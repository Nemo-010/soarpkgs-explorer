/**
 * Prerendered XML sitemap listing the home page and every package page.
 *
 * `lastmod` carries the dataset build time, so crawlers can skip pages whose
 * metadata has not changed between site rebuilds.
 */
import { allPackages, datasetMeta } from '$lib/data.server';
import { absoluteUrl } from '$lib/site';
import type { RequestHandler } from './$types';

export const prerender = true;

// The layout's `trailingSlash = 'always'` must not turn this file route into a
// directory-style URL; a sitemap lives at the bare `/sitemap.xml`.
export const trailingSlash = 'never';

/** Escape the five XML entities for use inside element text. */
function escapeXml(value: string): string {
	return value.replace(
		/[<>&'"]/g,
		(c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c
	);
}

function urlEntry(path: string, lastmod: string): string {
	return `\t<url><loc>${escapeXml(absoluteUrl(path))}</loc><lastmod>${lastmod}</lastmod></url>`;
}

export const GET: RequestHandler = () => {
	const lastmod = datasetMeta().builtAt;
	const entries = [
		urlEntry('/', lastmod),
		...allPackages().map((pkg) => urlEntry(`/pkg/${pkg.slug}/`, lastmod))
	];
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;

	return new Response(body, {
		headers: { 'content-type': 'application/xml; charset=utf-8' }
	});
};
