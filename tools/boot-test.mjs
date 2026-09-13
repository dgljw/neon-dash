/**
 * NEON DASH — client boot test.
 *
 * Runs the REAL js/main.js inside jsdom: the actual index.html, the actual DOM
 * wiring, the actual state machine, input handlers and frame loop. Only WebGL
 * is stubbed (jsdom has no GPU), via tools/three-stub-hooks.mjs.
 *
 * The gameplay test proves the rules are fair; this proves the page actually
 * boots, renders a frame, responds to keyboard and touch, and survives a full
 * run → crash → restart cycle without throwing.
 *
 *   node tools/boot-test.mjs
 *   JSDOM_PATH=/path/to/jsdom/lib/api.js node tools/boot-test.mjs
 */
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = pathResolve(HERE, '..');
const HOME = process.env.HOME || '';

/* ------------------------------------------------------------------ jsdom */

const candidates = [
  process.env.JSDOM_PATH,
  pathResolve(HOME, 'testdeps/node_modules/jsdom/lib/api.js'),
  pathResolve(ROOT, 'node_modules/jsdom/lib/api.js'),
].filter(Boolean);

let JSDOM = null;
for (const c of candidates) {
  try { ({ JSDOM } = await import(pathToFileURL(c).href)); break; } catch (e) { /* try next */ }
}
if (!JSDOM) {
  console.log('jsdom not found — boot test skipped.');
  console.log('  to enable:  mkdir -p "$HOME/testdeps" && (cd "$HOME/testdeps" && npm i jsdom)');
  console.log('  or pass:    JSDOM_PATH=/path/to/jsdom/lib/api.js');
  process.exit(0);
}

let failures = 0;
function check(cond, msg, detail) {
  if (!cond) { failures++; console.error('  ✗ ' + msg + (detail ? '  [' + detail + ']' : '')); }
  return cond;
}

/* --------------------------------------------------------------- run TAP */

const html = readFileSync(pathResolve(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window;

/* jsdom has no canvas backend; textures only need a 2D context that accepts
   drawing calls and a .width/.height, which the real canvas element provides. */
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
win.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === '2d') return mockCtx2D();
  return null;                       // no WebGL: the renderer is stubbed anyway
};

/* deterministic, manually pumped frame clock */
let rafQueue = [];
let clock = 0;
let rafSeq = 0;
win.requestAnimationFrame = (cb) => { rafQueue.push(cb); return ++rafSeq; };
win.cancelAnimationFrame = () => {};

/* ------------------------------------------------------------- globals */

globalThis.window = win;
globalThis.document = win.document;
// NOTE: deliberately NOT overriding globalThis.performance — jsdom's
// Performance.now() delegates to the Node global of the same name, so
// replacing it makes now() recurse into itself forever.
globalThis.localStorage = win.localStorage;
globalThis.devicePixelRatio = win.devicePixelRatio ?? 1;
globalThis.HTMLElement = win.HTMLElement;
globalThis.Event = win.Event;
globalThis.KeyboardEvent = win.KeyboardEvent;
globalThis.innerWidth = win.innerWidth;
globalThis.innerHeight = win.innerHeight;
globalThis.requestAnimationFrame = win.requestAnimationFrame;
globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
globalThis.addEventListener = (...a) => win.addEventListener(...a);
globalThis.removeEventListener = (...a) => win.removeEventListener(...a);
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: win.navigator, configurable: true, writable: true,
  });
} catch (e) { /* ignore */ }

/* ---------------------------------------------------------- error capture */

const errors = [];
win.addEventListener('error', (e) => errors.push('window.error: ' + (e.message || e.error)));
process.on('uncaughtException', (e) => errors.push('uncaught: ' + e.message));
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + e));

function step(frames = 1, dtMs = 16.67) {
  for (let i = 0; i < frames; i++) {
    clock += dtMs;
    const q = rafQueue;
    rafQueue = [];
    for (const cb of q) {
      try { cb(clock); }
      catch (e) { errors.push('frame: ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (id) => win.document.getElementById(id);
const hidden = (id) => $(id).classList.contains('hidden');

function key(k) {
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}
function touch(type, x, y) {
  const e = new win.Event(type, { bubbles: true, cancelable: true });
  const t = { clientX: x, clientY: y };
  e.touches = type === 'touchend' ? [] : [t];
  e.changedTouches = [t];
  win.document.body.dispatchEvent(e);
}

/* ------------------------------------------------------------- the test */

console.log('NEON DASH client boot test\n');

register('./three-stub-hooks.mjs', import.meta.url);

try {
  await import(pathToFileURL(pathResolve(ROOT, 'js/main.js')).href);
} catch (e) {
  console.error('  ✗ importing js/main.js threw: ' + (e.stack || e.message));
  process.exit(1);
}

const game = win.__neonDash;
check(!!game, 'game instance was exposed on window');
if (!game) { console.error('\n❌ boot failed'); process.exit(1); }

check(game.state === 'loading' || game.state === 'menu',
  'boots into loading or straight to the menu', 'state=' + game.state);
check(!!game.renderer, 'renderer was constructed');
check(!!game.scene && !!game.camera, 'scene and camera exist');
check(!!game.player && !!game.world, 'player and world exist');
check(rafQueue.length > 0, 'the frame loop scheduled itself');

await sleep(400);                    // main.js enters the menu after 220ms
check(game.state === 'menu', 'reaches the menu after boot', 'state=' + game.state);
check(!hidden('screen-start'), 'start screen is visible');
check(hidden('screen-over'), 'game-over screen is hidden');

step(40);
check(game.renderer.renderCount >= 40, 'frames were rendered', 'renders=' + game.renderer.renderCount);
step(80);                            // scenery spawns every 11 world units
check(game.world.scenery.length > 0, 'menu backdrop is scrolling scenery',
  'scenery=' + game.world.scenery.length);

/* ------------------------------------------------------------ start a run */
$('btn-play').click();
check(game.state === 'playing', 'clicking 开始奔跑 starts a run', 'state=' + game.state);
check(hidden('screen-start'), 'start screen hidden while playing');
check(!hidden('hud'), 'HUD is visible while playing');

step(600);                           // ~10s of play
check(game.distance > 50, 'distance advanced', 'distance=' + game.distance.toFixed(1));
check(game.score > 0, 'score accumulated', 'score=' + game.score.toFixed(0));
check(game.world.obstacles.length > 0, 'obstacles are being generated',
  'obstacles=' + game.world.obstacles.length);
check($('hud-score').textContent !== '0', 'HUD score text updated', 'hud=' + $('hud-score').textContent);
check($('hud-dist').textContent !== '0', 'HUD distance text updated', 'hud=' + $('hud-dist').textContent);
check($('hud-speed').textContent !== '0', 'HUD speed text updated', 'hud=' + $('hud-speed').textContent);

/* -------------------------------------------------------------- keyboard */
const startLane = game.player.laneIndex;
key('ArrowRight');
step(1);
check(game.player.laneIndex === Math.min(2, startLane + 1), 'ArrowRight changes lane',
  `${startLane} -> ${game.player.laneIndex}`);
key('ArrowLeft'); step(1);
key('ArrowLeft'); step(1);
check(game.player.laneIndex === 0, 'ArrowLeft walks back to lane 0', 'lane=' + game.player.laneIndex);
step(30);
check(Math.abs(game.player.x - (-2.6)) < 0.6, 'player x follows the lane',
  'x=' + game.player.x.toFixed(2));

key(' ');
check(game.player.onGround === false, 'Space triggers a jump');
let airborne = 0;
for (let i = 0; i < 120 && !game.player.onGround; i++) { step(1); airborne++; }
check(game.player.onGround === true, 'player lands again', 'airborne frames=' + airborne);
check(airborne > 20 && airborne < 60, 'jump airtime is sane', 'frames=' + airborne);

key('ArrowDown'); step(1);
check(game.player.sliding === true, 'ArrowDown triggers a slide');
step(60);
check(game.player.sliding === false, 'slide ends on its own');

/* ----------------------------------------------------------------- touch */
const beforeTouch = game.player.laneIndex;
touch('touchstart', 100, 300);
touch('touchmove', 220, 300);
touch('touchend', 220, 300);
step(1);
check(game.player.laneIndex === Math.min(2, beforeTouch + 1), 'swipe right changes lane',
  `${beforeTouch} -> ${game.player.laneIndex}`);

const beforeSwipeUp = game.player.onGround;
touch('touchstart', 100, 400);
touch('touchmove', 100, 300);
touch('touchend', 100, 300);
step(1);
check(beforeSwipeUp === true && game.player.onGround === false, 'swipe up jumps');

/* --------------------------------------------------------------- pausing */
game.pause();
check(game.state === 'paused', 'pause() pauses', 'state=' + game.state);
check(!hidden('screen-pause'), 'pause screen shown');
$('btn-resume').click();
check(game.state === 'playing', 'resume button resumes', 'state=' + game.state);

/* ------------------------------------------------------- crash and restart */
game._crash(0, 1, 0);
check(game.state === 'dying', 'crash enters the dying state', 'state=' + game.state);
step(80);
check(game.state === 'over', 'run ends after the crash animation', 'state=' + game.state);
check(!hidden('screen-over'), 'game-over screen shown');
check($('over-score').textContent !== '0', 'game-over score is filled in',
  'over=' + $('over-score').textContent);

$('btn-retry').click();
check(game.state === 'playing', 'retry button restarts', 'state=' + game.state);
check(game.distance < 50, 'retry resets distance', 'distance=' + game.distance.toFixed(1));
step(200);

$('btn-pause').click();
check(game.state === 'paused', 'HUD pause button works');
$('btn-quit').click();
check(game.state === 'menu', 'quit returns to the menu', 'state=' + game.state);

/* ------------------------------------------------------------ resize path */
win.innerWidth = 420;
win.innerHeight = 900;
win.dispatchEvent(new win.Event('resize'));
step(5);
check(Math.abs(game.camera.aspect - 420 / 900) < 0.001, 'resize updates camera aspect',
  'aspect=' + game.camera.aspect.toFixed(3));

/* ---------------------------------------------------------------- results */
step(60);
check(errors.length === 0, 'no runtime errors during the whole session',
  errors.slice(0, 3).join(' ;; '));
if (errors.length) for (const e of errors.slice(0, 5)) console.error('    ! ' + e);

console.log();
console.log('  frames pumped      :', clock / 16.67 | 0);
console.log('  renderer.render()  :', game.renderer.renderCount);
console.log('  final state        :', game.state);
console.log('  runtime errors     :', errors.length);
console.log();
console.log(failures === 0 ? '✅ client boots and plays correctly' : `❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
