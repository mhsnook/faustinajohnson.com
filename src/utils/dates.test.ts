import { describe, expect, it } from "vitest";
import { SITE_TIME_ZONE, formatLongDate, formatNoteDate, yearOf } from "./dates";

// A timestamp that lands on a different calendar day depending on the reader's
// zone: midnight UTC on 1 March is still 28 February in the Americas, and
// already 05:30 on 1 March in India. Every assertion below is the IST answer.
const MIDNIGHT_UTC = "2026-03-01T00:00:00Z";

// 22:00 UTC on 28 February is 03:30 on 1 March in IST — the case that proves
// the helpers really shift into the site's zone rather than just ignoring the
// host's.
const LATE_PREVIOUS_DAY_UTC = "2026-02-28T22:00:00Z";

describe("SITE_TIME_ZONE", () => {
	it("is a zone the runtime can actually resolve", () => {
		expect(() =>
			new Intl.DateTimeFormat("en-US", { timeZone: SITE_TIME_ZONE }).format(new Date()),
		).not.toThrow();
	});

	it("is UTC+05:30", () => {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: SITE_TIME_ZONE,
			timeZoneName: "longOffset",
		}).formatToParts(new Date(MIDNIGHT_UTC));
		expect(parts.find((p) => p.type === "timeZoneName")?.value).toBe("GMT+05:30");
	});
});

describe("formatNoteDate", () => {
	it("prints the Field Notes dateline as MM / DD / YY", () => {
		expect(formatNoteDate(MIDNIGHT_UTC)).toBe("03 / 01 / 26");
	});

	it("reads the date in the site's zone, not the host's", () => {
		expect(formatNoteDate(LATE_PREVIOUS_DAY_UTC)).toBe("03 / 01 / 26");
	});

	it("pads single-digit months and days", () => {
		expect(formatNoteDate("2019-09-05T12:00:00Z")).toBe("09 / 05 / 19");
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
		expect(formatLongDate(MIDNIGHT_UTC)).toBe("March 1, 2026");
	});

	it("reads the date in the site's zone, not the host's", () => {
		expect(formatLongDate(LATE_PREVIOUS_DAY_UTC)).toBe("March 1, 2026");
	});

	it("returns an empty string for a missing value", () => {
		expect(formatLongDate(null)).toBe("");
		expect(formatLongDate(undefined)).toBe("");
	});

	it("returns an empty string rather than NaN for an unparseable value", () => {
		expect(formatLongDate("not a date")).toBe("");
	});
});

describe("yearOf", () => {
	it("returns the four-digit year The Work's range is built from", () => {
		expect(yearOf(MIDNIGHT_UTC)).toBe(2026);
	});

	it("rolls into the next year when the site's zone has, and the host has not", () => {
		// 20:00 UTC on 31 December 2025 is already 01:30 on 1 January 2026 in IST.
		expect(yearOf("2025-12-31T20:00:00Z")).toBe(2026);
	});

	it("returns null for a missing or unparseable value", () => {
		expect(yearOf(null)).toBeNull();
		expect(yearOf(undefined)).toBeNull();
		expect(yearOf("not a date")).toBeNull();
	});
});
