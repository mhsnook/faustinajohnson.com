import { getEmDashCollection } from "emdash";

/** `entry.id` is the slug here; `entry.data.id` is the database ULID. */
export interface SnippetEntry {
	id?: string;
	data?: { body?: string | null } | null;
}

/** Indexes the `snippets` collection by slug for the templates that read it. */
export function readSnippets(entries?: SnippetEntry[] | null) {
	const bySlug = new Map((entries ?? []).map((entry) => [entry.id, entry.data?.body]));

	return function snippet(slug: string) {
		return bySlug.get(slug) ?? "";
	};
}

/** Every component that prints a snippet calls this. The filter is fixed rather
 *  than a parameter so each call hits the same key in emdash's request cache and
 *  the collection is read from D1 once per request, however many callers there are. */
export async function getSnippets() {
	const { entries, cacheHint } = await getEmDashCollection("snippets", { status: "published" });

	return { snippet: readSnippets(entries), cacheHint };
}
