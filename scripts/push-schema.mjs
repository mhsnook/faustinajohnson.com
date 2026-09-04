#!/usr/bin/env node
/**
 * Push the schema in seed/seed.json to a running EmDash instance.
 *
 * The seed only ever runs against an empty database, on the first request after
 * setup completes, so a collection or field added to it never reaches a site
 * that already has content. This walks the seed's collections against the live
 * schema and creates whatever is missing.
 *
 * It only ever adds. Nothing here renames, retypes or deletes, so a field the
 * live site has and the seed does not is left alone, and so is a field whose
 * definition has drifted -- both are reported, neither is touched.
 *
 *   node scripts/push-schema.mjs --url https://faustinajohnson.com --dry-run
 *   node scripts/push-schema.mjs --url https://faustinajohnson.com
 *   node scripts/push-schema.mjs --url http://127.0.0.1:4321 --collection images
 *
 * Auth, in the order the client tries them:
 *   --token / EMDASH_TOKEN     an ec_pat_ token from the admin
 *   EMDASH_HEADERS             "CF-Access-Client-Id: ...\nCF-Access-Client-Secret: ..."
 *                              for the Access service token the admin sits behind
 *   --dev-bypass               localhost only
 */
/* eslint-disable no-await-in-loop -- Every request here is sequential on purpose:
   fields have to land after the collection that holds them and in their seed order,
   and a failed step has to stop the run rather than let the rest race past it. */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { customHeadersInterceptor, resolveCustomHeaders } from "emdash/client/cf-access";
import { EmDashClient } from "emdash/client";

const { values } = parseArgs({
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
const wanted = (seed.collections ?? []).filter((c) => only.size === 0 || only.has(c.slug));

if (wanted.length === 0) {
	console.error(
		only.size > 0
			? `No collection in ${values.seed} matches ${[...only].join(", ")}`
			: `No collections in ${values.seed}`,
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

/** Everything the create-collection body takes, minus the fields themselves. */
function collectionInput(collection) {
	const { fields: _fields, ...rest } = collection;
	return rest;
}

/** Everything the create-field body takes. `undefined` keys are dropped by JSON. */
function fieldInput(field, sortOrder) {
	return {
		slug: field.slug,
		label: field.label,
		type: field.type,
		required: field.required,
		unique: field.unique,
		defaultValue: field.defaultValue,
		validation: field.validation,
		widget: field.widget,
		options: field.options,
		searchable: field.searchable,
		indexed: field.indexed,
		translatable: field.translatable,
		sortOrder,
	};
}

/** The seed calls it `url`; the API calls it `customUrl` and rejects unknown keys. */
function menuItemInput(item, sortOrder) {
	return {
		type: item.type,
		label: item.label,
		customUrl: item.url,
		target: item.target,
		titleAttr: item.titleAttr,
		cssClasses: item.cssClasses,
		sortOrder,
	};
}

const plan = [];

const live = await client.collections();
const liveSlugs = new Set(live.map((c) => c.slug));

for (const collection of wanted) {
	if (!liveSlugs.has(collection.slug)) {
		plan.push({ kind: "collection", collection });
		for (const [index, field] of (collection.fields ?? []).entries()) {
			plan.push({ kind: "field", collection, field, sortOrder: index });
		}
		continue;
	}

	// includeFields, so the response carries what the live collection actually has.
	const existing = await client.collection(collection.slug);
	const have = new Map((existing.fields ?? []).map((f) => [f.slug, f]));

	for (const [index, field] of (collection.fields ?? []).entries()) {
		const match = have.get(field.slug);
		if (!match) {
			plan.push({ kind: "field", collection, field, sortOrder: index });
		} else if (match.type !== field.type) {
			plan.push({ kind: "drift", collection, field, live: match });
		}
	}
}

// Menus are additive here on purpose. EmDash's own applySeed deletes a menu's
// items and rewrites them from the seed, which would throw away anything added
// in the admin since; this only ever appends links the live menu is missing.
for (const menu of seed.menus ?? []) {
	if (only.size > 0) break;

	let liveMenu;
	try {
		liveMenu = await client.menu(menu.name);
	} catch {
		plan.push({ kind: "menuMissing", menu });
		continue;
	}

	const have = new Set(liveMenu.items.map((item) => item.customUrl).filter(Boolean));

	// New links append past every existing item rather than taking the seed's
	// index, which would collide with whatever already sits at that position.
	let nextSortOrder = liveMenu.items.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0);

	for (const item of menu.items ?? []) {
		if (item.type !== "custom" || !item.url) {
			plan.push({ kind: "menuSkip", menu, item });
		} else if (!have.has(item.url)) {
			plan.push({ kind: "menuItem", menu, item, sortOrder: nextSortOrder });
			nextSortOrder += 1;
		}
	}
}

if (plan.length === 0) {
	console.log(`${values.url} is already up to date with ${values.seed}.`);
	process.exit(0);
}

for (const step of plan) {
	if (step.kind === "collection") {
		console.log(`+ collection ${step.collection.slug}`);
	} else if (step.kind === "field") {
		console.log(`+ field     ${step.collection.slug}.${step.field.slug} (${step.field.type})`);
	} else if (step.kind === "drift") {
		console.log(
			`! drift     ${step.collection.slug}.${step.field.slug}: live is ${step.live.type}, seed says ${step.field.type} -- not touching it`,
		);
	} else if (step.kind === "menuItem") {
		console.log(`+ menu item ${step.menu.name}: ${step.item.label} -> ${step.item.url}`);
	} else if (step.kind === "menuMissing") {
		console.log(`! menu      ${step.menu.name} does not exist here -- create it in the admin`);
	} else {
		console.log(
			`! menu item ${step.menu.name}: ${step.item.label ?? step.item.type} is not a custom URL -- skipping`,
		);
	}
}

if (dryRun) {
	console.log("\nDry run, nothing sent.");
	process.exit(0);
}

console.log("");
let applied = 0;

for (const step of plan) {
	if (step.kind === "drift" || step.kind === "menuMissing" || step.kind === "menuSkip") continue;

	let what;
	if (step.kind === "collection") what = `collection ${step.collection.slug}`;
	else if (step.kind === "field") what = `field     ${step.collection.slug}.${step.field.slug}`;
	else what = `menu item ${step.menu.name}: ${step.item.label}`;

	try {
		if (step.kind === "collection") {
			await client.createCollection(collectionInput(step.collection));
		} else if (step.kind === "field") {
			await client.createField(step.collection.slug, fieldInput(step.field, step.sortOrder));
		} else {
			await client.request(
				"POST",
				`/menus/${encodeURIComponent(step.menu.name)}/items`,
				menuItemInput(step.item, step.sortOrder),
			);
		}
	} catch (error) {
		console.error(`\nFailed on ${what}: ${error.message}`);
		if (error.code)
			console.error(`  ${error.code}${error.status ? ` (HTTP ${error.status})` : ""}`);
		if (error.code === "COLLECTION_EXISTS") {
			console.error(
				"  The slug is still reserved by a collection that was deleted but whose media cleanup\n" +
					"  has not finished. Wait for that job, then run this again.",
			);
		}
		console.error(
			`\nStopped after ${applied} change${applied === 1 ? "" : "s"}. Re-run to continue.`,
		);
		process.exit(1);
	}
	console.log(`created ${what}`);
	applied += 1;
}

console.log(`\nDone. ${applied} change${applied === 1 ? "" : "s"} applied to ${values.url}.`);
console.log("Run `npx emdash types` against the same URL to refresh emdash-env.d.ts.");
