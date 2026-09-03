// `pnpm format` runs this: each staged file goes to whichever formatter owns
// it. The repo-wide pass is `pnpm format:all`.
export default {
	"*.astro": "prettier --write",
	"*.{js,jsx,ts,tsx,mjs,cjs,json,jsonc,css}":
		"oxfmt --ignore-path .oxfmtignore --no-error-on-unmatched-pattern",
};
