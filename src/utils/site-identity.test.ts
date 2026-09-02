import { describe, expect, it } from "vitest";
import { AUTHOR_PORTRAIT, resolveStarterSiteIdentity } from "./site-identity";

describe("resolveStarterSiteIdentity", () => {
	it("falls back to the starter defaults when settings are absent", () => {
		expect(resolveStarterSiteIdentity()).toEqual({
			siteTitle: "My Site",
			siteTagline: "Built with EmDash",
			siteLogo: null,
		});
	});

	it("prefers the values held in site settings", () => {
		const resolved = resolveStarterSiteIdentity({
			title: "Faustina Johnson",
			tagline: "field reports",
		});
		expect(resolved.siteTitle).toBe("Faustina Johnson");
		expect(resolved.siteTagline).toBe("field reports");
	});

	it("keeps a logo that resolved to a URL", () => {
		const logo = { mediaId: "abc", url: "https://example.com/logo.png" };
		expect(resolveStarterSiteIdentity({ logo }).siteLogo).toBe(logo);
	});

	it("drops a logo whose media never resolved to a URL", () => {
		expect(resolveStarterSiteIdentity({ logo: { mediaId: "abc" } }).siteLogo).toBeNull();
	});
});

describe("AUTHOR_PORTRAIT", () => {
	it("points at the file shipped in public/ with its real dimensions", () => {
		expect(AUTHOR_PORTRAIT.src).toBe("/faustina-johnson.png");
		expect(AUTHOR_PORTRAIT.alt).toBe("Faustina Johnson");
		expect(AUTHOR_PORTRAIT.width).toBe(766);
		expect(AUTHOR_PORTRAIT.height).toBe(808);
	});
});
