/**
 * Portal design preview.
 *
 * There is no browser in this environment, so this mirrors the metrics in
 * css/portal.css as SVG and rasterises it with resvg. It reuses the REAL card
 * artwork (js/card-art.js) and the REAL catalogue (js/games.js), so what you
 * see is the actual artwork and copy in a layout of the right proportions.
 *
 * It is a design check, not a layout engine: it catches proportions, spacing,
 * density and contrast problems, not CSS bugs.
 *
 *   node tools/portal-mock.mjs [--out file.png] [--width 1120]
 */
import { writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve as pathResolve } from 'node:path';
import { ART } from '../js/card-art.js';
import { GAMES } from '../js/games.js';

const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const W = Number(getArg('width', 1120));
const OUT = getArg('out', pathResolve(process.env.HOME || '.', 'tmp', 'portal-mock.png'));

const req = createRequire(pathResolve(process.env.HOME || '.', 'testdeps', 'package.json'));
let Resvg;
try { ({ Resvg } = req('@resvg/resvg-js')); }
catch (e) { console.error('@resvg/resvg-js not installed — portal mock skipped'); process.exit(0); }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = 'Noto Sans CJK SC, Noto Sans SC, sans-serif';

/** Rough text wrap: CJK ≈ 1em, ASCII ≈ 0.55em. */
function wrap(text, maxUnits) {
  const out = [];
  let line = '', units = 0;
  for (const ch of text) {
    const w = ch.charCodeAt(0) > 0x2000 ? 1 : 0.55;
    if (units + w > maxUnits && line) { out.push(line); line = ''; units = 0; }
    line += ch; units += w;
  }
  if (line) out.push(line);
  return out;
}
const textW = (s, size) => [...s].reduce((a, c) => a + (c.charCodeAt(0) > 0x2000 ? size : size * 0.55), 0);

/* ------------------------------------------------- metrics from portal.css */
const PAD = 34, GAP = 24, RADIUS = 18, BODY_PAD = 18;
const COLS = W < 700 ? 1 : 2;
const CARD_W = (W - PAD * 2 - GAP * (COLS - 1)) / COLS;
const THUMB_H = CARD_W / 2;
const BODY_W = CARD_W - BODY_PAD * 2;

/* ---------------------------------------------------- measure each card */
const measured = GAMES.map((g) => {
  const descLines = wrap(g.desc, Math.floor(BODY_W / 13.5));
  const tags = g.tags.map((t) => ({ t, w: textW(t, 11) + 20 }));
  const tagsRows = [tags];
  const bodyH =
    17 + 28 + 10 +                                  // title row
    descLines.length * 13.5 * 1.72 + 10 +           // description
    21 + 10 + 13 +                                  // tags row
    42 + 12;                                        // CTA pill + gap
  return { g, descLines, tagsRows, h: THUMB_H + bodyH };
});

/* --------------------------------------------------------------- layout */
const rows = [];
for (let i = 0; i < measured.length; i += COLS) {
  const slice = measured.slice(i, i + COLS);
  rows.push({ items: slice, h: Math.max(...slice.map((m) => m.h)) });
}

let cursor = 92 + 62 + 14 + 14 + 56;              // masthead block
const placed = [];
for (const row of rows) {
  row.items.forEach((m, c) => {
    placed.push({ ...m, x: PAD + c * (CARD_W + GAP), y: cursor });
  });
  cursor += row.h + GAP;
}
const contentBottom = cursor - GAP;
const footerY = contentBottom + 58;
const H = Math.round(footerY + 60);

/* ------------------------------------------------------------------ draw */
const p = [];
const HZ = H * 0.30, SX = W / 2, SR = Math.min(W, H) * 0.10, SY = HZ - SR * 0.42;

p.push(`<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#05020c"/><stop offset="65%" stop-color="#0d0620"/>
    <stop offset="100%" stop-color="#1d0a33"/></linearGradient>
  <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#ffe36b"/><stop offset="42%" stop-color="#ff9a3c"/>
    <stop offset="100%" stop-color="#ff2fd0"/></linearGradient>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#ff2fd0" stop-opacity="0.34"/>
    <stop offset="100%" stop-color="#ff2fd0" stop-opacity="0"/></radialGradient>
  <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#05020c" stop-opacity="0.86"/>
    <stop offset="26%" stop-color="#05020c" stop-opacity="0.34"/>
    <stop offset="78%" stop-color="#05020c" stop-opacity="0.55"/>
    <stop offset="100%" stop-color="#05020c" stop-opacity="0.94"/></linearGradient>
  <clipPath id="sunclip"><circle cx="${SX}" cy="${SY}" r="${SR}"/></clipPath>
</defs>`);

p.push(`<rect width="${W}" height="${H}" fill="url(#sky)"/>`);
p.push(`<circle cx="${SX}" cy="${SY}" r="${SR * 4}" fill="url(#halo)"/>`);
p.push(`<g clip-path="url(#sunclip)"><rect x="${SX - SR}" y="${SY - SR}" width="${SR * 2}" height="${SR * 2}" fill="url(#sun)"/>`);
for (let i = 0; i < 9; i++) {
  p.push(`<rect x="${SX - SR}" y="${(SY + SR * 0.06 + i * SR * 0.15).toFixed(1)}" width="${SR * 2}" height="${(1.2 + i * 0.85).toFixed(1)}" fill="#0b0520"/>`);
}
p.push('</g>');
p.push(`<rect x="0" y="${HZ.toFixed(1)}" width="${W}" height="${(H - HZ).toFixed(1)}" fill="#0a0518"/>`);
for (let i = -14; i <= 14; i++) {
  p.push(`<line x1="${SX}" y1="${HZ.toFixed(1)}" x2="${(SX + i * (H * 0.11)).toFixed(1)}" y2="${H + 40}" stroke="#27f4ff" stroke-opacity="0.28" stroke-width="1"/>`);
}
for (let i = 1; i <= 18; i++) {
  const ry = HZ + (H - HZ + 40) / i;
  if (ry > H) continue;
  p.push(`<line x1="0" y1="${ry.toFixed(1)}" x2="${W}" y2="${ry.toFixed(1)}" stroke="#ff2fd0" stroke-opacity="0.26" stroke-width="1"/>`);
}
p.push(`<rect width="${W}" height="${H}" fill="url(#veil)"/>`);

/* masthead */
let my = 92;
const WM = Math.max(30, Math.min(0.084 * W, 62));
p.push(`<text x="${W / 2}" y="${my}" text-anchor="middle" font-family="${FONT}" font-size="${WM.toFixed(1)}" font-weight="900" letter-spacing="3.7"><tspan fill="#ffffff">JIANGUO18</tspan><tspan fill="#ff2fd0">.TOP</tspan></text>`);
my += 28;
p.push(`<text x="${W / 2}" y="${my}" text-anchor="middle" font-family="${FONT}" font-size="14" fill="#9b8fc4" letter-spacing="5.9">游戏厅 · 挑一个开始玩</text>`);

/* cards */
placed.forEach((m, i) => {
  const { g, x, y } = m;
  const acc = g.accent, acc2 = g.accent2;

  p.push(`<rect x="${x}" y="${y}" width="${CARD_W}" height="${m.h}" rx="${RADIUS}" fill="#0c061a" fill-opacity="0.9" stroke="#8b5cff" stroke-opacity="0.34"/>`);
  p.push(`<line x1="${(x + RADIUS).toFixed(1)}" y1="${(y + 1).toFixed(1)}" x2="${(x + CARD_W - RADIUS).toFixed(1)}" y2="${(y + 1).toFixed(1)}" stroke="${acc}" stroke-opacity="0.8" stroke-width="2"/>`);

  p.push(`<clipPath id="th${i}"><rect x="${x}" y="${y}" width="${CARD_W}" height="${THUMB_H}"/></clipPath>`);
  p.push(`<g clip-path="url(#th${i})">`);
  // resvg panics on a nested <svg>, so lift the artwork's inner content into a
  // plain <g> and let the outer scale transform place it
  const art = (ART[g.art] || ART.neon)(acc, acc2)
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');
  p.push(`<g transform="translate(${x} ${y}) scale(${(CARD_W / 200).toFixed(4)} ${(THUMB_H / 100).toFixed(4)})">${art}</g>`);
  p.push(`<rect x="${x}" y="${(y + THUMB_H * 0.55).toFixed(1)}" width="${CARD_W}" height="${(THUMB_H * 0.45).toFixed(1)}" fill="#090414" fill-opacity="0.55"/>`);
  p.push('</g>');
  p.push(`<line x1="${x}" y1="${(y + THUMB_H).toFixed(1)}" x2="${(x + CARD_W).toFixed(1)}" y2="${(y + THUMB_H).toFixed(1)}" stroke="#8b5cff" stroke-opacity="0.26"/>`);

  if (g.badge) {
    const bw = textW(g.badge, 10) + 24;
    p.push(`<rect x="${x + 12}" y="${y + 12}" width="${bw.toFixed(1)}" height="22" rx="11" fill="${acc}"/>`);
    p.push(`<text x="${(x + 12 + bw / 2).toFixed(1)}" y="${y + 27}" text-anchor="middle" font-family="${FONT}" font-size="10" font-weight="900" letter-spacing="1.6" fill="#06030f">${esc(g.badge)}</text>`);
  }

  let by = y + THUMB_H + BODY_PAD;
  p.push(`<text x="${x + BODY_PAD}" y="${by + 17}" font-family="${FONT}" font-size="22" font-weight="900" fill="#ffffff">${esc(g.title)}</text>`);
  p.push(`<text x="${(x + BODY_PAD + textW(g.title, 22) + 10).toFixed(1)}" y="${by + 16}" font-family="${FONT}" font-size="12" fill="#9b8fc4" letter-spacing="2.4">${esc(g.subtitle)}</text>`);
  by += 38;

  for (const ln of m.descLines) {
    p.push(`<text x="${x + BODY_PAD}" y="${(by + 12).toFixed(1)}" font-family="${FONT}" font-size="13.5" fill="#c8bfe6">${esc(ln)}</text>`);
    by += 13.5 * 1.72;
  }
  by += 10;

  let tx = x + BODY_PAD;
  for (const { t, w } of m.tagsRows[0]) {
    p.push(`<rect x="${tx.toFixed(1)}" y="${by.toFixed(1)}" width="${w.toFixed(1)}" height="21" rx="10.5" fill="${acc}" fill-opacity="0.10" stroke="${acc}" stroke-opacity="0.32"/>`);
    p.push(`<text x="${(tx + w / 2).toFixed(1)}" y="${(by + 15).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${acc}">${esc(t)}</text>`);
    tx += w + 7;
  }
  by += 34;

  const ctaW = CARD_W - BODY_PAD * 2;
  p.push(`<rect x="${x + BODY_PAD}" y="${(by - 4).toFixed(1)}" width="${ctaW.toFixed(1)}" height="42" rx="12" fill="${acc}" fill-opacity="0.14" stroke="${acc}" stroke-opacity="0.38"/>`);
  p.push(`<text x="${x + BODY_PAD + 15}" y="${(by + 22).toFixed(1)}" font-family="${FONT}" font-size="14" font-weight="800" letter-spacing="1.4" fill="${acc}">开始游戏 →</text>`);
  p.push(`<rect x="${(x + CARD_W - BODY_PAD - 15 - 22).toFixed(1)}" y="${(by + 7).toFixed(1)}" width="22" height="20" rx="6" fill="#8b5cff" fill-opacity="0.16" stroke="#8b5cff" stroke-opacity="0.3"/>`);
  p.push(`<text x="${(x + CARD_W - BODY_PAD - 15 - 11).toFixed(1)}" y="${(by + 21).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="700" fill="#9b8fc4">${i + 1}</text>`);
});

/* footer */
p.push(`<line x1="${PAD}" y1="${(footerY - 20).toFixed(1)}" x2="${W - PAD}" y2="${(footerY - 20).toFixed(1)}" stroke="#8b5cff" stroke-opacity="0.26"/>`);
p.push(`<text x="${PAD}" y="${footerY + 2}" font-family="${FONT}" font-size="12" fill="#9b8fc4">${GAMES.length} 个游戏 · 全部免费 · 无需安装</text>`);
p.push(`<text x="${W - PAD}" y="${footerY + 2}" text-anchor="end" font-family="${FONT}" font-size="12" fill="#9b8fc4" letter-spacing="1.2">GitHub</text>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${p.join('')}</svg>`;

const RESVG_OPTS = {
  fitTo: { mode: 'width', value: W },
  font: { loadSystemFonts: true, fontDirs: ['/system/fonts'], defaultFontFamily: 'Noto Sans CJK SC' },
  background: '#05020c',
};

if (args.includes('--bisect')) {
  let lastOk = -1;
  for (let n = 1; n <= p.length; n++) {
    const body = p.slice(0, n).join('');
    // a truncated prefix can leave <g> open, which is a different failure mode
    // to the one we are hunting, so balance the tree before rendering
    const open = (body.match(/<g[\s>]/g) || []).length - (body.match(/<\/g>/g) || []).length;
    const cand = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}${'</g>'.repeat(Math.max(0, open))}</svg>`;
    // resvg panics abort the whole process, so announce each attempt
    // unbuffered: the last index printed is the one that killed us
    try { appendFileSync(process.env.HOME + '/tmp/bisect.log', 'try ' + n + ' :: ' + p[n - 1].slice(0, 150) + '\n'); } catch (e) { /* ignore */ }
    try { new Resvg(cand, RESVG_OPTS).render().asPng(); lastOk = n; }
    catch (e) {
      console.log(`renders up to part ${lastOk}; part ${n - 1} breaks it:`);
      console.log('  ' + p[n - 1].slice(0, 260));
      process.exit(0);
    }
  }
  console.log('all', p.length, 'parts render fine in isolation');
  process.exit(0);
}

try {
  const r = new Resvg(svg, {
    ...RESVG_OPTS,
  });
  writeFileSync(OUT, r.render().asPng());
  console.log(`portal mock -> ${OUT}  (${W}x${H})`);
} catch (e) {
  console.error('resvg failed:', e.message);
  writeFileSync(OUT.replace(/\.png$/, '.svg'), svg);
  console.error('wrote raw SVG instead');
  process.exit(1);
}
