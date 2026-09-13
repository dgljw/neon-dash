/**
 * Portal test — boots the real index.html + js/portal.js in jsdom and checks
 * that every listed game is actually reachable on disk and that the page runs
 * without errors.
 *
 *   node tools/portal-test.mjs
 */
import { existsSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { bootClient, loadJsdom, ROOT } from './client-harness.mjs';
import { GAMES } from '../js/games.js';

let failures = 0;
function check(cond, msg, detail) {
  if (!cond) { failures++; console.error('  ✗ ' + msg + (detail ? '  [' + detail + ']' : '')); }
  return cond;
}

console.log('jianguo18.top portal test\n');

if (!(await loadJsdom())) {
  console.log('jsdom not found — portal test skipped.');
  process.exit(0);
}

/* ------------------------------------------- every listed game must exist */
console.log('catalogue <-> disk');
for (const g of GAMES) {
  const dir = pathResolve(ROOT, g.href.replace(/^\/|\/$/g, ''));
  const index = pathResolve(dir, 'index.html');
  const okDir = existsSync(dir);
  const okIndex = existsSync(index);
  check(okDir, `game folder exists for "${g.id}"`, dir);
  check(okIndex, `game has an index.html: "${g.id}"`, index);
  console.log(`  ${okDir && okIndex ? '✓' : '✗'} ${g.href.padEnd(20)} ${g.title}`);
}
// make sure nothing on disk is unlisted
check(GAMES.length > 0, 'catalogue is not empty');

/* ------------------------------------------------------ boot the real page */
const { win, errors, $ } = await bootClient({
  width: 1280,
  height: 720,
  entry: 'index.html',
  module: 'js/portal.js',
  globalName: null,
});

await new Promise((r) => setTimeout(r, 120));

const cards = win.document.querySelectorAll('.card');
check(cards.length === GAMES.length, 'one card per catalogue entry',
  `${cards.length} cards vs ${GAMES.length} games`);

GAMES.forEach((g, i) => {
  const el = cards[i];
  if (!el) return;
  check(el.getAttribute('href') === g.href, `card ${i + 1} links to ${g.href}`,
    'href=' + el.getAttribute('href'));
  check(el.querySelector('svg') !== null, `card ${i + 1} rendered artwork`);
  check(el.textContent.includes(g.title), `card ${i + 1} shows the title`);
});

const backdrop = $('bg');
check(!!backdrop, 'backdrop canvas exists');
check(backdrop && backdrop.width > 0 && backdrop.height > 0,
  'backdrop canvas was sized',
  backdrop ? `${backdrop.width}x${backdrop.height}` : 'n/a');

const stats = $('stats');
check(stats && stats.textContent.includes(String(GAMES.length)), 'footer stats filled in',
  stats ? stats.textContent : 'n/a');

// clicking a card navigates (jsdom will warn about navigation; that is fine)
check(win.document.querySelector('.card .play') !== null, 'each card has a call to action');

check(errors.length === 0, 'no runtime errors while rendering the portal',
  errors.slice(0, 3).join(' ;; '));
if (errors.length) for (const e of errors.slice(0, 5)) console.error('    ! ' + e);

console.log();
console.log('  games listed   :', GAMES.length);
console.log('  cards rendered :', cards.length);
console.log('  runtime errors :', errors.length);
console.log();
console.log(failures === 0 ? '✅ portal renders and every game is reachable' : `❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
