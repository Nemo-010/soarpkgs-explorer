/**
 * Canonical site identity used for SEO metadata.
 *
 * The site is fully prerendered, so absolute URLs for canonical links, Open
 * Graph, the sitemap, and structured data are all derived from this constant.
 */

/** Origin the site is served from, no trailing slash.
 *
 * static/robots.txt hardcodes the same origin for its Sitemap line; the two
 * must be kept in sync.
 */
export const SITE_URL = 'https://soarpkgs.qaidvoid.dev';

/** Display name used in titles and `og:site_name`. */
export const SITE_NAME = 'soarpkgs explorer';

/** One-line description of what the site is, used in titles, the og card, and alt text. */
export const SITE_TAGLINE = 'package repository for Soar';

/**
 * Join a root-relative path (starting with `/`) onto the site origin.
 * The trailing-slash convention is left to the caller, matching `trailingSlash = 'always'`.
 */
export function absoluteUrl(path: string): string {
	return `${SITE_URL}${path}`;
}
