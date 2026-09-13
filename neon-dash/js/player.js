/**
 * NEON DASH — the player: a hover-runner that occupies one of three lanes.
 * The bike is built from primitives and animated procedurally (hover bob,
 * lane roll, jump pitch, thruster flare).
 */
import * as THREE from '../../vendor/three.module.min.js';
import { CFG, COLOR, LANES } from './config.js';
import {
  clamp, damp, lerp, easeOutCubic, makeGlowTexture, makeTrailTexture,
  loftGeometry, tubeGeometry, bladeGeometry,
} from './utils.js';

export class Player {
  constructor(scene, particles, audio) {
    this.scene = scene;
    this.particles = particles;
    this.audio = audio;

    this.laneIndex = 1;
    this.x = LANES[1];
    this.laneFrom = LANES[1];
    this.laneTo = LANES[1];
    this.laneT = 1;
    this.y = 0;
    this.vy = 0;
    this.onGround = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.sliding = false;
    this.slideTimer = 0;
    this.tilt = 0;
    this.vx = 0;
    this.boostVis = 0;
    this.hurtFlash = 0;
    this.shield = false;
    this.time = 0;
    this.lastLandImpact = 0;

    this._build();
    scene.add(this.group);
  }

  /* ------------------------------------------------------------------ build */

  _build() {
    const g = new THREE.Group();
    g.scale.setScalar(1.0);
    this.model = g;
    this.group = new THREE.Group();
    this.group.add(g);

    /* ------------------------------------------------------------ materials */
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x0d0819, roughness: 0.26, metalness: 1.0,
      emissive: COLOR.magenta, emissiveIntensity: 0.13,
    });
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1a1035, roughness: 0.38, metalness: 0.9,
      emissive: COLOR.violet, emissiveIntensity: 0.38,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x05030c, roughness: 0.5, metalness: 0.7,
      emissive: 0x000000, emissiveIntensity: 0,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0d1c33, roughness: 0.06, metalness: 1.0,
      emissive: COLOR.cyan, emissiveIntensity: 0.22,
      transparent: true, opacity: 0.7, side: THREE.DoubleSide,
    });
    const magenta = new THREE.MeshBasicMaterial({ color: COLOR.magenta });
    const cyan = new THREE.MeshBasicMaterial({ color: COLOR.cyan });
    const warm = new THREE.MeshBasicMaterial({ color: 0xfff0cf });

    /* -------------------------------------------------------------- fuselage */
    // one shared cross-section, scaled per station — this is what makes the
    // body read as a smoothly tapering machine rather than a stack of boxes
    const HULL = [
      [0.00, 1.00], [-0.62, 0.74], [-0.96, 0.22], [-0.96, -0.24], [-0.60, -0.76],
      [0.00, -1.00], [0.60, -0.76], [0.96, -0.24], [0.96, 0.22], [0.62, 0.74],
    ];
    const hullRings = [
      [-1.34, 0.40, 0.050, 0.035],
      [-1.22, 0.40, 0.150, 0.085],
      [-1.02, 0.40, 0.250, 0.140],
      [-0.72, 0.41, 0.340, 0.190],
      [-0.30, 0.43, 0.390, 0.225],
      [ 0.15, 0.44, 0.400, 0.235],
      [ 0.55, 0.45, 0.370, 0.225],
      [ 0.88, 0.46, 0.300, 0.190],
      [ 1.08, 0.47, 0.190, 0.135],
      [ 1.16, 0.47, 0.090, 0.065],
    ].map(([z, cy, sx, sy]) => ({ z, cy, sx, sy, profile: HULL }));

    const hullGeo = loftGeometry(hullRings);
    g.add(new THREE.Mesh(hullGeo, hullMat));

    // a lighter dorsal spine breaks up the silhouette and reads as panelling
    const spineGeo = loftGeometry([
      { z: -0.95, cy: 0.63, sx: 0.10, sy: 0.035, profile: HULL },
      { z: -0.45, cy: 0.66, sx: 0.21, sy: 0.070, profile: HULL },
      { z:  0.15, cy: 0.68, sx: 0.23, sy: 0.075, profile: HULL },
      { z:  0.70, cy: 0.70, sx: 0.18, sy: 0.060, profile: HULL },
      { z:  0.98, cy: 0.68, sx: 0.08, sy: 0.030, profile: HULL },
    ]);
    g.add(new THREE.Mesh(spineGeo, panelMat));

    /* ---------------------------------------------------------------- fins */
    const FIN = [[0, 0], [0.58, 0.03], [0.70, -0.05], [0.16, -0.15], [0, -0.11]];
    const CANARD = [[0, 0], [0.30, 0.02], [0.34, -0.04], [0.08, -0.09], [0, -0.06]];
    const finGeo = bladeGeometry(FIN, 0.030, 0.007);
    const canardGeo = bladeGeometry(CANARD, 0.024, 0.006);
    const bladeMat = hullMat.clone();
    bladeMat.side = THREE.DoubleSide;

    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(finGeo, bladeMat);
      fin.rotation.x = -Math.PI / 2;
      fin.rotation.y = side * 0.30;
      fin.position.set(side * 0.33, 0.47, 0.30);
      fin.scale.x = side;
      g.add(fin);

      const canard = new THREE.Mesh(canardGeo, bladeMat);
      canard.rotation.x = -Math.PI / 2;
      canard.rotation.y = side * 0.22;
      canard.position.set(side * 0.28, 0.40, -0.70);
      canard.scale.x = side;
      g.add(canard);
    }

    /* ------------------------------------------------------------- tail fin */
    const tailFinGeo = bladeGeometry(
      [[0.36, 0.00], [-0.05, 0.00], [-0.30, 0.32], [-0.34, 0.45], [-0.04, 0.39], [0.22, 0.10]],
      0.026, 0.006);
    const tailFin = new THREE.Mesh(tailFinGeo, bladeMat);
    tailFin.rotation.y = Math.PI / 2;
    tailFin.position.set(0, 0.64, 0.72);
    g.add(tailFin);

    g.add(new THREE.Mesh(tubeGeometry([
      new THREE.Vector3(0, 0.66, 0.36),
      new THREE.Vector3(0, 1.00, 0.72),
      new THREE.Vector3(0, 1.08, 1.06),
    ], 0.013, 10, 5), cyan));

    /* ------------------------------------------------------------ windscreen */
    const wsGeo = bladeGeometry([[-0.20, 0], [0.20, 0], [0.15, 0.26], [0, 0.33], [-0.15, 0.26]], 0.022, 0.005);
    const ws = new THREE.Mesh(wsGeo, glassMat);
    ws.rotation.x = -0.62;
    ws.position.set(0, 0.60, -0.72);
    g.add(ws);

    /* ------------------------------------------------------------ thrusters */
    const bellPts = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      bellPts.push(new THREE.Vector2(0.048 + t * t * 0.082, t * 0.26));
    }
    const bellGeo = new THREE.LatheGeometry(bellPts, 16);
    const ringGeo = new THREE.TorusGeometry(0.135, 0.016, 6, 18);

    this.flames = [];
    this.flameMats = [];
    const flameGeo = new THREE.ConeGeometry(0.115, 1.35, 10, 1, true);

    for (const side of [-1, 1]) {
      const bell = new THREE.Mesh(bellGeo, darkMat);
      bell.rotation.x = Math.PI / 2;
      bell.position.set(side * 0.205, 0.45, 0.90);
      g.add(bell);

      const ring = new THREE.Mesh(ringGeo, side < 0 ? cyan : magenta);
      ring.position.set(side * 0.205, 0.45, 1.14);
      g.add(ring);

      // glowing throat
      const throat = new THREE.Mesh(new THREE.CircleGeometry(0.10, 16), warm);
      throat.position.set(side * 0.205, 0.45, 1.13);
      g.add(throat);

      const mat = new THREE.MeshBasicMaterial({
        color: 0x9beeff, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const f = new THREE.Mesh(flameGeo, mat);
      f.rotation.x = Math.PI / 2;
      f.position.set(side * 0.205, 0.45, 1.85);
      f.renderOrder = 5;
      g.add(f);
      this.flames.push(f);
      this.flameMats.push(mat);
    }
    this.flame = this.flames[0];
    this.flameMat = this.flameMats[0];

    /* ---------------------------------------------------------------- trim */
    // thin swept tubes along the flanks — cheap detail that reads as machining
    for (const side of [-1, 1]) {
      const pts = [
        new THREE.Vector3(side * 0.20, 0.44, -1.14),
        new THREE.Vector3(side * 0.33, 0.52, -0.72),
        new THREE.Vector3(side * 0.40, 0.54, -0.10),
        new THREE.Vector3(side * 0.39, 0.55, 0.45),
        new THREE.Vector3(side * 0.30, 0.53, 0.95),
      ];
      g.add(new THREE.Mesh(tubeGeometry(pts, 0.016, 22, 6), side < 0 ? cyan : magenta));
    }

    for (const side of [-1, 1]) {
      g.add(new THREE.Mesh(tubeGeometry([
        new THREE.Vector3(side * 0.08, 0.70, -0.85),
        new THREE.Vector3(side * 0.15, 0.75, -0.30),
        new THREE.Vector3(side * 0.17, 0.77, 0.30),
        new THREE.Vector3(side * 0.12, 0.74, 0.80),
      ], 0.012, 16, 5), side < 0 ? cyan : magenta));
    }

    // tail bar
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.055, 0.05), warm);
    tail.position.set(0, 0.60, 1.12);
    g.add(tail);

    /* ---------------------------------------------------------------- rider */
    const rider = new THREE.Group();
    rider.position.set(0, 0.60, 0.22);
    rider.rotation.x = -1.02;               // tucked forward over the tank
    g.add(rider);

    const suitMat = new THREE.MeshStandardMaterial({
      color: 0x0a0718, roughness: 0.42, metalness: 0.55,
      emissive: COLOR.violet, emissiveIntensity: 0.20,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x1a1038, roughness: 0.3, metalness: 0.7,
      emissive: COLOR.cyan, emissiveIntensity: 0.55,
    });
    const TORSO = [
      [0.00, 1.00], [-0.70, 0.70], [-1.00, 0.00], [-0.70, -0.70],
      [0.00, -1.00], [0.70, -0.70], [1.00, 0.00], [0.70, 0.70],
    ];
    // local +Z is the spine; the group rotation stands it up and leans it in
    const torso = new THREE.Mesh(loftGeometry([
      { z: 0.00, sx: 0.155, sy: 0.115, profile: TORSO },
      { z: 0.18, sx: 0.165, sy: 0.125, profile: TORSO },
      { z: 0.36, sx: 0.185, sy: 0.135, profile: TORSO },
      { z: 0.46, sx: 0.150, sy: 0.110, profile: TORSO },
    ]), suitMat);
    rider.add(torso);

    // hips / seat pad
    const hips = new THREE.Mesh(loftGeometry([
      { z: -0.16, sx: 0.150, sy: 0.110, profile: TORSO },
      { z:  0.04, sx: 0.175, sy: 0.125, profile: TORSO },
    ]), suitMat);
    rider.add(hips);

    // helmet: a lofted teardrop, far smaller than the old capsule head
    const HELM = [[0, 1], [-0.62, 0.72], [-1, 0.06], [-0.74, -0.6], [0, -1], [0.74, -0.6], [1, 0.06], [0.62, 0.72]];
    const helmet = new THREE.Mesh(loftGeometry([
      { z: 0.46, sx: 0.020, sy: 0.020, profile: HELM },
      { z: 0.54, sx: 0.105, sy: 0.095, profile: HELM },
      { z: 0.64, sx: 0.135, sy: 0.125, profile: HELM },
      { z: 0.74, sx: 0.115, sy: 0.105, profile: HELM },
      { z: 0.80, sx: 0.060, sy: 0.055, profile: HELM },
    ]), suitMat);
    rider.add(helmet);

    // visor
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.128, 16, 12, -0.75, 1.5, 0.65, 0.85), warm);
    visor.position.set(0, 0, 0.66);
    rider.add(visor);

    // shoulders + arms reaching for the bars
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.095, 0.14), accentMat);
    shoulder.position.set(0, 0, 0.34);
    rider.add(shoulder);

    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(loftGeometry([
        { z: 0.28, sx: 0.075, sy: 0.045, profile: HELM },
        { z: 0.40, sx: 0.095, sy: 0.055, profile: HELM },
      ]), accentMat);
      pad.position.set(side * 0.16, 0.0, 0);
      rider.add(pad);
    }

    // spine stripe running up the back
    rider.add(new THREE.Mesh(tubeGeometry([
      new THREE.Vector3(0, -0.02, 0.02),
      new THREE.Vector3(0, -0.06, 0.22),
      new THREE.Vector3(0, -0.07, 0.40),
    ], 0.020, 8, 5), cyan));

    const armGeo = tubeGeometry([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -0.02, 0.20),
      new THREE.Vector3(0, -0.06, 0.42),
    ], 0.045, 8, 6);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, suitMat);
      arm.position.set(side * 0.155, 0.01, 0.30);
      arm.rotation.y = side * 0.22;
      rider.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), accentMat);
      hand.position.set(side * 0.20, -0.06, 0.72);
      rider.add(hand);
    }

    // legs bent forward to the pegs
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(tubeGeometry([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -0.16, -0.06),
        new THREE.Vector3(0.02, -0.30, -0.20),
      ], 0.058, 8, 6), suitMat);
      leg.position.set(side * 0.14, -0.05, 0.02);
      rider.add(leg);
    }

    /* ---------------------------------------------------------- handlebars */
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.035, 0.035), darkMat);
    bar.position.set(0, 0.68, -0.42);
    g.add(bar);

    /* ---------------------------------------------------------------- core */
    this.coreMat = new THREE.MeshBasicMaterial({ color: COLOR.magenta });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), this.coreMat);
    this.core.position.set(0, 0.72, -0.12);
    g.add(this.core);
    const coreGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture('#ff2fd0'), color: COLOR.magenta,
        transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
    coreGlow.position.copy(this.core.position);
    coreGlow.position.z += 0.02;
    coreGlow.renderOrder = 4;
    g.add(coreGlow);
    this.coreGlow = coreGlow;

    /* --------------------------------------------------------- light & trail */
    const poolMat = new THREE.MeshBasicMaterial({
      map: makeGlowTexture('#27f4ff'), transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.02;
    this.pool.renderOrder = 2;
    g.add(this.pool);

    this.trailMat = new THREE.MeshBasicMaterial({
      map: makeTrailTexture(), transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.trail = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 6), this.trailMat);
    this.trail.rotation.x = -Math.PI / 2;
    this.trail.position.set(0, 0.06, 3.5);
    this.trail.renderOrder = 3;
    g.add(this.trail);

    /* --------------------------------------------------------------- shield */
    this.shieldMat = new THREE.MeshBasicMaterial({
      color: COLOR.green, wireframe: true, transparent: true, opacity: 0.0,
    });
    this.shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), this.shieldMat);
    this.shieldMesh.position.y = 0.9;
    this.shieldMesh.visible = false;
    g.add(this.shieldMesh);
  }

  /* ------------------------------------------------------------------- state */

  get height() {
    return this.sliding ? CFG.slideHeight : CFG.standHeight;
  }

  reset() {
    this.laneIndex = 1;
    this.x = LANES[1];
    this.laneFrom = LANES[1];
    this.laneTo = LANES[1];
    this.laneT = 1;
    this.y = 0;
    this.vy = 0;
    this.vx = 0;
    this.onGround = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.sliding = false;
    this.slideTimer = 0;
    this.tilt = 0;
    this.boostVis = 0;
    this.hurtFlash = 0;
    this.time = 0;
    this.shield = false;
    this.shieldMesh.visible = false;
    this.shieldMat.opacity = 0;
    this.group.visible = true;
    this.group.scale.set(1, 1, 1);
    this.group.rotation.set(0, 0, 0);
    this.group.position.set(this.x, 0, 0);
  }

  /* ----------------------------------------------------------------- actions */

  _startLane(newIndex) {
    this.laneFrom = this.x;
    this.laneTo = LANES[newIndex];
    this.laneIndex = newIndex;
    this.laneT = 0;
  }

  moveLeft() {
    if (this.laneIndex <= 0) return false;
    this._startLane(this.laneIndex - 1);
    if (this.audio) this.audio.lane();
    return true;
  }

  moveRight() {
    if (this.laneIndex >= LANES.length - 1) return false;
    this._startLane(this.laneIndex + 1);
    if (this.audio) this.audio.lane();
    return true;
  }

  _doJump() {
    this.vy = CFG.jumpVelocity;
    this.onGround = false;
    this.coyote = 0;
    this.sliding = false;
    this.slideTimer = 0;
    if (this.audio) this.audio.jump();
    this._puff(10, 0xcfefff, 3.2);
  }

  /**
   * @returns {boolean} true when a jump actually started this frame. A press
   * that is slightly early is remembered for jumpBufferTime so it fires on
   * landing instead of being swallowed.
   */
  jump() {
    if (this.onGround || this.coyote > 0) {
      this._doJump();
      this.jumpBuffer = 0;
      return true;
    }
    this.jumpBuffer = CFG.jumpBufferTime;
    return false;
  }

  slide() {
    if (!this.onGround) {
      this.vy = Math.min(this.vy, -6) * CFG.fastFallMul * 0.6;
      return false;
    }
    if (this.sliding) {
      this.slideTimer = CFG.slideDuration;
      return false;
    }
    this.sliding = true;
    this.slideTimer = CFG.slideDuration;
    if (this.audio) this.audio.slide();
    this._puff(14, 0x27f4ff, 4.5);
    return true;
  }

  _puff(count, color, speed) {
    this.particles.burst(this.x, this.y + 0.15, 0.4, {
      count, color, speed, size: 0.36, life: 0.5,
      gravity: -3, drag: 2.4, zVar: 0.6,
    });
  }

  /* ------------------------------------------------------------------ update */

  update(dt, speed) {
    this.time += dt;

    /* ------------------------------------------------------------ timers */
    if (this.onGround) this.coyote = CFG.coyoteTime;
    else this.coyote = Math.max(0, this.coyote - dt);

    if (this.jumpBuffer > 0) {
      this.jumpBuffer -= dt;
      if (this.onGround || this.coyote > 0) {
        this.jumpBuffer = 0;
        this._doJump();
      }
    }

    /* --------------------------------------------------------- vertical */
    if (!this.onGround) {
      // float up, drop fast
      this.vy += (this.vy > 0 ? CFG.gravityUp : CFG.gravityDown) * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.lastLandImpact = Math.min(1, -this.vy / 22);
        this.y = 0;
        this.vy = 0;
        this.onGround = true;
        if (this.audio) this.audio.land();
        this._puff(6 + Math.round(this.lastLandImpact * 14), 0xbfe9ff,
                   2.4 + this.lastLandImpact * 3);
      }
    }

    /* ------------------------------------------------------------ slide */
    if (this.sliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) this.sliding = false;
    }

    /* ------------------------------------------------------------- lane */
    const prevX = this.x;
    if (this.laneT < 1) {
      this.laneT = Math.min(1, this.laneT + dt / CFG.laneSwitchTime);
      this.x = lerp(this.laneFrom, this.laneTo, easeOutCubic(this.laneT));
    } else {
      this.x = this.laneTo;
    }
    this.vx = dt > 0 ? (this.x - prevX) / dt : 0;
    const targetTilt = clamp(-this.vx * 0.04, -CFG.laneTilt, CFG.laneTilt);
    this.tilt = damp(this.tilt, targetTilt, 14, dt);

    /* -------------------------------------------------------- animation */
    const t = this.time;
    const speed01 = clamp((speed - CFG.speedStart) / (CFG.speedMax - CFG.speedStart), 0, 1.4);

    const bob = Math.sin(t * 7.5) * 0.045 + Math.sin(t * 3.1) * 0.03;
    const slideSquash = this.sliding ? 0.5 : 1;

    this.group.position.set(this.x, this.y + bob * (this.onGround ? 1 : 0.25), 0);
    this.group.scale.y = damp(this.group.scale.y, slideSquash, 18, dt);
    this.group.scale.x = damp(this.group.scale.x, this.sliding ? 1.12 : 1, 14, dt);

    // pitch: nose up while rising, down while falling
    const pitch = this.onGround ? 0 : clamp(-this.vy * 0.02, -0.32, 0.32);
    this.group.rotation.x = damp(this.group.rotation.x, pitch, 10, dt);
    this.group.rotation.z = damp(this.group.rotation.z, this.tilt, 14, dt);
    this.group.rotation.y = damp(this.group.rotation.y, this.tilt * 0.35, 12, dt);

    // thruster flare
    for (let i = 0; i < this.flames.length; i++) {
      const flick = 0.6 + speed01 * 1.5 + Math.sin(t * 30 + i * 1.7) * 0.14;
      this.flames[i].scale.set(1, flick, 1);
      this.flameMats[i].opacity = 0.5 + speed01 * 0.45;
    }

    // core pulse
    const pulse = 1 + Math.sin(t * 8) * 0.11;
    this.core.scale.setScalar(pulse);
    this.coreMat.color.setHex(this.boostVis > 0 ? COLOR.gold : COLOR.magenta);

    // trail only really shows up at speed
    this.trailMat.opacity = clamp(speed01 * 0.75, 0, 0.8);
    this.trail.scale.set(1, 1 + speed01 * 0.6, 1);

    // ground light pool
    this.pool.material.opacity = this.onGround ? 0.5 : clamp(0.5 - this.y * 0.12, 0.05, 0.5);

    // shield bubble
    if (this.shield) {
      this.shieldMesh.visible = true;
      this.shieldMat.opacity = 0.32 + Math.sin(t * 6) * 0.12;
      this.shieldMesh.rotation.y += dt * 1.4;
      this.shieldMesh.rotation.x += dt * 0.9;
    } else if (this.shieldMesh.visible) {
      this.shieldMat.opacity -= dt * 2.2;
      if (this.shieldMat.opacity <= 0) {
        this.shieldMat.opacity = 0;
        this.shieldMesh.visible = false;
      }
    }

    /* ---------------------------------------------------- engine sparks */
    if (Math.random() < 0.4 + speed01 * 0.5) {
      this.particles.emit(
        this.x + (Math.random() - 0.5) * 0.4,
        this.y + 0.5 + (Math.random() - 0.5) * 0.15,
        1.05,
        (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 0.8,
        6 + Math.random() * 8,
        Math.random() < 0.5 ? COLOR.cyan : COLOR.magenta,
        0.3 + Math.random() * 0.22,
        0.28 + Math.random() * 0.22,
        0, 1.2
      );
    }

    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    if (this.boostVis > 0) this.boostVis = Math.max(0, this.boostVis - dt);
  }

  /** Visual feedback when a shield soaks a hit. */
  breakShield() {
    this.shield = false;
    this.particles.burst(this.x, this.y + 0.9, 0, {
      count: 26, color: COLOR.green, speed: 9, size: 0.45, life: 0.7, gravity: -8, drag: 1.6,
    });
  }

  /** Blow the bike apart on a fatal crash. */
  explode() {
    this.particles.burst(this.x, this.y + 0.8, 0, {
      count: 60, color: COLOR.magenta, speed: 14, size: 0.6, life: 1.0, gravity: -14, drag: 1.2,
    });
    this.particles.burst(this.x, this.y + 0.8, 0, {
      count: 40, color: COLOR.cyan, speed: 10, size: 0.5, life: 0.85, gravity: -10, drag: 1.4,
    });
    this.group.visible = false;
  }
}
