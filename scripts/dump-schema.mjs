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
 * `--check` writes nothing and exits 1 when the live schema and the seed differ.
 * Nothing runs it on a schedule yet; drift is a property of a site rather than of
 * a pull request, so it belongs in a cron job against production rather than in
 * the PR checks.
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

function withoutUndefined(object) {
	return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

/** Key order here is the order they land in the seed, and the key list is the
 *  same one `push-schema.mjs` sends back in `fieldInput`. A property EmDash adds
 *  later has to reach both or it round-trips away. */
function fieldFromLive(field) {
	return withoutUndefined({
		slug: field.slug,
		label: field.label,
		type: field.type,
		required: field.required || undefined,
		unique: field.unique || undefined,
		defaultValue: field.defaultValue ?? undefined,
		validation: field.validation ?? undefined,
		widget: field.widget ?? undefined,
		searchable: field.searchable || undefined,
		indexed: field.indexed || undefined,
		// Fields are translatable unless someone turned it off, so only the "off"
		// is worth committing.
		translatable: field.translatable === false ? false : undefined,
		options: field.options ?? undefined,
	});
}

function collectionFromLive(live) {
	return withoutUndefined({
		slug: live.slug,
		label: live.label,
		labelSingular: live.labelSingular ?? undefined,
		urlPattern: live.urlPattern ?? undefined,
		supports: live.supports?.length ? live.supports : undefined,
		titleField: live.titleField ?? undefined,
		dateField: live.dateField ?? undefined,
		hidden: live.hidden || undefined,
		admin: live.admin ?? undefined,
		fields: (live.fields ?? [])
			.toSorted((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
			.map(fieldFromLive),
	});
}

/** Compares by content rather than by key order, so a seed whose keys were
 *  hand-written in another order than this script emits is not permanent drift. */
function canonical(value) {
	return JSON.stringify(value, (_key, inner) =>
		inner && typeof inner === "object" && !Array.isArray(inner)
			? Object.fromEntries(Object.entries(inner).toSorted(([a], [b]) => a.localeCompare(b)))
			: inner,
	);
}

const raw = await readFile(values.seed, "utf8");
const committed = JSON.parse(raw).collections ?? [];

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
const dumped = (await Promise.all(wanted.map((c) => client.collection(c.slug)))).map(
	collectionFromLive,
);

// The seed's order is the order someone chose to read them in, so a collection it
// already lists keeps its place and anything new goes at the end. A full run drops
// a collection the site no longer has; a narrowed one leaves the rest alone.
const fromLive = new Map(dumped.map((c) => [c.slug, c]));
const committedSlugs = new Set(committed.map((c) => c.slug));
const next = [
	...committed
		.filter((c) => fromLive.has(c.slug) || only.size > 0)
		.map((c) => fromLive.get(c.slug) ?? c),
	...dumped.filter((c) => !committedSlugs.has(c.slug)),
];

const before = new Map(committed.map((c) => [c.slug, c]));
const after = new Map(next.map((c) => [c.slug, c]));
const changes = [];
const settingsOf = (collection) => canonical({ ...collection, fields: undefined });

for (const slug of new Set([...before.keys(), ...after.keys()])) {
	const was = before.get(slug);
	const now = after.get(slug);

	if (!was) {
		changes.push(`+ collection ${slug}`);
		continue;
	}
	if (!now) {
		changes.push(`- collection ${slug} -- on the site no longer`);
		continue;
	}

	const wasFields = new Map((was.fields ?? []).map((f) => [f.slug, f]));
	const nowFields = new Map((now.fields ?? []).map((f) => [f.slug, f]));

	for (const fieldSlug of new Set([...wasFields.keys(), ...nowFields.keys()])) {
		const a = wasFields.get(fieldSlug);
		const b = nowFields.get(fieldSlug);
		if (!a) changes.push(`+ field      ${slug}.${fieldSlug} (${b.type})`);
		else if (!b) changes.push(`- field      ${slug}.${fieldSlug}`);
		else if (canonical(a) !== canonical(b)) changes.push(`~ field      ${slug}.${fieldSlug}`);
	}

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

// The seed has two authors: a person hand-wrapping the content, menus and widget
// props, and this script. Splicing one array in leaves the rest of their file
// byte for byte, so the diff of a dump is the collection that changed.
const printed = JSON.stringify(next, null, "\t")
	.split("\n")
	.map((line, index) => (index === 0 ? line : `\t${line}`))
	.join("\n");

// Anchored to the start of a line: `taxonomies` carries "collections" keys of its
// own, and a bare search would splice over one of those if the sections were ever
// reordered.
const ANCHOR = '\n\t"collections": [';
const anchorAt = raw.indexOf(ANCHOR);

if (anchorAt === -1) {
	console.error(`Could not find a top-level "collections" array in ${values.seed}.`);
	process.exit(1);
}

const open = anchorAt + ANCHOR.length - 1;
let depth = 0;
let inString = false;
let escaped = false;
let close = open;

for (let i = open; i < raw.length; i++) {
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

const rewritten = raw.slice(0, open) + printed + raw.slice(close + 1);

// Proves the splice landed on the array it meant to: a misplaced one still parses,
// and would quietly file the whole schema under something else.
if (canonical(JSON.parse(rewritten).collections) !== canonical(next)) {
	console.error(`Refusing to write ${values.seed}: the splice did not land on its collections.`);
	process.exit(1);
}

await writeFile(values.seed, rewritten, "utf8");

// JSON.stringify wraps every array and object; oxfmt puts the short ones back on
// one line, so the file reads the way the rest of the seed does. The pre-commit
// hook would do this anyway -- running it here is what keeps `git diff` legible
// between the dump and the commit.
const formatted = spawnSync(
	"pnpm",
	["exec", "oxfmt", "--ignore-path", ".oxfmtignore", values.seed],
	{
		stdio: ["ignore", "ignore", "inherit"],
	},
);

console.log(
	`\nWrote ${values.seed}. Run \`npx emdash types\` against the same URL to match the types.`,
);

if (formatted.status !== 0) {
	console.log("Could not run oxfmt over it -- run `pnpm format` before committing.");
}
