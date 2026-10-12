/**
 * Generate the static Open Graph card at `static/og.png`.
 *
 * The card is prerendered text rather than a screenshot so it stays readable
 * at thumbnail size and never leaks whatever page happened to be open when a
 * screenshot was taken. Every colour mirrors the dark theme in `src/app.css`,
 * so the card follows the brand.
 *
 * Requires ffmpeg with drawtext (libfreetype). Run with `bun run og`.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const OUT = 'static/og.png';
const FONT_DIR = `${process.env.HOME}/.local/share/fonts/JetBrainsMono`;

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

type Segment = {
	text: string;
	color: string;
	font: string;
	size: number;
	/** Shift down from the line's y, for text sharing a baseline with a bigger size. */
	dy?: number;
};

/**
 * Lay out segments on one line, returning comma-separated drawtext filters.
 *
 * JetBrains Mono advances a fixed 0.6em per character, so a string's width is
 * known from its length. Deriving positions from that rather than hardcoding
 * pixels is what keeps segments from overlapping when the text changes.
 */
function drawLine(y: number, segments: Segment[]): string {
	let x = MARGIN;
	const filters = segments.map((segment) => {
		const filter = [
			`drawtext=fontfile=${FONT_DIR}/${segment.font}.ttf`,
			// A leading `:` would be parsed as a filter option separator even
			// inside quotes, so every colon is escaped.
			`text='${segment.text.replaceAll(':', '\\:')}'`,
			`fontcolor=${segment.color}`,
			`fontsize=${segment.size}`,
			`x=${Math.round(x)}`,
			`y=${y + (segment.dy ?? 0)}`
		].join(':');
		x += segment.text.length * segment.size * 0.6;
		return filter;
	});
	return filters.join(',');
}

// Lay the gradient bar over the flat background, then chain the text on top.
const filters =
	`[0:v][1:v]overlay=0:0[base];[base]` +
	[
		drawLine(230, [
			{ text: '$ ', color: THEME.accent, font: 'JetBrainsMono-Bold', size: 84 },
			{ text: 'soarpkgs', color: THEME.text, font: 'JetBrainsMono-Bold', size: 84 },
			{ text: ' explorer', color: THEME.muted, font: 'JetBrainsMono-Medium', size: 44, dy: 32 }
		]),
		drawLine(370, [
			{
				text: 'package repository for Soar',
				color: THEME.muted,
				font: 'JetBrainsMono-Regular',
				size: 30
			}
		]),
		drawLine(505, [
			{ text: '$ ', color: THEME.accent, font: 'JetBrainsMono-Bold', size: 26 },
			{ text: 'soar install ', color: THEME.text, font: 'JetBrainsMono-Regular', size: 26 },
			{ text: '<package>', color: THEME.muted, font: 'JetBrainsMono-Regular', size: 26 }
		])
	].join(',');

if (!existsSync(`${FONT_DIR}/JetBrainsMono-Bold.ttf`)) {
	console.error(`JetBrains Mono not found at ${FONT_DIR}.`);
	process.exit(1);
}

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
		filters,
		'-frames:v',
		'1',
		OUT
	],
	{ stdio: ['ignore', 'inherit', 'inherit'] }
);

if (result.status !== 0) {
	console.error('ffmpeg failed to render the og card.');
	process.exit(result.status ?? 1);
}

console.log(`Wrote ${OUT} (${WIDTH}x${HEIGHT}).`);
