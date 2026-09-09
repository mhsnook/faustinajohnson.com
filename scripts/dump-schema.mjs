#!/usr/bin/env node
/**
 * Dump a running site's collections back into seed/seed.json.
 *
 * The other direction of `push-schema.mjs`, for the loop where you shape a
 * collection in the dev admin, dump it, commit it, and push that shape to
 * production. The seed stays the committed truth; this is how a change made in
 * an admin becomes committed truth rather than drift.
 *
 *   node scripts/dump-schema.mjs --url http://127.0.0.1:4321            # rewrite the seed
 *   node scripts/dump-schema.mjs --url http://127.0.0.1:4321 --dry-run  # say what would change
 *   node scripts/dump-schema.mjs --url https://faustinajohnson.com --check
 *
 * `--check` writes nothing and exits 1 when the live schema and the seed differ,
 * which is the shape a CI job wants.
 *
 * Only `collections` is rewritten. Settings, taxonomies, menus, widget areas and
 * content are left exactly as committed -- they hold copy someone may have
 * reworded on the live site, and overwriting them from a database is how you
 * lose it.
 *
 * `npx emdash export-seed` covers similar ground against a local SQLite file,
 * but it drops `titleField` and `dateField`, and cannot read a deployed site.
 *
 * Auth, in the order the client tries them:
 *   --token / EMDASH_TOKEN     an ec_pat_ token from the admin
 *   EMDASH_HEADERS             "CF-Access-Client-Id: ...\nCF-Access-Client-Secret: ..."
 *                              for the Access service token the admin sits behind
 */
/* eslint-disable no-await-in-loop -- One request per collection, in seed order, so
   a failure stops the run with the seed untouched rather than half-rewritten. */
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { customHeadersInterceptor, resolveCustomHeaders } from "emdash/client/cf-access";
import { EmDashClient } from "emdash/client";

// `pnpm run x -- --flag` forwards the "--" itself, and parseArgs would then read
// every real flag after it as a positional and silently fall back to defaults --
// which once pointed a production run at localhost.
const argv = process.argv.slice(2).filter((arg) => arg !== "--");

const { values } = parseArgs({
	args: argv,
	options: {
		url: { type: "string", default: process.env.EMDASH_URL ?? "http://127.0.0.1:4321" },
		token: { type: "string", default: process.env.EMDASH_TOKEN },
		seed: { type: "string", default: "seed/seed.json" },
		collection: { type: "string", multiple: true, default: [] },
		"dry-run": { type: "boolean", default: false },
		check: { type: "boolean", default: false },
	},
});

const only = new Set(values.collection);

const headers = resolveCustomHeaders();
const client = new EmDashClient({
	baseUrl: values.url,
	token: values.token,
	interceptors: Object.keys(headers).length > 0 ? [customHeadersInterceptor(headers)] : [],
});

/** Drop a key whose live value is the default, so a dumped seed reads like a
 *  hand-written one rather than every flag spelled out. */
function withoutDefaults(entries) {
	return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

function fieldFromLive(field) {
	return withoutDefaults([
		["slug", field.slug],
		["label", field.label],
		["type", field.type],
		["required", field.required || undefined],
		["unique", field.unique || undefined],
		["defaultValue", field.defaultValue ?? undefined],
		["validation", field.validation ?? undefined],
		["widget", field.widget ?? undefined],
		["searchable", field.searchable || undefined],
		["indexed", field.indexed || undefined],
		// Fields are translatable unless someone turned it off, so only the "off"
		// is worth committing.
		["translatable", field.translatable === false ? false : undefined],
		["options", field.options ?? undefined],
	]);
}

function collectionFromLive(live) {
	const fields = (live.fields ?? [])
		.toSorted((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
		.map(fieldFromLive);

	return withoutDefaults([
		["slug", live.slug],
		["label", live.label],
		["labelSingular", live.labelSingular ?? undefined],
		["urlPattern", live.urlPattern ?? undefined],
		["supports", live.supports ?? []],
		["titleField", live.titleField ?? undefined],
		["dateField", live.dateField ?? undefined],
		["hidden", live.hidden || undefined],
		["admin", live.admin ?? undefined],
		["fields", fields],
	]);
}

const seed = JSON.parse(await readFile(values.seed, "utf8"));
const committed = seed.collections ?? [];

let liveList;
try {
	liveList = await client.collections();
} catch (error) {
	console.error(`Could not read the schema at ${values.url}: ${error.message}`);
	if (error.status === 401 || error.status === 403) {
		console.error(
			"  Reading the schema needs a credential. Pass --token, or set EMDASH_HEADERS to the\n" +
				"  Cloudflare Access service token if the admin is behind Access.",
		);
	}
	process.exit(1);
}

const wanted = liveList.filter((c) => only.size === 0 || only.has(c.slug));
const dumped = [];

for (const summary of wanted) {
	const live = await client.collection(summary.slug);
	dumped.push(collectionFromLive(live));
}

// The seed's order is the order someone chose to read them in; keep it, and put
// anything the live site has and the seed does not at the end.
const order = new Map(committed.map((c, index) => [c.slug, index]));
const ordered = dumped.toSorted(
	(a, b) =>
		(order.get(a.slug) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.slug) ?? Number.MAX_SAFE_INTEGER),
);

// A narrowed run only speaks for the collections it asked about; everything else
// in the seed stays as committed.
const next =
	only.size === 0 ? ordered : committed.map((c) => ordered.find((d) => d.slug === c.slug) ?? c);

const before = new Map(committed.map((c) => [c.slug, c]));
const after = new Map(next.map((c) => [c.slug, c]));
const changes = [];

for (const slug of new Set([...before.keys(), ...after.keys()])) {
	const was = before.get(slug);
	const now = after.get(slug);

	if (!was) {
		changes.push(`+ collection ${slug}`);
		continue;
	}
	if (!now) {
		changes.push(`- collection ${slug} -- on the site no longer, or not in this run`);
		continue;
	}

	const wasFields = new Map((was.fields ?? []).map((f) => [f.slug, f]));
	const nowFields = new Map((now.fields ?? []).map((f) => [f.slug, f]));

	for (const fieldSlug of new Set([...wasFields.keys(), ...nowFields.keys()])) {
		const a = wasFields.get(fieldSlug);
		const b = nowFields.get(fieldSlug);
		if (!a) changes.push(`+ field      ${slug}.${fieldSlug} (${b.type})`);
		else if (!b) changes.push(`- field      ${slug}.${fieldSlug}`);
		else if (JSON.stringify(a) !== JSON.stringify(b))
			changes.push(`~ field      ${slug}.${fieldSlug}`);
	}

	const settingsOf = (c) => JSON.stringify({ ...c, fields: undefined });
	if (settingsOf(was) !== settingsOf(now)) changes.push(`~ collection ${slug} (settings)`);
}

if (changes.length === 0) {
	console.log(`${values.seed} already matches the schema at ${values.url}.`);
	process.exit(0);
}

for (const line of changes) console.log(line);

if (values.check) {
	console.error(`\n${values.seed} is out of date with ${values.url}. Run \`pnpm schema:dump\`.`);
	process.exit(1);
}

if (values["dry-run"]) {
	console.log("\nDry run, nothing written.");
	process.exit(0);
}

// Only the collections array is rewritten, in place. oxfmt keeps whatever wrapping
// it is given rather than imposing its own, so the rest of the seed -- hand-wrapped
// portable text, menus, widget props -- would come back reflowed from a whole-file
// rewrite, and the dump's diff would bury the field that actually changed.
const printed = JSON.stringify(next, null, "\t")
	.split("\n")
	.map((line, index) => (index === 0 ? line : `\t${line}`))
	.join("\n");

const raw = await readFile(values.seed, "utf8");
const open = raw.indexOf('"collections": [');
if (open === -1) {
	console.error(`Could not find a "collections" array in ${values.seed}.`);
	process.exit(1);
}

// Walk to the array's own closing bracket, ignoring brackets inside strings.
let depth = 0;
let inString = false;
let escaped = false;
let close = -1;

for (let i = raw.indexOf("[", open); i < raw.length; i++) {
	const char = raw[i];
	if (escaped) escaped = false;
	else if (char === "\\") escaped = true;
	else if (char === '"') inString = !inString;
	else if (!inString && (char === "[" || char === "{")) depth += 1;
	else if (!inString && (char === "]" || char === "}")) {
		depth -= 1;
		if (depth === 0) {
			close = i;
			break;
		}
	}
}

if (close === -1) {
	console.error(`Could not read the end of the "collections" array in ${values.seed}.`);
	process.exit(1);
}

const rewritten = raw.slice(0, raw.indexOf("[", open)) + printed + raw.slice(close + 1);
JSON.parse(rewritten); // A malformed splice should fail here, not on the next build.
await writeFile(values.seed, rewritten, "utf8");

const formatted = spawnSync("npx", ["oxfmt", "--ignore-path", ".oxfmtignore", values.seed], {
	shell: true,
	stdio: "ignore",
});

console.log(
	`\nWrote ${values.seed}. Run \`npx emdash types\` against the same URL to match the types.`,
);

if (formatted.status !== 0) {
	console.log("Could not run oxfmt over it -- run `pnpm format` before committing.");
}
