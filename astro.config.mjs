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

// Cloudflare Access fronts /_emdash/admin, and EmDash verifies the Access JWT
// on every /_emdash request, so the admin needs no second login. Passkey auth
// is off whenever `auth` is set, and the Access JWT never reaches a local
// build -- so EMDASH_LOCAL_AUTH=1 swaps back to passkey for `astro preview`.
const localAuth = process.env.EMDASH_LOCAL_AUTH === "1";
const accessTeamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
const accessAudience = process.env.CF_ACCESS_AUD;

const accessAuth =
	!localAuth && accessTeamDomain && accessAudience
		? access({
				teamDomain: accessTeamDomain,
				audience: accessAudience,
				// Everyone the Access policy admits lands here as an EmDash admin.
				// Narrow who gets in from the Access policy, not from this number.
				defaultRole: 50,
			})
		: undefined;

// `astro preview` and `astro check` load this file too, and neither of them
// serves the admin, so the missing-variable check waits until a build -- the
// one moment where it would ship the wrong login.
const requireAccessOnBuild = {
	name: "require-cloudflare-access",
	hooks: {
		"astro:build:start": () => {
			if (accessAuth || localAuth) return;
			throw new Error(
				"Cloudflare Access is the admin login for this site, so a build needs " +
					"CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD (see .env.example). " +
					"For a local build with passkey login instead: pnpm build:local",
			);
		},
	},
};

export default defineConfig({
	// Canonical origin. Without it, absolute URLs (magic-link login, recovery
	// mail, SEO tags) are built from whichever origin served the request, which
	// meant login links pointed at the workers.dev URL.
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
		requireAccessOnBuild,
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
});
