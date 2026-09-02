import { describe, expect, it } from "vitest";
import { formatLongDate, formatNoteDate } from "./dates";

describe("formatNoteDate", () => {
	it("prints the Field Notes dateline as MM / DD / YY", () => {
		expect(formatNoteDate("2026-03-01T00:00:00Z")).toBe("03 / 01 / 26");
	});

	it("pads single-digit months and days", () => {
		expect(formatNoteDate("2019-09-05T00:00:00Z")).toBe("09 / 05 / 19");
	});

	it("returns an empty string for a missing value", () => {
		expect(formatNoteDate(null)).toBe("");
		expect(formatNoteDate(undefined)).toBe("");
		expect(formatNoteDate("")).toBe("");
	});

	it("returns an empty string rather than NaN for an unparseable value", () => {
		expect(formatNoteDate("not a date")).toBe("");
	});
});

describe("formatLongDate", () => {
	it("prints the article dateline in long US form", () => {
		expect(formatLongDate("2026-03-01T00:00:00Z")).toBe("March 1, 2026");
	});

	it("returns an empty string for a missing value", () => {
		expect(formatLongDate(null)).toBe("");
		expect(formatLongDate(undefined)).toBe("");
	});

	it("returns an empty string rather than NaN for an unparseable value", () => {
		expect(formatLongDate("not a date")).toBe("");
	});
});
