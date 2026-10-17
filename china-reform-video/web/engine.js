/* 渲染引擎：画面完全由时间 t 决定（window.seek(t)），便于逐帧截图导出。
 * 预览：web/index.html?play 实时播放；?t=秒数 定格到某一时刻。 */

const W = 1920, H = 1080;
const OVERLAP = 0.6;
const YEAR0 = 1978, YEAR1 = 2026;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, t0, d) => clamp((t - t0) / d);
const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  out5: (t) => 1 - Math.pow(1 - t, 5),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
const SVGNS = "http://www.w3.org/2000/svg";
function sv(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function place(e, x, y, extra) {
  e.style.left = x + "px";
  e.style.top = y + "px";
  if (extra) Object.assign(e.style, extra);
  return e;
}

/* ---------- 通用动画 ---------- */
function fadeUp(e, t, t0, d = 0.8, dist = 36) {
  const p = ease.out(prog(t, t0, d));
  e.style.opacity = p;
  e.style.transform = `translateY(${((1 - p) * dist).toFixed(2)}px)`;
  return p;
}
function fadeIn(e, t, t0, d = 0.8) {
  const p = ease.out(prog(t, t0, d));
  e.style.opacity = p;
  return p;
}
function splitChars(e, text) {
  e.textContent = "";
  return [...text].map((c) => el("span", "ch", e, c === " " ? "&nbsp;" : c));
}
function revealChars(spans, t, t0, per = 0.06, d = 0.55, dist = 26, blur = 0) {
  spans.forEach((s, i) => {
    const p = ease.out(prog(t, t0 + i * per, d));
    s.style.opacity = p;
    s.style.transform = `translateY(${((1 - p) * dist).toFixed(2)}px)`;
    if (blur) s.style.filter = p < 1 ? `blur(${((1 - p) * blur).toFixed(2)}px)` : "none";
  });
}
function stamp(e, t, t0, rot = -6) {
  const p = prog(t, t0, 0.45);
  const s = lerp(1.7, 1, ease.out5(p));
  e.style.opacity = clamp(p * 2.2) * 0.94;
  e.style.transform = `rotate(${rot}deg) scale(${s.toFixed(3)})`;
  return p;
}
function fmt(v, decimals = 0) {
  return v.toFixed(decimals);
}

/* ---------- 引擎 ---------- */
const E = { scenes: [], subs: [], built: false };

function cueOf(sc, k, delay = 0, at) {
  const a = at ? sc.anchors[`${k}|${at}`] : null;
  if (a != null) return a + delay;
  const l = sc.lines[k];
  if (l) return l.start + delay;
  return (sc.lines.length ? sc.lines[sc.lines.length - 1].start : 0.6) + delay;
}

async function boot() {
  const [script, timing, map] = await Promise.all([
    fetch("../script.json").then((r) => r.json()),
    fetch("../build/timing.json").then((r) => r.json()),
    fetch("../data/china_map.json").then((r) => r.json()),
  ]);
  E.script = script; E.timing = timing; E.map = map; E.total = timing.total;
  E.subs = timing.subs;

  const root = document.getElementById("scenes");
  script.scenes.forEach((def, i) => {
    const tm = timing.scenes[i];
    const sc = {
      def, idx: i, start: tm.start, end: tm.end, dur: tm.end - tm.start,
      lines: tm.lines.map((l) => ({ start: l.start - tm.start, dur: l.dur })),
      anchors: tm.anchors || {},
      year: def.year, yearTo: def.yearTo || def.year,
    };
    sc.el = el("div", "scene" + (def.mood === "somber" ? " somber" : ""), root);
    sc.el.dataset.id = def.id;
    const builder = SCENES[def.type];
    if (!builder) throw new Error("未知场景类型 " + def.type);
    sc.update = builder(sc, sc.el) || (() => {});
    E.scenes.push(sc);
  });
  buildHud();
  await loadFonts();
  E.built = true;

  const q = new URLSearchParams(location.search);
  if (q.has("play")) play(parseFloat(q.get("play")) || 0);
  else seek(parseFloat(q.get("t")) || 0);
  window.__ready = true;
}

async function loadFonts() {
  let text = "0123456789.,%×→—·：；，。“”（）亿万元年 ";
  text += document.getElementById("stage").textContent;
  text += E.subs.map((s) => s.text).join("");
  E.script.scenes.forEach((s) => { text += JSON.stringify(s); });
  text = [...new Set(text)].join("");
  const specs = [
    '500 40px "Noto Serif SC"', '700 40px "Noto Serif SC"', '900 40px "Noto Serif SC"',
    '300 40px "Noto Sans SC"', '400 40px "Noto Sans SC"', '500 40px "Noto Sans SC"', '700 40px "Noto Sans SC"',
    '400 40px "Ma Shan Zheng"',
  ];
  await Promise.all(specs.map((s) => document.fonts.load(s, text)));
  await document.fonts.ready;
}

/* ---------- 背景与 HUD ---------- */
const MOOD = {
  calm:   [[176, 64, 40, 0.20], [60, 40, 30, 0.25]],
  rise:   [[205, 72, 46, 0.26], [120, 60, 30, 0.20]],
  bright: [[222, 150, 72, 0.22], [190, 60, 40, 0.18]],
  somber: [[96, 108, 128, 0.22], [40, 46, 58, 0.30]],
};
function moodColor(m, k) { return MOOD[m] ? MOOD[m][k] : MOOD.calm[k]; }
function mixC(a, b, p) { return a.map((v, i) => lerp(v, b[i], p)); }
function rgba(c) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${c[3].toFixed(3)})`; }

let HUD = {};
function buildHud() {
  const g = document.querySelector("#bg .glow");
  HUD.glow = g;
  HUD.tag = document.getElementById("chapterTag");
  HUD.tagText = HUD.tag.querySelector(".txt");
  HUD.sub = document.querySelector("#subs span");
  HUD.grain = document.getElementById("grain");
  HUD.fade = document.getElementById("fade");

  // 时间轴：1978 — 2026
  const svg = document.getElementById("timeline");
  const x0 = 260, x1 = 1660, y = 1036;
  HUD.tl = { x0, x1, y };
  HUD.tlGroup = sv("g", {}, svg);
  const G = HUD.tlGroup;
  sv("line", { x1: x0, y1: y, x2: x1, y2: y, stroke: "rgba(243,234,216,.22)", "stroke-width": 1.5 }, G);
  for (let yr = YEAR0; yr <= YEAR1; yr++) {
    const x = lerp(x0, x1, (yr - YEAR0) / (YEAR1 - YEAR0));
    const major = [1978, 1992, 2001, 2012, 2026].includes(yr);
    const dec = yr % 10 === 0;
    sv("line", { x1: x, y1: y - (major ? 9 : dec ? 6 : 3), x2: x, y2: y + (major ? 9 : dec ? 6 : 3),
      stroke: major ? "rgba(243,234,216,.55)" : "rgba(243,234,216,.25)", "stroke-width": major ? 1.6 : 1 }, G);
    if (major) {
      const tx = sv("text", { x, y: y + 33, "text-anchor": "middle", "font-size": 19, fill: "rgba(243,234,216,.45)" }, G);
      tx.textContent = yr;
    }
  }
  HUD.tlFill = sv("line", { x1: x0, y1: y, x2: x0, y2: y, stroke: "url(#tlgrad)", "stroke-width": 3 }, G);
  const defs = sv("defs", {}, svg);
  const lg = sv("linearGradient", { id: "tlgrad", x1: 0, x2: 1 }, defs);
  sv("stop", { offset: 0, "stop-color": "#a8261c" }, lg);
  sv("stop", { offset: 1, "stop-color": "#e3b862" }, lg);
  HUD.tlDot = sv("circle", { cx: x0, cy: y, r: 7, fill: "#e3b862" }, G);
  HUD.tlHalo = sv("circle", { cx: x0, cy: y, r: 16, fill: "rgba(227,184,98,.18)" }, G);
  HUD.tlYear = sv("text", { x: x0, y: y - 22, "text-anchor": "middle", "font-size": 30, fill: "#e3b862", "font-weight": 700 }, G);
}

function activeScene(t) {
  let a = E.scenes[0];
  for (const sc of E.scenes) if (sc.start <= t) a = sc;
  return a;
}

function sceneYear(sc, lt) {
  const prev = E.scenes[sc.idx - 1];
  const from = prev ? prev.yearTo : sc.year;
  let y = lerp(from, sc.year, ease.inOut(prog(lt, 0, 1.4)));
  if (sc.yearTo !== sc.year) y = lerp(y, sc.yearTo, ease.inOut(prog(lt, 1.4, Math.max(0.1, sc.dur - 3))));
  return y;
}

function updateHud(t) {
  const sc = activeScene(t), lt = t - sc.start;
  const prev = E.scenes[sc.idx - 1];

  // 背景光晕随情绪渐变
  const p = prev ? ease.inOut(prog(lt, 0, 1.2)) : 1;
  const m0 = prev ? prev.def.mood : sc.def.mood;
  const c1 = mixC(moodColor(m0, 0), moodColor(sc.def.mood, 0), p);
  const c2 = mixC(moodColor(m0, 1), moodColor(sc.def.mood, 1), p);
  const gx = 30 + 10 * Math.sin(t * 0.05), gy = 30 + 6 * Math.cos(t * 0.04);
  HUD.glow.style.background =
    `radial-gradient(ellipse 60% 55% at ${gx}% ${gy}%, ${rgba(c1)}, transparent 70%),` +
    `radial-gradient(ellipse 55% 60% at ${100 - gx}% ${100 - gy * 0.6}%, ${rgba(c2)}, transparent 70%)`;

  // 章节标签
  const tag = sc.def.chapter || "";
  if (HUD.tagText.textContent !== tag) HUD.tagText.textContent = tag;
  let tagOp = tag ? 1 : 0;
  if (tag && (!prev || prev.def.chapter !== tag)) tagOp = ease.out(prog(lt, 0.3, 0.8));
  const hideHud = ["title", "chapter", "ending", "credits"].includes(sc.def.type);
  if (sc.def.type === "chapter") tagOp = 0;
  HUD.tag.style.opacity = tagOp;

  // 时间轴
  let tlOp = hideHud ? 0 : 1;
  if (hideHud && sc.def.type === "chapter") tlOp = 0.55;
  const nextSc = E.scenes[sc.idx + 1];
  if (sc.def.type === "title" && nextSc) tlOp = ease.inOut(prog(t, sc.end - 0.6, 0.6));
  if (prev && ["title"].includes(prev.def.type) && !hideHud) tlOp = 1;
  if (sc.def.type === "ending" || sc.def.type === "credits") tlOp = sc.def.type === "ending" ? 1 - ease.inOut(prog(lt, 0, 1.0)) : 0;
  HUD.tlGroup.style.opacity = tlOp.toFixed(3);
  const yr = clamp(sceneYear(sc, lt), YEAR0, YEAR1);
  const x = lerp(HUD.tl.x0, HUD.tl.x1, (yr - YEAR0) / (YEAR1 - YEAR0));
  HUD.tlFill.setAttribute("x2", x.toFixed(2));
  HUD.tlDot.setAttribute("cx", x.toFixed(2));
  HUD.tlHalo.setAttribute("cx", x.toFixed(2));
  HUD.tlHalo.setAttribute("r", (14 + 4 * Math.sin(t * 3)).toFixed(2));
  HUD.tlYear.setAttribute("x", x.toFixed(2));
  HUD.tlYear.textContent = Math.floor(yr + 1e-6);

  // 字幕
  let s = null;
  for (const c of E.subs) if (c.start <= t && t < c.end + 0.05) { s = c; }
  if (s) {
    if (HUD.sub.textContent !== s.text) HUD.sub.textContent = s.text;
    const o = Math.min(prog(t, s.start - 0.02, 0.14), 1 - prog(t, s.end - 0.06, 0.12));
    HUD.sub.style.opacity = o.toFixed(3);
  } else {
    HUD.sub.style.opacity = 0;
  }

  // 片头片尾黑场
  HUD.fade.style.opacity = Math.max(1 - prog(t, 0, 1.2), prog(t, E.total - 1.6, 1.5)).toFixed(3);
}

function seek(t) {
  if (!E.built) return;
  for (const sc of E.scenes) {
    const lt = t - sc.start;
    const vis = lt >= 0 && t <= sc.end;
    if (!vis) {
      if (sc.vis) { sc.el.style.display = "none"; sc.vis = false; }
      continue;
    }
    if (!sc.vis) { sc.el.style.display = "block"; sc.vis = true; }
    const fin = sc.idx === 0 ? 1 : ease.inOut(prog(lt, 0, OVERLAP));
    const last = sc.idx === E.scenes.length - 1;
    const fout = last ? 1 : 1 - ease.inOut(prog(t, sc.end - OVERLAP, OVERLAP));
    sc.el.style.opacity = Math.min(fin, fout).toFixed(3);
    const kb = 1 + 0.03 * prog(lt, 0, sc.dur);
    sc.el.style.transform = `scale(${kb.toFixed(4)})`;
    sc.update(lt, t);
  }
  updateHud(t);
}
window.seek = seek;

function play(from) {
  const audio = new Audio("../build/audio/mix.wav");
  const t0 = performance.now() - from * 1000;
  audio.currentTime = from;
  audio.play().catch(() => {});
  const loop = () => {
    const t = audio.paused ? (performance.now() - t0) / 1000 : audio.currentTime;
    seek(t);
    if (t < E.total) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
