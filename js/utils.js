/**
 * NEON DASH — maths helpers and procedurally generated canvas textures.
 * There are no external assets: every texture in the game is drawn at runtime.
 */
import * as THREE from '../vendor/three.module.min.js';

/* ------------------------------------------------------------------ maths */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Frame-rate independent exponential smoothing. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/* --------------------------------------------------------------- textures */

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(canvas, { repeatX = 1, repeatY = 1 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Road surface: dark tarmac with glowing lane separators and cross rungs.
 * The texture tiles once per road "cell"; repeat is set by the caller.
 */
export function makeRoadTexture() {
  const S = 512;
  const [c, g] = canvas2d(S, S);

  g.fillStyle = '#0a0616';
  g.fillRect(0, 0, S, S);

  // subtle vertical sheen so the road is not flat black
  const sheen = g.createLinearGradient(0, 0, S, 0);
  sheen.addColorStop(0.0, 'rgba(120,60,255,0.18)');
  sheen.addColorStop(0.5, 'rgba(40,20,90,0.04)');
  sheen.addColorStop(1.0, 'rgba(120,60,255,0.18)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, S, S);

  // lane divider lines at 1/3 and 2/3 across
  g.shadowBlur = 14;
  g.shadowColor = '#27f4ff';
  g.strokeStyle = 'rgba(39,244,255,0.8)';
  g.lineWidth = 3;
  for (const x of [S / 3, (S * 2) / 3]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, S);
    g.stroke();
  }

  // outer edge rails
  g.shadowColor = '#ff2fd0';
  g.strokeStyle = 'rgba(255,47,208,0.85)';
  g.lineWidth = 6;
  for (const x of [3, S - 3]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, S);
    g.stroke();
  }

  // cross rungs — dashes that read as motion
  g.shadowColor = '#8b5cff';
  g.shadowBlur = 10;
  g.strokeStyle = 'rgba(139,92,255,0.36)';
  g.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    const y = (S / 6) * i;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(S, y);
    g.stroke();
  }

  return finish(c);
}

/** Soft radial glow, used for sprites, light pools and the backdrop. */
export function makeGlowTexture(hex = '#ffffff') {
  const S = 128;
  const [c, g] = canvas2d(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0.0, hexToRgba(hex, 1));
  grad.addColorStop(0.3, hexToRgba(hex, 0.5));
  grad.addColorStop(0.65, hexToRgba(hex, 0.12));
  grad.addColorStop(1.0, hexToRgba(hex, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Small soft dot — reads well at particle sizes. */
export function makeDotTexture() {
  const S = 64;
  const [c, g] = canvas2d(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Retrowave sun with horizontal cut-out bands. */
export function makeSunTexture() {
  const W = 512, H = 512;
  const [c, g] = canvas2d(W, H);

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.0, '#ffe36b');
  grad.addColorStop(0.35, '#ff9a3c');
  grad.addColorStop(0.68, '#ff2fd0');
  grad.addColorStop(1.0, '#7a1bff');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(W / 2, H / 2, W / 2 - 4, 0, Math.PI * 2);
  g.fill();

  // scanline cut-outs across the lower half
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 12; i++) {
    const y = H * 0.5 + (i * (H * 0.5)) / 12;
    g.fillRect(0, y, W, 3 + i * 1.5);
  }
  g.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Vertical gradient ribbon used for the thruster flame and speed trails. */
export function makeTrailTexture() {
  const W = 64, H = 256;
  const [c, g] = canvas2d(W, H);
  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0.0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.25, 'rgba(39,244,255,0.55)');
  grad.addColorStop(0.7, 'rgba(255,47,208,0.8)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0.06)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // fade the sides so the ribbon has no hard edges
  const side = g.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.5, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Tiny bright core with a cool halo — used for the starfield. */
export function makeStarTexture() {
  const S = 32;
  const [c, g] = canvas2d(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(190,228,255,0.55)');
  grad.addColorStop(1.0, 'rgba(120,160,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/* --------------------------------------------------------------- disposal */

export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    }
  });
}
