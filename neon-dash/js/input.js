/**
 * NEON DASH — input layer.
 * Keyboard (arrows / WASD / space) plus touch: swipe to change lane, swipe up to
 * jump, swipe down to slide, tap to jump. Swipes fire as soon as the gesture
 * crosses the threshold so the controls feel immediate.
 */

const SWIPE_MIN = 26;     // px before a drag counts as a swipe
const TAP_MAX_DIST = 18;  // px of travel still considered a tap
const TAP_MAX_MS = 260;

export class Input {
  constructor(target) {
    this.target = target || document.body;
    this.handlers = new Map();
    this.enabled = true;
    this._touch = null;
    this._locked = false;
    this._bound = {};
  }

  on(action, fn) {
    if (!this.handlers.has(action)) this.handlers.set(action, []);
    this.handlers.get(action).push(fn);
    return this;
  }

  emit(action, payload) {
    if (!this.enabled && action !== 'pause' && action !== 'resume') return;
    const list = this.handlers.get(action);
    if (!list) return;
    for (const fn of list) fn(payload);
  }

  /* ------------------------------------------------------------- keyboard */

  attachKeyboard(win = window) {
    const onKey = (e) => {
      if (e.repeat) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
        return;
      }
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A': this.emit('left'); break;
        case 'ArrowRight': case 'd': case 'D': this.emit('right'); break;
        case 'ArrowUp': case 'w': case 'W': case ' ': this.emit('jump'); break;
        case 'ArrowDown': case 's': case 'S': this.emit('slide'); break;
        case 'Escape': case 'p': case 'P': this.emit('pause'); break;
        case 'r': case 'R': this.emit('restart'); break;
        case 'm': case 'M': this.emit('mute'); break;
        case 'Enter': this.emit('confirm'); break;
        default: handled = false;
      }
      if (handled) e.preventDefault();
    };
    win.addEventListener('keydown', onKey, { passive: false });
    this._bound.keydown = onKey;
    this._win = win;
  }

  /* ---------------------------------------------------------------- touch */

  attachTouch(el = this.target) {
    const start = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      this._touch = { x: t.clientX, y: t.clientY, t: performance.now() };
      this._locked = false;
    };

    const move = (e) => {
      if (!this._touch || this._locked) return;
      const t = e.touches[0];
      const dx = t.clientX - this._touch.x;
      const dy = t.clientY - this._touch.y;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) < SWIPE_MIN) return;
      this._locked = true;
      if (ax > ay) this.emit(dx > 0 ? 'right' : 'left');
      else this.emit(dy > 0 ? 'slide' : 'jump');
      if (e.cancelable) e.preventDefault();
    };

    const end = (e) => {
      if (!this._touch) return;
      const t = (e.changedTouches && e.changedTouches[0]) || null;
      const dt = performance.now() - this._touch.t;
      if (!this._locked && t) {
        const dist = Math.hypot(t.clientX - this._touch.x, t.clientY - this._touch.y);
        if (dist < TAP_MAX_DIST && dt < TAP_MAX_MS) this.emit('tap');
      }
      this._touch = null;
      this._locked = false;
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
    this._bound.touch = { el, start, move, end };
  }

  /** Wire a DOM button (mouse + touch) to a game action. */
  bindButton(el, action) {
    if (!el) return;
    const fire = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.emit(action);
    };
    el.addEventListener('click', fire);
    return el;
  }

  detach() {
    if (this._win && this._bound.keydown) {
      this._win.removeEventListener('keydown', this._bound.keydown);
    }
    const t = this._bound.touch;
    if (t) {
      t.el.removeEventListener('touchstart', t.start);
      t.el.removeEventListener('touchmove', t.move);
      t.el.removeEventListener('touchend', t.end);
      t.el.removeEventListener('touchcancel', t.end);
    }
  }
}
