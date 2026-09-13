/**
 * NEON DASH — the player: a hover-runner that occupies one of three lanes.
 * The bike is built from primitives and animated procedurally (hover bob,
 * lane roll, jump pitch, thruster flare).
 */
import * as THREE from '../vendor/three.module.min.js';
import { CFG, COLOR, LANES } from './config.js';
import { clamp, damp, makeGlowTexture, makeTrailTexture } from './utils.js';

export class Player {
  constructor(scene, particles, audio) {
    this.scene = scene;
    this.particles = particles;
    this.audio = audio;

    this.laneIndex = 1;
    this.x = LANES[1];
    this.y = 0;
    this.vy = 0;
    this.onGround = true;
    this.sliding = false;
    this.slideTimer = 0;
    this.tilt = 0;
    this.boostVis = 0;
    this.hurtFlash = 0;
    this.shield = false;
    this.time = 0;
    this._grounded = true;

    this._build();
    scene.add(this.group);
  }

  /* ------------------------------------------------------------------ build */

  _build() {
    const g = new THREE.Group();
    this.group = g;

    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x1a1030, roughness: 0.35, metalness: 0.85,
      emissive: COLOR.cyan, emissiveIntensity: 0.25,
    });
    const neonCyan = new THREE.MeshBasicMaterial({ color: COLOR.cyan });
    const neonMagenta = new THREE.MeshBasicMaterial({ color: COLOR.magenta });

    // chassis
    const chassisGeo = new THREE.BoxGeometry(0.86, 0.3, 1.75);
    const chassis = new THREE.Mesh(chassisGeo, darkMetal);
    chassis.position.y = 0.44;
    g.add(chassis);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(chassisGeo),
      new THREE.LineBasicMaterial({ color: COLOR.cyan })
    );
    edges.position.y = 0.44;
    g.add(edges);

    // nose
    const noseGeo = new THREE.ConeGeometry(0.34, 0.78, 4);
    const nose = new THREE.Mesh(noseGeo, darkMetal);
    nose.rotation.x = -Math.PI / 2;
    nose.rotation.z = Math.PI / 4;
    nose.position.set(0, 0.44, -1.16);
    g.add(nose);

    // side rails
    const railGeo = new THREE.BoxGeometry(0.1, 0.08, 1.5);
    for (const sx of [-0.48, 0.48]) {
      const rail = new THREE.Mesh(railGeo, neonCyan);
      rail.position.set(sx, 0.4, 0);
      g.add(rail);
    }

    // rear thruster block
    const thrusterGeo = new THREE.CylinderGeometry(0.2, 0.26, 0.34, 12);
    const thruster = new THREE.Mesh(thrusterGeo, darkMetal);
    thruster.rotation.x = Math.PI / 2;
    thruster.position.set(0, 0.5, 0.95);
    g.add(thruster);

    // flame (additive cone that scales with speed)
    this.flameMat = new THREE.MeshBasicMaterial({
      color: 0x9beeff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.5, 10, 1, true), this.flameMat);
    this.flame.rotation.x = Math.PI / 2;
    this.flame.position.set(0, 0.5, 1.75);
    this.flame.renderOrder = 5;
    g.add(this.flame);

    // rider
    const riderMat = new THREE.MeshStandardMaterial({
      color: 0x241546, roughness: 0.55, metalness: 0.4,
      emissive: COLOR.magenta, emissiveIntensity: 0.4,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.44, 4, 10), riderMat);
    body.position.set(0, 0.99, 0.06);
    body.rotation.x = 0.34;
    g.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), riderMat);
    head.position.set(0, 1.46, -0.16);
    g.add(head);

    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.205, 14, 12, 0, Math.PI * 2, 0.6, 0.7),
      new THREE.MeshBasicMaterial({ color: COLOR.cyan })
    );
    visor.position.copy(head.position);
    g.add(visor);

    // glowing power core
    this.coreMat = new THREE.MeshBasicMaterial({ color: COLOR.magenta });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), this.coreMat);
    this.core.position.set(0, 0.72, 0.2);
    g.add(this.core);

    // light pool on the road under the bike
    const poolMat = new THREE.MeshBasicMaterial({
      map: makeGlowTexture('#27f4ff'), transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.02;
    this.pool.renderOrder = 2;
    g.add(this.pool);

    // speed trail ribbon
    this.trailMat = new THREE.MeshBasicMaterial({
      map: makeTrailTexture(), transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.trail = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 6), this.trailMat);
    this.trail.rotation.x = -Math.PI / 2;
    this.trail.position.set(0, 0.06, 3.4);
    this.trail.renderOrder = 3;
    g.add(this.trail);

    // shield bubble (hidden until a shield is picked up)
    this.shieldMat = new THREE.MeshBasicMaterial({
      color: COLOR.green, wireframe: true, transparent: true, opacity: 0.0,
    });
    this.shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), this.shieldMat);
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
    this.y = 0;
    this.vy = 0;
    this.onGround = true;
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

  moveLeft() {
    if (this.laneIndex <= 0) return false;
    this.laneIndex--;
    if (this.audio) this.audio.lane();
    return true;
  }

  moveRight() {
    if (this.laneIndex >= LANES.length - 1) return false;
    this.laneIndex++;
    if (this.audio) this.audio.lane();
    return true;
  }

  jump() {
    if (this.onGround) {
      this.vy = CFG.jumpVelocity;
      this.onGround = false;
      this.sliding = false;
      this.slideTimer = 0;
      if (this.audio) this.audio.jump();
      this._puff(10, 0xcfefff, 3.2);
      return true;
    }
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

    /* --------------------------------------------------------- vertical */
    if (!this.onGround) {
      this.vy += CFG.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.onGround = true;
        if (this.audio) this.audio.land();
        this._puff(12, 0xbfe9ff, 3.6);
      }
    }

    /* ------------------------------------------------------------ slide */
    if (this.sliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) this.sliding = false;
    }

    /* ------------------------------------------------------------- lane */
    const prevX = this.x;
    this.x = damp(this.x, LANES[this.laneIndex], CFG.laneLerp, dt);
    const vx = dt > 0 ? (this.x - prevX) / dt : 0;
    const targetTilt = clamp(-vx * 0.045, -CFG.laneTilt, CFG.laneTilt);
    this.tilt = damp(this.tilt, targetTilt, 12, dt);

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
    this.flame.scale.set(1, 0.6 + speed01 * 1.5 + Math.sin(t * 30) * 0.12, 1);
    this.flameMat.opacity = 0.55 + speed01 * 0.4;

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
