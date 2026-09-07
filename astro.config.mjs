import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { access, d1, r2 } from "@emdash-cms/cloudflare";
import { cloudflareEmail } from "@emdash-cms/cloudflare/plugins";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";

// Astro loads .env for `import.meta.env` inside the app, not for `process.env`
// out here, so the config file has to read the file itself.
try {
	process.loadEnvFile();
} catch {
	// No .env; the variables may still come from the shell.
}

// The Access application is fixed and neither value is secret: the team domain
// shows up in every login redirect, and the AUD tag only says which application
// signed a JWT. `access()` bakes both into the bundle at config time, so they
// have to be literals here or in the environment -- wrangler.jsonc's `vars` is
// the worker's RUNTIME environment and a build container never sees it.
const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN || "shy-snow-5265.cloudflareaccess.com";
const audience =
	process.env.CF_ACCESS_AUD || "a0d488cfb2cef1984c0462c469a257d431bd14fcd736d5dc501bc0efd01e02f9";

const accessAuth = access({
	teamDomain,
	audience,
	// New identities are provisioned at this level. Lowering it is a one-way
	// door: nobody below Admin can raise themselves back.
	//
	// 40 is Editor: all content and taxonomies, but not schemas.
	defaultRole: 40,
});

export default defineConfig({
	// Canonical origin for Astro's own absolute URLs, such as SEO tags. EmDash
	// does not read this: its outbound mail resolves the origin from
	// EMDASH_SITE_URL, then the stored `emdash:site_url`, then the request.
	site: "https://faustinajohnson.com",
	output: "server",
	adapter: cloudflare(),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	fonts: [
		{
			provider: fontProviders.google(),
			name: "IM Fell English SC",
			cssVariable: "--font-display",
			weights: [400],
			styles: ["normal"],
			subsets: ["latin"],
			fallbacks: ["Georgia", "serif"],
		},
		{
			provider: fontProviders.google(),
			name: "IM Fell English",
			cssVariable: "--font-body",
			weights: [400],
			styles: ["normal", "italic"],
			subsets: ["latin"],
			fallbacks: ["Georgia", "serif"],
		},
	],
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
			auth: accessAuth,
			plugins: [
				// Without a real provider the only email:deliver handler is a dev
				// console stub, so magic-link login and recovery mail fail with
				// "Email is not configured". Activate under Admin -> Extensions.
				cloudflareEmail({
					from: { email: "cms@mail.faustinajohnson.com", name: "Faustina Johnson" },
				}),
			],
		}),
	],
	devToolbar: { enabled: false },
	vite: {
		server: {
			// miniflare rewrites its D1/R2/KV state under .wrangler/ on every
			// request; without this the watcher reads those writes as source edits
			// and reloads the worker mid-request, wedging astro dev.
			watch: { ignored: ["**/.wrangler/**"] },
		},
	},
});
