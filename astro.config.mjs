import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { cloudflareEmail } from "@emdash-cms/cloudflare/plugins";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";

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
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
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
