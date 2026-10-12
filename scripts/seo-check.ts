/**
 * Offline SEO checks against the built site in `build/`.
 *
 * Verifies that every prerendered page ships the expected head metadata
 * (title, description, canonical, Open Graph, Twitter card, valid JSON-LD),
 * that every sitemap URL resolves to a real page and vice versa, and that
 * robots.txt points at the sitemap. Exits non-zero on any problem.
 *
 * Run after `bun run build` (wired into `bun run check`).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_URL } from '../src/lib/site';

const BUILD = 'build';

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

/** Every prerendered page, as `build`-relative paths ending in index.html. */
function pageFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...pageFiles(path));
		else if (entry.name === 'index.html') out.push(path);
	}
	return out;
}

function expectedUrl(file: string): string {
	return SITE_URL + file.slice(BUILD.length).replace(/index\.html$/, '');
}

function first(html: string, pattern: RegExp): string | null {
	return html.match(pattern)?.[1] ?? null;
}

if (!existsSync(join(BUILD, 'index.html'))) {
	console.error(`No build output in ${BUILD}/. Run \`bun run build\` first.`);
	process.exit(1);
}

const pages = pageFiles(BUILD);
const pageUrls = new Set<string>();

for (const file of pages) {
	const where = `${file}:`;
	const html = readFileSync(file, 'utf8');
	const url = expectedUrl(file);
	pageUrls.add(url);

	const titles = html.match(/<title>[^<]*<\/title>/g) ?? [];
	if (titles.length !== 1) fail(`${where} expected 1 <title>, found ${titles.length}`);

	const description = first(html, /<meta name="description" content="([^"]*)"/);
	if (!description) fail(`${where} missing meta description`);

	const canonical = first(html, /<link rel="canonical" href="([^"]*)"/);
	if (canonical !== url) fail(`${where} canonical is ${canonical}, expected ${url}`);

	const ogTitle = first(html, /<meta property="og:title" content="([^"]*)"/);
	const ogUrl = first(html, /<meta property="og:url" content="([^"]*)"/);
	const ogImage = first(html, /<meta property="og:image" content="([^"]*)"/);
	if (ogTitle === null) fail(`${where} missing og:title`);
	if (ogUrl !== url) fail(`${where} og:url is ${ogUrl}, expected ${url}`);
	if (ogImage !== `${SITE_URL}/og.png`) fail(`${where} og:image is ${ogImage}`);

	if (!/<meta name="twitter:card" content="summary_large_image"/.test(html)) {
		fail(`${where} missing twitter:card`);
	}

	if (html.includes('{@html')) fail(`${where} leaked Svelte template syntax`);

	const jsonLd = first(html, /<script type="application\/ld\+json">([^<]*)<\/script>/);
	if (!jsonLd) {
		fail(`${where} missing JSON-LD`);
	} else {
		try {
			const parsed = JSON.parse(jsonLd) as { '@context'?: string; '@type'?: unknown };
			if (!parsed['@context']?.includes('schema.org') || !parsed['@type']) {
				fail(`${where} JSON-LD lacks schema.org context or type`);
			}
		} catch {
			fail(`${where} JSON-LD is not valid JSON`);
		}
	}
}

// Sitemap: every URL must resolve to a page, and every page must be listed.
const sitemapPath = join(BUILD, 'sitemap.xml');
if (!existsSync(sitemapPath)) {
	fail('build/sitemap.xml missing');
} else {
	const sitemap = readFileSync(sitemapPath, 'utf8');
	const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
	const sitemapUrls = new Set<string>();

	for (const loc of locs) {
		if (!loc.startsWith(`${SITE_URL}/`)) {
			fail(`sitemap.xml: ${loc} is outside ${SITE_URL}`);
			continue;
		}
		const pathname = new URL(loc).pathname;
		sitemapUrls.add(loc);
		const file = join(BUILD, pathname, pathname.endsWith('/') ? 'index.html' : '');
		if (!existsSync(file)) fail(`sitemap.xml: ${loc} has no prerendered page`);
	}

	const lastmods = sitemap.match(/<lastmod>[^<]*<\/lastmod>/g) ?? [];
	if (lastmods.length !== locs.length) {
		fail(`sitemap.xml: ${locs.length - lastmods.length} URLs lack lastmod`);
	}

	for (const url of pageUrls) {
		if (!sitemapUrls.has(url)) fail(`sitemap.xml does not list ${url}`);
	}
	for (const url of sitemapUrls) {
		if (!pageUrls.has(url)) fail(`sitemap.xml lists unknown page ${url}`);
	}
}

const robots = readFileSync(join(BUILD, 'robots.txt'), 'utf8');
if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) {
	fail(`robots.txt missing "Sitemap: ${SITE_URL}/sitemap.xml"`);
}

if (!existsSync(join(BUILD, 'og.png'))) {
	fail('build/og.png missing');
}

if (failures.length > 0) {
	console.error(`SEO check failed with ${failures.length} problem(s):`);
	for (const message of failures) console.error(`  - ${message}`);
	process.exit(1);
}

console.log(`SEO check passed: ${pages.length} pages, sitemap, robots.txt, og.png all sane.`);
