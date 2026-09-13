/**
 * Software preview renderer.
 *
 * jsdom cannot give us WebGL, so there is no way to screenshot the game with a
 * real rasteriser here. This instead boots the genuine client (see
 * tools/client-harness.mjs), then renders its ACTUAL scene graph from its
 * ACTUAL camera by raycasting one ray per pixel and shading the hits with an
 * approximation of three's lighting, fog, tone mapping and additive blending.
 *
 * It is not pixel-accurate — it does not run the GPU shaders, post-processing
 * or particles — but it faithfully shows composition, geometry, colour and
 * layout, which is exactly what you need to judge "does this look good".
 *
 *   node tools/preview-render.mjs --scene menu   --out a.png
 *   node tools/preview-render.mjs --scene play --seconds 12 --width 480
 */
import { writeFileSync } from 'node:fs';
import { resolve as pathResolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.mjs';
import { bootClient, ROOT } from './client-harness.mjs';

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};

const SCENE = getArg('scene', 'play');
const SECONDS = Number(getArg('seconds', 14));
const W = Number(getArg('width', 400));
const H = Math.round(W * 9 / 16);
const OUT = getArg('out', pathResolve(process.env.HOME || '.', 'tmp', `preview-${SCENE}-${W}.png`));

/* --------------------------------------------------------------- boot */

const { game, step, sleep, key, errors } = await bootClient({ width: 1280, height: 720 });
await sleep(400);

if (SCENE === 'menu') {
  step(160);
} else if (SCENE === 'play') {
  game.startRun();
  // dodge a little so the shot is not always the same three lanes
  for (let s = 0; s < SECONDS; s++) {
    step(60);
    if (s % 4 === 1) key('ArrowLeft');
    if (s % 4 === 3) key('ArrowRight');
    if (s % 7 === 5) key('ArrowUp');
    if (s % 9 === 7) key('ArrowDown');
    if (game.state !== 'playing') { game.state = 'playing'; game.player.group.visible = true; }
  }
} else if (SCENE === 'over') {
  game.startRun();
  step(60 * 20);
  game._crash(0, 1, 0);
  step(80);
} else if (SCENE === 'idle') {
  // first frame of a run, nothing on screen yet
  game.startRun();
  step(2);
}

const THREE = game.scene.constructor === Object ? null : await import('../vendor/three.module.min.js');

/* -------------------------------------------------- scene introspection */

const { scene, camera } = game;
scene.updateMatrixWorld(true);
camera.updateMatrixWorld(true);

function collectVisible(root, out) {
  if (!root.visible) return out;
  if (root.isMesh || root.isSprite || root.isPoints) out.push(root);
  for (const c of root.children) collectVisible(c, out);
  return out;
}
const targets = collectVisible(scene, []);
const nPoints = targets.filter((o) => o.isPoints).length;

const lights = { hemi: null, dirs: [] };
scene.traverse((o) => {
  if (o.isHemisphereLight) lights.hemi = o;
  else if (o.isDirectionalLight) lights.dirs.push(o);
});

const fog = scene.fog;
const exposure = game.renderer.toneMappingExposure ?? 1;

console.log(`scene="${SCENE}"  objects=${targets.length} (points=${nPoints})  render ${W}x${H}  lights=${lights.dirs.length}dir`);
console.log(`  camera pos=(${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}) fov=${camera.fov.toFixed(1)}`);
console.log(`  state=${game.state}  player: visible=${game.player.group.visible} x=${game.player.x.toFixed(2)} y=${game.player.y.toFixed(2)}`);
if (game.world.obstacles.length) {
  const near = game.world.obstacles.map(o=>o.position.z).filter(z=>z<-1).sort((a,b)=>b-a)[0];
  console.log(`  nearest obstacle z=${near === undefined ? 'n/a' : near.toFixed(1)}`);
}
console.log(`  world: obstacles=${game.world.obstacles.length} coins=${game.world.coins.length} powerups=${game.world.powerups.length} scenery=${game.world.scenery.length}`);

/* ------------------------------------------------------------- shading */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const srgbToLinear = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
const linearToSRGB = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

/* ---------------------------------------------------- texture sampling */

/** Decode each backing canvas once, then index the pixel buffer directly. */
const pixelCache = new WeakMap();
function getPixels(img) {
  if (!img || !img.getContext) return null;
  let e = pixelCache.get(img);
  if (!e) {
    if (!img.width || !img.height) return null;
    const g = img.getContext('2d');
    if (!g || !g.getImageData) return null;
    e = { w: img.width, h: img.height, data: g.getImageData(0, 0, img.width, img.height).data };
    pixelCache.set(img, e);
  }
  return e;
}

const REPEAT = 1000;   // THREE.RepeatWrapping
const CLAMP = 1001;    // THREE.ClampToEdgeWrapping

/**
 * Sample a texture at a UV, honouring repeat/offset/wrap and sRGB decoding.
 * @returns {[number,number,number,number]|null} linear rgb + alpha
 */
function sampleTexture(tex, uv) {
  if (!tex || !uv) return null;
  const px = getPixels(tex.image);
  if (!px) return null;

  let u = uv.x * (tex.repeat ? tex.repeat.x : 1) + (tex.offset ? tex.offset.x : 0);
  let v = uv.y * (tex.repeat ? tex.repeat.y : 1) + (tex.offset ? tex.offset.y : 0);

  const wrapS = tex.wrapS === undefined ? CLAMP : tex.wrapS;
  const wrapT = tex.wrapT === undefined ? CLAMP : tex.wrapT;
  if (wrapS === REPEAT) u -= Math.floor(u); else u = clamp01(u);
  if (wrapT === REPEAT) v -= Math.floor(v); else v = clamp01(v);

  const x = Math.min(px.w - 1, Math.max(0, (u * px.w) | 0));
  // three uploads textures with flipY, so v = 0 is the last image row
  const y = Math.min(px.h - 1, Math.max(0, ((1 - v) * px.h) | 0));
  const o = (y * px.w + x) * 4;
  const srgb = tex.colorSpace === 'srgb' || tex.colorSpace === undefined || tex.colorSpace === '';
  const conv = srgb ? srgbToLinear : (z) => z;
  return [
    conv(px.data[o] / 255),
    conv(px.data[o + 1] / 255),
    conv(px.data[o + 2] / 255),
    px.data[o + 3] / 255,
  ];
}

/* ---------------------------------------------------------- tone mapping */

const m3 = (M, v) => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
];
const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]];
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];

function tonemap(c) {
  let v = c.map((x) => x * exposure);
  v = m3(ACES_IN, v);
  const a = v.map((x) => x * (x + 0.0245786) - 0.000090537);
  const b = v.map((x) => x * (0.983729 * x + 0.432951) + 0.238081);
  v = a.map((x, i) => x / (b[i] || 1e-6));
  v = m3(ACES_OUT, v);
  return v.map(clamp01);
}

/* ------------------------------------------------------------------ fog */

function fogFactor(depth) {
  if (!fog) return 0;
  const d = depth * fog.density;
  return 1 - Math.exp(-d * d);
}
const fogCol = fog ? [fog.color.r, fog.color.g, fog.color.b] : [0, 0, 0];

/* -------------------------------------------------------------- lighting */

const _n = { x: 0, y: 0, z: 0 };

/** Approximate three's light accumulation for one surface point. */
function lightAt(normalWorld) {
  const n = normalWorld;
  let lr = 0, lg = 0, lb = 0;

  if (lights.hemi) {
    const t = 0.5 + 0.5 * n.y;
    const s = lights.hemi.color, g = lights.hemi.groundColor, i = lights.hemi.intensity;
    lr += (g.r + (s.r - g.r) * t) * i;
    lg += (g.g + (s.g - g.g) * t) * i;
    lb += (g.b + (s.b - g.b) * t) * i;
  }
  for (const d of lights.dirs) {
    const p = d.position;
    const len = Math.hypot(p.x, p.y, p.z) || 1;
    const ndl = Math.max(0, (n.x * p.x + n.y * p.y + n.z * p.z) / len);
    lr += d.color.r * d.intensity * ndl;
    lg += d.color.g * d.intensity * ndl;
    lb += d.color.b * d.intensity * ndl;
  }
  return [lr, lg, lb];
}

/* ------------------------------------------------------------ shade a hit */

function shadeHit(hit) {
  const o = hit.object;
  const mat = Array.isArray(o.material) ? o.material[0] : o.material;
  if (!mat || mat.visible === false) return null;
  // the particle system uses a raw ShaderMaterial with no `color`
  if (!mat.color) return null;

  const opacity = mat.opacity === undefined ? 1 : mat.opacity;
  const additive = mat.blending === 2;                          // THREE.AdditiveBlending
  const uv = hit.uv || null;

  let rgb, coverage;

  if (o.isPoints || o.isSprite) {
    // additive billboards: the map is the whole shape
    const t = sampleTexture(mat.map, uv);
    const ta = t ? t[3] : 1;
    const tr = t ? t[0] : 1, tg = t ? t[1] : 1, tb = t ? t[2] : 1;
    const k = opacity * ta;
    rgb = [mat.color.r * tr * k, mat.color.g * tg * k, mat.color.b * tb * k];
    coverage = 1;
    const f = mat.fog === false ? 0 : fogFactor(hit.distance);
    if (f > 0) rgb = rgb.map((c, i) => c + (fogCol[i] - c) * f);
    return { rgb, additive: true, coverage: 1, depth: hit.distance };
  }

  if (mat.isMeshBasicMaterial) {
    rgb = [mat.color.r, mat.color.g, mat.color.b];
    coverage = mat.transparent ? opacity : 1;
    const t = sampleTexture(mat.map, uv);
    if (t) {
      rgb = [rgb[0] * t[0], rgb[1] * t[1], rgb[2] * t[2]];
      coverage *= t[3];
    }
  } else {
    // standard / phong / lambert: diffuse * light + emissive
    let dr = mat.color.r, dg = mat.color.g, db = mat.color.b;
    const t = sampleTexture(mat.map, uv);
    if (t) { dr *= t[0]; dg *= t[1]; db *= t[2]; }

    let er = 0, eg = 0, eb = 0;
    if (mat.emissive) {
      const ei = mat.emissiveIntensity === undefined ? 1 : mat.emissiveIntensity;
      er = mat.emissive.r * ei; eg = mat.emissive.g * ei; eb = mat.emissive.b * ei;
      const et = sampleTexture(mat.emissiveMap, uv);
      if (et) { er *= et[0]; eg *= et[1]; eb *= et[2]; }
    }

    let nrm;
    if (hit.face) {
      const n = hit.face.normal;
      const e = o.matrixWorld.elements;
      _n.x = e[0] * n.x + e[4] * n.y + e[8] * n.z;
      _n.y = e[1] * n.x + e[5] * n.y + e[9] * n.z;
      _n.z = e[2] * n.x + e[6] * n.y + e[10] * n.z;
      const len = Math.hypot(_n.x, _n.y, _n.z) || 1;
      _n.x /= len; _n.y /= len; _n.z /= len;
      nrm = _n;
    } else {
      nrm = { x: 0, y: 1, z: 0 };
    }

    const L = lightAt(nrm);
    rgb = [dr * L[0] + er, dg * L[1] + eg, db * L[2] + eb];
    coverage = mat.transparent ? opacity * (t ? t[3] : 1) : 1;
  }

  // materials can opt out of fog, exactly like the real renderer
  const f = mat.fog === false ? 0 : fogFactor(hit.distance);
  if (f > 0) rgb = rgb.map((c, i) => c + (fogCol[i] - c) * f);

  return { rgb, additive: additive || (mat.transparent === true && mat.blending !== 1),
           coverage, depth: hit.distance };
}

/* -------------------------------------------------------------- render */

const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.12;
raycaster.params.Points.threshold = 0.4;
raycaster.params.Sprite = raycaster.params.Sprite || {};

const bg = scene.background && scene.background.isColor
  ? [scene.background.r, scene.background.g, scene.background.b]
  : [0, 0, 0];

const px = new Uint8Array(W * H * 3);
const ndc = new THREE.Vector2();
const hits = [];
const t0 = Date.now();

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    ndc.x = (x + 0.5) / W * 2 - 1;
    ndc.y = -((y + 0.5) / H * 2 - 1);
    raycaster.setFromCamera(ndc, camera);

    hits.length = 0;
    raycaster.intersectObjects(targets, false, hits);

    let acc = [bg[0], bg[1], bg[2]];
    let alpha = 0;
    for (let i = 0; i < hits.length; i++) {
      const s = shadeHit(hits[i]);
      if (!s) continue;
      if (s.additive) {
        acc[0] += s.rgb[0] * s.coverage;
        acc[1] += s.rgb[1] * s.coverage;
        acc[2] += s.rgb[2] * s.coverage;
      } else {
        const a = s.coverage;
        acc[0] = acc[0] * (1 - a) + s.rgb[0] * a;
        acc[1] = acc[1] * (1 - a) + s.rgb[1] * a;
        acc[2] = acc[2] * (1 - a) + s.rgb[2] * a;
        alpha += a * (1 - alpha);
        if (alpha > 0.995) break;
      }
    }

    const c = tonemap(acc).map(linearToSRGB);
    const o = (y * W + x) * 3;
    px[o] = Math.round(clamp01(c[0]) * 255);
    px[o + 1] = Math.round(clamp01(c[1]) * 255);
    px[o + 2] = Math.round(clamp01(c[2]) * 255);
  }
}

writeFileSync(OUT, encodePNG(W, H, px));
console.log(`\nrendered in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${OUT}`);
if (errors.length) console.log('runtime errors:', errors.slice(0, 3));
void ROOT;
