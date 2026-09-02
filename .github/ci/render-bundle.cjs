'use strict'

// Diff two bundle measurements and render one fragment.
//
// Takes the JSON summaries written by measure-bundle.cjs, not the built
// directories — the report job never has either tree checked out.

const fs = require('fs')
const path = require('path')
const { formatBytes, deltaLabel, sizeTable } = require('./delta.cjs')

const load = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null)

const formatMB = (n) => (n / 1048576).toFixed(2) + ' MB'

/**
 * The Worker is the one axis with a hard external limit. Cloudflare rejects a
 * deploy over 10 MB gzipped on Workers Paid, so this is a budget, not a trend.
 */
function workerSection(base, head) {
	const limit = head.worker.limit
	const pct = (head.worker.gz / limit) * 100
	const icon = pct >= 90 ? '🔴' : pct >= 75 ? '🟠' : '🟢'
	return [
		`${icon} **${formatMB(head.worker.gz)} gzipped — ${pct.toFixed(1)}% of Cloudflare's ${formatMB(limit)} deploy limit.**`,
		'',
		sizeTable(head.worker.raw, head.worker.gz, base.worker.raw, base.worker.gz),
	].join('\n')
}

/**
 * Compare fingerprinted chunks by identity, not size.
 *
 * A chunk whose content hash is unchanged is still in returning visitors'
 * caches. A PR that adds 2 kB to one has really cost every returning visitor
 * the WHOLE chunk again. So report which chunks changed first, sizes second.
 */
function chunkSection(base, head) {
	const names = [...new Set([...Object.keys(base.chunks), ...Object.keys(head.chunks)])].sort()
	if (!names.length) return '_No fingerprinted chunks in the build._'

	const changed = []
	let cachedGz = 0
	let cachedCount = 0

	for (const n of names) {
		const b = base.chunks[n]
		const h = head.chunks[n]
		if (b && h && b.file === h.file) {
			cachedCount++
			cachedGz += h.gz
			continue
		}
		changed.push({ n, b, h })
	}

	if (!changed.length) {
		return (
			`✅ **Every chunk keeps its hash** — ${cachedCount} chunk(s), ` +
			`${formatBytes(cachedGz)} gzipped, still cached for repeat visitors.`
		)
	}

	const rows = changed.map(({ n, b, h }) => {
		if (!b) return `- 🆕 \`${n}\` added — ${formatBytes(h.raw)} raw (${formatBytes(h.gz)} gz)`
		if (!h) return `- ❌ \`${n}\` removed — was ${formatBytes(b.raw)} raw`
		return `- \`${n}\` — ${formatBytes(b.raw)} → ${formatBytes(h.raw)} raw, ${deltaLabel(h.raw, b.raw)}`
	})
	const stable =
		cachedCount ?
			`\n\n${cachedCount} other chunk(s) keep their hash — ${formatBytes(cachedGz)} gzipped, still cached.`
		:	''
	return `**Chunks that changed — repeat visitors re-download these in full:**\n${rows.join('\n')}${stable}`
}

module.exports = function render({ head, base, out }) {
	fs.mkdirSync(out, { recursive: true })
	const h = load(head)
	const b = load(base)

	// A missing measurement means a build failed. Say so rather than rendering a
	// delta against zeros, which would read as "the whole bundle is new".
	if (!h || !b) {
		const which = !h && !b ? 'Both builds' : !h ? 'The PR build' : 'The base build'
		fs.writeFileSync(
			path.join(out, '40-bundle.md'),
			`#### Bundle size\n\n⚠️ ${which} produced no measurement, so there is nothing to compare. Check the job log.`
		)
		fs.writeFileSync(
			path.join(out, '40-bundle.json'),
			JSON.stringify({ check: 'bundle', missing: true }, null, 2)
		)
		return
	}

	const markdown = [
		'#### Bundle size',
		'',
		'**Worker** — `dist/server`, the code Cloudflare runs',
		'',
		workerSection(b, h),
		'',
		'**Client JS** — `dist/client/_astro`, what a browser downloads',
		'',
		sizeTable(h.js.raw, h.js.gz, b.js.raw, b.js.gz),
		'',
		'**CSS** — render-blocking on first paint',
		'',
		sizeTable(h.css.raw, h.css.gz, b.css.raw, b.css.gz),
		'',
		// deltaLabel already carries the direction emoji — do not prefix another.
		`**Static assets** (fonts, images): ${formatBytes(h.static.raw)} raw · ` +
			`${deltaLabel(h.static.raw, b.static.raw)}`,
		'',
		chunkSection(b, h),
	].join('\n')

	fs.writeFileSync(path.join(out, '40-bundle.md'), markdown)
	fs.writeFileSync(
		path.join(out, '40-bundle.json'),
		JSON.stringify(
			{
				check: 'bundle',
				workerGz: h.worker.gz,
				workerGzLimit: h.worker.limit,
				workerGzDelta: h.worker.gz - b.worker.gz,
				clientGzDelta: h.js.gz - b.js.gz,
				cssGzDelta: h.css.gz - b.css.gz,
			},
			null,
			2
		)
	)
}

module.exports.chunkSection = chunkSection
