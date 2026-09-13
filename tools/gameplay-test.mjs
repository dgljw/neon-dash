/**
 * NEON DASH — headless gameplay test.
 *
 * Boots the real World / Player / ParticleSystem modules under a minimal DOM
 * shim (WebGL is not needed to exercise game logic) and lets an oracle "bot"
 * play. The bot reads the track and jumps, slides and changes lanes with
 * correct timing, so if it dies the generator produced something a human could
 * not clear either.
 *
 * Every run uses a fixed seed, so failures are reproducible rather than flaky.
 *
 *   node tools/gameplay-test.mjs [seconds] [seeds]
 */

/* ------------------------------------------------------------- DOM shims */

function mockContext2D() {
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

function mockElement(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    style: {}, dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { el.children.push(c); return c; },
    removeChild() {}, remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getContext() { return mockContext2D(); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
  };
  return el;
}

globalThis.document = {
  createElement: (tag) => mockElement(tag),
  createElementNS: (ns, tag) => mockElement(tag),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  body: mockElement('body'),
  documentElement: mockElement('html'),
  hidden: false,
};
globalThis.window = globalThis;
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { maxTouchPoints: 0, userAgent: 'node', platform: 'node' },
    configurable: true, writable: true,
  });
} catch (e) { /* node may expose a read-only navigator; harmless */ }
globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

/* -------------------------------------------------------- seeded randomness */

/** mulberry32 — small, fast, deterministic. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let currentSeed = 1;
const realRandom = Math.random;
Math.random = () => makeRng(currentSeed)();   // replaced per run below

/* --------------------------------------------------------------- imports */

const THREE = await import('../vendor/three.module.min.js');
const { CFG, LANES } = await import('../neon-dash/js/config.js');
const { World } = await import('../neon-dash/js/world.js');
const { Player } = await import('../neon-dash/js/player.js');
const { ParticleSystem } = await import('../neon-dash/js/particles.js');
const { laneAt, OBSTACLE } = await import('../neon-dash/js/entities.js');

/* ------------------------------------------------------------- assertions */

let failures = 0;
function check(cond, msg, detail) {
  if (!cond) {
    failures++;
    console.error('  ✗ ' + msg + (detail ? '  [' + detail + ']' : ''));
  }
  return cond;
}

/* ---------------------------------------------------- jump arc calibration */

/**
 * Measure, rather than hardcode, the window during which a jump keeps the
 * player above a low barrier — by jumping the REAL Player and sampling it.
 * Any future change to gravity or jump velocity is picked up automatically.
 */
function calibrateJump(scene, particles, audioStub, dt) {
  const probe = new Player(scene, particles, audioStub);
  probe.reset();
  probe.jump();

  const threshold = OBSTACLE.low.yTop;
  const samples = [];
  for (let i = 0; i < 240; i++) {
    probe.update(dt, CFG.speedStart);
    samples.push({ t: (i + 1) * dt, y: probe.y });
    if (probe.onGround && i > 3) break;
  }
  scene.remove(probe.group);

  let enter = null, exit = null;
  for (const s of samples) {
    if (s.y > threshold) { if (enter === null) enter = s.t; exit = s.t; }
  }
  return {
    enter, exit,
    airtime: samples.length ? samples[samples.length - 1].t : 0,
    apex: samples.reduce((m, s) => Math.max(m, s.y), 0),
    threshold,
  };
}

/* --------------------------------------------- module state used by the bot */

let world = null;
let player = null;

/* --------------------------------------------------------------- the bot */

/** Nearest obstacle that sits in `lane` and has not fully passed the player. */
function nearestInLane(lane, maxAhead = 80) {
  let best = null;
  for (const o of world.obstacles) {
    const ud = o.userData;
    if (ud.lane !== lane) continue;
    const z = o.position.z;
    // The collision window is |z| < (bodyHalfDepth + halfDepth) — about
    // +/-0.96 — so an obstacle slightly PAST the player still collides and must
    // not be treated as gone when judging whether a lane is safe to enter.
    if (z > 1.0 || z < -maxAhead) continue;
    if (!best || z > best.z) best = { z, kind: ud.kind };
  }
  return best;
}

/** Group upcoming obstacles into rows (obstacles sharing roughly one z). */
function upcomingRows(maxAhead = 70) {
  const list = [];
  for (const o of world.obstacles) {
    const z = o.position.z;
    if (z > 1 || z < -maxAhead) continue;
    list.push({ z, lane: o.userData.lane, kind: o.userData.kind });
  }
  list.sort((a, b) => b.z - a.z);              // nearest first
  const rows = [];
  for (const o of list) {
    let row = rows.find((r) => Math.abs(r.z - o.z) < 3.5);
    if (!row) { row = { z: o.z, items: [] }; rows.push(row); }
    row.items.push(o);
  }
  return rows;
}

/**
 * Plan lane by lane.
 *
 * Only pillars force a lane change — a barrier or a gate can be jumped or slid
 * under, so those never make a lane unusable. For each candidate starting lane
 * we walk the upcoming rows, stepping sideways only when a pillar is in the
 * way, and score rows survived minus travelling cost. The best lane becomes the
 * target; the caller walks one lane per frame toward it.
 */
function chooseTargetLane() {
  const cur = player.laneIndex;
  const rows = upcomingRows(70);
  let bestLane = cur;
  let bestScore = -Infinity;

  for (let start = 0; start < LANES.length; start++) {
    let lane = start;
    let score = -Math.abs(start - cur) * 0.4;
    let feasible = true;

    for (const row of rows) {
      const pillars = new Set();
      for (const it of row.items) if (it.kind === 'pillar') pillars.add(it.lane);
      if (pillars.has(lane)) {
        const alts = [0, 1, 2].filter((x) => !pillars.has(x));
        if (!alts.length) { feasible = false; break; }   // generator produced a wall
        let pick = alts[0];
        for (const a of alts) {
          if (Math.abs(a - lane) < Math.abs(pick - lane)) pick = a;
        }
        score -= 1 + Math.abs(pick - lane) * 0.5;
        lane = pick;
      } else {
        score += 1;
      }
    }

    if (feasible && score > bestScore) { bestScore = score; bestLane = start; }
  }
  return bestLane;
}

function playFrame(speed, stats) {
  // While a lane change is in flight the player is physically in `settled` but
  // about to be in `laneIndex`. React to whichever has the more urgent problem.
  const settled = laneAt(player.x);
  const watched = settled === player.laneIndex
    ? [settled]
    : [settled, player.laneIndex];

  let imm = null;
  for (const l of watched) {
    const o = nearestInLane(l, 45);
    if (o && (!imm || o.z > imm.z)) imm = o;
  }

  if (imm) {
    const t = -imm.z / speed;                  // seconds until it reaches z = 0

    if (imm.kind === 'low') {
      // The jump keeps the player above the barrier for [enter, exit] seconds
      // (measured from the real physics). The barrier also has depth, so the
      // boxes overlap in z for w = (bodyHalfDepth + halfDepth)/speed on each
      // side of the crossing; the jump must cover that whole span, which puts
      // the ideal take-off in the middle of the safe interval.
      const w = (CFG.bodyHalfDepth + OBSTACLE.low.halfDepth) / speed;
      const lo = stats.jump.enter + w;
      const hi = stats.jump.exit - w;
      const mid = (lo + hi) / 2;
      if (hi > lo && player.onGround && t <= mid + 0.06 && t > mid - 0.06) {
        if (player.jump()) stats.jumps++;
        return;
      }
      if (t < mid - 0.06) return;              // too late to do anything else
    } else if (imm.kind === 'high') {
      // A slide drops the hitbox to 0.85 (gate bottom sits at 1.35) and lasts
      // 0.62s — far longer than the overlap window, so timing is forgiving.
      if (!player.sliding && t > 0.08 && t < 0.42) {
        if (player.slide()) stats.slides++;
        return;
      }
      if (t < 0.08) return;
    }
    // A pillar gets no special case: it cannot be jumped or slid under, so the
    // only answer is the lane planner below — including as a last-ditch escape.
  }

  // Walk one lane toward the planned target — but only when the side-step is
  // actually safe. Repositioning is forced when a pillar sits in our own lane.
  const target = chooseTargetLane();
  if (target !== player.laneIndex) {
    const step = target > player.laneIndex ? +1 : -1;
    const nextLane = player.laneIndex + step;

    const entry = nearestInLane(nextLane, 60);
    const entryT = entry ? -entry.z / speed : Infinity;
    const need = 0.15 + (entry && entry.kind === 'low' ? 0.10 : 0.02);
    const canEnter = !entry || entryT > need;

    const own = nearestInLane(player.laneIndex, 40);
    const forced = !!own && own.kind === 'pillar' && -own.z / speed < 1.2;

    if (canEnter || forced) {
      if (step < 0) { if (player.moveLeft()) stats.laneChanges++; }
      else { if (player.moveRight()) stats.laneChanges++; }
    }
  }
}

/* ------------------------------------------------------------- simulation */

function runSimulation(seed, seconds) {
  currentSeed = seed;
  Math.random = makeRng(seed);

  const scene = new THREE.Scene();

  // audio stub: Player/World call these, and there is no AudioContext in node
  const audioStub = new Proxy({}, {
    get(_, k) { return k === 'muted' ? true : () => {}; },
    set() { return true; },
  });

  const particles = new ParticleSystem(scene, 600);
  const w = new World(scene);
  const p = new Player(scene, particles, audioStub);

  world = w;
  player = p;

  w.demo = false;
  w.reset();
  p.reset();
  particles.reset();

  const stats = {
    seed, frames: 0, distance: 0, coins: 0, hits: 0, powerups: 0,
    maxObstacles: 0, maxCoins: 0, maxPowerups: 0,
    jumps: 0, slides: 0, laneChanges: 0,
    rowsSpawned: 0, obstaclesSpawned: 0, coinRuns: 0, coinsSpawned: 0, powerupsSpawned: 0,
    deathAt: null, deathKind: null, hitDetail: null, impossibleRows: 0,
    trace: [],
  };

  // spawn instrumentation (pooled objects make identity counting useless)
  {
    const origRow = w.spawnRow.bind(w);
    w.spawnRow = (d) => {
      const before = w.obstacles.length;
      origRow(d);
      stats.rowsSpawned++;
      stats.obstaclesSpawned += w.obstacles.length - before;
    };
    const origCoin = w._spawnCoinRun.bind(w);
    w._spawnCoinRun = (z, lanes) => {
      const before = w.coins.length;
      origCoin(z, lanes);
      stats.coinRuns++;
      stats.coinsSpawned += w.coins.length - before;
    };
    const origPower = w._spawnPowerup.bind(w);
    w._spawnPowerup = (lane, z) => {
      const before = w.powerups.length;
      origPower(lane, z);
      stats.powerupsSpawned += w.powerups.length - before;
    };
  }

  const dt = 1 / 60;
  const totalFrames = Math.round(seconds * 60);

  const jump = calibrateJump(scene, particles, audioStub, dt);
  stats.jump = jump;

  const ctx = {
    speed: CFG.speedStart, distance: 0, difficulty: 0,
    player: p, magnet: false,
    onCoin: () => { stats.coins++; },
    onHit: (kind, x, y, z, obj) => {
      stats.hits++;
      stats.deathKind = kind;
      if (!stats.hitDetail) {
        stats.hitDetail = {
          kind,
          objZ: obj ? +obj.position.z.toFixed(2) : null,
          objLane: obj ? obj.userData.lane : null,
          objYBottom: obj ? obj.userData.yBottom : null,
          objYTop: obj ? obj.userData.yTop : null,
          playerY: +p.y.toFixed(3),
          playerH: p.height,
          playerX: +p.x.toFixed(3),
          settled: laneAt(p.x),
          intent: p.laneIndex,
          sliding: p.sliding,
          speed: +ctx.speed.toFixed(2),
        };
      }
    },
    onPowerup: () => { stats.powerups++; },
  };

  for (let f = 0; f < totalFrames; f++) {
    const speed = Math.min(CFG.speedMax, CFG.speedStart + stats.distance * CFG.speedRamp);

    // keep the last 26 frames so a failure can be post-mortemed
    {
      const lane = laneAt(p.x);
      let nearest = null;
      for (const o of w.obstacles) {
        const z = o.position.z;
        if (z > 1 || z < -70) continue;
        if (!nearest || z > nearest.z) nearest = { z, kind: o.userData.kind, lane: o.userData.lane };
      }
      let mine = null;
      for (const o of w.obstacles) {
        const z = o.position.z;
        if (o.userData.lane !== lane || z > 1 || z < -70) continue;
        if (!mine || z > mine.z) mine = { z, kind: o.userData.kind };
      }
      stats.trace.push({
        f, lane, mine, nearest, intent: p.laneIndex, target: chooseTargetLane(),
        y: +p.y.toFixed(3), onGround: p.onGround, speed: +speed.toFixed(2),
      });
      if (stats.trace.length > 26) stats.trace.shift();
    }

    playFrame(speed, stats);

    ctx.speed = speed;
    ctx.distance = stats.distance;
    ctx.difficulty = Math.min(1, stats.distance / 1400);

    p.update(dt, speed);
    w.update(dt, ctx);
    particles.update(dt);

    stats.distance += speed * dt;
    stats.frames++;

    if (w.obstacles.length > stats.maxObstacles) stats.maxObstacles = w.obstacles.length;
    if (w.coins.length > stats.maxCoins) stats.maxCoins = w.coins.length;
    if (w.powerups.length > stats.maxPowerups) stats.maxPowerups = w.powerups.length;

    // structural invariants: no row may ever block every lane
    if (f % 7 === 0) {
      const byRow = new Map();
      for (const o of w.obstacles) {
        const key = Math.round(o.position.z / 3.5);
        if (!byRow.has(key)) byRow.set(key, []);
        byRow.get(key).push(o.userData.kind);
      }
      for (const [, kinds] of byRow) {
        const pillars = kinds.filter((k) => k === 'pillar').length;
        if (pillars >= 3) { stats.impossibleRows++; check(false, 'row blocks all three lanes with pillars', JSON.stringify(kinds)); }
        if (kinds.length >= 3 && kinds.includes('low') && kinds.includes('high')) {
          stats.impossibleRows++;
          check(false, 'full row mixes low+high across all lanes', JSON.stringify(kinds));
        }
      }
    }

    if (stats.hits > 0) {
      stats.deathAt = stats.distance;
      break;
    }
  }

  return stats;
}

/* ------------------------------------------------------------------- main */

const args = process.argv.slice(2);
const SECONDS = Number(args[0] || 120);
const SEEDS = Number(args[1] || 5);
const seedList = Array.from({ length: SEEDS }, (_, i) => 1000 + i * 7919);

console.log(`NEON DASH headless gameplay test`);
console.log(`${SECONDS}s per seed, ${SEEDS} seeds\n`);

const results = [];
let died = 0;

for (const seed of seedList) {
  const r = runSimulation(seed, SECONDS);
  results.push(r);
  if (r.hits > 0) died++;
}

/* ---------------------------------------------------------------- report */

console.log('seed      distance     speed   coins  power  rows   jumps slides lanes  result');
console.log('-------------------------------------------------------------------------------');
for (const r of results) {
  const speed = Math.min(CFG.speedMax, CFG.speedStart + (r.deathAt || r.distance) * CFG.speedRamp);
  console.log(
    String(r.seed).padEnd(9) +
    (r.distance.toFixed(0) + ' m').padEnd(13) +
    speed.toFixed(1).padEnd(8) +
    String(r.coins).padEnd(7) +
    String(r.powerups).padEnd(7) +
    String(r.rowsSpawned).padEnd(7) +
    String(r.jumps).padEnd(7) +
    String(r.slides).padEnd(7) +
    String(r.laneChanges).padEnd(7) +
    (r.hits === 0 ? '✅ clean' : `❌ ${r.deathKind} @ ${r.deathAt.toFixed(0)}m`)
  );
}

const clean = results.filter((r) => r.hits === 0);
const totalCoins = results.reduce((a, r) => a + r.coinsSpawned, 0);
const picked = results.reduce((a, r) => a + r.coins, 0);
const peakObs = Math.max(...results.map((r) => r.maxObstacles));
const peakCoins = Math.max(...results.map((r) => r.maxCoins));
const totalRows = results.reduce((a, r) => a + r.rowsSpawned, 0);

console.log();
console.log('aggregate');
console.log('  total rows generated   :', totalRows);
console.log('  coin pickup rate       :', totalCoins ? ((picked / totalCoins) * 100).toFixed(1) + '%' : 'n/a',
            `(${picked}/${totalCoins})`);
console.log('  peak live obstacles    :', peakObs, '/ peak live coins:', peakCoins);
const j = results[0].jump;
console.log('  measured jump arc      : apex ' + j.apex.toFixed(2) + 'm, airtime ' + j.airtime.toFixed(3) +
            's, above ' + j.threshold + 'm for ' + (j.exit - j.enter).toFixed(3) + 's');
console.log('  min seconds between rows:', CFG.minRowGapTime, '(must exceed airtime ' + j.airtime.toFixed(3) + 's)');
console.log('  seeds survived cleanly :', clean.length + '/' + results.length);

// print a post-mortem for the first failure
const firstDead = results.find((r) => r.hits > 0);
if (firstDead) {
  console.error(`\n--- seed ${firstDead.seed}: last frames before the collision ---`);
  for (const r of firstDead.trace) {
    console.error(
      'f=' + String(r.f).padStart(5) +
      ' spd=' + r.speed +
      ' lane=' + r.lane +
      ' mine=' + (r.mine ? r.mine.kind + '@' + r.mine.z.toFixed(1) : 'none') +
      ' near=' + (r.nearest ? r.nearest.kind + '/' + r.nearest.lane + '@' + r.nearest.z.toFixed(1) : 'none') +
      ' y=' + r.y + ' ground=' + r.onGround +
      ' intent=' + r.intent + ' target=' + r.target
    );
  }
  console.error('\nhit detail: ' + JSON.stringify(firstDead.hitDetail));
}

/* ------------------------------------------------------------- assertions */

console.log();
check(died === 0, 'oracle bot cleared every seed without a collision',
  died + '/' + results.length + ' seeds died');
check(totalRows > SEEDS * 10, 'rows were generated', 'rows=' + totalRows);
check(totalCoins > 0 && picked > 0, 'coins were generated and collected',
  `spawned=${totalCoins} picked=${picked}`);
check(peakObs < 90, 'live obstacle count stays bounded', 'peak=' + peakObs);
check(peakCoins < 200, 'live coin count stays bounded', 'peak=' + peakCoins);
check(results.every((r) => r.impossibleRows === 0), 'no impossible rows were ever generated');

console.log(failures === 0 ? '\n✅ all gameplay checks passed' : `\n❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
