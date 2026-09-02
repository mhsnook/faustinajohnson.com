'use strict'

// The one place the pass/fail policy lives.
//
// Reporting and gating are deliberately separate: the comment always posts, so
// a contributor can see the full picture even on a red build. This step then
// decides, from the same numbers, whether the build should fail.

const fs = require('fs')
const path = require('path')

// Strictness per check.
//   'report-only'      never fails — the comment is the whole point
//   'no-new'           fails when this PR adds any issue of this kind
//   'touched-clean'    fails on any issue in a file this PR touched, new or
//                      pre-existing; issues in untouched files never fail
//   { maxNew: N }      allows up to N new issues
//   { maxTotal: N }    fails on the absolute count, ignoring the delta
//
// typecheck, lint and tests are 'no-new' because all three start at zero on
// this repo — nothing has to be cleaned up before the gate is usable.
//
// format is 'touched-clean' rather than 'no-new' because formatting is not
// linting: the formatter applies to every file you touch, every time. Six
// .astro files pre-date the formatter and are deliberately left alone; they
// clear as they are edited.
const POLICY = {
	typecheck: 'no-new',
	lint: 'no-new',
	format: 'touched-clean',
	tests: 'no-new',
	// Bundle size has no "new issue" to count, so it takes byte budgets. These
	// are deliberately loose: they exist to catch an accidental dependency, not
	// to argue about kilobytes. The worker limit is the one that is not a
	// preference — Cloudflare refuses the deploy above it.
	bundle: {
		maxWorkerGzDelta: 250 * 1024,
		maxClientGzDelta: 100 * 1024,
	},
}

function bundleVerdict(rule, data) {
	// The hard one first: over this, `wrangler deploy` fails outright, so it
	// blocks regardless of how much the PR itself added.
	if (data.workerGz != null && data.workerGzLimit != null && data.workerGz >= data.workerGzLimit) {
		return (
			`the Worker is ${(data.workerGz / 1048576).toFixed(2)} MB gzipped, at or over ` +
			`Cloudflare's ${(data.workerGzLimit / 1048576).toFixed(0)} MB limit — this deploy would be rejected`
		)
	}
	const checks = [
		['worker', data.workerGzDelta, rule.maxWorkerGzDelta],
		['client JS', data.clientGzDelta, rule.maxClientGzDelta],
	]
	for (const [label, grew, limit] of checks) {
		if (typeof limit !== 'number' || typeof grew !== 'number') continue
		if (grew > limit) {
			return (
				`${label} grew ${(grew / 1024).toFixed(2)} kB gzipped, over the ` +
				`${(limit / 1024).toFixed(0)} kB budget`
			)
		}
	}
	return null
}

function verdict(check, data) {
	const rule = POLICY[check] ?? 'report-only'
	if (rule === 'report-only') return null

	// A step that produced no measurement did not pass — it crashed. Treat the
	// absence as a failure for every gated check, or a broken build reads as
	// "no change" and merges clean.
	if (data.missing) return 'the step produced no measurement (crashed or was skipped)'

	// Scoped to the PR's own footprint rather than to the delta. A file nobody
	// edited being unformatted is not this PR's problem; a file this PR edited
	// is, even if it was already unformatted before.
	if (rule === 'touched-clean') {
		if (!data.touchedKnown)
			return 'no list of touched files was produced, so the touched-file gate could not run'
		return data.touched > 0 ?
				`${data.touched} touched file(s) still have issues — run \`pnpm format\` on the files you edited`
			:	null
	}

	if (check === 'tests') {
		return data.failed > 0 ? `${data.failed} failing test(s)` : null
	}

	if (check === 'bundle') {
		return bundleVerdict(rule, data)
	}

	if (rule === 'no-new') {
		return data.new > 0 ? `${data.new} new issue(s)` : null
	}
	if (typeof rule.maxNew === 'number') {
		return data.new > rule.maxNew ?
				`${data.new} new issue(s), over the limit of ${rule.maxNew}`
			:	null
	}
	if (typeof rule.maxTotal === 'number') {
		return data.total > rule.maxTotal ?
				`${data.total} total issue(s), over the limit of ${rule.maxTotal}`
			:	null
	}
	return null
}

function main(dir) {
	if (!fs.existsSync(dir)) {
		console.error(`No fragments at ${dir} — every check job failed before reporting.`)
		process.exit(1)
	}

	const sidecars = fs
		.readdirSync(dir, { recursive: true })
		.filter((f) => typeof f === 'string' && f.endsWith('.json'))
		.sort()

	const failures = []
	for (const f of sidecars) {
		const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
		const reason = verdict(data.check, data)
		if (reason) failures.push(`${data.check}: ${reason}`)
		else if ((POLICY[data.check] ?? 'report-only') === 'report-only')
			console.log(`➖ ${data.check} (report only, not gated)`)
		else console.log(`✅ ${data.check}`)
	}

	if (!failures.length) {
		console.log('\nAll gated checks passed.')
		return
	}
	console.error('\nBlocking:')
	for (const f of failures) console.error(`  ❌ ${f}`)
	console.error('\nSee the "### PR checks" comment on the pull request for detail.')
	process.exit(1)
}

if (require.main === module) main(process.argv[2] ?? '/tmp/fragments')

module.exports = { POLICY, verdict, bundleVerdict }
