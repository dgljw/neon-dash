/**
 * NEON DASH — GPU particle pool.
 * One draw call for the whole system; particles are simulated on the CPU
 * (a few hundred at a time is comfortably cheap) and uploaded as attributes.
 */
import * as THREE from '../../vendor/three.module.min.js';

const VERT = `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (320.0 / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  // NOTE: glsl smoothstep() is undefined when edge0 >= edge1, so the
  // arguments must be ascending and the result inverted.
  float a = (1.0 - smoothstep(0.0, 0.25, r)) * vAlpha;
  if (a <= 0.001) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

/** Store a hex literal verbatim (no colour-space conversion) so the shader output matches it exactly. */
const rawColor = (hex) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);

export class ParticleSystem {
  constructor(scene, max = 1000) {
    this.max = max;
    this.cursor = 0;
    this.highWater = 0;

    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.fadePow = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.geometry = geo;
    this.material = mat;
    scene.add(this.points);

    this._c = new THREE.Color();
  }

  /** Emit a single particle. Returns false when the pool has no room. */
  emit(x, y, z, vx, vy, vz, hex, size, life, gravity = 0, drag = 1.4, fadePow = 1) {
    const i = this.cursor;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;

    const c = rawColor(hex);
    this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;

    this.size[i] = size;
    this.baseSize[i] = size;
    this.alpha[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.fadePow[i] = fadePow;

    this.cursor = (i + 1) % this.max;
    if (this.cursor > this.highWater) this.highWater = this.cursor;

    // keep the draw range tight to what has actually been used
    this.geometry.setDrawRange(0, Math.min(this.max, this.highWater + 1));
    return true;
  }

  /** Radial burst of `count` particles around a point. */
  burst(x, y, z, opts = {}) {
    const {
      count = 18, color = 0xffffff, speed = 6, speedVar = 0.6,
      size = 0.42, sizeVar = 0.5, life = 0.6, lifeVar = 0.4,
      gravity = -6, drag = 2.2, dir = null, spread = 1, zVar = 0.4, fadePow = 1,
    } = opts;
    for (let n = 0; n < count; n++) {
      let vx, vy, vz;
      if (dir) {
        vx = dir.x + (Math.random() - 0.5) * spread;
        vy = dir.y + (Math.random() - 0.5) * spread;
        vz = dir.z + (Math.random() - 0.5) * spread;
      } else {
        const a = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        vx = Math.sin(p) * Math.cos(a);
        vy = Math.sin(p) * Math.sin(a);
        vz = Math.cos(p);
      }
      const sp = speed * (1 + (Math.random() - 0.5) * 2 * speedVar);
      this.emit(
        x + (Math.random() - 0.5) * zVar,
        y + (Math.random() - 0.5) * zVar,
        z + (Math.random() - 0.5) * zVar,
        vx * sp, vy * sp, vz * sp,
        color,
        size * (1 + (Math.random() - 0.5) * 2 * sizeVar),
        life * (1 + (Math.random() - 0.5) * 2 * lifeVar),
        gravity, drag, fadePow
      );
    }
  }

  update(dt) {
    const { pos, vel, life, maxLife, alpha, size, baseSize, grav, drag, fadePow } = this;
    const n = this.max;
    for (let i = 0; i < n; i++) {
      if (life[i] <= 0) {
        if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; }
        continue;
      }
      life[i] -= dt;
      if (life[i] <= 0) { alpha[i] = 0; size[i] = 0; continue; }

      const i3 = i * 3;
      const d = Math.exp(-drag[i] * dt);
      vel[i3] *= d;
      vel[i3 + 1] = vel[i3 + 1] * d + grav[i] * dt;
      vel[i3 + 2] *= d;

      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;

      const t = life[i] / maxLife[i];
      alpha[i] = Math.pow(t, fadePow[i]);
      size[i] = baseSize[i] * (0.35 + 0.65 * t);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  /** Kill everything — used when restarting a run. */
  reset() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.size.fill(0);
    this.cursor = 0;
    this.geometry.setDrawRange(0, 0);
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
  }
}
