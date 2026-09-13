/**
 * NEON DASH — entity visuals.
 *
 * Every obstacle is a `THREE.Group` carrying its own gameplay fields
 * (kind / lane / halfDepth / yBottom / yTop). Geometry and materials are built
 * once in `Assets` and shared through `clone()`, so spawning a row costs almost
 * nothing.
 *
 * Collision model: an obstacle occupies a whole lane. The player is "in" a lane
 * when |player.x - lane.x| < laneHalfWidth, so sub-lane jitter can never cause
 * an unfair hit.
 */
import * as THREE from '../../vendor/three.module.min.js';
import { COLOR, CFG, LANES, POWERUPS } from './config.js';
import { makeGlowTexture, loftGeometry, tubeGeometry, bladeGeometry } from './utils.js';

/* ------------------------------------------------------------- obstacle defs */

export const OBSTACLE = {
  // jump over it
  low: { halfDepth: 0.30, yBottom: 0.0, yTop: 1.04, color: COLOR.cyan },
  // slide under it
  high: { halfDepth: 0.30, yBottom: 1.36, yTop: 2.60, color: COLOR.gold },
  // full-height pillar: change lane
  pillar: { halfDepth: 0.34, yBottom: 0.0, yTop: 3.9, color: COLOR.magenta },
};

/* --------------------------------------------------------------------- assets */

export class Assets {
  constructor() {
    this.glow = {};
    this.geo = {};
    this.mat = {};
    this._build();
  }

  _glowTex(color) {
    if (!this.glow[color]) this.glow[color] = makeGlowTexture('#' + color.toString(16).padStart(6, '0'));
    return this.glow[color];
  }

  _build() {
    const G = this.geo;
    const M = this.mat;

    /* ---------------------------------------------------------- shared bodies */
    // Solid bodies are chamfered extrusions: a barrier must still read as an
    // impassable mass, but a plain box looks like a placeholder. Extruding the
    // front silhouette with a bevel gives solidity AND machined edges.
    G.lowBody = bladeGeometry(
      [[-0.94, 0.00], [0.94, 0.00], [0.94, 0.86], [0.78, 1.04], [-0.78, 1.04], [-0.94, 0.86]],
      0.40, 0.028);

    G.highBody = bladeGeometry(
      [[-0.94, 1.36], [0.94, 1.36], [0.94, 2.36], [0.76, 2.60], [-0.76, 2.60], [-0.94, 2.36]],
      0.40, 0.028);

    G.pillarBody = bladeGeometry(
      [[-0.66, 0.00], [0.66, 0.00], [0.60, 2.40], [0.50, 3.62], [0.32, 3.88],
       [-0.32, 3.88], [-0.50, 3.62], [-0.60, 2.40]],
      0.62, 0.032);

    G.lowRail = new THREE.BoxGeometry(1.86, 0.060, 0.22);
    G.highSill = new THREE.BoxGeometry(1.86, 0.065, 0.25);
    G.chevronRow = bladeGeometry([-0.52, 0, 0.52].map((dx) =>
      [[dx, 0], [dx + 0.30, 0], [dx + 0.16, 0.20], [dx, 0.26], [dx - 0.16, 0.20]]), 0.075, 0.018);
    G.coreGeo = new THREE.OctahedronGeometry(0.22, 0);
    G.pillarCap = bladeGeometry([[-0.34, 0], [0.34, 0], [0.20, 0.13], [0, 0.18], [-0.20, 0.13]], 0.66, 0.034);
    G.pillarStrip = tubeGeometry([
      new THREE.Vector3(0.62, 0.10, 0.30),
      new THREE.Vector3(0.54, 1.90, 0.26),
      new THREE.Vector3(0.34, 3.80, 0.18),
    ], 0.026, 14, 6);
    G.glowLow = new THREE.PlaneGeometry(3.6, 2.4);
    G.glowHigh = new THREE.PlaneGeometry(3.6, 3.0);
    G.glowPillar = new THREE.PlaneGeometry(2.8, 5.4);
    G.pillarCore = new THREE.OctahedronGeometry(0.42, 0);

    G.coinDisc = new THREE.CylinderGeometry(0.35, 0.35, 0.085, 22);
    G.coinRim = new THREE.TorusGeometry(0.35, 0.055, 6, 22);

    G.powerCore = new THREE.OctahedronGeometry(0.36, 0);
    G.powerShell = new THREE.IcosahedronGeometry(0.62, 0);
    G.powerRing = new THREE.TorusGeometry(0.78, 0.045, 6, 26);

    /* -------------------------------------------------------------- materials */
    const dark = (emissive) =>
      new THREE.MeshStandardMaterial({
        color: 0x140a24,
        roughness: 0.45,
        metalness: 0.65,
        emissive,
        emissiveIntensity: 0.32,
      });

    M.lowBody = dark(COLOR.cyan);
    M.highBody = dark(COLOR.gold);
    M.pillarBody = dark(COLOR.magenta);

    M.lowLip = new THREE.MeshBasicMaterial({ color: COLOR.cyan });
    M.highLip = new THREE.MeshBasicMaterial({ color: COLOR.gold });
    M.pillarCore = new THREE.MeshBasicMaterial({ color: COLOR.magenta });
    M.pillarCap = new THREE.MeshBasicMaterial({ color: 0xffd0f4 });
    M.pillarCap = new THREE.MeshBasicMaterial({ color: 0xffd0f4 });

    const glowMat = (color, opacity) => new THREE.MeshBasicMaterial({
      map: this._glowTex(color),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    M.glowLow = glowMat(COLOR.cyan, 0.42);
    M.glowHigh = glowMat(COLOR.gold, 0.42);
    M.glowPillar = glowMat(COLOR.magenta, 0.5);

    M.edgeCyan = new THREE.LineBasicMaterial({ color: COLOR.cyan, transparent: true, opacity: 0.9 });
    M.edgeGold = new THREE.LineBasicMaterial({ color: COLOR.gold, transparent: true, opacity: 0.9 });
    M.edgeMagenta = new THREE.LineBasicMaterial({ color: COLOR.magenta, transparent: true, opacity: 0.95 });

    M.coinDisc = new THREE.MeshStandardMaterial({
      color: 0xffd447, roughness: 0.25, metalness: 1.0,
      emissive: COLOR.gold, emissiveIntensity: 0.85,
    });
    M.coinRim = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });

    M.shell = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.75 });
    M.ring = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    M.powerCore = new THREE.MeshBasicMaterial({ color: 0xffffff });
  }

  /** Warm glow sprite used behind coins / power-ups. */
  sprite(color, scale, opacity = 0.85) {
    const m = new THREE.SpriteMaterial({
      map: this._glowTex(color),
      color: 0xffffff,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const s = new THREE.Sprite(m);
    s.scale.set(scale, scale, 1);
    return s;
  }

  /* ------------------------------------------------------------------ builds */

  obstacle(kind) {
    const g = new THREE.Group();

    if (kind === 'low') {
      g.add(new THREE.Mesh(this.geo.lowBody, this.mat.lowBody));

      const rail = new THREE.Mesh(this.geo.lowRail, this.mat.lowLip);
      rail.position.set(0, 1.06, 0);
      g.add(rail);

      const ch = new THREE.Mesh(this.geo.chevronRow, this.mat.lowLip);
      ch.position.set(0, 0.42, 0.22);
      g.add(ch);

      const glow = new THREE.Mesh(this.geo.glowLow, this.mat.glowLow);
      glow.position.set(0, 0.62, -0.30);
      glow.renderOrder = 1;
      g.add(glow);

    } else if (kind === 'high') {
      g.add(new THREE.Mesh(this.geo.highBody, this.mat.highBody));

      const sill = new THREE.Mesh(this.geo.highSill, this.mat.highLip);
      sill.position.set(0, 1.40, 0);
      g.add(sill);

      const ch = new THREE.Mesh(this.geo.chevronRow, this.mat.highLip);
      ch.position.set(0, 1.62, 0.22);
      ch.rotation.z = Math.PI;
      g.add(ch);

      const glow = new THREE.Mesh(this.geo.glowHigh, this.mat.glowHigh);
      glow.position.set(0, 1.98, -0.30);
      glow.renderOrder = 1;
      g.add(glow);

    } else {
      g.add(new THREE.Mesh(this.geo.pillarBody, this.mat.pillarBody));

      const cap = new THREE.Mesh(this.geo.pillarCap, this.mat.pillarCap);
      cap.position.set(0, 3.88, 0);
      g.add(cap);

      for (const sx of [-1, 1]) {
        const strip = new THREE.Mesh(this.geo.pillarStrip, this.mat.pillarCore);
        strip.scale.x = sx;
        g.add(strip);
      }

      const core = new THREE.Mesh(this.geo.coreGeo, this.mat.pillarCore);
      core.name = 'core';
      core.position.set(0, 2.10, 0);
      g.add(core);

      const glow = new THREE.Mesh(this.geo.glowPillar, this.mat.glowPillar);
      glow.position.set(0, 1.95, -0.38);
      glow.renderOrder = 1;
      g.add(glow);
    }

    g.userData.kind = kind;
    g.userData.spec = OBSTACLE[kind];
    return g;
  }

  coin() {
    const g = new THREE.Group();
    // disc + rim share one spin node so the coin tumbles as a single object
    const spin = new THREE.Group();
    const disc = new THREE.Mesh(this.geo.coinDisc, this.mat.coinDisc);
    disc.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(this.geo.coinRim, this.mat.coinRim);
    spin.add(disc, rim);
    g.add(spin);
    g.add(this.sprite(COLOR.gold, 1.9, 0.6));
    g.userData.spin = spin;
    return g;
  }

  powerup(type) {
    const def = POWERUPS[type];
    const g = new THREE.Group();
    const core = new THREE.Mesh(this.geo.powerCore, new THREE.MeshBasicMaterial({ color: def.color }));
    const shell = new THREE.Mesh(this.geo.powerShell, this.mat.shell.clone());
    shell.material.color.setHex(def.color);
    const ring = new THREE.Mesh(this.geo.powerRing, this.mat.ring.clone());
    ring.material.color.setHex(def.color);
    ring.rotation.x = Math.PI / 2.6;
    const glow = this.sprite(def.color, 2.6, 0.7);
    g.add(core, shell, ring, glow);
    g.userData.type = type;
    g.userData.shell = shell;
    g.userData.ring = ring;
    g.userData.core = core;
    g.userData.glow = glow;
    return g;
  }
}

/* ------------------------------------------------------------------ pooling */

export class Pool {
  constructor(factory, reset) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
    this.created = 0;
  }

  get() {
    if (this.free.length) return this.free.pop();
    this.created++;
    return this.factory();
  }

  release(obj) {
    if (this.reset) this.reset(obj);
    this.free.push(obj);
  }
}

/* ---------------------------------------------------------------- lane helpers */

/** Lane index the player currently occupies (-1 when between lanes). */
export function laneAt(x) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < LANES.length; i++) {
    const d = Math.abs(x - LANES[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return bestD < CFG.laneHalfWidth ? best : -1;
}

/** True when the vertical spans [aBottom,aTop] and [bBottom,bTop] overlap. */
export function spansOverlap(aBottom, aTop, bBottom, bTop) {
  return aBottom < bTop && bBottom < aTop;
}
