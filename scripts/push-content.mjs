#!/usr/bin/env node
/**
 * Push the content in seed/seed.json to a running EmDash instance.
 *
 * `pnpm schema:push` creates a collection and its fields on a site that already
 * has content, but not the entries: seed content only ever lands on the first
 * request after setup, against an empty database. So a collection pushed to a
 * live site arrives empty, and anything the templates read by slug renders
 * blank until the rows exist. This creates them.
 *
 * It only ever adds. An entry whose slug is already there is left exactly as it
 * is, edits and all -- the seed is the starting copy, not the current copy, and
 * the live row is the one someone has since reworded.
 *
 *   node scripts/push-content.mjs --url https://faustinajohnson.com --dry-run
 *   node scripts/push-content.mjs --url https://faustinajohnson.com
 *   node scripts/push-content.mjs --url http://127.0.0.1:4321 --collection snippets
 *
 * Auth, in the order the client tries them:
 *   --token / EMDASH_TOKEN     an ec_pat_ token from the admin
 *   EMDASH_HEADERS             "CF-Access-Client-Id: ...\nCF-Access-Client-Secret: ..."
 *                              for the Access service token the admin sits behind
 *   --dev-bypass               localhost only
 */
/* eslint-disable no-await-in-loop -- Every request here is sequential on purpose:
   a publish has to follow the create it publishes, and a failed step has to stop
   the run rather than let the rest race past it. */
import { readFile } from "node:fs/promises";
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
		"dev-bypass": { type: "boolean", default: false },
		"dry-run": { type: "boolean", default: false },
	},
});

const dryRun = values["dry-run"];
const only = new Set(values.collection);

const seed = JSON.parse(await readFile(values.seed, "utf8"));
const content = seed.content ?? {};
const wanted = Object.keys(content).filter((slug) => only.size === 0 || only.has(slug));

if (wanted.length === 0) {
	console.error(
		only.size > 0
			? `No content in ${values.seed} for ${[...only].join(", ")}`
			: `No content in ${values.seed}`,
	);
	process.exit(1);
}

const headers = resolveCustomHeaders();
const client = new EmDashClient({
	baseUrl: values.url,
	token: values.token,
	devBypass: values["dev-bypass"],
	interceptors: Object.keys(headers).length > 0 ? [customHeadersInterceptor(headers)] : [],
});

/** Media and cross-entry references in a seed are resolved by EmDash's own
 *  seeder, which this is not: it would create the row with the marker stored as
 *  a literal string. Report those instead of writing them. */
function referencesToResolve(data) {
	const found = [];
	JSON.stringify(data, (key, value) => {
		if (key === "$media") found.push("$media");
		else if (typeof value === "string" && value.startsWith("$ref:")) found.push(value);
		return value;
	});
	return found;
}

const plan = [];

for (const collection of wanted) {
	const entries = content[collection] ?? [];
	if (entries.length === 0) continue;

	let live;
	try {
		live = [];
		for await (const item of client.listAll(collection)) live.push(item);
	} catch (error) {
		console.error(`Could not list ${collection} at ${values.url}: ${error.message}`);
		if (error.status === 401 || error.status === 403) {
			console.error(
				"  Content changes need a credential. Pass --token, or set EMDASH_HEADERS to the\n" +
					"  Cloudflare Access service token if the admin is behind Access.",
			);
		} else if (error.status === 404) {
			console.error("  That collection does not exist here yet -- run `pnpm schema:push` first.");
		}
		process.exit(1);
	}

	const have = new Set(live.map((item) => item.slug).filter(Boolean));

	for (const entry of entries) {
		const slug = entry.slug ?? entry.id;
		const refs = referencesToResolve(entry.data);

		if (refs.length > 0) plan.push({ kind: "refs", collection, slug, refs });
		else if (have.has(slug)) plan.push({ kind: "exists", collection, slug });
		else plan.push({ kind: "create", collection, slug, entry });
	}
}

const creates = plan.filter((step) => step.kind === "create");

for (const step of plan) {
	if (step.kind === "create") {
		console.log(`+ ${step.collection}/${step.slug} (${step.entry.status ?? "draft"})`);
	} else if (step.kind === "exists") {
		console.log(`= ${step.collection}/${step.slug} -- already here, left alone`);
	} else {
		console.log(
			`! ${step.collection}/${step.slug} carries ${[...new Set(step.refs)].join(", ")} -- ` +
				"only EmDash's own seeder resolves those, skipping",
		);
	}
}

if (creates.length === 0) {
	console.log(`\n${values.url} already has every entry in ${values.seed}.`);
	process.exit(0);
}

if (dryRun) {
	console.log("\nDry run, nothing sent.");
	process.exit(0);
}

console.log("");
let applied = 0;

for (const step of creates) {
	const what = `${step.collection}/${step.slug}`;
	const status = step.entry.status ?? "draft";

	try {
		// The create endpoint rejects any status but "draft", so a published seed
		// entry is two calls. Passing `locale` explicitly as null is rejected too,
		// hence the spread rather than a key that might carry undefined.
		const created = await client.create(step.collection, {
			data: step.entry.data,
			slug: step.slug,
			...(step.entry.locale ? { locale: step.entry.locale } : {}),
		});

		if (status === "published") {
			await client.publish(step.collection, created.id);
		}
	} catch (error) {
		console.error(`\nFailed on ${what}: ${error.message}`);
		if (error.code)
			console.error(`  ${error.code}${error.status ? ` (HTTP ${error.status})` : ""}`);
		console.error(
			`\nStopped after ${applied} entr${applied === 1 ? "y" : "ies"}. Re-run to continue.`,
		);
		process.exit(1);
	}

	console.log(`created ${what}`);
	applied += 1;
}

console.log(`\nDone. ${applied} entr${applied === 1 ? "y" : "ies"} created on ${values.url}.`);
