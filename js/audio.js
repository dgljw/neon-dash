/**
 * NEON DASH — all sound is synthesised at runtime with the Web Audio API.
 * No audio files, nothing to download, instant load.
 */

const NOTE = { C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47,
               C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
               C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
               C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0 };

/** i – VI – III – VII, the classic outrun progression. Root + chord tones. */
const PROGRESSION = [
  { root: NOTE.A2, tones: [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4] },
  { root: NOTE.F2, tones: [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.F4] },
  { root: NOTE.C3, tones: [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5] },
  { root: NOTE.G2, tones: [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.G4] },
];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.musicOn = false;
    this._timer = null;
    this._step = 0;
    this._nextTime = 0;
    this.bpm = 128;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.0;
    this.musicBus.connect(this.master);

    // shared white-noise buffer for percussive sounds
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    this.ready = true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
  }

  /* ------------------------------------------------------------ primitives */

  _osc(type, freq, t0, dur, gain, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (detune) o.detune.setValueAtTime(detune, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest || this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    return o;
  }

  _noise(t0, dur, gain, filterType, freq, q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t0);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /* ------------------------------------------------------------------ sfx */

  coin(combo = 0) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const base = 660 * Math.pow(1.0595, Math.min(combo, 12) * 2);
    this._osc('sine', base, t, 0.09, 0.22);
    this._osc('sine', base * 1.5, t + 0.045, 0.11, 0.16);
  }

  jump() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this._osc('triangle', 320, t, 0.2, 0.16);
    o.frequency.exponentialRampToValueAtTime(760, t + 0.16);
  }

  land() {
    if (!this.ready || this.muted) return;
    this._noise(this.ctx.currentTime, 0.09, 0.1, 'lowpass', 900);
  }

  slide() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.34, 0.16, 'bandpass', 1800, 0.8);
    const o = this._osc('sawtooth', 420, t, 0.3, 0.06);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.3);
  }

  lane() {
    if (!this.ready || this.muted) return;
    this._osc('square', 520, this.ctx.currentTime, 0.05, 0.05);
  }

  powerup() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12].forEach((semi, i) => {
      this._osc('square', 440 * Math.pow(2, semi / 12), t + i * 0.06, 0.2, 0.12);
    });
  }

  shieldBreak() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    [12, 7, 0].forEach((semi, i) => {
      this._osc('triangle', 880 * Math.pow(2, semi / 12), t + i * 0.05, 0.22, 0.13);
    });
    this._noise(t, 0.3, 0.14, 'highpass', 2200);
  }

  hit() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this._osc('sawtooth', 200, t, 0.42, 0.24);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.4);
    this._noise(t, 0.4, 0.24, 'lowpass', 500, 0.7);
  }

  gameOver() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    [NOTE.A3, NOTE.F3, NOTE.D3, NOTE.A2].forEach((f, i) => {
      this._osc('triangle', f, t + i * 0.16, 0.4, 0.14);
    });
  }

  click() {
    if (!this.ready || this.muted) return;
    this._osc('square', 880, this.ctx.currentTime, 0.04, 0.07);
  }

  /* ---------------------------------------------------------------- music */

  startMusic() {
    if (!this.ready) return;
    this.musicOn = true;
    this.musicBus.gain.setTargetAtTime(0.34, this.ctx.currentTime, 0.6);
    if (this._timer) return;
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.08;
    this._timer = setInterval(() => this._scheduler(), 25);
  }

  stopMusic(fade = 0.4) {
    this.musicOn = false;
    if (this.ready && this.musicBus) {
      this.musicBus.gain.setTargetAtTime(0.0, this.ctx.currentTime, fade / 3);
    }
  }

  /** Duck the music while paused / on the game-over screen. */
  duckMusic(amount = 0.1) {
    if (this.ready && this.musicBus) {
      this.musicBus.gain.setTargetAtTime(this.musicOn ? amount : 0, this.ctx.currentTime, 0.15);
    }
  }

  setIntensity(t) {
    // 0..1 — raise the music bus slightly as the run speeds up
    if (this.ready && this.musicBus && this.musicOn) {
      this.musicBus.gain.setTargetAtTime(0.3 + t * 0.14, this.ctx.currentTime, 0.4);
    }
  }

  _scheduler() {
    if (!this.ready) return;
    const stepDur = 60 / this.bpm / 4; // 16th notes
    while (this._nextTime < this.ctx.currentTime + 0.15) {
      this._playStep(this._step, this._nextTime);
      this._nextTime += stepDur;
      this._step++;
    }
  }

  _playStep(step, t) {
    const bar = Math.floor(step / 16) % PROGRESSION.length;
    const chord = PROGRESSION[bar];
    const s = step % 16;
    const bus = this.musicBus;

    // kick on every beat
    if (s % 4 === 0) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.28);
    }

    // offbeat hat
    if (s % 4 === 2) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      src.connect(f).connect(g).connect(bus);
      src.start(t);
      src.stop(t + 0.09);
    }

    // driving 8th-note bass
    if (s % 2 === 0) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(700, t);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(chord.root, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      o.connect(f).connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.22);
    }

    // arpeggio, skipping a few steps so it breathes
    if (![1, 6, 11, 14].includes(s)) {
      const tone = chord.tones[(step * 3 + bar) % chord.tones.length];
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(tone * 2, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.075, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.16);
    }
  }
}
