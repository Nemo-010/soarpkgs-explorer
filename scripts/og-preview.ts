/**
 * Render a local preview of the Open Graph cards, the way a social platform
 * would show them.
 *
 * Reads the real tags out of the built pages and lays them out as X and
 * Facebook style cards, plus a small-size row so text legibility can be judged
 * at thumbnail scale. The point is to catch a missing image, a wrong tag, or
 * text too small to read before the link is ever shared.
 *
 * Requires `bun run build` first. Writes build/og-preview.html; open it
 * directly in a browser.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = 'build';
const OUT = join(BUILD, 'og-preview.html');

interface Card {
	page: string;
	title: string;
	description: string;
	image: string;
	alt: string;
	twitterCard: string;
}

function meta(html: string, attr: 'property' | 'name', key: string): string {
	const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return html.match(new RegExp(`<meta ${attr}="${escaped}" content="([^"]*)"`))?.[1] ?? '';
}

function readCard(file: string, page: string): Card | null {
	const path = join(BUILD, file);
	try {
		const html = readFileSync(path, 'utf8');
		const image = meta(html, 'property', 'og:image');
		if (!image) return null;
		return {
			page,
			title: meta(html, 'property', 'og:title') || html.match(/<title>([^<]*)<\/title>/)?.[1] || '',
			description: meta(html, 'property', 'og:description') || meta(html, 'name', 'description'),
			// Absolute production URL -> local path under build/, so the preview
			// works offline without hitting the deployed site.
			image: image.replace(/^https?:\/\/[^/]+/, ''),
			alt: meta(html, 'property', 'og:image:alt'),
			twitterCard: meta(html, 'name', 'twitter:card')
		};
	} catch {
		return null;
	}
}

const slugs = readdirSync(join(BUILD, 'pkg'));

// Sample a spread rather than dumping all 532: the homepage, the longest name,
// the longest description, and a few ordinary packages.
const packages = JSON.parse(readFileSync('src/lib/generated/packages.json', 'utf8')) as {
	slug: string;
	pkg_name: string;
	description: string | null;
}[];
const longestName = [...packages].sort((a, b) => b.pkg_name.length - a.pkg_name.length)[0];
const longestDesc = [...packages].sort(
	(a, b) => (b.description ?? '').length - (a.description ?? '').length
)[0];
const sample = ['home', longestName.slug, longestDesc.slug, ...slugs.slice(0, 2)].filter(
	(slug, i, all) => slug && all.indexOf(slug) === i
);

const cards: Card[] = [
	...(readCard('index.html', 'homepage') ? [readCard('index.html', 'homepage')!] : []),
	...sample
		.filter((slug) => slug !== 'home')
		.map((slug) => readCard(join('pkg', slug, 'index.html'), `/pkg/${slug}/`))
		.filter((c): c is Card => c !== null)
];

const esc = (value: string) =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One card at a given width, showing whether the image loads. */
function render(card: Card, width: number, label: string): string {
	return `
<figure class="card" style="width:${width}px">
	<div class="imgwrap">
		<img src="${esc(card.image)}" alt="${esc(card.alt)}" onerror="this.dataset.broken=1">
	</div>
	<div class="body">
		<div class="domain">${esc(card.page.replace(/^\/pkg\/([^/]+)\/.*$/, '$1').replace(/^\/$/, 'soarpkgs.qaidvoid.dev'))}</div>
		<div class="title">${esc(card.title)}</div>
		<div class="desc">${esc(card.description)}</div>
	</div>
	<figcaption>${esc(card.page)} &middot; ${esc(label)} &middot; ${width}px</figcaption>
</figure>`;
}

const xCards = cards.map((c) => render(c, 500, `x-card=${c.twitterCard}`)).join('');
const fbCards = cards.map((c) => render(c, 400, 'facebook-style')).join('');
const thumbs = cards.map((c) => render(c, 200, 'small thumbnail')).join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OG card preview</title>
<style>
	body { margin: 0; padding: 32px; background: #0b0c0f; color: #e7e9ee;
		font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
	h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
		color: #8b949e; margin: 32px 0 12px; }
	h1 { font-size: 18px; margin: 0 0 4px; }
	p.sub { color: #8b949e; margin: 0 0 8px; }
	.row { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
	.card { margin: 0; background: #16181d; border: 1px solid #30363d; border-radius: 12px;
		overflow: hidden; }
	.imgwrap { aspect-ratio: 1200 / 630; background: #000; }
	.imgwrap img { width: 100%; height: 100%; display: block; object-fit: cover; }
	.imgwrap img[data-broken] { outline: 3px solid #f85149; }
	.body { padding: 10px 12px 12px; }
	.domain { font-size: 12px; color: #8b949e; }
	.title { font-weight: 600; margin: 2px 0 3px; }
	.desc { font-size: 13px; color: #b9c0cc; }
	figcaption { font-family: ui-monospace, monospace; font-size: 11px; color: #6e7681;
		padding: 6px 12px; border-top: 1px solid #30363d; }
</style>
</head>
<body>
<h1>Open Graph card preview</h1>
<p class="sub">Tags read from ${esc(BUILD)}/. Open this file in a browser. A red outline means the image 404s.</p>

<h2>X / Twitter</h2>
<div class="row">${xCards}</div>

<h2>Facebook</h2>
<div class="row">${fbCards}</div>

<h2>Thumbnail legibility</h2>
<div class="row">${thumbs}</div>
</body>
</html>`;

writeFileSync(OUT, html);
console.log(`Wrote ${OUT} with ${cards.length} cards.`);
for (const card of cards) {
	const exists = (() => {
		try {
			readFileSync(join(BUILD, card.image));
			return true;
		} catch {
			return false;
		}
	})();
	console.log(`  ${exists ? 'ok ' : 'MISSING'} ${card.page} -> ${card.image}`);
}
