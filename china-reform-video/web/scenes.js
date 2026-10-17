/* 各类镜头模板。每个模板 (sc, root) 构建 DOM，返回 update(lt)，lt 为场景内时间（秒）。 */

const SCENES = {};

/* ---------- 共用部件 ---------- */
function makeWaves(parent, opt = {}) {
  const { n = 9, y0 = 790, spread = 24, amp = 26, seed = 7 } = opt;
  const svg = sv("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: "position:absolute;left:0;top:0" }, parent);
  const r = rng(seed);
  const ws = [];
  for (let i = 0; i < n; i++) {
    const gold = i % 3 !== 1;
    ws.push({
      path: sv("path", {
        fill: "none", "stroke-width": gold ? 1.4 : 2,
        stroke: gold ? `rgba(227,184,98,${(0.16 + 0.22 * r()).toFixed(2)})` : `rgba(210,58,44,${(0.28 + 0.2 * r()).toFixed(2)})`,
      }, svg),
      base: y0 + i * spread, a1: amp * (0.6 + r()), k1: 0.0028 + r() * 0.002, w1: 0.35 + r() * 0.4,
      a2: amp * 0.5 * r(), k2: 0.007 + r() * 0.004, w2: 0.6 + r() * 0.6, ph: r() * 6.28,
    });
  }
  return (t, op = 1) => {
    svg.style.opacity = op.toFixed(3);
    for (const w of ws) {
      let d = "";
      for (let x = -20; x <= W + 20; x += 24) {
        const y = w.base + w.a1 * Math.sin(x * w.k1 + t * w.w1 + w.ph) + w.a2 * Math.sin(x * w.k2 - t * w.w2 + w.ph * 2);
        d += (x < 0 ? "M" : "L") + x + "," + y.toFixed(1);
      }
      w.path.setAttribute("d", d);
    }
  };
}

function makeHeading(root, text, top = 128) {
  const h = el("div", "heading", root);
  h.style.top = top + "px";
  const span = el("span", "", h);
  const chars = splitChars(span, text);
  return (t, t0 = 0.15) => {
    h.style.opacity = ease.out(prog(t, t0, 0.5));
    revealChars(chars, t, t0, 0.05, 0.6, 22);
  };
}

function makeSeal(parent, text) {
  const s = el("div", "seal v" + Math.min(4, [...text].length), parent, text);
  s.style.opacity = 0;
  return s;
}

/* ---------- 片头 ---------- */
SCENES.title = (sc, root) => {
  const S = E.script;
  const waves = makeWaves(root, { y0: 760, n: 10 });
  const box = place(el("div", "abs", root), 0, 240, { width: W + "px", display: "flex", flexDirection: "column", alignItems: "center" });
  const kick = el("div", "kicker", box, "纪 录 短 片");
  const wrap = el("div", "", box);
  Object.assign(wrap.style, { position: "relative", marginTop: "26px" });
  const big = el("div", "t-big", wrap, S.title);
  const seal = makeSeal(wrap, "改革开放");
  Object.assign(seal.style, { right: "-150px", top: "50px", width: "120px", height: "120px", fontSize: "44px" });
  const sub = el("div", "t-sub", box, S.subtitle);
  sub.style.marginTop = "18px";
  const yrs = el("div", "t-years", box, `<i></i><span>${S.years}</span><i></i>`);
  yrs.style.marginTop = "44px";
  const rules = yrs.querySelectorAll("i");
  return (t) => {
    waves(t, ease.out(prog(t, 0, 2.5)));
    fadeUp(kick, t, 0.7, 1.0, 20);
    const p = ease.inOut(prog(t, 1.1, 2.0));
    big.style.clipPath = `inset(-20% ${((1 - p) * 100).toFixed(2)}% -20% 0)`;
    big.style.letterSpacing = lerp(0.3, 0.08, ease.out(prog(t, 1.1, 2.6))).toFixed(3) + "em";
    big.style.filter = `blur(${((1 - ease.out(prog(t, 1.1, 1.6))) * 6).toFixed(2)}px)`;
    fadeUp(sub, t, 2.7, 1.0, 24);
    const q = ease.out(prog(t, 3.1, 1.2));
    yrs.style.opacity = q;
    rules.forEach((r) => (r.style.width = (160 * q).toFixed(1) + "px"));
    stamp(seal, t, 3.7, -4);
  };
};

/* ---------- 章节卡 ---------- */
SCENES.chapter = (sc, root) => {
  const d = sc.def;
  const water = place(el("div", "abs c-water", root, d.range.split(" ")[0]), 80, 560);
  const num = place(el("div", "abs c-num", root, d.num), 300, 300);
  const rule = place(el("div", "abs", root), 830, 330, { width: "2px", height: "0px", background: "linear-gradient(180deg, rgba(210,58,44,0), #d23a2c 30%, #d23a2c 70%, rgba(210,58,44,0))" });
  const right = place(el("div", "abs", root), 900, 372);
  const label = el("div", "c-label", right, d.label);
  const name = el("div", "c-name", right);
  if ([...d.name].length > 3) name.style.fontSize = "112px";
  name.style.marginTop = "18px";
  const chars = splitChars(name, d.name);
  const range = el("div", "c-range", right, d.range);
  range.style.marginTop = "22px";
  return (t) => {
    water.style.opacity = ease.out(prog(t, 0.2, 1.5));
    water.style.transform = `translateX(${(-t * 26).toFixed(1)}px)`;
    const p = ease.out(prog(t, 0.1, 1.1));
    num.style.opacity = p;
    num.style.transform = `scale(${lerp(1.3, 1, p).toFixed(3)})`;
    num.style.filter = `blur(${((1 - p) * 14).toFixed(2)}px)`;
    rule.style.height = (420 * ease.inOut(prog(t, 0.35, 0.9))).toFixed(1) + "px";
    fadeUp(label, t, 0.6, 0.7, 16);
    revealChars(chars, t, 0.8, 0.09, 0.7, 30, 8);
    fadeUp(range, t, 1.4, 0.8, 16);
  };
};

/* ---------- 数据卡 ---------- */
SCENES.stats = (sc, root) => {
  const d = sc.def;
  const head = makeHeading(root, d.heading);
  const n = d.items.length;
  const cards = d.items.map((it, i) => {
    let x, y, w, h;
    if (n === 4) { w = 770; h = 268; x = 160 + (i % 2) * 830; y = 290 + Math.floor(i / 2) * 310; }
    else { w = 500; h = 330; x = 160 + i * 550; y = 330; }
    const c = place(el("div", "card", root), x, y, { width: w + "px", height: h + "px" });
    const rule = el("div", "rule", c);
    const num = el("div", "s-num", c);
    if (n !== 4) num.style.fontSize = "112px";
    const val = el("span", "", num);
    el("small", "", num, it.unit);
    const lab = el("div", "s-label", c, it.label);
    return { it, c, rule, val, t0: cueOf(sc, it.cue, it.delay || 0) };
  });
  return (t) => {
    head(t);
    for (const k of cards) {
      fadeUp(k.c, t, k.t0, 0.8, 40);
      k.rule.style.width = (100 * ease.inOut(prog(t, k.t0, 1.0))).toFixed(1) + "%";
      const it = k.it;
      if (it.plain) k.val.textContent = (it.prefix || "") + it.value;
      else {
        const v = lerp(0, it.value, ease.out(prog(t, k.t0 + 0.1, 1.8)));
        k.val.textContent = (it.prefix || "") + fmt(v, it.decimals || 0);
      }
    }
  };
};

/* ---------- 事件 ---------- */
SCENES.event = (sc, root) => {
  const d = sc.def;
  const water = place(el("div", "abs e-water", root, d.date.split(".")[0]), 820, 250);
  const kicker = place(el("div", "abs kicker", root, d.kicker), 164, 236);
  const date = place(el("div", "abs e-date", root, d.date), 150, 288);
  const head = place(el("div", "abs e-head", root), 160, 520);
  const chars = splitChars(head, d.headline);
  const pillBox = place(el("div", "abs", root), 160, 712, { width: "1600px" });
  const pills = (d.phrases || []).map((ph) => ({ e: el("span", "pill", pillBox, ph.text), t0: cueOf(sc, ph.cue, ph.delay || 0) }));
  const seal = d.seal ? makeSeal(root, d.seal) : null;
  const headEnd = 0.9 + chars.length * 0.07 + 0.6;

  let arc = null;
  if (d.arc) {
    const svg = sv("svg", { width: W, height: H, style: "position:absolute;left:0;top:0" }, root);
    const A = [1190, 600], B = [1740, 600], C = [1465, 330];
    const path = sv("path", { d: `M${A}Q${C} ${B}`, fill: "none", stroke: "#e3b862", "stroke-width": 3, "stroke-linecap": "round" }, svg);
    const dots = [A, B].map((p) => sv("circle", { cx: p[0], cy: p[1], r: 9, fill: "#d23a2c" }, svg));
    const rings = [A, B].map((p) => sv("circle", { cx: p[0], cy: p[1], r: 9, fill: "none", stroke: "#d23a2c", "stroke-width": 2 }, svg));
    const labels = [A, B].map((p, i) => {
      const tx = sv("text", { x: p[0], y: p[1] + 64, "text-anchor": "middle", "font-size": 40, fill: "#f3ead8", "font-family": "Noto Serif SC", "font-weight": 700 }, svg);
      tx.textContent = d.arc[i];
      return tx;
    });
    const mover = sv("circle", { r: 7, fill: "#fff3d6" }, svg);
    arc = { svg, path, dots, rings, labels, mover, A, B, C, t0: cueOf(sc, 0, 0.8) };
  }

  return (t) => {
    water.style.opacity = ease.out(prog(t, 0.2, 1.6));
    water.style.transform = `translateX(${(-t * 14).toFixed(1)}px)`;
    fadeUp(kicker, t, 0.25, 0.7, 16);
    const p = ease.out(prog(t, 0.35, 1.1));
    date.style.opacity = p;
    date.style.transform = `translateY(${((1 - p) * 50).toFixed(1)}px)`;
    revealChars(chars, t, 0.9, 0.07, 0.6, 26);
    for (const ph of pills) fadeUp(ph.e, t, ph.t0 + 0.15, 0.7, 24);
    if (seal) {
      if (!seal.dataset.placed && head.offsetWidth) {
        place(seal, 160 + head.offsetWidth + 54, 528);
        seal.dataset.placed = 1;
      }
      stamp(seal, t, headEnd + 0.5);
    }
    if (arc) {
      const q = prog(t, arc.t0, 2.2), qe = ease.inOut(q);
      arc.svg.style.opacity = ease.out(prog(t, arc.t0 - 0.4, 0.6));
      const total = 760;
      arc.path.setAttribute("stroke-dasharray", `${(total * qe).toFixed(1)} ${total}`);
      const bez = (s) => {
        const { A, B, C } = arc;
        const u = 1 - s;
        return [u * u * A[0] + 2 * u * s * C[0] + s * s * B[0], u * u * A[1] + 2 * u * s * C[1] + s * s * B[1]];
      };
      const m = bez(qe);
      arc.mover.setAttribute("cx", m[0].toFixed(1));
      arc.mover.setAttribute("cy", m[1].toFixed(1));
      arc.mover.style.opacity = q > 0 && q < 1 ? 1 : 0;
      arc.labels.forEach((l, i) => (l.style.opacity = ease.out(prog(t, arc.t0 + i * 1.8, 0.6))));
      arc.rings.forEach((r, i) => {
        const f = ((t - arc.t0 - i * 1.8) % 1.8) / 1.8;
        const on = t > arc.t0 + i * 1.8;
        r.setAttribute("r", (9 + 30 * f).toFixed(1));
        r.style.opacity = on ? ((1 - f) * 0.8).toFixed(2) : 0;
      });
      arc.dots.forEach((dt, i) => (dt.style.opacity = ease.out(prog(t, arc.t0 + i * 1.8, 0.4))));
    }
  };
};

/* ---------- 小岗村红手印 ---------- */
function fingerprint(g, r) {
  const rings = 8;
  for (let k = 0; k < rings; k++) {
    const rx = 3 + k * 2.3, ry = rx * 1.32;
    const ph = r() * 6.28, wob = 0.05 + r() * 0.05;
    let d = "";
    for (let i = 0; i <= 44; i++) {
      const th = (i / 44) * Math.PI * 2;
      const m = 1 + wob * Math.sin(3 * th + ph) + 0.03 * Math.sin(7 * th + ph * 2);
      d += (i ? "L" : "M") + (Math.cos(th) * rx * m).toFixed(2) + "," + (Math.sin(th) * ry * m).toFixed(2);
    }
    sv("path", {
      d, fill: "none", stroke: "rgba(176,28,22,.92)", "stroke-width": 1.8,
      "stroke-dasharray": `${(8 + r() * 14).toFixed(1)} ${(1.5 + r() * 3).toFixed(1)} ${(4 + r() * 9).toFixed(1)} ${(1 + r() * 2).toFixed(1)}`,
    }, g);
  }
  sv("ellipse", { rx: 21, ry: 27, fill: "rgba(176,28,22,.16)" }, g);
}

SCENES.fingerprints = (sc, root) => {
  const d = sc.def;
  const paper = place(el("div", "abs", root), 200, 170, {
    width: "640px", height: "740px", transform: "rotate(-2deg)",
    background: "linear-gradient(160deg, #efe2c4 0%, #e4d2ae 60%, #d9c39a 100%)",
    boxShadow: "0 30px 80px rgba(0,0,0,.55)",
  });
  const svg = sv("svg", { width: 640, height: 740, style: "position:absolute;left:0;top:0" }, paper);
  const r = rng(1978);
  const ink = sv("g", {}, svg);
  for (let col = 0; col < 10; col++) {
    const x = 575 - col * 50;
    let y = 60 + r() * 20;
    const yEnd = col < 2 ? 420 : 330 + r() * 90;
    while (y < yEnd) {
      const len = 6 + r() * 16;
      sv("path", { d: `M${(x + (r() - 0.5) * 10).toFixed(1)},${y.toFixed(1)}l${((r() - 0.5) * 14).toFixed(1)},${len.toFixed(1)}`,
        stroke: "rgba(48,36,24,.55)", "stroke-width": 2 + r() * 1.5, "stroke-linecap": "round" }, ink);
      y += len + 4 + r() * 10;
    }
  }
  const prints = [];
  for (let i = 0; i < d.count; i++) {
    const cx = 92 + (i % 6) * 90 + (r() - 0.5) * 18, cy = 480 + Math.floor(i / 6) * 84 + (r() - 0.5) * 16;
    const g = sv("g", {}, svg);
    const inner = sv("g", {}, g);
    fingerprint(inner, r);
    prints.push({ g, inner, cx, cy, rot: (r() - 0.5) * 50 });
  }
  const right = place(el("div", "abs", root), 980, 270, { width: "800px" });
  const kicker = el("div", "kicker", right, d.place);
  const cap = el("div", "e-head", right, d.caption);
  Object.assign(cap.style, { fontSize: "76px", marginTop: "26px" });
  const pill = el("div", "pill", right, "家庭联产承包责任制");
  pill.style.marginTop = "40px";
  const gr = el("div", "", right);
  gr.style.marginTop = "50px";
  const gl = el("div", "s-label", gr, d.grain.label);
  gl.style.marginTop = "0";
  const bars = [d.grain.from, d.grain.to].map((v, i) => {
    const row = el("div", "", gr);
    Object.assign(row.style, { display: "flex", alignItems: "center", gap: "24px", marginTop: "20px" });
    el("div", "m-tag", row, v[0]).style.width = "120px";
    const b = el("div", "", row);
    Object.assign(b.style, { height: "34px", width: "0px", background: i ? "linear-gradient(90deg,#a8261c,#e3b862)" : "#8a8173" });
    const tx = el("div", "cmp-val", row);
    return { b, tx, v: v[1], w: (v[1] / 4.2) * 470 };
  });
  const tPrint = cueOf(sc, 1, 1.0), tGrain = cueOf(sc, d.grain.cue, 0.3);
  return (t) => {
    fadeUp(paper, t, 0.1, 1.0, 30);
    paper.style.transform = `rotate(-2deg) translateY(${((1 - ease.out(prog(t, 0.1, 1.0))) * 30).toFixed(1)}px)`;
    ink.style.opacity = ease.out(prog(t, 0.4, 1.2)) * 0.9;
    prints.forEach((p, i) => {
      const t0 = tPrint + i * 0.2;
      const q = prog(t, t0, 0.35);
      const s = lerp(1.45, 1, ease.out5(q));
      p.g.setAttribute("transform", `translate(${p.cx.toFixed(1)},${p.cy.toFixed(1)}) rotate(${p.rot.toFixed(1)}) scale(${s.toFixed(3)})`);
      p.g.style.opacity = clamp(q * 2.5) * 0.88;
    });
    fadeUp(kicker, t, 0.4, 0.7, 16);
    fadeUp(cap, t, tPrint - 0.6, 0.9, 26);
    fadeUp(pill, t, cueOf(sc, 2, 0.2), 0.8, 20);
    fadeUp(gr, t, tGrain, 0.8, 20);
    bars.forEach((b, i) => {
      const q = ease.out(prog(t, tGrain + 0.3 + i * 0.9, 1.4));
      b.b.style.width = (b.w * q).toFixed(1) + "px";
      b.tx.textContent = q > 0 ? fmt(b.v * q, 2) + " " + d.grain.unit : "";
    });
  };
};

/* ---------- 地图 ---------- */
SCENES.map = (sc, root) => {
  const d = sc.def, M = E.map, P = M.proj;
  const BW = 1120, BH = 860, A = M.width / M.height;
  const proj = (lon, lat) => [(lon - P.lon0) * P.aspect * P.scale, (P.lat1 - lat) * P.scale];
  const head = makeHeading(root, d.heading);
  const svg = sv("svg", { width: BW, height: BH, viewBox: `0 0 ${M.width} ${M.height}`,
    style: `position:absolute;left:730px;top:118px;-webkit-mask-image:radial-gradient(ellipse 52% 52% at 50% 50%, #000 72%, transparent 100%)` }, root);
  const base = [44, 37, 30], hi = [150, 40, 30];
  const provs = {};
  for (const [name, path] of Object.entries(M.provinces)) {
    provs[name] = sv("path", { d: path, fill: `rgb(${base})`, stroke: "rgba(227,184,98,.42)", "stroke-width": 0.9,
      "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }, svg);
  }
  sv("path", { d: M.nanhai, fill: "rgba(227,184,98,.5)", stroke: "rgba(227,184,98,.5)", "stroke-width": 0.6, "vector-effect": "non-scaling-stroke" }, svg);

  const groups = d.groups.map((g, gi) => {
    const t0 = cueOf(sc, g.cue, 0.2);
    const gEl = sv("g", {}, svg);
    const pts = g.points.map((p, j) => {
      const [x, y] = proj(p.lon, p.lat);
      const ring = sv("circle", { cx: x, cy: y, fill: "none", stroke: "#e3b862", "stroke-width": 1.6, "vector-effect": "non-scaling-stroke" }, gEl);
      const dot = sv("circle", { cx: x, cy: y, fill: g.small ? "#e3b862" : "#ff5a40", stroke: "#fff4e0", "stroke-width": 1.2, "vector-effect": "non-scaling-stroke" }, gEl);
      const lab = sv("text", { fill: "#f6eddc", "font-family": "Noto Sans SC", "font-weight": g.small ? 400 : 700,
        "text-anchor": (p.dx || 10) < 0 ? "end" : "start", "paint-order": "stroke", stroke: "rgba(13,11,9,.85)", "stroke-width": 0 }, gEl);
      lab.textContent = p.name;
      return { x, y, ring, dot, lab, dx: p.dx || 10, dy: p.dy == null ? 8 : p.dy, t0: t0 + 0.3 + j * (g.small ? 0.16 : 0.45) };
    });
    // 镜头：累计包含此前所有点
    const all = d.groups.slice(0, gi + 1).flatMap((q) => q.points.map((p) => proj(p.lon, p.lat)));
    let x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0]));
    let y0 = Math.min(...all.map((p) => p[1])), y1 = Math.max(...all.map((p) => p[1]));
    let w = Math.max(x1 - x0, 120) * 1.9, h = Math.max(y1 - y0, 90) * 1.6;
    if (w / h < A) w = h * A; else h = w / A;
    const cx = (x0 + x1) / 2 + w * 0.04, cy = (y0 + y1) / 2;
    return { g, t0, pts, vb: [cx - w / 2, cy - h / 2, w, h] };
  });

  const panel = place(el("div", "abs", root), 160, 330, { width: "560px" });
  const rows = d.groups.map((g) => {
    const row = el("div", "", panel);
    Object.assign(row.style, { marginBottom: "46px", borderLeft: "3px solid #d23a2c", paddingLeft: "26px" });
    el("div", "m-tag", row, g.tag);
    const lb = el("div", "", row, g.label);
    Object.assign(lb.style, { fontFamily: "var(--serif)", fontWeight: 700, fontSize: "46px", marginTop: "6px" });
    return row;
  });

  const full = [0, 0, M.width, M.height];
  return (t) => {
    head(t);
    svg.style.opacity = ease.out(prog(t, 0.1, 1.0));
    let vb = full;
    groups.forEach((g) => { vb = vb.map((v, i) => lerp(v, g.vb[i], ease.inOut(prog(t, g.t0 - 0.3, 2.0)))); });
    svg.setAttribute("viewBox", vb.map((v) => v.toFixed(2)).join(" "));
    const u = vb[2] / BW; // 每屏幕像素对应的地图单位

    for (const name in provs) {
      let c = base;
      for (const g of groups) if ((g.g.provinces || []).includes(name)) c = mixC(base, hi, ease.out(prog(t, g.t0, 1.2)));
      provs[name].setAttribute("fill", `rgb(${c.map((v) => v | 0)})`);
    }
    groups.forEach((g, gi) => {
      const small = g.g.small;
      const later = groups[gi + 1];
      const dim = later ? 1 - 0.35 * ease.out(prog(t, later.t0, 1)) : 1;
      for (const p of g.pts) {
        const q = prog(t, p.t0, 0.5);
        const rDot = (small ? 5 : 8) * ease.back(q);
        p.dot.setAttribute("r", (Math.max(0, rDot) * u).toFixed(3));
        p.dot.style.opacity = q > 0 ? dim : 0;
        const f = t > p.t0 ? ((t - p.t0) % 1.8) / 1.8 : 0;
        p.ring.setAttribute("r", ((8 + 26 * f) * u).toFixed(3));
        p.ring.style.opacity = t > p.t0 ? ((1 - f) * 0.75 * dim).toFixed(3) : 0;
        p.lab.setAttribute("x", (p.x + p.dx * u).toFixed(3));
        p.lab.setAttribute("y", (p.y + p.dy * u).toFixed(3));
        p.lab.setAttribute("font-size", ((small ? 21 : 32) * u).toFixed(3));
        p.lab.setAttribute("stroke-width", (5 * u).toFixed(3));
        p.lab.style.opacity = (ease.out(prog(t, p.t0 + 0.15, 0.5)) * dim).toFixed(3);
      }
    });
    rows.forEach((row, i) => {
      const g = groups[i], nx = groups[i + 1];
      fadeUp(row, t, g.t0 - 0.1, 0.7, 20);
      if (nx && t > nx.t0) row.style.opacity = lerp(1, 0.45, ease.out(prog(t, nx.t0, 0.8)));
    });
  };
};

/* ---------- 列表 ---------- */
SCENES.list = (sc, root) => {
  const d = sc.def;
  const head = makeHeading(root, d.heading);
  const box = place(el("div", "abs", root), 160, 290, { width: "1600px" });
  const tagW = Math.max(...d.items.map((it) => [...it.tag].length)) > 4 ? 340 : 200;
  const rows = d.items.map((it) => {
    const row = el("div", "l-row", box);
    if (d.items.length > 4) { row.style.padding = "18px 0"; }
    el("div", "l-tag", row, it.tag).style.width = tagW + "px";
    el("div", "l-text", row, it.text);
    return { row, t0: cueOf(sc, it.cue, it.delay || 0) };
  });
  return (t) => {
    head(t);
    for (const r of rows) fadeUp(r.row, t, r.t0 + 0.1, 0.8, 26);
  };
};

/* ---------- 引语 ---------- */
SCENES.quote = (sc, root) => {
  const d = sc.def;
  const top = place(el("div", "abs", root), 0, 150, { width: W + "px", display: "flex", flexDirection: "column", alignItems: "center" });
  const attr = el("div", "q-attr", top, `<i></i><span>${d.attribution}</span><i></i>`);
  const route = el("div", "route", top);
  route.style.marginTop = "30px";
  const stops = [];
  (d.route || []).forEach((c, i) => {
    if (i) stops.push(el("div", "arrow", route));
    stops.push(el("div", "", route, c));
  });
  const mark = place(el("div", "abs q-mark", root), 130, 250);
  mark.textContent = "“";
  const main = place(el("div", "abs q-main", root), 0, 350, { width: W + "px", textAlign: "center" });
  const chars = splitChars(main, d.quote);
  const sec = place(el("div", "abs q-sec", root), 310, 620, { width: "1300px" }, "");
  sec.textContent = "“" + d.secondary + "”";
  const foot = place(el("div", "abs", root), 0, 790, { width: W + "px", textAlign: "center" });
  const fp = el("span", "pill", foot, d.footer);
  const tQ = cueOf(sc, d.quoteCue, d.quoteDelay || 0);
  const tR = cueOf(sc, 0, 0.6);
  return (t) => {
    fadeUp(attr, t, 0.2, 0.8, 16);
    stops.forEach((s, i) => fadeUp(s, t, tR + i * 0.55, 0.6, 14));
    const m = ease.out(prog(t, tQ - 0.3, 0.8));
    mark.style.opacity = m;
    mark.style.transform = `translateY(${((1 - m) * 30).toFixed(1)}px)`;
    revealChars(chars, t, tQ, 0.12, 0.7, 34, 10);
    fadeUp(sec, t, cueOf(sc, d.secondaryCue, 0.1), 0.9, 20);
    fadeUp(fp, t, cueOf(sc, d.footerCue, 0.3), 0.8, 20);
  };
};

/* ---------- 卡片墙 ---------- */
SCENES.montage = (sc, root) => {
  const d = sc.def;
  const head = makeHeading(root, d.heading);
  const n = d.cards.length, gap = 36;
  const w = (1600 - gap * (n - 1)) / n;
  const big = n <= 2, many = n >= 5;
  const cards = d.cards.map((c, i) => {
    const card = place(el("div", "card", root), 160 + i * (w + gap), big ? 320 : 330, { width: w + "px", height: (big ? 420 : 400) + "px" });
    const rule = el("div", "rule", card);
    const tag = el("div", "m-tag", card, c.tag);
    const ti = el("div", "m-title", card, c.title);
    const tx = el("div", "m-text", card, c.text);
    if (big) { ti.style.fontSize = "80px"; tx.style.fontSize = "40px"; tag.style.fontSize = "54px"; }
    if (n === 4) { ti.style.fontSize = "46px"; card.style.padding = "34px 34px 30px"; }
    if (many) { ti.style.fontSize = "40px"; tag.style.fontSize = "32px"; tx.style.fontSize = "26px"; card.style.padding = "30px 24px"; }
    return { card, rule, t0: cueOf(sc, c.cue, c.delay || 0) };
  });
  return (t) => {
    head(t);
    for (const c of cards) {
      fadeUp(c.card, t, c.t0, 0.9, 50);
      c.rule.style.width = (100 * ease.inOut(prog(t, c.t0 + 0.1, 1.0))).toFixed(1) + "%";
    }
  };
};

/* ---------- 双栏 ---------- */
SCENES.dual = (sc, root) => {
  const d = sc.def;
  const pre = place(el("div", "abs d-pre", root, d.preface), 0, 200, { width: W + "px", textAlign: "center" });
  const rule = place(el("div", "abs", root), 959, 330, { width: "2px", height: "0px", background: "linear-gradient(180deg, rgba(227,184,98,0), rgba(227,184,98,.7), rgba(227,184,98,0))" });
  const side = (o, cx) => {
    const b = place(el("div", "abs", root), cx - 400, 345, { width: "800px", textAlign: "center" });
    el("div", "d-date" + (o.tone === "somber" ? " somber" : ""), b, o.date);
    el("div", "d-text", b, o.text);
    if (o.sub) el("div", "d-sub", b, o.sub);
    return { b, t0: cueOf(sc, o.cue, o.delay || 0) };
  };
  const L = side(d.left, 520), R = side(d.right, 1400);
  [L, R].forEach((s) => (s.b.querySelector(".d-date").style.fontSize = "128px"));
  const foot = place(el("div", "abs", root), 0, 790, { width: W + "px", textAlign: "center" });
  const fp = el("span", "pill", foot, d.footer);
  return (t) => {
    fadeUp(pre, t, cueOf(sc, d.prefaceCue, 0.1), 0.8, 16);
    rule.style.height = (400 * ease.inOut(prog(t, L.t0, 1.2))).toFixed(1) + "px";
    fadeUp(L.b, t, L.t0, 0.9, 40);
    fadeUp(R.b, t, R.t0, 0.9, 40);
    fadeUp(fp, t, cueOf(sc, d.footerCue, 0.3), 0.8, 20);
  };
};

/* ---------- GDP 曲线 ---------- */
SCENES.chart = (sc, root) => {
  const d = sc.def;
  const head = makeHeading(root, d.heading);
  const X0 = 300, X1 = 1680, Y0 = 830, Y1 = 290, YMAX = 150;
  const yr0 = d.series[0][0], yr1 = d.series[d.series.length - 1][0];
  const X = (y) => X0 + ((y - yr0) / (yr1 - yr0)) * (X1 - X0);
  const Y = (v) => Y0 - (v / 10000 / YMAX) * (Y0 - Y1);
  const val = (yr) => {
    for (let i = 1; i < d.series.length; i++) {
      const [a, va] = d.series[i - 1], [b, vb] = d.series[i];
      if (yr <= b) return lerp(va, vb, (yr - a) / (b - a));
    }
    return d.series[d.series.length - 1][1];
  };
  const svg = sv("svg", { width: W, height: H, style: "position:absolute;left:0;top:0" }, root);
  const defs = sv("defs", {}, svg);
  const lg = sv("linearGradient", { id: "areaG", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  sv("stop", { offset: 0, "stop-color": "rgba(227,184,98,.42)" }, lg);
  sv("stop", { offset: 1, "stop-color": "rgba(210,58,44,0)" }, lg);
  const cp = sv("clipPath", { id: "chartClip" }, defs);
  const clipRect = sv("rect", { x: X0 - 20, y: 0, width: 0, height: H }, cp);
  const axis = sv("g", { class: "axis" }, svg);
  for (let v = 0; v <= YMAX; v += 25) {
    sv("line", { x1: X0, x2: X1, y1: Y(v * 10000), y2: Y(v * 10000), stroke: v ? "rgba(243,234,216,.08)" : "rgba(243,234,216,.35)", "stroke-width": 1 }, axis);
    const tx = sv("text", { x: X0 - 22, y: Y(v * 10000) + 8, "text-anchor": "end", "font-size": 24, fill: "rgba(243,234,216,.5)" }, axis);
    tx.textContent = v;
  }
  [1978, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025].forEach((yr) => {
    const tx = sv("text", { x: X(yr), y: Y0 + 40, "text-anchor": "middle", "font-size": 24, fill: "rgba(243,234,216,.5)" }, axis);
    tx.textContent = yr;
  });
  const pts = d.series.map(([y, v]) => [X(y), Y(v)]);
  const line = "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");
  const g = sv("g", { "clip-path": "url(#chartClip)" }, svg);
  sv("path", { d: line + `L${X1},${Y0}L${X0},${Y0}Z`, fill: "url(#areaG)" }, g);
  sv("path", { d: line, fill: "none", stroke: "#e3b862", "stroke-width": 4, "stroke-linejoin": "round" }, g);
  const headDot = sv("circle", { r: 9, fill: "#fff1cf" }, svg);
  const headHalo = sv("circle", { r: 22, fill: "rgba(227,184,98,.25)" }, svg);
  const headLbl = sv("text", { "font-size": 44, fill: "#e3b862", "font-family": "Noto Serif SC", "font-weight": 900, "text-anchor": "end" }, svg);
  const anns = d.annotations.map((a) => {
    const x = X(a.year), y = Y(val(a.year));
    const ag = sv("g", {}, svg);
    const up = 80;
    sv("line", { x1: x, y1: y - 12, x2: x, y2: y - up, stroke: "rgba(243,234,216,.5)", "stroke-width": 1.5 }, ag);
    sv("circle", { cx: x, cy: y, r: 7, fill: "#d23a2c", stroke: "#fff1cf", "stroke-width": 2 }, ag);
    const last = a.year === yr1, first = a.year === yr0;
    const anchor = last ? "end" : first ? "start" : "middle", ax = last ? x + 8 : first ? x - 8 : x;
    const tx = sv("text", { x: ax, y: y - up - 14, "text-anchor": anchor, "font-size": 30, fill: "#f3ead8", class: "ann" }, ag);
    tx.textContent = a.text;
    const ty = sv("text", { x: ax, y: y - up - 52, "text-anchor": anchor, "font-size": 22, fill: "rgba(227,184,98,.85)", "font-family": "Noto Serif SC" }, ag);
    ty.textContent = a.year;
    return { ag, year: a.year };
  });
  const tStart = 0.8, dur = d.draw;
  return (t) => {
    head(t);
    axis.style.opacity = ease.out(prog(t, 0.2, 0.8));
    const p = ease.inOut(prog(t, tStart, dur));
    const yr = lerp(yr0, yr1, p);
    const hx = X(yr), hy = Y(val(yr));
    clipRect.setAttribute("width", (hx - X0 + 20).toFixed(1));
    const on = t >= tStart ? 1 : 0;
    headDot.setAttribute("cx", hx.toFixed(1)); headDot.setAttribute("cy", hy.toFixed(1));
    headHalo.setAttribute("cx", hx.toFixed(1)); headHalo.setAttribute("cy", hy.toFixed(1));
    headHalo.setAttribute("r", (18 + 6 * Math.sin(t * 4)).toFixed(1));
    const fin = 1 - ease.out(prog(yr, 2015.5, 2.5));
    headDot.style.opacity = on; headHalo.style.opacity = on;
    headLbl.style.opacity = on * fin;
    headLbl.setAttribute("x", (hx - 30).toFixed(1));
    headLbl.setAttribute("y", (hy - 30).toFixed(1));
    headLbl.textContent = Math.floor(yr);
    for (const a of anns) {
      const q = ease.out(prog(yr + (t > tStart + dur ? 1 : 0), a.year - 0.2, 1.2));
      a.ag.style.opacity = q.toFixed(3);
    }
  };
};

/* ---------- 今昔对比 ---------- */
SCENES.compare = (sc, root) => {
  const d = sc.def;
  const head = makeHeading(root, d.heading);
  const legend = place(el("div", "abs", root), 1340, 150, { display: "flex", gap: "40px", alignItems: "center", fontSize: "30px", color: "var(--muted)" });
  legend.innerHTML = `<span style="display:flex;align-items:center;gap:12px"><i style="display:block;width:28px;height:18px;background:#8a8173"></i>1978</span>` +
    `<span style="display:flex;align-items:center;gap:12px"><i style="display:block;width:28px;height:18px;background:linear-gradient(90deg,#a8261c,#e3b862)"></i>2025</span>`;
  const BX = 600, BW = 960;
  const rows = d.rows.map((r, i) => {
    const y = 290 + i * 150;
    const lab = place(el("div", "abs cmp-label", root, r.label), 160, y + 12);
    const a = place(el("div", "bar", root), BX, y, { background: "#8a8173", width: "0px" });
    const b = place(el("div", "bar", root), BX, y + 44, { background: "linear-gradient(90deg,#a8261c,#e3b862)", width: "0px" });
    const at = place(el("div", "abs cmp-val", root, r.aText), BX, y - 8, { color: "var(--muted)", fontSize: "30px" });
    const bt = place(el("div", "abs cmp-val", root, r.bText), BX, y + 34, { color: "var(--gold)" });
    return { r, lab, a, b, at, bt, wa: Math.max(4, (r.a / r.max) * BW), wb: (r.b / r.max) * BW, t0: cueOf(sc, r.cue, r.delay || 0) };
  });
  return (t) => {
    head(t);
    legend.style.opacity = ease.out(prog(t, 0.4, 0.8));
    for (const k of rows) {
      fadeUp(k.lab, t, k.t0, 0.7, 16);
      const qa = ease.out(prog(t, k.t0 + 0.2, 0.9)), qb = ease.out(prog(t, k.t0 + 0.8, 1.6));
      k.a.style.width = (k.wa * qa).toFixed(1) + "px";
      k.b.style.width = (k.wb * qb).toFixed(1) + "px";
      k.at.style.left = BX + k.wa * qa + 20 + "px";
      k.bt.style.left = BX + k.wb * qb + 20 + "px";
      k.at.style.opacity = ease.out(prog(t, k.t0 + 0.6, 0.6));
      k.bt.style.opacity = ease.out(prog(t, k.t0 + 1.6, 0.6));
    }
  };
};

/* ---------- 脱贫 ---------- */
SCENES.poverty = (sc, root) => {
  const d = sc.def;
  const head = makeHeading(root, d.heading);
  const note = place(el("div", "abs", root), 160, 232, { fontSize: "32px", color: "var(--muted)", letterSpacing: ".04em" }, "");
  note.textContent = d.note;
  const base = 820, maxH = 440, xs = [470, 960, 1450], bw = 220;
  const line = place(el("div", "abs", root), 260, base, { height: "2px", width: "1400px", background: "rgba(243,234,216,.35)" });
  const vmax = Math.max(...d.points.map((p) => p.value));
  const bars = d.points.map((p, i) => {
    const b = place(el("div", "abs", root), xs[i] - bw / 2, base, { width: bw + "px", height: "0px",
      background: i === 0 ? "linear-gradient(180deg,#8a8173,#5d564c)" : "linear-gradient(180deg,#d23a2c,#7e1f17)" });
    const lbl = place(el("div", "abs", root), xs[i] - 300, base, { width: "600px", textAlign: "center",
      fontFamily: "var(--serif)", fontWeight: 900, fontSize: p.value ? "68px" : "84px", color: p.value ? "var(--gold)" : "var(--red)" }, "");
    lbl.textContent = p.label;
    const yr = place(el("div", "abs m-tag", root, p.year), xs[i] - 200, base + 24, { width: "400px", textAlign: "center" });
    return { b, lbl, yr, h: (p.value / vmax) * maxH, t0: cueOf(sc, p.cue, p.delay || 0), zero: !p.value };
  });
  return (t) => {
    head(t);
    line.style.opacity = ease.out(prog(t, 0.3, 0.8));
    for (const k of bars) {
      const q = ease.out(prog(t, k.t0, 1.3));
      k.b.style.height = (k.h * q).toFixed(1) + "px";
      k.b.style.top = (base - k.h * q).toFixed(1) + "px";
      fadeUp(k.yr, t, k.t0, 0.6, 10);
      if (k.zero) {
        k.lbl.style.top = base - 130 + "px";
        stamp(k.lbl, t, k.t0 + 0.4, -4);
      } else {
        k.lbl.style.top = (base - k.h * q - 100).toFixed(1) + "px";
        k.lbl.style.opacity = ease.out(prog(t, k.t0 + 0.6, 0.6));
      }
    }
    fadeUp(note, t, cueOf(sc, d.noteCue, 0.2), 0.9, 16);
  };
};

/* ---------- 结尾 ---------- */
SCENES.ending = (sc, root) => {
  const d = sc.def, S = E.script;
  const waves = makeWaves(root, { y0: 800, n: 10, seed: 26 });
  const box = place(el("div", "abs", root), 0, 300, { width: W + "px" });
  const verses = d.verses.map((v, i) => {
    const e = el("div", "v-line", box, v.text);
    e.style.marginBottom = "44px";
    if (i === d.verses.length - 1) e.style.color = "var(--gold)";
    return { e, t0: cueOf(sc, v.cue, v.delay || 0) };
  });
  const fin = place(el("div", "abs", root), 0, 330, { width: W + "px", display: "flex", flexDirection: "column", alignItems: "center" });
  const big = el("div", "t-big", fin, S.title);
  big.style.fontSize = "240px";
  const yrs = el("div", "t-years", fin, `<i></i><span>${S.years}</span><i></i>`);
  yrs.style.marginTop = "36px";
  const tEnd = sc.dur - 4.2;
  return (t) => {
    waves(t + 40, ease.out(prog(t, 0, 2)));
    const out = 1 - ease.inOut(prog(t, tEnd - 0.8, 0.8));
    for (const v of verses) { fadeUp(v.e, t, v.t0, 1.0, 24); v.e.style.opacity *= out; }
    const p = ease.inOut(prog(t, tEnd, 1.6));
    big.style.opacity = p;
    big.style.filter = `blur(${((1 - p) * 8).toFixed(2)}px)`;
    big.style.transform = `scale(${lerp(1.06, 1, p).toFixed(3)})`;
    const q = ease.out(prog(t, tEnd + 0.9, 1.0));
    yrs.style.opacity = q;
    yrs.querySelectorAll("i").forEach((r) => (r.style.width = (160 * q).toFixed(1) + "px"));
  };
};

/* ---------- 片尾字幕 ---------- */
SCENES.credits = (sc, root) => {
  const d = sc.def, S = E.script;
  const box = place(el("div", "abs", root), 0, 250, { width: W + "px", display: "flex", flexDirection: "column", alignItems: "center" });
  const big = el("div", "t-big", box, S.title);
  big.style.fontSize = "120px";
  const sub = el("div", "t-sub", box, S.subtitle);
  Object.assign(sub.style, { fontSize: "36px", marginTop: "14px", color: "var(--muted)" });
  const lines = d.sources.map((s, i) => {
    const e = el("div", "cr-line", box, s);
    e.style.marginTop = i ? "18px" : "90px";
    e.style.maxWidth = "1500px";
    return e;
  });
  return (t) => {
    fadeUp(big, t, 0.3, 1.0, 16);
    fadeUp(sub, t, 0.6, 1.0, 16);
    lines.forEach((e, i) => fadeUp(e, t, 1.0 + i * 0.35, 0.9, 14));
  };
};
