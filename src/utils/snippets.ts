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
