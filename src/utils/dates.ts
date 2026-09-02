/**
 * Every date on this site prints in India Standard Time, wherever the code runs.
 *
 * Pinning the zone is a correctness fix, not a preference. `getFullYear()`,
 * `getMonth()`, `getDate()` and a bare `toLocaleDateString()` all read the
 * HOST's zone, so a note stamped `2026-03-01T00:00:00Z` prints as "March 1" on
 * a UTC server and "February 28" on a machine west of Greenwich. Naming the
 * zone makes the output identical on the Worker, in a test, and on a laptop.
 *
 * "Asia/Kolkata" is the canonical IANA name for the zone also written
 * "Asia/Calcutta". Both resolve to the same UTC+05:30.
 */
export const SITE_TIME_ZONE = "Asia/Kolkata";

/** Parse a stored value, or null when it is absent or unparseable. */
function toDate(value: string | null | undefined): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

// Built once at module load. Constructing an Intl.DateTimeFormat is the
// expensive part; formatting with an existing one is cheap.
const noteFormat = new Intl.DateTimeFormat("en-US", {
	timeZone: SITE_TIME_ZONE,
	year: "2-digit",
	month: "2-digit",
	day: "2-digit",
});

const longFormat = new Intl.DateTimeFormat("en-US", {
	timeZone: SITE_TIME_ZONE,
	year: "numeric",
	month: "long",
	day: "numeric",
});

const yearFormat = new Intl.DateTimeFormat("en-US", {
	timeZone: SITE_TIME_ZONE,
	year: "numeric",
});

/** Format a dateline the way the Field Notes list prints it: "08 / 24 / 26". */
export function formatNoteDate(value: string | null | undefined): string {
	const date = toDate(value);
	if (!date) return "";
	// formatToParts rather than a string replace: it gives the padded month, day
	// and year as separate values, so the " / " separator is ours to place.
	const parts: Record<string, string> = {};
	for (const part of noteFormat.formatToParts(date)) parts[part.type] = part.value;
	return `${parts.month} / ${parts.day} / ${parts.year}`;
}

/** Format a piece's dateline the way the article pages print it: "March 1, 2026". */
export function formatLongDate(value: string | null | undefined): string {
	const date = toDate(value);
	return date ? longFormat.format(date) : "";
}

/** The year a piece belongs to, for The Work's year range. Null if unparseable. */
export function yearOf(value: string | null | undefined): number | null {
	const date = toDate(value);
	return date ? Number(yearFormat.format(date)) : null;
}
