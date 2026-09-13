/**
 * NEON DASH — DOM overlay: HUD, screens and transient feedback.
 * The 3D layer never touches the DOM directly; everything routes through here.
 */
import { POWERUPS } from './config.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      loading: $('loading'),
      start: $('screen-start'),
      pause: $('screen-pause'),
      over: $('screen-over'),
      hud: $('hud'),
      touchpad: $('touchpad'),
      flash: $('flash'),

      score: $('hud-score'),
      dist: $('hud-dist'),
      coins: $('hud-coins'),
      speed: $('hud-speed'),
      speedFill: $('speed-fill'),
      combo: $('combo'),
      powers: $('powers'),

      startBest: $('start-best'),
      btnMuteStart: $('btn-mute-start'),
      btnMutePause: $('btn-mute-pause'),

      overScore: $('over-score'),
      overDist: $('over-dist'),
      overCoins: $('over-coins'),
      overCombo: $('over-combo'),
      overBest: $('over-best'),
      overNew: $('over-newbest'),
      overSub: $('over-sub'),
    };
    this.powerEls = new Map();
    this._flashTimer = null;
  }

  /* ---------------------------------------------------------------- screens */

  /**
   * @param {'loading'|'start'|'playing'|'paused'|'over'} name
   */
  setScreen(name) {
    const { loading, start, pause, over, hud, touchpad } = this.el;
    loading.classList.toggle('hidden', name !== 'loading');
    start.classList.toggle('hidden', name !== 'start');
    pause.classList.toggle('hidden', name !== 'paused');
    over.classList.toggle('hidden', name !== 'over');
    hud.classList.toggle('hidden', !(name === 'playing' || name === 'paused'));
    // the touch pad is only useful while actually running
    touchpad.classList.toggle('hidden', name !== 'playing' || !this.touchMode);
  }

  setTouchMode(on) {
    this.touchMode = on;
    if (on) document.body.classList.add('has-touch');
  }

  setKeyboardMode() {
    document.body.classList.add('has-keyboard');
  }

  /* -------------------------------------------------------------------- HUD */

  setScore(n) { this.el.score.textContent = Math.floor(n).toLocaleString('en-US'); }

  setDistance(m) { this.el.dist.textContent = Math.floor(m); }

  setCoins(n) { this.el.coins.textContent = n; }

  setSpeed(kmh, ratio) {
    this.el.speed.textContent = Math.round(kmh);
    this.el.speedFill.style.width = Math.round(clamp01(ratio) * 100) + '%';
  }

  showCombo(mult) {
    const c = this.el.combo;
    c.textContent = 'x' + mult;
    c.classList.remove('pop');
    void c.offsetWidth;   // force reflow so the animation restarts
    c.classList.add('pop');
  }

  /**
   * @param {Array<{key:string, ratio:number}>} active
   */
  setPowers(active) {
    const seen = new Set();
    for (const p of active) {
      seen.add(p.key);
      let node = this.powerEls.get(p.key);
      if (!node) {
        const def = POWERUPS[p.key];
        node = document.createElement('div');
        node.className = 'power';
        node.style.color = def.css;
        node.innerHTML =
          '<span class="pico">' + def.icon + '</span>' +
          '<span class="plabel">' + def.label + '</span>' +
          '<span class="pbar"><i></i></span>';
        this.el.powers.appendChild(node);
        this.powerEls.set(p.key, node);
      }
      const bar = node.querySelector('.pbar i');
      bar.style.width = Math.round(clamp01(p.ratio) * 100) + '%';
    }
    for (const [key, node] of this.powerEls) {
      if (!seen.has(key)) {
        node.remove();
        this.powerEls.delete(key);
      }
    }
  }

  setBest(n) { this.el.startBest.textContent = Math.floor(n).toLocaleString('en-US'); }

  setMuteLabel(muted) {
    const txt = muted ? '🔇 声音：关' : '🔊 声音：开';
    if (this.el.btnMuteStart) this.el.btnMuteStart.textContent = txt;
    if (this.el.btnMutePause) this.el.btnMutePause.textContent = txt;
  }

  /* --------------------------------------------------------------- feedback */

  /** Full-screen colour punch, used on crashes and power-ups. */
  flash(color = '#ffffff', alpha = 0.4) {
    const f = this.el.flash;
    f.style.background = color;
    f.style.transition = 'none';
    f.style.opacity = String(alpha);
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      f.style.transition = 'opacity 240ms ease-out';
      f.style.opacity = '0';
    }, 24);
  }

  showGameOver(stats) {
    this.el.overScore.textContent = Math.floor(stats.score).toLocaleString('en-US');
    this.el.overDist.textContent = Math.floor(stats.distance) + ' m';
    this.el.overCoins.textContent = stats.coins;
    this.el.overCombo.textContent = 'x' + stats.bestCombo;
    this.el.overBest.textContent = Math.floor(stats.best).toLocaleString('en-US');
    this.el.overNew.classList.toggle('hidden', !stats.isNewBest);
    this.el.overSub.textContent = stats.isNewBest
      ? '刷新了个人纪录，继续保持这个节奏。'
      : '再来一次，你会跑得更远。';
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
