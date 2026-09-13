/**
 * jianguo18.top — game portal.
 *
 * A single place to list and launch the games hosted on this domain. Each game
 * lives in its own folder and is a self-contained static site, so publishing a
 * new one is just: drop the folder in, add an entry to GAMES below.
 */

/* card artwork lives in js/card-art.js so it can also be rendered offline */
import { ART } from './card-art.js';
import { GAMES } from './games.js';

/* ================================================================== cards */

function buildCard(game, index) {
  const el = document.createElement('a');
  el.className = 'card';
  el.href = game.href;
  el.style.setProperty('--accent', game.accent);
  el.style.setProperty('--accent2', game.accent2);
  el.setAttribute('aria-label', `${game.title} ${game.subtitle} — 开始游戏`);

  const art = (ART[game.art] || artNeon)(game.accent, game.accent2);
  const tags = game.tags.map((t) => `<span class="tag">${t}</span>`).join('');
  const badge = game.badge ? `<span class="badge">${game.badge}</span>` : '';
  const hint = index < 9 ? `<kbd>${index + 1}</kbd>` : '';

  el.innerHTML = `
    <div class="thumb">
      ${art}
      <div class="thumb-glow"></div>
      ${badge}
    </div>
    <div class="body">
      <div class="titles">
        <h2 class="game-title">${game.title}</h2>
        <span class="game-sub">${game.subtitle}</span>
      </div>
      <p class="game-desc">${game.desc}</p>
      <div class="tags">${tags}</div>
      <div class="play">
        <span class="play-label">开始游戏</span>
        <span class="play-arrow">→</span>
        ${hint}
      </div>
    </div>`;
  return el;
}

function renderGames() {
  const host = document.getElementById('games');
  if (!host) return;
  const frag = document.createDocumentFragment();
  GAMES.forEach((g, i) => frag.appendChild(buildCard(g, i)));
  host.appendChild(frag);

  const stats = document.getElementById('stats');
  if (stats) stats.textContent = `${GAMES.length} 个游戏 · 全部免费 · 无需安装`;

  // number keys launch a game — arcade style
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= GAMES.length) {
      e.preventDefault();
      window.location.href = GAMES[n - 1].href;
    }
  });
}

/* ======================================================== background art */

function startBackdrop() {
  const canvas = document.getElementById('bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1;
  let stars = [];
  let scroll = 0;
  let raf = 0;
  let last = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.round((W * H) / 9000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * 0.62,
      r: Math.random() * 1.2 + 0.25,
      a: Math.random() * 0.6 + 0.2,
      tw: Math.random() * Math.PI * 2,
    }));
  }

  function draw(t) {
    const horizon = H * 0.62;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#05020c');
    sky.addColorStop(0.65, '#0d0620');
    sky.addColorStop(1, '#1d0a33');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon);

    // stars
    for (const s of stars) {
      const tw = reduce ? 1 : 0.65 + 0.35 * Math.sin(t * 0.0016 + s.tw);
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = '#cfe6ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // sun
    const cx = W / 2;
    const sunR = Math.min(W, H) * 0.16;
    const sunY = horizon - sunR * 0.42;

    const halo = ctx.createRadialGradient(cx, sunY, sunR * 0.5, cx, sunY, sunR * 4);
    halo.addColorStop(0, 'rgba(255,47,208,0.34)');
    halo.addColorStop(0.5, 'rgba(255,47,208,0.10)');
    halo.addColorStop(1, 'rgba(255,47,208,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, horizon);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, sunY, sunR, 0, Math.PI * 2);
    ctx.clip();
    const sg = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    sg.addColorStop(0, '#ffe36b');
    sg.addColorStop(0.42, '#ff9a3c');
    sg.addColorStop(1, '#ff2fd0');
    ctx.fillStyle = sg;
    ctx.fillRect(cx - sunR, sunY - sunR, sunR * 2, sunR * 2);
    // cut-out bands
    ctx.fillStyle = '#0b0520';
    for (let i = 0; i < 9; i++) {
      const y = sunY + sunR * 0.06 + i * (sunR * 0.15);
      ctx.fillRect(cx - sunR, y, sunR * 2, 1.2 + i * 0.85);
    }
    ctx.restore();

    // ground
    const ground = ctx.createLinearGradient(0, horizon, 0, H);
    ground.addColorStop(0, '#150a2c');
    ground.addColorStop(1, '#05020c');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, W, H - horizon);

    // perspective grid
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, W, H - horizon);
    ctx.clip();
    ctx.lineWidth = 1;

    const vpx = cx;
    const span = Math.max(W, H) * 1.6;
    ctx.strokeStyle = 'rgba(39,244,255,0.34)';
    ctx.beginPath();
    for (let i = -14; i <= 14; i++) {
      const xb = vpx + i * (span / 28);
      ctx.moveTo(vpx, horizon);
      ctx.lineTo(xb, H + 40);
    }
    ctx.stroke();

    // horizontal rungs scrolling toward the viewer
    if (!reduce) scroll = (scroll + 0.0075) % 1;
    ctx.strokeStyle = 'rgba(255,47,208,0.32)';
    ctx.beginPath();
    const RUNGS = 16;
    for (let i = 0; i < RUNGS; i++) {
      const d = i + 1 - scroll;
      if (d <= 0.05) continue;
      const y = horizon + (H - horizon + 40) / d;
      if (y < horizon || y > H + 40) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
    ctx.restore();

    // horizon bloom
    const hb = ctx.createLinearGradient(0, horizon - 46, 0, horizon + 10);
    hb.addColorStop(0, 'rgba(255,47,208,0)');
    hb.addColorStop(1, 'rgba(255,47,208,0.4)');
    ctx.fillStyle = hb;
    ctx.fillRect(0, horizon - 46, W, 56);
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (reduce) {
      draw(t);
      cancelAnimationFrame(raf);
      return;
    }
    if (t - last < 24) return;          // ~40fps is plenty for a backdrop
    last = t;
    draw(t);
  }

  window.addEventListener('resize', () => { resize(); draw(performance.now()); });
  resize();
  draw(performance.now());
  if (!reduce) raf = requestAnimationFrame(frame);
}

/* =================================================================== boot */

renderGames();
startBackdrop();
