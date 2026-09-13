/**
 * NEON DASH — game controller.
 * Owns the renderer/scene, the run state machine, scoring and the frame loop.
 */
import * as THREE from '../vendor/three.module.min.js';
import { CFG, COLOR, POWERUPS } from './config.js';
import { clamp, damp } from './utils.js';
import { World } from './world.js';
import { Player } from './player.js';
import { ParticleSystem } from './particles.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import { UI } from './ui.js';

const SAVE_KEY = 'neon-dash-v1';

class Game {
  constructor() {
    this.state = 'loading';
    this.ui = new UI();
    this.audio = new SoundEngine();
    this.input = new Input(document.body);
    this.save = this._loadSave();

    this.distance = 0;
    this.score = 0;
    this.coinCount = 0;
    this.streak = 0;
    this.combo = 1;
    this.bestCombo = 1;
    this.comboTimer = 0;
    this.speed = CFG.speedStart;
    this.shake = 0;
    this.elapsed = 0;
    this.powers = { magnet: 0, shield: false, boost: 0 };

    this._frameTimes = [];
    this._quality = CFG.maxPixelRatio;
    this._last = 0;
    this._acc = 0;
    this._fps = 60;
  }

  /* ------------------------------------------------------------------- setup */

  init() {
    const canvas = document.getElementById('game');
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CFG.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLOR.bg);
    this.scene.fog = new THREE.FogExp2(CFG.fogColor, CFG.fogDensity);

    this.camera = new THREE.PerspectiveCamera(
      62, window.innerWidth / window.innerHeight, 0.1, 900
    );
    this.camera.position.set(0, CFG.camOffsetY, CFG.camOffsetZ);
    this.camera.lookAt(0, CFG.camLookY, CFG.camLookZ);

    this._addLights();

    this.particles = new ParticleSystem(this.scene, 1100);
    this.world = new World(this.scene);
    this.player = new Player(this.scene, this.particles, this.audio);

    this.world.demo = true;
    this.player.group.visible = true;

    this._bindInput();
    this._bindDom();

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 120));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    this.ui.setBest(this.save.best);
    this.audio.muted = !!this.save.muted;
    this.ui.setMuteLabel(this.audio.muted);
    this.ui.setTouchMode(IS_TOUCH);

    this.onResize();
    this._enterMenu();

    this._last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _addLights() {
    this.scene.add(new THREE.HemisphereLight(0x5a6cff, 0x0a0418, 1.15));

    const key = new THREE.DirectionalLight(0xff2fd0, 1.5);
    key.position.set(-5, 9, -7);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x27f4ff, 1.0);
    fill.position.set(6, 7, -4);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0x8b5cff, 0.85);
    rim.position.set(0, 5, 11);
    this.scene.add(rim);
  }

  /* ------------------------------------------------------------------ saving */

  _loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          best: Number(parsed.best) || 0,
          totalCoins: Number(parsed.totalCoins) || 0,
          plays: Number(parsed.plays) || 0,
          muted: !!parsed.muted,
        };
      }
    } catch (e) { /* storage unavailable — run without persistence */ }
    return { best: 0, totalCoins: 0, plays: 0, muted: false };
  }

  _persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------- input */

  _bindInput() {
    const i = this.input;
    i.attachKeyboard(window);
    i.attachTouch(document.body);

    i.on('left', () => { if (this.state === 'playing') this.player.moveLeft(); });
    i.on('right', () => { if (this.state === 'playing') this.player.moveRight(); });
    i.on('jump', () => {
      if (this.state === 'playing') this.player.jump();
      else if (this.state === 'menu' || this.state === 'over') this.startRun();
    });
    i.on('slide', () => { if (this.state === 'playing') this.player.slide(); });
    i.on('tap', () => { if (this.state === 'playing') this.player.jump(); });

    i.on('pause', () => {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'menu') this.startRun();
    });

    i.on('restart', () => {
      if (this.state === 'over' || this.state === 'paused' || this.state === 'playing') this.startRun();
    });

    i.on('mute', () => this.toggleMute());

    // the very first real key press switches the UI into keyboard mode
    const onceKey = () => {
      this.ui.setKeyboardMode();
      window.removeEventListener('keydown', onceKey);
    };
    window.addEventListener('keydown', onceKey);

    // unlock audio on the first user gesture (browsers require this)
    const unlock = () => {
      this.audio.init();
      if (this.audio.muted) this.audio.setMuted(true);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
  }

  _bindDom() {
    const click = (el, fn) => {
      if (!el) return;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.audio.init();
        if (this.audio.muted) this.audio.setMuted(true);
        this.audio.click();
        fn();
      });
    };

    click(document.getElementById('btn-play'), () => this.startRun());
    click(document.getElementById('btn-retry'), () => this.startRun());
    click(document.getElementById('btn-resume'), () => this.resume());
    click(document.getElementById('btn-home'), () => this._enterMenu());
    click(document.getElementById('btn-quit'), () => this._enterMenu());
    click(document.getElementById('btn-pause'), () => this.pause());
    click(document.getElementById('btn-mute-start'), () => this.toggleMute());
    click(document.getElementById('btn-mute-pause'), () => this.toggleMute());

    const pad = document.getElementById('touchpad');
    if (pad) {
      for (const btn of pad.querySelectorAll('[data-act]')) {
        const act = btn.dataset.act;
        const fire = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.state !== 'playing') return;
          if (act === 'left') this.player.moveLeft();
          else if (act === 'right') this.player.moveRight();
          else if (act === 'jump') this.player.jump();
          else if (act === 'slide') this.player.slide();
        };
        btn.addEventListener('touchstart', fire, { passive: false });
        btn.addEventListener('mousedown', fire);
      }
    }
  }

  toggleMute() {
    this.audio.init();
    this.audio.setMuted(!this.audio.muted);
    this.save.muted = this.audio.muted;
    this._persist();
    this.ui.setMuteLabel(this.audio.muted);
  }

  /* --------------------------------------------------------------- lifecycle */

  _enterMenu() {
    this.state = 'menu';
    this.world.demo = true;
    this.audio.stopMusic();
    this.player.reset();
    this.resetRunStats();
    this.world.reset();
    this.ui.setTouchMode(IS_TOUCH);
    this.ui.setScreen('start');
    this.ui.setPowers([]);
    this.ui.setBest(this.save.best);
  }

  resetRunStats() {
    this.distance = 0;
    this.score = 0;
    this.coinCount = 0;
    this.streak = 0;
    this.combo = 1;
    this.bestCombo = 1;
    this.comboTimer = 0;
    this.speed = CFG.speedStart;
    this.elapsed = 0;
    this.shake = 0;
    this.powers.magnet = 0;
    this.powers.boost = 0;
    this.powers.shield = false;
  }

  startRun() {
    this.audio.init();
    this.audio.startMusic();

    this.state = 'playing';
    this.world.demo = false;
    this.world.reset();
    this.particles.reset();
    this.player.reset();
    this.resetRunStats();

    this.save.plays += 1;
    this._persist();

    this.ui.setScreen('playing');
    this.ui.setScore(0);
    this.ui.setDistance(0);
    this.ui.setCoins(0);
    this.ui.setSpeed(0, 0);
    this.ui.setPowers([]);

    this.camera.position.set(0, CFG.camOffsetY, CFG.camOffsetZ);
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.duckMusic(0.07);
    this.ui.setScreen('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.audio.setIntensity(clamp((this.speed - CFG.speedStart) / 40, 0, 1));
    this.ui.setScreen('playing');
    this._last = performance.now();
  }

  toggleRunState() { if (this.state === 'playing') this.pause(); else this.resume(); }

  /* ---------------------------------------------------------------- gameplay */

  update(dt) {
    this.elapsed += dt;

    const ramp = Math.min(CFG.speedMax, CFG.speedStart + this.distance * CFG.speedRamp);
    const boostOn = this.powers.boost > 0;
    this.speed = boostOn ? ramp * CFG.boostMul : ramp;

    const dz = this.speed * dt;
    this.distance += dz;

    const difficulty = clamp(this.distance / 1400, 0, 1);
    this.score += dz * 0.62 * (boostOn ? 1.35 : 1);

    // combo decays when you stop collecting
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0 && this.combo > 1) {
        this.streak = 0;
        this.combo = 1;
      }
    }

    this.player.update(dt, this.speed);

    this.world.update(dt, {
      speed: this.speed,
      distance: this.distance,
      difficulty,
      player: this.player,
      magnet: this.powers.magnet > 0,
      onCoin: (x, y, z) => this._onCoin(x, y, z),
      onHit: (kind, x, y, z, obj) => this._onHit(kind, x, y, z, obj),
      onPowerup: (type, x, y, z) => this._onPowerup(type, x, y, z),
    });

    this._updatePowers(dt);
    this.updateCamera(dt);

    // music intensity tracks speed
    this.audio.setIntensity(clamp((this.speed - CFG.speedStart) / 55, 0, 1));

    this.ui.setScore(this.score);
    this.ui.setDistance(this.distance);
    this.ui.setCoins(this.coinCount);
    this.ui.setSpeed(
      this.speed * 3.6,
      (this.speed - CFG.speedStart) / (CFG.speedMax * CFG.boostMul - CFG.speedStart)
    );
  }

  _onCoin(x, y, z) {
    this.coinCount++;
    this.streak++;
    this.combo = clamp(1 + Math.floor(this.streak / 4), 1, CFG.comboMax);
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.comboTimer = CFG.comboWindow;
    this.score += CFG.coinScore * this.combo;

    this.audio.coin(Math.min(this.streak, 12));
    if (this.combo >= 2) this.ui.showCombo(this.combo);

    this.particles.burst(x, y, z, {
      count: 11, color: COLOR.gold, speed: 5.5, size: 0.36,
      life: 0.5, gravity: -4, drag: 2.6, zVar: 0.3,
    });
  }

  _onHit(kind, x, y, z, obj) {
    // while boosting you smash straight through obstacles
    if (this.powers.boost > 0) {
      if (obj) obj.visible = false;
      this.audio.hit();
      this.particles.burst(x, y, z, {
        count: 26, color: POWERUPS.boost.color, speed: 12, size: 0.5,
        life: 0.6, gravity: -7, drag: 1.5, zVar: 0.5,
      });
      this.shake = Math.max(this.shake, 0.2);
      return;
    }

    // a shield eats exactly one hit
    if (this.player.shield) {
      this.player.shield = false;
      this.powers.shield = false;
      this.player.breakShield();
      this.audio.shieldBreak();
      this.ui.flash('#4dffa1', 0.32);
      this.shake = Math.max(this.shake, 0.34);
      return;
    }

    this._crash(x, y, z);
  }

  _onPowerup(type, x, y, z) {
    const def = POWERUPS[type];
    this.audio.powerup();
    this.ui.flash(def.css, 0.3);
    this.score += 40;

    this.particles.burst(x, y, z, {
      count: 34, color: def.color, speed: 9, size: 0.48,
      life: 0.75, gravity: -5, drag: 1.8, zVar: 0.6,
    });

    if (type === 'magnet') this.powers.magnet = CFG.magnetDuration;
    else if (type === 'boost') this.powers.boost = CFG.boostDuration;
    else if (type === 'shield') { this.powers.shield = true; this.player.shield = true; }
  }

  _updatePowers(dt) {
    const list = [];
    if (this.powers.magnet > 0) {
      this.powers.magnet = Math.max(0, this.powers.magnet - dt);
      list.push({ key: 'magnet', ratio: this.powers.magnet / CFG.magnetDuration, timed: true });
    }
    if (this.powers.boost > 0) {
      this.powers.boost = Math.max(0, this.powers.boost - dt);
      list.push({ key: 'boost', ratio: this.powers.boost / CFG.boostDuration, timed: true });
    }
    if (this.powers.shield) list.push({ key: 'shield', ratio: 1, timed: false });
    this.ui.setPowers(list);
  }

  _crash(x, y, z) {
    this.state = 'dying';
    this.dyingTimer = 0.95;

    this.audio.hit();
    this.audio.stopMusic(0.8);
    this.audio.gameOver();

    this.ui.flash('#ff3b5c', 0.6);
    this.shake = 0.95;

    this.player.explode();
    this.particles.burst(x, y + 0.8, z, {
      count: 46, color: COLOR.danger, speed: 15, size: 0.6,
      life: 0.95, gravity: -13, drag: 1.2, zVar: 0.7,
    });
  }

  _updateDying(dt) {
    this.dyingTimer -= dt;
    const k = clamp(this.dyingTimer / 0.95, 0, 1);
    const slow = dt * (0.12 + 0.88 * k);

    this.world.update(slow, {
      speed: this.speed,
      distance: this.distance,
      difficulty: 0,
      player: this.player,
      magnet: false,
      onCoin: null,
      onHit: null,
      onPowerup: null,
    });

    this.updateCamera(dt);
    if (this.dyingTimer <= 0) this._gameOver();
  }

  _gameOver() {
    this.state = 'over';

    const isNewBest = this.score > this.save.best;
    if (isNewBest) this.save.best = Math.floor(this.score);
    this.save.totalCoins += this.coinCount;
    this._persist();

    this.ui.setBest(this.save.best);
    this.ui.setPowers([]);
    this.ui.showGameOver({
      score: this.score,
      distance: this.distance,
      coins: this.coinCount,
      bestCombo: this.bestCombo,
      best: this.save.best,
      isNewBest,
    });
    this.ui.setScreen('over');
  }

  _updateMenu(dt) {
    this.elapsed += dt;
    const speed = 15;
    this.menuDistance = (this.menuDistance || 0) + speed * dt;

    this.player.update(dt, speed);
    this.world.update(dt, {
      speed,
      distance: this.menuDistance,
      difficulty: 0,
      player: this.player,
      magnet: false,
      onCoin: null,
      onHit: null,
      onPowerup: null,
    });

    const t = this.elapsed;
    this.camera.position.x = damp(this.camera.position.x, Math.sin(t * 0.32) * 2.4, 1.1, dt);
    this.camera.position.y = damp(this.camera.position.y, CFG.camOffsetY + Math.sin(t * 0.47) * 0.45, 1.1, dt);
    this.camera.position.z = damp(this.camera.position.z, CFG.camOffsetZ + 0.6, 1.6, dt);
    this.camera.lookAt(this.camera.position.x * 0.35, CFG.camLookY + 0.2, CFG.camLookZ);
    if (Math.abs(this.camera.fov - 62) > 0.05) {
      this.camera.fov = damp(this.camera.fov, 62, 3, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  /* ----------------------------------------------------------------- camera */

  updateCamera(dt) {
    const p = this.player;
    const boosting = this.powers.boost > 0;

    this.camera.position.x = damp(this.camera.position.x, p.x * 0.68, CFG.camLerp, dt);
    this.camera.position.y = damp(this.camera.position.y, CFG.camOffsetY + p.y * 0.3, CFG.camLerp, dt);
    this.camera.position.z = damp(this.camera.position.z, CFG.camOffsetZ - (boosting ? 0.8 : 0), 4, dt);

    if (this.shake > 0.0005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 1.3;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 1.3;
      this.shake = Math.max(0, this.shake - dt * CFG.camShakeDecay);
    }

    if (!this._look) this._look = new THREE.Vector3();
    this._look.set(p.x * 0.45, CFG.camLookY + p.y * 0.32, CFG.camLookZ);
    this.camera.lookAt(this._look);

    const targetFov = 62 + (boosting ? 9 : 0) + clamp((this.speed - 28) / 70, 0, 1) * 5;
    if (Math.abs(this.camera.fov - targetFov) > 0.06) {
      this.camera.fov = damp(this.camera.fov, targetFov, 3.5, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  /* ------------------------------------------------------------- frame loop */

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._quality));
    this.renderer.setSize(w, h, false);
  }

  _loop(now) {
    requestAnimationFrame(this._loop);

    let dt = (now - this._last) / 1000;
    this._last = now;
    if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, CFG.maxDelta);

    // adaptive resolution: drop to 1x if we are consistently slow
    this._frameTimes.push(dt);
    if (this._frameTimes.length >= 90) {
      this._frameTimes.shift();
      let sum = 0;
      for (const v of this._frameTimes) sum += v;
      const avg = sum / this._frameTimes.length;
      this._fps = 1 / avg;
      if (avg > 0.026 && this._quality > 1) {
        this._quality = 1;
        this.onResize();
      }
    }

    switch (this.state) {
      case 'playing': this.update(dt); break;
      case 'dying': this._updateDying(dt); break;
      case 'menu': this._updateMenu(dt); break;
      case 'paused': this.updateCamera(dt * 0.25); break;
      case 'over': this.updateCamera(dt * 0.5); break;
      default: this._updateMenu(dt); break;
    }

    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

/* ------------------------------------------------------------------- bootstrap */

const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;

const game = new Game();
window.__neonDash = game;

try {
  game.init();
  setTimeout(() => {
    if (game.state === 'loading') game._enterMenu();
  }, 220);
} catch (err) {
  console.error('[NEON DASH] boot failed', err);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.innerHTML =
      '<div class="loader"><p style="color:#ff3b5c;letter-spacing:.1em">' +
      '初始化失败<br><span style="font-size:11px;color:#9d8fc4">' +
      '你的浏览器可能不支持 WebGL</span></p></div>';
  }
}
