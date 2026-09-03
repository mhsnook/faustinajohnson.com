// Using lint-staged to trigger the formatters.
export default {
	"*.astro": "prettier --write",
	"*.{js,jsx,ts,tsx,mjs,cjs,json,jsonc,css}":
		"oxfmt --ignore-path .oxfmtignore --no-error-on-unmatched-pattern",
};
