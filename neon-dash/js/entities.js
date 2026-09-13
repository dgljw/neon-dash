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
import { makeGlowTexture } from './utils.js';

/* ------------------------------------------------------------- obstacle defs */

export const OBSTACLE = {
  // jump over it
  low: { halfDepth: 0.42, yBottom: 0.0, yTop: 1.15, color: COLOR.cyan },
  // slide under it
  high: { halfDepth: 0.42, yBottom: 1.35, yTop: 2.6, color: COLOR.gold },
  // full-height pillar: change lane
  pillar: { halfDepth: 0.4, yBottom: 0.0, yTop: 3.9, color: COLOR.magenta },
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
    G.lowBody = new THREE.BoxGeometry(2.05, 1.15, 0.42);
    G.lowLip = new THREE.BoxGeometry(2.12, 0.14, 0.5);

    G.highBeam = new THREE.BoxGeometry(2.05, 1.25, 0.42);
    G.highLip = new THREE.BoxGeometry(2.12, 0.14, 0.5);

    G.chevron = new THREE.BoxGeometry(0.3, 0.62, 0.13);
    G.pillarBody = new THREE.BoxGeometry(1.5, 3.9, 0.72);
    G.pillarStrip = new THREE.BoxGeometry(0.09, 3.7, 0.09);
    G.pillarCap = new THREE.BoxGeometry(1.62, 0.16, 0.84);
    G.lowGlow = new THREE.PlaneGeometry(4.6, 3.0);
    G.highGlow = new THREE.PlaneGeometry(4.6, 3.4);
    G.pillarGlow = new THREE.PlaneGeometry(3.6, 6.4);
    G.pillarCore = new THREE.OctahedronGeometry(0.42, 0);

    G.coin = new THREE.TorusGeometry(0.34, 0.105, 8, 22);
    G.coinCore = new THREE.CircleGeometry(0.22, 16);

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
    M.pillarStrip = new THREE.MeshBasicMaterial({ color: COLOR.magenta });
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
    M.lowGlow = glowMat(COLOR.cyan, 0.42);
    M.highGlow = glowMat(COLOR.gold, 0.42);
    M.pillarGlow = glowMat(COLOR.magenta, 0.5);

    M.edgeCyan = new THREE.LineBasicMaterial({ color: COLOR.cyan, transparent: true, opacity: 0.9 });
    M.edgeGold = new THREE.LineBasicMaterial({ color: COLOR.gold, transparent: true, opacity: 0.9 });
    M.edgeMagenta = new THREE.LineBasicMaterial({ color: COLOR.magenta, transparent: true, opacity: 0.95 });

    M.coin = new THREE.MeshBasicMaterial({ color: COLOR.gold });
    M.coinCore = new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });

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
      // a wide low barrier with a bright top rail and upward chevrons
      const body = new THREE.Mesh(this.geo.lowBody, this.mat.lowBody);
      body.position.y = 0.575;
      const lip = new THREE.Mesh(this.geo.lowLip, this.mat.lowLip);
      lip.position.y = 1.15;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(this.geo.lowBody), this.mat.edgeCyan);
      edges.position.y = 0.575;
      g.add(body, lip, edges);

      for (const sx of [-0.62, 0, 0.62]) {
        const bar = new THREE.Mesh(this.geo.chevron, this.mat.lowLip);
        bar.position.set(sx, 0.48, 0.24);
        bar.rotation.z = sx === 0 ? 0 : (sx > 0 ? -0.85 : 0.85);
        g.add(bar);
      }

      const glow = new THREE.Mesh(this.geo.lowGlow, this.mat.lowGlow);
      glow.position.set(0, 0.8, -0.34);
      glow.renderOrder = 1;
      g.add(glow);

    } else if (kind === 'high') {
      // an overhead gate with a bright underside and downward chevrons
      const beam = new THREE.Mesh(this.geo.highBeam, this.mat.highBody);
      beam.position.y = 1.975;
      const lip = new THREE.Mesh(this.geo.highLip, this.mat.highLip);
      lip.position.y = 1.35;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(this.geo.highBeam), this.mat.edgeGold);
      edges.position.y = 1.975;
      g.add(beam, lip, edges);

      for (const sx of [-0.62, 0, 0.62]) {
        const bar = new THREE.Mesh(this.geo.chevron, this.mat.highLip);
        bar.position.set(sx, 1.62, 0.24);
        bar.rotation.z = sx === 0 ? 0 : (sx > 0 ? 0.85 : -0.85);
        g.add(bar);
      }

      const glow = new THREE.Mesh(this.geo.highGlow, this.mat.highGlow);
      glow.position.set(0, 1.9, -0.34);
      glow.renderOrder = 1;
      g.add(glow);

    } else {
      // a slim pillar with corner strips and a spinning core
      const body = new THREE.Mesh(this.geo.pillarBody, this.mat.pillarBody);
      body.position.y = 1.95;
      const cap = new THREE.Mesh(this.geo.pillarCap, this.mat.pillarCap);
      cap.position.y = 3.95;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(this.geo.pillarBody), this.mat.edgeMagenta);
      edges.position.y = 1.95;
      g.add(body, cap, edges);

      for (const sx of [-0.7, 0.7]) {
        const strip = new THREE.Mesh(this.geo.pillarStrip, this.mat.pillarStrip);
        strip.position.set(sx, 1.95, 0.37);
        g.add(strip);
      }

      const core = new THREE.Mesh(this.geo.pillarCore, this.mat.pillarCore);
      core.name = 'core';
      core.position.y = 2.3;
      g.add(core);

      const glow = new THREE.Mesh(this.geo.pillarGlow, this.mat.pillarGlow);
      glow.position.set(0, 2.0, -0.42);
      glow.renderOrder = 1;
      g.add(glow);
    }

    g.userData.kind = kind;
    g.userData.spec = OBSTACLE[kind];
    return g;
  }

  coin() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(this.geo.coin, this.mat.coin);
    const core = new THREE.Mesh(this.geo.coinCore, this.mat.coinCore);
    core.position.z = 0.01;
    const glow = this.sprite(COLOR.gold, 1.7, 0.55);
    g.add(ring, core, glow);
    g.userData.spinY = true;
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
