/**
 * NEON DASH — the player: a hover-runner that occupies one of three lanes.
 * The bike is built from primitives and animated procedurally (hover bob,
 * lane roll, jump pitch, thruster flare).
 */
import * as THREE from '../../vendor/three.module.min.js';
import { CFG, COLOR, LANES } from './config.js';
import { clamp, damp, lerp, easeOutCubic, makeGlowTexture, makeTrailTexture } from './utils.js';

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
    // `group` carries world transform and the slide squash; `model` carries the
    // overall art scale, so the two never fight each other.
    const g = new THREE.Group();
    g.scale.setScalar(1.18);
    this.model = g;
    this.group = new THREE.Group();
    this.group.add(g);

    /* ------------------------------------------------------------ materials */
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x0a0616, roughness: 0.25, metalness: 1.0,
      emissive: COLOR.magenta, emissiveIntensity: 0.06,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x06030d, roughness: 0.5, metalness: 0.8,
      emissive: COLOR.violet, emissiveIntensity: 0.18,
    });
    const magenta = new THREE.MeshBasicMaterial({ color: COLOR.magenta });
    const cyan = new THREE.MeshBasicMaterial({ color: COLOR.cyan });
    const white = new THREE.MeshBasicMaterial({ color: 0xfff3d0 });

    const edges = (geo, color, op = 1) => new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color, transparent: op < 1, opacity: op })
    );

    /* ---------------------------------------------------------------- hull */
    const hullGeo = new THREE.BoxGeometry(1.02, 0.26, 1.95);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 0.44;
    g.add(hull);
    const hullEdges = edges(hullGeo, COLOR.magenta);
    hullEdges.position.y = 0.44;
    g.add(hullEdges);

    // nose, pointing down the track
    const noseGeo = new THREE.ConeGeometry(0.4, 0.9, 4);
    const nose = new THREE.Mesh(noseGeo, hullMat);
    nose.rotation.x = -Math.PI / 2;
    nose.rotation.z = Math.PI / 4;
    nose.position.set(0, 0.44, -1.35);
    g.add(nose);
    const noseEdges = edges(noseGeo, COLOR.cyan, 0.85);
    noseEdges.rotation.copy(nose.rotation);
    noseEdges.position.copy(nose.position);
    g.add(noseEdges);

    // canopy over the rider
    const canopyGeo = new THREE.SphereGeometry(0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshStandardMaterial({
      color: 0x120a26, roughness: 0.1, metalness: 1.0,
      emissive: COLOR.cyan, emissiveIntensity: 0.3,
      transparent: true, opacity: 0.85,
    }));
    canopy.scale.set(1, 0.7, 1.5);
    canopy.position.set(0, 0.5, -0.35);
    g.add(canopy);

    /* ------------------------------------------------------- side rails/pods */
    const railGeo = new THREE.BoxGeometry(0.1, 0.09, 1.85);
    const podGeo = new THREE.CylinderGeometry(0.19, 0.23, 0.36, 12);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, sx < 0 ? cyan : magenta);
      rail.position.set(sx * 0.56, 0.4, 0);
      g.add(rail);

      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.8), darkMat);
      wing.position.set(sx * 0.72, 0.52, 0.25);
      wing.rotation.z = sx * 0.16;
      g.add(wing);
      // NOTE: Object3D.position/rotation are non-writable properties, so they
      // must be copied into, never assigned over.
      const wingEdge = edges(wing.geometry, sx < 0 ? COLOR.cyan : COLOR.magenta, 0.8);
      wingEdge.position.copy(wing.position);
      wingEdge.rotation.copy(wing.rotation);
      g.add(wingEdge);

      const pod = new THREE.Mesh(podGeo, darkMat);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(sx * 0.56, 0.44, 1.02);
      g.add(pod);
    }

    // bright tail bar — this is what the player stares at all game
    const tailGeo = new THREE.BoxGeometry(0.98, 0.11, 0.08);
    const tail = new THREE.Mesh(tailGeo, white);
    tail.position.set(0, 0.6, 1.02);
    g.add(tail);
    const tailGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.62),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture('#ff2fd0'), color: COLOR.magenta,
        transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
    tailGlow.position.set(0, 0.6, 1.06);
    tailGlow.renderOrder = 4;
    g.add(tailGlow);

    /* ------------------------------------------------------------- thrusters */
    this.flames = [];
    this.flameMats = [];
    const flameGeo = new THREE.ConeGeometry(0.2, 1.5, 10, 1, true);
    for (const sx of [-1, 1]) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9beeff, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const f = new THREE.Mesh(flameGeo, mat);
      f.rotation.x = Math.PI / 2;
      f.position.set(sx * 0.56, 0.44, 1.85);
      f.renderOrder = 5;
      g.add(f);
      this.flames.push(f);
      this.flameMats.push(mat);
    }
    this.flame = this.flames[0];
    this.flameMat = this.flameMats[0];

    /* ---------------------------------------------------------------- rider */
    const riderMat = new THREE.MeshStandardMaterial({
      color: 0x0d0720, roughness: 0.35, metalness: 0.6,
      emissive: COLOR.violet, emissiveIntensity: 0.22,
    });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 4, 12), riderMat);
    torso.position.set(0, 1.02, 0.02);
    torso.rotation.x = 0.42;
    g.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), riderMat);
    head.position.set(0, 1.5, -0.2);
    g.add(head);

    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.216, 16, 12, -0.6, 1.2, 0.7, 0.8), white);
    visor.position.copy(head.position);
    visor.rotation.y = Math.PI;
    g.add(visor);

    // glowing core between the rider's hands
    this.coreMat = new THREE.MeshBasicMaterial({ color: COLOR.magenta });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), this.coreMat);
    this.core.position.set(0, 0.78, 0.34);
    g.add(this.core);
    const coreGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture('#ff2fd0'), color: COLOR.magenta,
        transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
    coreGlow.position.copy(this.core.position);
    coreGlow.position.z += 0.02;
    coreGlow.renderOrder = 4;
    g.add(coreGlow);
    this.coreGlow = coreGlow;

    /* ------------------------------------------------------- light and trail */
    const poolMat = new THREE.MeshBasicMaterial({
      map: makeGlowTexture('#27f4ff'), transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.02;
    this.pool.renderOrder = 2;
    g.add(this.pool);

    this.trailMat = new THREE.MeshBasicMaterial({
      map: makeTrailTexture(), transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.trail = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 6), this.trailMat);
    this.trail.rotation.x = -Math.PI / 2;
    this.trail.position.set(0, 0.06, 3.5);
    this.trail.renderOrder = 3;
    g.add(this.trail);

    /* --------------------------------------------------------------- shield */
    this.shieldMat = new THREE.MeshBasicMaterial({
      color: COLOR.green, wireframe: true, transparent: true, opacity: 0.0,
    });
    this.shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), this.shieldMat);
    this.shieldMesh.position.y = 1.0;
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
