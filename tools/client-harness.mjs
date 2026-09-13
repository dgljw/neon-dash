/**
 * Boots the real NEON DASH client inside jsdom.
 *
 * Shared by tools/boot-test.mjs (assertions) and tools/preview-render.mjs
 * (software-rendered screenshots). Only WebGL is stubbed — everything else is
 * the genuine index.html, main.js, state machine and frame loop.
 */
import { readFileSync } from 'node:fs';
import { register, createRequire } from 'node:module';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = pathResolve(HERE, '..');
export const GAME = pathResolve(ROOT, 'neon-dash');   // the game lives in its own subpath

/** Locate jsdom, or return null so callers can skip gracefully. */
export async function loadJsdom() {
  const candidates = [
    process.env.JSDOM_PATH,
    pathResolve(process.env.HOME || '', 'testdeps/node_modules/jsdom/lib/api.js'),
    pathResolve(ROOT, 'node_modules/jsdom/lib/api.js'),
  ].filter(Boolean);
  for (const c of candidates) {
    try { const m = await import(pathToFileURL(c).href); if (m.JSDOM) return m.JSDOM; }
    catch (e) { /* try next */ }
  }
  return null;
}

/**
 * A real Canvas2D implementation, if one is installed.
 *
 * jsdom ships without a canvas backend, which would leave every procedurally
 * generated texture blank. @napi-rs/canvas gives us Skia — gradients, arcs,
 * shadowBlur, composite ops — so the texture code runs for real and the
 * preview renderer can sample actual pixels.
 */
export async function loadCanvasBackend() {
  const req = createRequire(pathResolve(ROOT, 'package.json'));
  const dirs = [
    process.env.CANVAS_DIR,
    pathResolve(process.env.HOME || '', 'testdeps'),
    ROOT,
  ].filter(Boolean);
  for (const dir of dirs) {
    try {
      const r = createRequire(pathResolve(dir, 'package.json'));
      const mod = r('@napi-rs/canvas');
      if (typeof mod.createCanvas === 'function') return mod;
    } catch (e) { /* try next */ }
  }
  void req;
  return null;
}

function mockCtx2D() {
  const gradient = { addColorStop() {} };
  const target = {};
  return new Proxy(target, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => gradient;
      if (k === 'canvas') return { width: 1, height: 1 };
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

/**
 * @param {{width?:number, height?:number, entry?:string}} opts
 * @returns {Promise<{win:any, game:any, step:Function, sleep:Function, key:Function,
 *                    touch:Function, $:Function, hidden:Function, errors:string[]}>}
 */
export async function bootClient(opts = {}) {
  const {
    width = 1280,
    height = 720,
    entry = 'neon-dash/index.html',
    module = 'neon-dash/js/main.js',
    globalName = '__neonDash',
  } = opts;

  const JSDOM = await loadJsdom();
  if (!JSDOM) throw new Error('jsdom not found');

  const html = readFileSync(pathResolve(ROOT, entry), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;

  // Back every canvas with a real rasteriser when one is available so the
  // procedural textures contain actual pixels; otherwise swallow the drawing
  // calls (logic still runs, textures are just blank).
  const canvasBackend = await loadCanvasBackend();
  win.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type !== '2d') return null;
    if (canvasBackend) {
      if (!this.__napi) {
        const c = canvasBackend.createCanvas(this.width || 300, this.height || 150);
        Object.defineProperty(this, '__napi', { value: c, configurable: true });
      }
      return this.__napi.getContext('2d');
    }
    return mockCtx2D();
  };

  // fixed viewport so the camera aspect is deterministic
  for (const [k, v] of [['innerWidth', width], ['innerHeight', height]]) {
    Object.defineProperty(win, k, { value: v, configurable: true, writable: true });
  }

  // manually pumped frame clock
  let rafQueue = [];
  let clock = 0;
  let rafSeq = 0;
  win.requestAnimationFrame = (cb) => { rafQueue.push(cb); return ++rafSeq; };
  win.cancelAnimationFrame = () => {};

  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  globalThis.devicePixelRatio = win.devicePixelRatio ?? 1;
  globalThis.HTMLElement = win.HTMLElement;
  globalThis.Event = win.Event;
  globalThis.KeyboardEvent = win.KeyboardEvent;
  globalThis.innerWidth = width;
  globalThis.innerHeight = height;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
  globalThis.addEventListener = (...a) => win.addEventListener(...a);
  globalThis.removeEventListener = (...a) => win.removeEventListener(...a);
  // NOTE: globalThis.performance is deliberately left as Node's — jsdom's
  // Performance.now() delegates to the Node global of the same name, so
  // replacing it makes now() recurse into itself forever.
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: win.navigator, configurable: true, writable: true,
    });
  } catch (e) { /* ignore */ }

  const errors = [];
  win.addEventListener('error', (e) => errors.push('window.error: ' + (e.message || e.error)));
  // Swallowing uncaught exceptions keeps a broken frame from killing the
  // harness, but it also hides real failures — so echo them immediately.
  process.on('uncaughtException', (e) => {
    errors.push('uncaught: ' + (e && e.message));
    console.error('[uncaught] ' + ((e && (e.stack || e.message)) || e));
  });

  register('./three-stub-hooks.mjs', import.meta.url);

  await import(pathToFileURL(pathResolve(ROOT, module)).href);

  const game = globalName ? win[globalName] : null;
  if (globalName && !game) throw new Error(`${module} did not expose window.${globalName}`);

  const step = (frames = 1, dtMs = 16.67) => {
    for (let i = 0; i < frames; i++) {
      clock += dtMs;
      const q = rafQueue;
      rafQueue = [];
      for (const cb of q) {
        try { cb(clock); }
        catch (e) { errors.push('frame: ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
      }
    }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => win.document.getElementById(id);
  const hidden = (id) => $('#' + id) === null;

  const key = (k) => win.dispatchEvent(
    new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

  const touch = (type, x, y) => {
    const e = new win.Event(type, { bubbles: true, cancelable: true });
    const t = { clientX: x, clientY: y };
    e.touches = type === 'touchend' ? [] : [t];
    e.changedTouches = [t];
    win.document.body.dispatchEvent(e);
  };

  const isHidden = (id) => $(id).classList.contains('hidden');
  void hidden;

  return { win, game, step, sleep, key, touch, $, hidden: isHidden, errors, width, height, canvasBackend };
}
