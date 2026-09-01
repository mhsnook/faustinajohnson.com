/** Format a dateline the way the Field Notes list prints it: "08 / 24 / 26". */
export function formatNoteDate(value: string | null | undefined): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const pad = (n: number) => String(n).padStart(2, "0");
	const year = String(date.getFullYear()).slice(-2);
	return `${pad(date.getMonth() + 1)} / ${pad(date.getDate())} / ${year}`;
}

/** Format a piece's dateline the way the article pages print it: "March 1, 2026". */
export function formatLongDate(value: string | null | undefined): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
