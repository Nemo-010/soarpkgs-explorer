/**
 * Generate the static Open Graph cards: `static/og.png` for the homepage and
 * `static/og/pkg/<slug>.png` for every package page.
 *
 * The cards are prerendered text rather than screenshots so they stay readable
 * at thumbnail size and never leak whatever page happened to be open when a
 * screenshot was taken. Every colour mirrors the dark theme in `src/app.css`,
 * so the cards follow the brand.
 *
 * Requires ffmpeg with drawtext (libfreetype) and JetBrains Mono. Run with
 * `bun run og` (also runs as part of `bun run build`).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT_DIR = 'static/og';
/** Scratch dir for drawtext textfiles, removed when the script finishes. */
const TMP_DIR = mkdtempSync(join(tmpdir(), 'og-'));

/** Where the JetBrains Mono fonts may live: a local install, or the Debian package. */
const FONT_DIRS = [
	`${process.env.HOME}/.local/share/fonts/JetBrainsMono`,
	'/usr/share/fonts/truetype/jetbrains-mono',
	'/usr/local/share/fonts/JetBrainsMono'
];

/**
 * Locate one weight of the font, so the script works with a local font
 * install and with the distribution's `fonts-jetbrains-mono` package that CI
 * installs, which uses a different directory and includes the `NL` variants.
 */
function fontFile(weight: 'Bold' | 'Medium' | 'Regular'): string {
	const names = [`JetBrainsMono-${weight}.ttf`, `JetBrainsMonoNL-${weight}.ttf`];
	for (const dir of FONT_DIRS) {
		for (const name of names) {
			const path = join(dir, name);
			if (existsSync(path)) return path;
		}
	}
	throw new Error(
		`JetBrains Mono (${weight}) not found. Looked for ${names.join(' and ')} in: ${FONT_DIRS.join(', ')}`
	);
}

const FONTS = {
	Bold: fontFile('Bold'),
	Medium: fontFile('Medium'),
	Regular: fontFile('Regular')
} as const;

/** Design tokens, mirroring the dark theme in src/app.css. */
const THEME = {
	bg: '0x0b0c0f',
	text: '0xe7e9ee',
	muted: '0x8b949e',
	accent: '0x2dd4bf',
	/** The favicon's gradient, used for the bar along the top. */
	gradient: ['0x58a6ff', '0x3fb9a2', '0xd29922']
} as const;

const WIDTH = 1200;
const HEIGHT = 630;
const BAR_HEIGHT = 8;
const MARGIN = 100;
/** Width available to text, in pixels. */
const CONTENT_WIDTH = WIDTH - MARGIN * 2;

type Segment = {
	text: string;
	color: string;
	font: keyof typeof FONTS;
	size: number;
	/** Shift down from the line's y, for text sharing a baseline with a bigger size. */
	dy?: number;
};

/**
 * JetBrains Mono advances a fixed 0.6em per character, so a string's width is
 * known from its length. Deriving positions from that rather than hardcoding
 * pixels is what keeps segments from overlapping when the text changes.
 */
const ADVANCE = 0.6;

/** Width of a string at a given font size, in pixels. */
function textWidth(text: string, size: number): number {
	return text.length * size * ADVANCE;
}

/**
 * Write a drawtext string to a temp file and return a filter reading it.
 *
 * Passing text inline is fragile: a `:` in package descriptions is parsed as
 * a filter option separator, `%` as a strftime expansion, and `'` (as in
 * "BioWare's") ends the quoting with no working escape inside single quotes.
 * `textfile` sidesteps all three because the file's bytes are taken verbatim.
 */
let textFileCounter = 0;
function textFile(text: string): string {
	const path = `${TMP_DIR}/text-${textFileCounter++}.txt`;
	writeFileSync(path, text);
	return `textfile=${path}`;
}

/** One drawtext filter for a segment placed at (x, y). */
function drawText(x: number, y: number, segment: Segment): string {
	return [
		`drawtext=fontfile=${FONTS[segment.font]}`,
		textFile(segment.text),
		`fontcolor=${segment.color}`,
		`fontsize=${segment.size}`,
		`x=${Math.round(x)}`,
		`y=${Math.round(y)}`
	].join(':');
}

/**
 * Lay out segments left to right on one line, returning drawtext filters.
 * Segments are placed by accumulating each one's width, so changing one
 * segment's text shifts the rest rather than overlapping them.
 */
function drawLine(y: number, segments: Segment[]): string {
	let x = MARGIN;
	const filters = segments.map((segment) => {
		const filter = drawText(x, y + (segment.dy ?? 0), segment);
		x += textWidth(segment.text, segment.size);
		return filter;
	});
	return filters.join(',');
}

/**
 * Fit text to the content width by stepping the font size down. Returns the
 * first size that fits, or the smallest as a floor.
 */
function fitSize(text: string, sizes: number[]): number {
	for (const size of sizes) {
		if (textWidth(text, size) <= CONTENT_WIDTH) return size;
	}
	return sizes[sizes.length - 1];
}

/**
 * Wrap text to a maximum width, breaking on spaces so words stay whole. A word
 * wider than the line on its own is split by character rather than allowed to
 * overflow the card.
 */
function wrapText(text: string, maxWidth: number, size: number): string[] {
	const lines: string[] = [];
	let line = '';
	for (const word of text.split(/\s+/).filter(Boolean)) {
		const candidate = line ? `${line} ${word}` : word;
		if (textWidth(candidate, size) <= maxWidth) {
			line = candidate;
			continue;
		}
		if (line) lines.push(line);
		if (textWidth(word, size) > maxWidth) {
			let chunk = '';
			for (const char of word) {
				if (textWidth(chunk + char, size) > maxWidth) {
					lines.push(chunk);
					chunk = char;
				} else {
					chunk += char;
				}
			}
			line = chunk;
		} else {
			line = word;
		}
	}
	if (line) lines.push(line);
	return lines;
}

interface Package {
	slug: string;
	pkg_name: string;
	description: string | null;
}

/** The homepage card: brand, tagline, install command. */
function homeCard(): string {
	return [
		drawLine(230, [
			{ text: '$ ', color: THEME.accent, font: 'Bold', size: 84 },
			{ text: 'soarpkgs', color: THEME.text, font: 'Bold', size: 84 },
			{ text: ' explorer', color: THEME.muted, font: 'Medium', size: 44, dy: 32 }
		]),
		drawLine(370, [
			{
				text: 'package repository for Soar',
				color: THEME.muted,
				font: 'Regular',
				size: 30
			}
		]),
		drawLine(505, [
			{ text: '$ ', color: THEME.accent, font: 'Bold', size: 26 },
			{ text: 'soar install ', color: THEME.text, font: 'Regular', size: 26 },
			{ text: '<package>', color: THEME.muted, font: 'Regular', size: 26 }
		])
	].join(',');
}

/**
 * A package card: `$<name>` with the real description beneath it and the
 * install command pinned to the bottom, so a shared link shows the same
 * content the page shows.
 */
function packageCard(pkg: Package): string {
	// The `$ ` prefix is part of the name line, so reserve its width when
	// fitting. Names run to 25 characters, which overflows the 84px wordmark.
	const prefix = '$ ';
	const size = fitSize(`${prefix}${pkg.pkg_name}`, [84, 72, 60, 48]);

	const lines = wrapText(pkg.description ?? '', CONTENT_WIDTH, 30).slice(0, 2);
	const filters = [
		drawLine(230, [
			{ text: prefix, color: THEME.accent, font: 'Bold', size },
			{ text: pkg.pkg_name, color: THEME.text, font: 'Bold', size }
		])
	];
	for (const [i, line] of lines.entries()) {
		filters.push(
			drawText(MARGIN, 370 + i * 44, {
				text: line,
				color: THEME.muted,
				font: 'Regular',
				size: 30
			})
		);
	}
	filters.push(
		drawLine(505, [
			{ text: '$ ', color: THEME.accent, font: 'Bold', size: 26 },
			{ text: 'soar install ', color: THEME.text, font: 'Regular', size: 26 },
			{ text: pkg.pkg_name, color: THEME.muted, font: 'Regular', size: 26 }
		])
	);
	return filters.join(',');
}

/**
 * Render one card. The flat background and gradient bar are two lavfi inputs
 * overlaid, then the text filters chain onto the overlay output.
 */
function renderCard(filters: string, out: string): void {
	const result = spawnSync(
		'ffmpeg',
		[
			'-y',
			'-loglevel',
			'error',
			'-f',
			'lavfi',
			'-i',
			`color=c=${THEME.bg}:s=${WIDTH}x${HEIGHT}:d=1`,
			'-f',
			'lavfi',
			'-i',
			`gradients=s=${WIDTH}x${BAR_HEIGHT}:c0=${THEME.gradient[0]}:c1=${THEME.gradient[1]}:c2=${THEME.gradient[2]}:nb_colors=3:x0=0:y0=0:x1=${WIDTH - 1}:y1=0:d=1`,
			'-filter_complex',
			`[0:v][1:v]overlay=0:0[base];[base]${filters}`,
			'-frames:v',
			'1',
			out
		],
		{ stdio: ['ignore', 'ignore', 'pipe'] }
	);
	if (result.status !== 0) {
		throw new Error(result.stderr?.toString() || 'ffmpeg failed');
	}
}

async function main(): Promise<void> {
	try {
		await mkdir(`${OUT_DIR}/pkg`, { recursive: true });
		renderCard(homeCard(), `${OUT_DIR}.png`);

		const packages = JSON.parse(
			readFileSync('src/lib/generated/packages.json', 'utf8')
		) as Package[];
		for (const pkg of packages) {
			renderCard(packageCard(pkg), `${OUT_DIR}/pkg/${pkg.slug}.png`);
		}
		console.log(`Wrote ${OUT_DIR}.png and ${packages.length} package cards to ${OUT_DIR}/pkg/.`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	} finally {
		rmSync(TMP_DIR, { recursive: true, force: true });
	}
}

await main();
