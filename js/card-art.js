/**
 * Portal card artwork — pure functions returning SVG strings, so the same art
 * can be rendered by the page and rasterised offline by tools/portal-mock.mjs.
 */

/* ============================================================ card artwork */

const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 8);

/** Mini synthwave scene: banded sun over a perspective grid. */
export function artNeon(a, b) {
  const s = uid('sun'), h = uid('halo');
  let grid = '';
  for (let i = -6; i <= 6; i++) {
    grid += `<line x1="${100 + i * 1.2}" y1="62" x2="${100 + i * 17}" y2="112" stroke="${a}" stroke-opacity="0.5" stroke-width="0.7"/>`;
  }
  for (let i = 1; i <= 7; i++) {
    const y = (62 + Math.pow(i / 7, 2.1) * 50).toFixed(1);
    grid += `<line x1="0" y1="${y}" x2="200" y2="${y}" stroke="${a}" stroke-opacity="0.3" stroke-width="0.7"/>`;
  }
  let bands = '';
  for (let i = 0; i < 6; i++) {
    bands += `<rect x="0" y="${(44 + i * 3.1).toFixed(1)}" width="200" height="${(0.9 + i * 0.5).toFixed(1)}" fill="#08040f"/>`;
  }
  return `<svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="${s}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffe36b"/><stop offset="45%" stop-color="#ff9a3c"/>
        <stop offset="100%" stop-color="${b}"/>
      </linearGradient>
      <radialGradient id="${h}" cx="50%" cy="62%" r="58%">
        <stop offset="0%" stop-color="${b}" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="${b}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="200" height="112" fill="#07030f"/>
    <rect width="200" height="112" fill="url(#${h})"/>
    <circle cx="100" cy="46" r="26" fill="url(#${s})"/>
    ${bands}
    <rect x="0" y="62" width="200" height="50" fill="#0a0518"/>
    ${grid}
    <line x1="0" y1="62" x2="200" y2="62" stroke="${a}" stroke-width="1.1" stroke-opacity="0.9"/>
  </svg>`;
}

/** Mini life-sim scene: soft wash with rising stat bars. */
export function artLife(a, b) {
  const g = uid('bg'), bar = uid('bar');
  const bars = [0.42, 0.66, 0.5, 0.82, 0.58, 0.74];
  const out = bars.map((v, i) => {
    const bh = (v * 58).toFixed(1);
    return `<rect x="${26 + i * 26}" y="${(96 - v * 58).toFixed(1)}" width="13" height="${bh}" rx="4" fill="url(#${bar})" opacity="${(0.45 + v * 0.55).toFixed(2)}"/>`;
  }).join('');
  return `<svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${b}" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="${a}" stop-opacity="0.14"/>
      </linearGradient>
      <linearGradient id="${bar}" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="${b}"/><stop offset="100%" stop-color="${a}"/>
      </linearGradient>
    </defs>
    <rect width="200" height="112" fill="#0b0618"/>
    <rect width="200" height="112" fill="url(#${g})"/>
    ${out}
    <line x1="0" y1="97" x2="200" y2="97" stroke="${a}" stroke-opacity="0.7" stroke-width="1.2"/>
  </svg>`;
}

export const ART = { neon: artNeon, life: artLife };

