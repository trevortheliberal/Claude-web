// 用无头 Chromium 逐帧截图，交给 ffmpeg 编码。
//   node tools/render.mjs video [--workers 4] [--from 秒 --to 秒] [--out build/video.mp4]
//   node tools/render.mjs stills 12.5 40 88 ...   （输出 build/stills/*.png，用于检查画面）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require("/opt/node-tools/node_modules/playwright")); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, "build");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".woff2": "font/woff2", ".wav": "audio/wav" };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("页面错误:", e.message));
  await page.goto(`http://127.0.0.1:${port}/web/index.html?t=0`);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  return page;
}

const stage = { x: 0, y: 0, width: 1920, height: 1080 };

async function renderRange(browser, port, f0, f1, fps, out) {
  const page = await openPage(browser, port);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-tune", "animation", "-pix_fmt", "yuv420p", "-r", String(fps), out], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => ff.on("close", (c) => (c ? rej(new Error("ffmpeg 退出码 " + c)) : res())));
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    await page.evaluate((t) => window.seek(t), f / fps);
    const buf = await page.screenshot({ type: "jpeg", quality: 93, clip: stage });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if ((f - f0) % 300 === 0 && f > f0) {
      const sp = (f - f0) / ((Date.now() - t0) / 1000);
      console.log(`  [${path.basename(out)}] ${f - f0}/${f1 - f0} 帧，${sp.toFixed(1)} 帧/秒`);
    }
  }
  ff.stdin.end();
  await done;
  await page.close();
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const arg = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
  const timing = JSON.parse(fs.readFileSync(path.join(BUILD, "timing.json"), "utf8"));
  const fps = timing.fps;
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ["--font-render-hinting=none", "--disable-gpu-vsync"] });
  try {
    if (mode === "stills") {
      fs.mkdirSync(path.join(BUILD, "stills"), { recursive: true });
      const page = await openPage(browser, port);
      for (const s of rest) {
        const t = parseFloat(s);
        await page.evaluate((t) => window.seek(t), t);
        const out = path.join(BUILD, "stills", `t${t.toFixed(1).padStart(6, "0")}.png`);
        await page.screenshot({ path: out, clip: stage });
        console.log(out);
      }
    } else {
      const workers = parseInt(arg("--workers", "4"), 10);
      const from = Math.round(parseFloat(arg("--from", "0")) * fps);
      const to = Math.min(timing.frames, Math.round(parseFloat(arg("--to", String(timing.total))) * fps));
      const out = path.resolve(arg("--out", path.join(BUILD, "video.mp4")));
      const segDir = path.join(BUILD, "segments");
      fs.rmSync(segDir, { recursive: true, force: true });
      fs.mkdirSync(segDir, { recursive: true });
      const per = Math.ceil((to - from) / workers);
      const segs = [];
      for (let i = 0; i < workers; i++) {
        const a = from + i * per, b = Math.min(to, a + per);
        if (a < b) segs.push({ a, b, file: path.join(segDir, `seg${i}.mp4`) });
      }
      console.log(`渲染 ${to - from} 帧（${((to - from) / fps).toFixed(1)} 秒），${segs.length} 路并行`);
      const t0 = Date.now();
      await Promise.all(segs.map((s) => renderRange(browser, port, s.a, s.b, fps, s.file)));
      const list = path.join(segDir, "list.txt");
      fs.writeFileSync(list, segs.map((s) => `file '${s.file}'`).join("\n"));
      await new Promise((res, rej) => spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out],
        { stdio: "inherit" }).on("close", (c) => (c ? rej(new Error("concat 失败")) : res())));
      console.log(`完成：${out}，用时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
    }
  } finally {
    await browser.close();
    srv.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
