/** Resolved media reference from getSiteSettings() */
export interface MediaReference {
	mediaId: string;
	alt?: string;
	url?: string;
}

export interface StarterSiteIdentitySettings {
	title?: string;
	tagline?: string;
	logo?: MediaReference;
}

const DEFAULT_SITE_TITLE = "My Site";
const DEFAULT_SITE_TAGLINE = "Built with EmDash";

export function resolveStarterSiteIdentity(settings?: StarterSiteIdentitySettings) {
	return {
		siteTitle: settings?.title ?? DEFAULT_SITE_TITLE,
		siteTagline: settings?.tagline ?? DEFAULT_SITE_TAGLINE,
		siteLogo: settings?.logo?.url ? settings.logo : null,
	};
}

/** Author portrait. EmDash seeds can only carry media by URL, so this ships as a
 *  file in public/. A portrait uploaded to the About page in the admin wins. */
export const AUTHOR_PORTRAIT = {
	provider: "external",
	id: "portrait-faustina-johnson",
	src: "/faustina-johnson.png",
	alt: "Faustina Johnson",
	width: 766,
	height: 808,
} as const;
