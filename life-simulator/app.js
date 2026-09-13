// ============================================================
//  人生模拟器 · 游戏逻辑 (app.js)
//  负责：创建角色、逐年推进、事件选择、结局结算、DOM 渲染。
// ============================================================

"use strict";

(function () {
  const LIFE = window.LIFE;

  // ---------- 工具 ----------
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function weightedPick(items) {
    const total = items.reduce((s, it) => s + it.weight, 0);
    let r = Math.random() * total;
    for (const it of items) { r -= it.weight; if (r <= 0) return it; }
    return items[items.length - 1];
  }

  // ---------- 全局状态 ----------
  let state = null;
  let pendingEvent = null;

  // ---------- 统计属性 ----------
  function initStats(alloc, familyVal) {
    const base = {};
    LIFE.STATS.forEach((s) => { base[s.key] = 0; });
    // 天赋点
    const map = { iq: alloc.iq, eq: alloc.eq, health: alloc.health, looks: alloc.looks };
    // 智力/情商/颜值 初始 40 基准 + 天赋*4 - 6 ; 体质 55 基准 ；财富由家庭 ；幸福 60
    base.iq = 40 + map.iq * 4 - 6;
    base.eq = 40 + map.eq * 4 - 6;
    base.looks = 40 + map.looks * 4 - 6;
    base.health = 55 + map.health * 3 - 3;
    base.wealth = 30;
    base.happy = 60;
    // 家庭加成
    for (const k in familyVal) base[k] += familyVal[k];
    // 归一化到 0..100
    LIFE.STATS.forEach((s) => { base[s.key] = clamp(Math.round(base[s.key]), 0, s.max); });
    // 财富上限 100
    return base;
  }

  // ---------- 创建角色 ----------
  function createCharacter(opts) {
    const gender = opts.gender;
    const name = opts.name && opts.name.trim() ? opts.name.trim()
      : (gender === "female" ? choice(LIFE.NAMES_FEMALE) : choice(LIFE.NAMES_MALE));
    const family = LIFE.FAMILIES.find((f) => f.id === opts.family) || LIFE.FAMILIES[1];
    const stats = initStats(opts.alloc, family.val);
    stats.wealth = clamp(Math.round(stats.wealth + family.wealth), 0, 100);
    return {
      name, gender, family,
      age: 0, alive: true,
      stats,
      born: new Date().getFullYear() - 0,
      log: [],
      milestones: { love: 0, career: 0, edu: 0, wealth_peak: stats.wealth, happy_peak: stats.happy },
    };
  }

  // ---------- 属性调整 ----------
  function applyEffects(effects, opts) {
    if (!effects) return [];
    const deltas = [];
    for (const k in effects) {
      const v = effects[k];
      if (!(k in state.stats)) continue;
      const prev = state.stats[k];
      state.stats[k] = clamp(Math.round(state.stats[k] + v), 0, LIFE.STAT_BY_KEY[k].max);
      const d = Math.round(state.stats[k] - prev);
      if (d !== 0) deltas.push({ key: k, value: d });
    }
    if (opts && opts.track) {
      state.milestones.wealth_peak = Math.max(state.milestones.wealth_peak, state.stats.wealth);
      state.milestones.happy_peak = Math.max(state.milestones.happy_peak, state.stats.happy);
    }
    return deltas;
  }

  // ---------- 事件触发 ----------
  function eventMatches(ev, age) {
    const st = ev.stage;
    if (typeof st === "object" && st.from !== undefined) return age >= st.from && age <= st.to;
    // stage 为字符串（同上限）或未指定：默认全部
    return true;
  }

  function pickEvent(age) {
    const eligible = LIFE.EVENTS.filter((ev) => eventMatches(ev, age));
    // 若含 cond 且不满足，跳过
    const candidates = eligible.filter((ev) => !ev.cond || ev.cond(state));
    if (candidates.length === 0) return null;
    // 每年最多触发一次；用 weight 抽
    return weightedPick(candidates);
  }

  // ---------- 进入下一年 ----------
  function nextYear() {
    if (!state.alive) return;
    state.age += 1;

    // 年龄增长的自然衰减
    tickAging();

    // 死亡则直接结算，不再触发事件
    if (!state.alive) { advanceYear(); return; }

    // 触发随机事件（70% 概率）
    let event = null;
    if (Math.random() < 0.7) event = pickEvent(state.age);
    if (event) {
      pendingEvent = event;
      showEvent(event);
      return; // 等待用户选择
    }
    // 无事件直接推进
    advanceYear();
  }

  function tickAging() {
    const s = state.stats;
    const age = state.age;
    // 健康损失随年龄加速，且加入随机波动，让寿命分布更有差异
    let loss = 0;
    if (age >= 35) loss += (age - 35) / 30;       // 轻缓开始
    if (age >= 55) loss += (age - 55) / 12;       // 加速
    if (age >= 72) loss += (age - 72) / 5;        // 快速
    loss += (Math.random() - 0.5) * 1.6;           // ±0.8 随机抖动
    s.health = clamp(s.health - loss + 0.6, 0, 100); // 稍微回补，避免死板下行
    // 幸福自然回归
    if (s.happy > 75) s.happy -= 1;
    if (s.happy < 30) s.happy += 1;
    s.happy = clamp(s.happy, 0, 100);
    // 颜值随年龄逐渐下降
    if (age >= 45) s.looks = clamp(s.looks - (Math.random() < 0.4 ? 1 : 0), 0, 100);
    // 生存判定：需要年度死亡风险
    deathCheck();
  }

  // 年度死亡风险 —— 生存曲线模型
  function deathCheck() {
    const age = state.age;
    const hp = state.stats.health;
    let hazard;
    if (age < 45) hazard = 0.003;
    else if (age < 65) hazard = 0.003 + (age - 45) * 0.0006;      // 缓慢上升
    else hazard = 0.015 + (age - 65) * 0.0045;                    // 指数上升(近似)
    // 健康修正：健康低显著提升风险，健康高降低风险
    const healthFactor = hp <= 5 ? 8 : (hp <= 20 ? 3 : (hp >= 70 ? 0.6 : 1));
    hazard *= healthFactor;
    if (age >= 105) hazard = 0.8;   // 极高龄基本走向终点
    if (Math.random() < hazard) { die(); }
  }

  function die() {
    state.alive = false;
  }

  // ---------- 事件选择处理 ----------
  function chooseOption(choiceObj) {
    if (!pendingEvent) return;
    const text = choiceObj ? choiceObj.text : pendingEvent.text;
    const effects = choiceObj ? choiceObj.effects : pendingEvent.effects;
    const deltas = applyEffects(effects, { track: true });
    recordLog(`${state.age}岁 ${state.age === 0 ? "出生" : ""}：${text}`, deltas);
    pendingEvent = null;
    closeModal();
    advanceYear();
  }

  // ---------- 推进一年后的渲染 ----------
  function advanceYear() {
    if (!state.alive) { showEnd(); return; }
    renderLife();
  }

  // ---------- 记录 ----------
  function recordLog(text, deltas) {
    state.log.push({ age: state.age, text, deltas: deltas || [] });
    if (state.log.length > 200) state.log.shift();
  }

  // ============================================================
  //                      渲染部分
  // ============================================================

  function statColor(key) { return LIFE.STAT_BY_KEY[key].color; }

  function renderStats() {
    const host = $("#stat-grid");
    let html = "";
    LIFE.STATS.forEach((s) => {
      const v = state.stats[s.key];
      html += `<div class="stat-box">
        <div class="stat-ico">${s.icon}</div>
        <div class="stat-name">${s.name}</div>
        <div class="stat-bar"><i style="width:${v}%;background:${s.color}"></i></div>
        <div class="stat-num" style="color:${s.color}">${v}</div>
      </div>`;
    });
    host.innerHTML = html;
  }

  function renderLife() {
    const age = state.age;
    const stage = LIFE.getStage(age);
    $("#age-num").textContent = age;
    // 进度条（120 岁封顶）
    const pct = clamp((age / 120) * 100, 0, 100);
    $("#life-progress").style.width = pct + "%";
    $("#wealth-token").textContent = state.stats.wealth;

    // 主体：顶部统计 + 日志
    const main = $("#life-main");
    let html = `<div class="stat-grid" id="stat-grid"></div>
      <div class="year-card">
        <div class="year-head">
          <span class="year-age">${age} 岁</span>
          <span class="year-tag">${stage.name}</span>
        </div>
        <div class="event-text">${renderRecentLog()}</div>
        <div class="continue-row">
          <button id="btn-next" class="btn btn-primary">${age >= 40 ? "步入下一年" : "继续长大"}</button>
        </div>
      </div>`;
    main.innerHTML = html;

    renderStats();
    $("#btn-next").onclick = nextYear;

    // 动画强调
    if (age % 10 === 0 && age > 0) {
      toast(`🎉 你 ${age} 岁啦！`);
    }
  }

  function renderRecentLog() {
    // 显示最近 1-2 条日志
    const recent = state.log.slice(-2);
    if (recent.length === 0) return `你出生了。`;
    return recent.map((l) => escapeHtml(l.text) + deltaHtml(l.deltas)).join("<br/><br/>");
  }

  function deltaHtml(deltas) {
    if (!deltas || deltas.length === 0) return "";
    const spans = deltas.slice(0, 4).map((d) => {
      const cls = d.value > 0 ? "up" : "down";
      const sign = d.value > 0 ? "+" : "";
      const name = LIFE.STAT_BY_KEY[d.key].name;
      return `<span class="delta ${cls}">${name} ${sign}${d.value}</span>`;
    }).join(" ");
    return `<div class="result-chip">${spans}</div>`;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---------- 事件弹窗 ----------
  function showEvent(ev) {
    $("#modal-emoji").textContent = emojiForEvent(ev);
    $("#modal-title").textContent = ev.text;
    $("#modal-body").innerHTML = ev.choices
      ? `<div style="color:var(--text-dim)">你面临一个选择：</div><div style="margin-top:6px">${escapeHtml(ev.text)}</div>`
      : escapeHtml(ev.text);
    const choicesHost = $("#modal-choices");
    const btn = $("#modal-btn");
    if (ev.choices) {
      choicesHost.innerHTML = "";
      choicesHost.hidden = false;
      ev.choices.forEach((c, i) => {
        const b = document.createElement("button");
        b.className = "choice-btn";
        b.textContent = `${i + 1}. ${c.label}`;
        b.onclick = () => chooseOption(c);
        choicesHost.appendChild(b);
      });
      btn.hidden = true;
    } else {
      choicesHost.hidden = true;
      btn.hidden = false;
      btn.onclick = () => chooseOption(null);
    }
    $("#modal").hidden = false;
  }

  function emojiForEvent(ev) {
    if (ev.text.includes("彩票") || ev.text.includes("中奖")) return "🎰";
    if (ev.text.includes("意外")) return "⚠️";
    if (ev.text.includes("病") || ev.text.includes("健康")) return "🏥";
    if (ev.text.includes("爱") || ev.text.includes("恋") || ev.text.includes("婚")) return "💞";
    if (ev.text.includes("学") || ev.text.includes("考")) return "📚";
    if (ev.text.includes("生") && !ev.text.includes("意外")) return "👶";
    return "📜";
  }

  function closeModal() { $("#modal").hidden = true; }

  // ---------- 结局 ----------
  function showEnd() {
    $(`#screen-life`).classList.remove("active");
    $(`#screen-end`).classList.add("active");
    $("#end-age").textContent = state.age;
    const v = LIFE.verdict(state);
    const rows = `
      <div class="report-row"><div class="report-label">人生结局</div><div class="report-score">${v.title}</div><div class="report-desc">${v.desc}</div></div>
      <div class="report-row"><div class="report-label">最终属性</div><div class="report-desc">${finalStatLine()}</div></div>
      <div class="report-row"><div class="report-label">人生经历</div><div class="report-desc">${milestoneLine()}</div></div>
      <div class="tombstone">☾ ${state.name} ${state.born} - ${state.born + state.age} ☽</div>`;
    $("#end-report").innerHTML = rows;
  }

  function finalStatLine() {
    const s = state.stats;
    return LIFE.STATS.map((st) => `${st.icon}${st.name} ${s[st.key]}`).join(" &nbsp; ");
  }

  function milestoneLine() {
    const m = state.milestones;
    const parts = [];
    parts.push(`财富峰值 ${m.wealth_peak}`);
    parts.push(`幸福峰值 ${m.happy_peak}`);
    parts.push(`共经历 ${state.log.length} 个转折点`);
    return parts.join(" · ");
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
  }

  // ============================================================
  //                      开始界面
  // ============================================================

  let alloc = { iq: 3, eq: 3, health: 3, looks: 3 };
  const POINTS = 12;
  const MIN_ALLOC = 1;

  function renderAlloc() {
    let used = 0;
    for (const k in alloc) used += alloc[k];
    $("#pts-total").textContent = POINTS;
    $("#pts-info").textContent = `${POINTS - used}`;
    $("#alloc-iq").textContent = alloc.iq;
    $("#alloc-eq").textContent = alloc.eq;
    $("#alloc-health").textContent = alloc.health;
    $("#alloc-looks").textContent = alloc.looks;
    // 禁用按钮状态
    document.querySelectorAll(".alloc-btn.plus").forEach((b) => {
      b.disabled = alloc[b.dataset.stat] >= 10;
    });
    document.querySelectorAll(".alloc-btn.minus").forEach((b) => {
      b.disabled = alloc[b.dataset.stat] <= MIN_ALLOC;
    });
    // 无剩余点时禁用所有加号
    if (used >= POINTS) {
      document.querySelectorAll(".alloc-btn.plus").forEach((b) => { b.disabled = true; });
    }
  }

  function bindSeg(segId, onChange) {
    const seg = $(segId);
    seg.querySelectorAll(".seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        seg.querySelectorAll(".seg-btn").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        onChange(b.dataset.value);
      });
    });
  }

  function initStart() {
    let gender = "male";
    let family = "normal";

    bindSeg("#seg-gender", (v) => { gender = v; });
    bindSeg("#seg-family", (v) => { family = v; });

    // 默认高亮第一个选项
    document.querySelector("#seg-gender .seg-btn[data-value='male']").classList.add("active");
    document.querySelector("#seg-family .seg-btn[data-value='normal']").classList.add("active");

    document.querySelectorAll(".alloc-btn.plus").forEach((b) => {
      b.addEventListener("click", () => {
        if (totalUsed() >= POINTS) return;
        alloc[b.dataset.stat] = Math.min(10, alloc[b.dataset.stat] + 1);
        renderAlloc();
      });
    });
    document.querySelectorAll(".alloc-btn.minus").forEach((b) => {
      b.addEventListener("click", () => {
        alloc[b.dataset.stat] = Math.max(MIN_ALLOC, alloc[b.dataset.stat] - 1);
        renderAlloc();
      });
    });

    function totalUsed() { return Object.values(alloc).reduce((a, b) => a + b, 0); }

    $("#btn-start").onclick = () => {
      let finalGender = gender;
      if (gender === "random") finalGender = Math.random() < 0.5 ? "male" : "female";
      let finalFamily = family;
      if (family === "random") finalFamily = choice(["poor", "normal", "rich"]);

      const name = $("#inp-name").value;
      state = createCharacter({ name, gender: finalGender, family: finalFamily, alloc });

      // 记录出生
      recordLog("你出生了（家庭背景：" + LIFE.FAMILIES.find((f) => f.id === finalFamily).tag + "）");
      // 第一年渲染
      showScreen("screen-life");
      renderLife();
    };
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("#" + id).classList.add("active");
  }

  // ---------- 重新开始 ----------
  function bindRestart() {
    $("#btn-restart").onclick = () => { showScreen("screen-start"); };
    $("#btn-again").onclick = () => { showScreen("screen-start"); };
  }

  // ---------- 启动 ----------
  document.addEventListener("DOMContentLoaded", () => {
    initStart();
    bindRestart();
    renderAlloc();
    // 回车快速开始
    $("#inp-name").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("#btn-start").click();
    });
  });

  // 暴露测试钩子
  window.__life = {
    createCharacter, applyEffects, pickEvent, nextYear,
    _getState: () => state,
    _setState: (s) => { state = s; },
    _choose: (c) => chooseOption(c),
    _advance: () => advanceYear(),
  };
})();
