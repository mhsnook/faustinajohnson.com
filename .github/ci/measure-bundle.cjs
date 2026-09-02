'use strict'

// Measure an Astro + Cloudflare build into a small JSON summary.
//
//   node measure-bundle.cjs dist /tmp/out/bundle.json
//
// Runs in the build job, next to the dist/ it reads. The report job then diffs
// two summaries, so it never needs either tree — which is what lets the head
// and base builds happen once each, in parallel, on separate runners.
//
// This project is server-rendered (`output: "server"`), so the template's
// index.html entry point does not exist. The axes here are the ones that
// actually move for this stack:
//
//   worker  — dist/server, the code uploaded to Cloudflare. Its GZIPPED size is
//             a hard deploy limit, not a preference: 10 MB on Workers Paid.
//             Exceed it and `wrangler deploy` fails.
//   client  — dist/client/_astro, what a browser downloads. Split js/css.
//
// Static assets under dist/client that Astro did not fingerprint (the portrait
// PNG, fonts) are counted separately: they are cached hard and do not belong in
// the number you watch per PR.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// Cloudflare's limit on a deployed Worker, gzipped, on the Workers Paid plan.
const WORKER_GZ_LIMIT = 10 * 1024 * 1024

// Astro fingerprints emitted assets as `name.HASH.ext`. Strip the hash so the
// same logical chunk is comparable across two builds, but keep the real
// filename alongside — an unchanged hash means returning visitors still have it.
const STRIP_HASH = /\.[A-Za-z0-9_-]{8}(\.[a-z]+)$/

function walk(dir) {
	if (!fs.existsSync(dir)) return []
	const out = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile()) continue
		out.push(path.join(entry.parentPath ?? entry.path, entry.name))
	}
	return out
}

/** Total raw and gzipped bytes for a list of files. */
function total(files) {
	let raw = 0
	let gz = 0
	for (const f of files) {
		const buf = fs.readFileSync(f)
		raw += buf.length
		gz += zlib.gzipSync(buf).length
	}
	return { raw, gz }
}

function measure(dist) {
	const serverDir = path.join(dist, 'server')
	const clientDir = path.join(dist, 'client')
	if (!fs.existsSync(serverDir)) {
		throw new Error(`no server/ in ${dist} — is this an Astro SSR build?`)
	}

	const clientFiles = walk(clientDir)
	const astroDir = path.join(clientDir, '_astro')
	const isAstro = (f) => f.startsWith(astroDir + path.sep)

	const js = clientFiles.filter((f) => isAstro(f) && f.endsWith('.js'))
	const css = clientFiles.filter((f) => isAstro(f) && f.endsWith('.css'))
	// Everything else under client/: fonts, images, _headers. Cached hard, and
	// not what a PR usually moves — kept on its own axis so it cannot drown out
	// a real JS regression.
	const staticFiles = clientFiles.filter((f) => !isAstro(f))

	// Per-chunk identity for the client JS. A chunk whose hash did not change is
	// still in returning visitors' caches, which matters more than its size.
	const chunks = {}
	for (const f of [...js, ...css]) {
		const buf = fs.readFileSync(f)
		const name = path.basename(f)
		chunks[name.replace(STRIP_HASH, '$1')] = {
			file: name,
			raw: buf.length,
			gz: zlib.gzipSync(buf).length,
		}
	}

	return {
		worker: { ...total(walk(serverDir)), limit: WORKER_GZ_LIMIT },
		js: total(js),
		css: total(css),
		static: total(staticFiles),
		chunks,
	}
}

module.exports = { measure, WORKER_GZ_LIMIT }

if (require.main === module) {
	const [dist, out] = process.argv.slice(2)
	if (!dist || !out) {
		console.error('usage: measure-bundle.cjs <dist-dir> <output.json>')
		process.exit(2)
	}
	const r = measure(dist)
	fs.mkdirSync(path.dirname(out), { recursive: true })
	fs.writeFileSync(out, JSON.stringify(r, null, 2))
	const pct = ((r.worker.gz / WORKER_GZ_LIMIT) * 100).toFixed(1)
	console.log(
		`worker ${(r.worker.gz / 1048576).toFixed(2)} MB gzipped (${pct}% of the 10 MB limit) · ` +
			`client ${(r.js.gz / 1024).toFixed(2)} kB JS + ${(r.css.gz / 1024).toFixed(2)} kB CSS gzipped · ` +
			`${Object.keys(r.chunks).length} fingerprinted chunk(s)`
	)
}
