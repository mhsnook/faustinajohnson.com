import { describe, expect, it } from "vitest";
import { readSnippets } from "./snippets";

describe("readSnippets", () => {
	it("reads a snippet by slug", () => {
		const snippet = readSnippets([{ id: "footer-signoff", data: { body: "read slowly" } }]);
		expect(snippet("footer-signoff")).toBe("read slowly");
	});

	it("returns an empty string for a slug the collection does not hold", () => {
		expect(readSnippets([])("footer-tagline")).toBe("");
		expect(readSnippets()("footer-tagline")).toBe("");
	});
});
