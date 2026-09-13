/**
 * NEON DASH — the track: road, sky, side scenery, speed streaks and the
 * procedural row spawner.
 *
 * The world scrolls: the player stays at z = 0 and everything else is pushed
 * toward +Z. That keeps collision trivial and avoids float precision drift on
 * long runs.
 */
import * as THREE from '../../vendor/three.module.min.js';
import { CFG, COLOR, LANES, POWERUPS } from './config.js';
import {
  makeRoadTexture, makeSunTexture, makeStarTexture, makeGlowTexture, rand, randInt, pick, clamp,
  makeBuildingTexture, makeGroundGridTexture, makeVerticalFadeTexture,
} from './utils.js';
import { Assets, Pool, OBSTACLE, laneAt } from './entities.js';

const ROAD_W = 7.8;
const ROAD_L = 460;
const TILE_L = 9;              // world metres per road texture tile
const SPAWN_Z = CFG.spawnZ;
const DESPAWN_Z = CFG.despawnZ;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.assets = new Assets();

    this.obstacles = [];
    this.coins = [];
    this.powerups = [];
    this.scenery = [];
    this.speedLines = [];

    this._buildSky();
    this._buildRoad();
    this._buildScenery();

    this.pool = {
      low: new Pool(() => this.assets.obstacle('low')),
      high: new Pool(() => this.assets.obstacle('high')),
      pillar: new Pool(() => this.assets.obstacle('pillar')),
      coin: new Pool(() => this.assets.coin(), (o) => { o.visible = false; }),
      arch: new Pool(() => this._makeArch(), (o) => { o.visible = false; }),
      city: new Pool(() => this._makeCityBlock(), (o) => { o.visible = false; }),
    };

    this.reset();
  }

  /* ------------------------------------------------------------------ build */

  _buildSky() {
    const s = this.scene;

    const sunMat = new THREE.MeshBasicMaterial({
      map: makeSunTexture(), transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(74, 74), sunMat);
    this.sun.position.set(0, 20, -305);
    this.sun.renderOrder = -10;
    s.add(this.sun);

    const hazeMat = new THREE.MeshBasicMaterial({
      map: makeGlowTexture('#ff2fd0'), transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, opacity: 0.34, fog: false,
    });
    this.haze = new THREE.Mesh(new THREE.PlaneGeometry(320, 150), hazeMat);
    this.haze.position.set(0, 14, -320);
    this.haze.renderOrder = -11;
    s.add(this.haze);

    const N = 1500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = Math.random() * 0.55 + 0.02;
      const r = 340;
      pos[i * 3] = Math.cos(a) * r * Math.cos(el);
      pos[i * 3 + 1] = Math.sin(el) * r + 8;
      pos[i * 3 + 2] = Math.sin(a) * r * Math.cos(el) - 60;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      map: makeStarTexture(), size: 2.6, sizeAttenuation: false,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      color: 0xbfe4ff, opacity: 0.9, fog: false,
    }));
    this.stars.frustumCulled = false;
    s.add(this.stars);
  }

  _buildRoad() {
    this.roadTex = makeRoadTexture();
    this.roadTex.repeat.set(1, ROAD_L / TILE_L);
    const roadMat = new THREE.MeshStandardMaterial({
      map: this.roadTex,
      color: 0xffffff,
      roughness: 0.32,
      metalness: 0.55,
      emissiveMap: this.roadTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
    });
    this.road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_L), roadMat);
    this.road.rotation.x = -Math.PI / 2;
    this.road.position.set(0, 0, -ROAD_L / 2 + 40);
    this.scene.add(this.road);

  }

  _buildScenery() {
    const G = this.geo = this.geo || {};
    const M = this.mat = this.mat || {};

    /* -------- neon gantries that span the track -------- */
    G.post = new THREE.BoxGeometry(0.46, 7.8, 0.46);
    G.beam = new THREE.BoxGeometry(11.2, 0.5, 0.62);
    G.beamGlow = new THREE.BoxGeometry(10.6, 0.1, 0.14);
    G.postStrip = new THREE.BoxGeometry(0.1, 6.4, 0.12);

    M.structure = new THREE.MeshStandardMaterial({
      color: 0x160d2c, roughness: 0.42, metalness: 0.85,
      emissive: COLOR.violet, emissiveIntensity: 0.6,
    });
    M.beamGlow = new THREE.MeshBasicMaterial({ color: COLOR.cyan });
    M.postStrip = new THREE.MeshBasicMaterial({ color: COLOR.magenta });

    /* -------- distant city -------- */
    G.city = new THREE.BoxGeometry(1, 1, 1);
    G.cityCap = new THREE.BoxGeometry(1, 0.12, 1);
    this.cityTextures = [makeBuildingTexture(), makeBuildingTexture(), makeBuildingTexture()];
    this.cityMats = this.cityTextures.map((tex) => new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      color: 0x241640,
      roughness: 0.75,
      metalness: 0.15,
    }));
    M.cityCap = new THREE.MeshBasicMaterial({ color: COLOR.cyan });

    /* -------- ground that extends past the track -------- */
    const gridTex = makeGroundGridTexture();
    gridTex.repeat.set(24, 70);
    const groundMat = new THREE.MeshStandardMaterial({
      map: gridTex,
      emissiveMap: gridTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.5,
      color: 0x0a0616,
      roughness: 0.85,
      metalness: 0.2,
    });
    this.groundGridTex = gridTex;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 700), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, -180);
    this.scene.add(ground);
    this.ground = ground;

    /* -------- glowing light walls along both road edges -------- */
    const wallGeo = new THREE.BoxGeometry(0.34, 0.5, ROAD_L);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x120a24, roughness: 0.35, metalness: 0.8,
      emissive: COLOR.violet, emissiveIntensity: 0.8,
    });
    const lipGeo = new THREE.BoxGeometry(0.4, 0.09, ROAD_L);
    const lipMat = new THREE.MeshBasicMaterial({ color: COLOR.cyan });

    const fadeTex = makeVerticalFadeTexture();
    this.edgeGlowMats = [];
    for (const side of [-1, 1]) {
      const x = side * (ROAD_W / 2 + 0.2);

      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(x, 0.25, -ROAD_L / 2 + 40);
      this.scene.add(wall);

      const lip = new THREE.Mesh(lipGeo, lipMat);
      lip.position.set(x, 0.52, -ROAD_L / 2 + 40);
      this.scene.add(lip);

      // additive gradient sheet rising off the wall — the "light wall"
      const glowMat = new THREE.MeshBasicMaterial({
        map: fadeTex,
        color: side < 0 ? COLOR.cyan : COLOR.magenta,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, ROAD_L), glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.rotation.z = Math.PI / 2;
      glow.position.set(x, 0.5, -ROAD_L / 2 + 40);
      glow.renderOrder = 2;
      this.scene.add(glow);
      this.edgeGlowMats.push(glowMat);
    }

    /* -------- camera-facing speed streaks -------- */
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xbfe9ff, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const lineGeo = new THREE.PlaneGeometry(0.05, 3.2);
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(lineGeo, lineMat.clone());
      m.position.set(rand(-11, 11), rand(0.3, 7), rand(-70, 6));
      m.rotation.y = Math.PI / 2;
      m.userData.spd = rand(1.6, 3.4);
      this.scene.add(m);
      this.speedLines.push(m);
    }
  }

  /** A neon gantry spanning the track. */
  _makeArch() {
    const g = new THREE.Group();
    const M = this.mat, G = this.geo;

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(G.post, M.structure);
      post.position.set(side * 5.15, 3.9, 0);
      g.add(post);

      const strip = new THREE.Mesh(G.postStrip, M.postStrip);
      strip.position.set(side * 4.9, 3.6, 0);
      g.add(strip);
    }

    const beam = new THREE.Mesh(G.beam, M.structure);
    beam.position.set(0, 7.6, 0);
    g.add(beam);

    const glow = new THREE.Mesh(G.beamGlow, M.beamGlow);
    glow.position.set(0, 7.32, 0);
    g.add(glow);

    return g;
  }

  /** A distant tower with lit windows. */
  _makeCityBlock() {
    const g = new THREE.Group();
    const w = rand(3.2, 7.5);
    const h = rand(9, 34);
    const d = rand(3.2, 7.5);

    const body = new THREE.Mesh(this.geo.city, pick(this.cityMats));
    body.scale.set(w, h, d);
    body.position.y = h / 2;
    g.add(body);

    if (Math.random() < 0.45) {
      const cap = new THREE.Mesh(this.geo.cityCap, this.mat.cityCap);
      cap.scale.set(w * 1.02, 1, d * 1.02);
      cap.position.y = h + 0.06;
      g.add(cap);
    }
    g.userData.height = h;
    return g;
  }

  /* ------------------------------------------------------------- power pools */

  /** Lazily create one pool per power-up type. */
  _powerPool(type) {
    const key = 'p_' + type;
    if (!this.pool[key]) {
      this.pool[key] = new Pool(
        () => this.assets.powerup(type),
        (o) => { o.visible = false; }
      );
    }
    return this.pool[key];
  }

  /* ------------------------------------------------------------------ reset */

  reset() {
    for (const o of this.obstacles) { o.visible = false; this.scene.remove(o); this.pool[o.userData.kind].release(o); }
    for (const c of this.coins) { c.visible = false; this.scene.remove(c); this.pool.coin.release(c); }
    for (const p of this.powerups) { p.visible = false; this.scene.remove(p); this._powerPool(p.userData.type).release(p); }
    for (const s of this.scenery) {
      s.visible = false;
      this.scene.remove(s);
      this.pool[s.userData.poolKey || 'city'].release(s);
    }
    this.obstacles.length = 0;
    this.coins.length = 0;
    this.powerups.length = 0;
    this.scenery.length = 0;

    this.roadTex.offset.y = 0;
    this.sinceRow = 0;
    this.sinceArch = 0;
    this.sinceCity = 0;
    this.sincePowerup = 999;
    this.rowGap = CFG.rowGapMin;
    this.lastPattern = '';
  }

  /* ---------------------------------------------------------------- spawning */

  /**
   * True when nothing occupies `lane` at (or very near) `z`.
   *
   * This deliberately checks the live objects rather than a persistent grid:
   * every row spawns at the same z, so a grid keyed by absolute world z would
   * be poisoned by marks left behind by earlier rows and would veto every
   * collectible placed after it.
   */
  _isFree(lane, z, radius = 3.2) {
    for (const o of this.obstacles) {
      if (o.userData.lane === lane && Math.abs(o.position.z - z) < radius) return false;
    }
    for (const p of this.powerups) {
      if (p.userData.lane === lane && Math.abs(p.position.z - z) < radius) return false;
    }
    return true;
  }

  spawnRow(difficulty) {
    const z = SPAWN_Z;
    const d = clamp(difficulty, 0, 1);

    const wSingle = 0.78 - 0.44 * d;
    const wDouble = 0.20 + 0.26 * d;
    const wTriple = 0.02 + 0.18 * d;
    const r = Math.random() * (wSingle + wDouble + wTriple);

    let pattern;
    if (r < wSingle) pattern = 'single';
    else if (r < wSingle + wDouble) pattern = 'double';
    else pattern = 'triple';

    const laneOrder = [0, 1, 2].sort(() => Math.random() - 0.5);
    const rows = [];

    if (pattern === 'single') {
      rows.push({ lane: laneOrder[0], kind: this._rollKind(d) });
    } else if (pattern === 'double') {
      rows.push({ lane: laneOrder[0], kind: this._rollKind(d) });
      rows.push({ lane: laneOrder[1], kind: this._rollKind(d) });
    } else {
      // A full-width row always uses one uniform type so a single move clears
      // it, and never repeats the same triple twice in a row.
      let kind = Math.random() < 0.55 ? 'low' : 'high';
      if (kind === 'low' && this.lastPattern === 'tripleLow') kind = 'high';
      else if (kind === 'high' && this.lastPattern === 'tripleHigh') kind = 'low';
      for (const lane of [0, 1, 2]) rows.push({ lane, kind });
      this.lastPattern = kind === 'low' ? 'tripleLow' : 'tripleHigh';
    }
    if (pattern !== 'triple') this.lastPattern = pattern;

    for (const row of rows) {
      const o = this.pool[row.kind].get();
      const spec = OBSTACLE[row.kind];
      o.visible = true;
      o.position.set(LANES[row.lane], 0, z);
      o.rotation.set(0, 0, 0);
      o.userData.lane = row.lane;
      o.userData.consumed = false;
      o.userData.halfDepth = spec.halfDepth;
      o.userData.yBottom = spec.yBottom;
      o.userData.yTop = spec.yTop;
      this.scene.add(o);
      this.obstacles.push(o);
    }

    const usedLanes = new Set(rows.map((row) => row.lane));
    const freeLanes = laneOrder.filter((l) => !usedLanes.has(l));

    if (this.sincePowerup > CFG.powerupCooldown && freeLanes.length && Math.random() < CFG.powerupChance) {
      this.sincePowerup = 0;
      this._spawnPowerup(freeLanes[0], z - 8);
    } else if (freeLanes.length && Math.random() < 0.82) {
      this._spawnCoinRun(z, freeLanes);
    }
  }

  _rollKind(d) {
    const r = Math.random();
    if (r < 0.40 - 0.06 * d) return 'low';
    if (r < 0.78 - 0.04 * d) return 'high';
    return 'pillar';
  }

  _spawnCoinRun(z, freeLanes) {
    const lane = freeLanes[0];
    const count = randInt(3, 6);
    const spacing = 2.6;
    const start = z - (count - 1) * spacing * 0.5;
    const arc = Math.random() < 0.3;

    for (let i = 0; i < count; i++) {
      const cz = start + i * spacing;
      if (!this._isFree(lane, cz)) break;
      const t = count > 1 ? i / (count - 1) : 0.5;
      const y = arc ? 1.0 + Math.sin(t * Math.PI) * 1.55 : 1.0;

      const c = this.pool.coin.get();
      c.visible = true;
      c.position.set(LANES[lane], y, cz);
      c.rotation.set(0, 0, 0);
      c.userData.lane = lane;
      c.userData.consumed = false;
      c.userData.phase = Math.random() * Math.PI * 2;
      this.scene.add(c);
      this.coins.push(c);
    }
  }

  _spawnPowerup(lane, z) {
    const type = pick(Object.keys(POWERUPS));
    const p = this._powerPool(type).get();
    p.visible = true;
    p.position.set(LANES[lane], 1.35, z);
    p.rotation.set(0, 0, 0);
    p.userData.lane = lane;
    p.userData.type = type;
    p.userData.consumed = false;
    p.userData.phase = Math.random() * Math.PI * 2;
    p.userData.shell.rotation.set(0, 0, 0);
    p.userData.ring.rotation.set(Math.PI / 2.6, 0, 0);
    p.userData.core.rotation.set(0, 0, 0);
    this.scene.add(p);
    this.powerups.push(p);
  }

  spawnScenery(kind) {
    const z = SPAWN_Z;

    if (kind === 'arch') {
      const a = this.pool.arch.get();
      a.visible = true;
      a.position.set(0, 0, z);
      a.userData.poolKey = 'arch';
      this.scene.add(a);
      this.scenery.push(a);
      return;
    }

    // a small cluster of towers, offset so the skyline never looks tiled
    const n = randInt(1, 3);
    for (let i = 0; i < n; i++) {
      const c = this.pool.city.get();
      c.visible = true;
      const side = Math.random() < 0.5 ? -1 : 1;
      c.position.set(side * rand(11, 42), 0, z + rand(-18, 18));
      c.rotation.y = rand(0, Math.PI);
      c.userData.poolKey = 'city';
      this.scene.add(c);
      this.scenery.push(c);
    }
  }

  /* ------------------------------------------------------------------ update */

  /**
   * @param {number} dt
   * @param {object} ctx
   *   { speed, distance, difficulty, player, magnet,
   *     onCoin(x,y,z), onHit(kind,x,y,z), onPowerup(type,x,y,z) }
   */
  update(dt, ctx) {
    const dz = ctx.speed * dt;

    // road texture scroll — the grid flows toward the camera
    this.roadTex.offset.y = (this.roadTex.offset.y + dz / TILE_L) % 4096;

    // gentle drift on the backdrop
    this.sun.position.x = Math.sin(ctx.distance * 0.0009) * 6;
    this.haze.position.x = this.sun.position.x * 0.6;
    this.stars.rotation.z += dt * 0.004;

    // speed streaks near the camera
    const lineAlpha = clamp((ctx.speed - 20) / 34, 0, 1) * 0.55;
    for (const l of this.speedLines) {
      l.material.opacity = lineAlpha * (0.35 + 0.65 * Math.random());
      l.position.z += dz * l.userData.spd;
      if (l.position.z > 14) {
        l.position.z = -100;
        l.position.x = rand(-11, 11);
        l.position.y = rand(0.3, 7);
      }
    }

    this._spawn(dt, ctx);
    this._moveAndCollide(dt, dz, ctx);
  }

  _spawn(dt, ctx) {
    this.rowGap = clamp(ctx.speed * CFG.minRowGapTime, CFG.rowGapMin, CFG.rowGapMax);
    const advance = ctx.speed * dt;

    this.sinceRow += advance;
    if (!this.demo && this.sinceRow >= this.rowGap) {
      this.sinceRow -= this.rowGap;
      this.spawnRow(ctx.difficulty);
    }

    this.sinceArch += advance;
    if (this.sinceArch >= CFG.archGap) {
      this.sinceArch -= CFG.archGap;
      this.spawnScenery('arch');
    }

    this.sinceCity += advance;
    if (this.sinceCity >= CFG.cityGap) {
      this.sinceCity -= CFG.cityGap;
      this.spawnScenery('city');
    }

    this.sincePowerup += advance;
  }

  _moveAndCollide(dt, dz, ctx) {
    const p = ctx.player;
    const pBottom = p.y;
    const pTop = p.y + p.height;
    const laneIdx = laneAt(p.x);
    const now = performance.now() * 0.001;

    /* ------------------------------------------------------------ obstacles */
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      const z0 = o.position.z;
      const z = z0 + dz;
      o.position.z = z;
      const ud = o.userData;

      if (ud.kind === 'pillar') {
        const core = o.getObjectByName('core');
        if (core) { core.rotation.y += dt * 2.4; core.rotation.x += dt * 1.3; }
      }

      const W = CFG.bodyHalfDepth + ud.halfDepth;
      if (!ud.consumed && z0 < W && z > -W && ud.lane === laneIdx) {
        if (pBottom < ud.yTop && ud.yBottom < pTop) {
          ud.consumed = true;
          if (ctx.onHit) ctx.onHit(ud.kind, o.position.x, (ud.yBottom + ud.yTop) * 0.5, 0, o);
        }
      }

      if (z > DESPAWN_Z) {
        o.visible = false;
        this.scene.remove(o);
        this.obstacles.splice(i, 1);
        this.pool[ud.kind].release(o);
      }
    }

    /* ---------------------------------------------------------------- coins */
    const magnet = ctx.magnet;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      const z0 = c.position.z;
      let z = z0 + dz;
      c.position.z = z;
      const ud = c.userData;

      if (magnet) {
        const dx = p.x - c.position.x;
        const dy = p.y + p.height * 0.45 - c.position.y;
        const dzz = -c.position.z;
        const dist = Math.hypot(dx, dy, dzz);
        if (dist < CFG.magnetRadius && dist > 0.001) {
          const pull = (1 - dist / CFG.magnetRadius) * 30 * dt;
          c.position.x += (dx / dist) * pull * 1.7;
          c.position.y += (dy / dist) * pull;
          c.position.z += (dzz / dist) * pull * 1.3;
          z = c.position.z;
        }
      }

      c.rotation.y += dt * 3.4;
      c.rotation.z = Math.sin(ud.phase + now * 2) * 0.14;

      const W = CFG.bodyHalfDepth + 0.45;
      if (!ud.consumed && z0 < W && z > -W) {
        const laneHit = Math.abs(p.x - c.position.x) < CFG.laneHalfWidth + 0.25;
        if (laneHit && c.position.y > pBottom - 0.75 && c.position.y < pTop + 0.75) {
          ud.consumed = true;
          if (ctx.onCoin) ctx.onCoin(c.position.x, c.position.y, c.position.z);
          c.visible = false;
          this.scene.remove(c);
          this.coins.splice(i, 1);
          this.pool.coin.release(c);
          continue;
        }
      }

      if (z > DESPAWN_Z) {
        c.visible = false;
        this.scene.remove(c);
        this.coins.splice(i, 1);
        this.pool.coin.release(c);
      }
    }

    /* ------------------------------------------------------------ power-ups */
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const u = this.powerups[i];
      const z0 = u.position.z;
      const z = z0 + dz;
      u.position.z = z;
      const ud = u.userData;
      const t = now + ud.phase;

      u.position.y = 1.35 + Math.sin(t * 1.7) * 0.22;
      ud.shell.rotation.y += dt * 1.5;
      ud.shell.rotation.x += dt * 0.9;
      ud.ring.rotation.z += dt * 2.2;
      ud.core.rotation.y -= dt * 2.6;
      const gs = 2.6 + Math.sin(t * 4) * 0.35;
      ud.glow.scale.set(gs, gs, 1);

      const W = CFG.bodyHalfDepth + 0.75;
      if (!ud.consumed && z0 < W && z > -W) {
        const laneHit = Math.abs(p.x - u.position.x) < CFG.laneHalfWidth + 0.4;
        if (laneHit && u.position.y > pBottom - 1.3 && u.position.y < pTop + 1.3) {
          ud.consumed = true;
          if (ctx.onPowerup) ctx.onPowerup(ud.type, u.position.x, u.position.y, u.position.z);
          u.visible = false;
          this.scene.remove(u);
          this.powerups.splice(i, 1);
          this._powerPool(ud.type).release(u);
          continue;
        }
      }

      if (z > DESPAWN_Z) {
        u.visible = false;
        this.scene.remove(u);
        this.powerups.splice(i, 1);
        this._powerPool(ud.type).release(u);
      }
    }

    /* -------------------------------------------------------------- scenery */
    for (let i = this.scenery.length - 1; i >= 0; i--) {
      const s = this.scenery[i];
      s.position.z += dz;
      if (s.position.z > DESPAWN_Z + 14) {
        s.visible = false;
        this.scene.remove(s);
        this.scenery.splice(i, 1);
        this.pool[s.userData.poolKey || 'city'].release(s);
      }
    }
  }
}
