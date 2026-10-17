"""程序合成配乐：铺底和声 + 低音 + 古筝式拨弦琶音 + 高音弦乐 + 章节鼓点，配器随场景情绪变化。

输入 script.json 与 build/timing.json，输出 build/audio/music.wav（48 kHz 立体声）。
"""
import json
import os

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
BPM = 66
BEAT = 60 / BPM
BAR = 4 * BEAT
SLOT = 2 * BAR                       # 每两小节换一个和弦
rng = np.random.default_rng(1978)

# 和弦：音级集合（0 = C），第一个为根音
CHORDS = {
    "Dm": [2, 5, 9], "Bb": [10, 2, 5], "F": [5, 9, 0], "C": [0, 4, 7], "Gm": [7, 10, 2],
    "A": [9, 1, 4], "Am": [9, 0, 4], "Dm9": [2, 5, 9, 4], "Fadd9": [5, 9, 0, 7], "Bbmaj7": [10, 2, 5, 9],
}
PROG = {
    "calm":   ["Dm", "Bb", "F", "C"],
    "rise":   ["Dm9", "Bbmaj7", "F", "C"],
    "bright": ["Fadd9", "C", "Dm9", "Bbmaj7"],
    "somber": ["Dm", "Gm", "Bb", "A"],
}
# 各情绪下的层级强度：铺底、低音、拨弦密度、高音弦乐、脉冲
LEVEL = {
    "calm":   dict(pad=0.85, bass=0.45, pluck=0.35, high=0.0, pulse=0.0),
    "rise":   dict(pad=1.0, bass=0.8, pluck=0.65, high=0.35, pulse=0.45),
    "bright": dict(pad=1.0, bass=0.95, pluck=0.85, high=0.6, pulse=0.6),
    "somber": dict(pad=0.9, bass=0.55, pluck=0.12, high=0.0, pulse=0.0),
}
PENTA = [2, 5, 7, 9, 0]             # D 小调五声音阶


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def near(pc, center):
    """离 center 最近的、音级为 pc 的 MIDI 音高。"""
    m = center - ((center - pc) % 12)
    return m + 12 if center - m > 6 else m


def env_adsr(n, a, r, sr=SR):
    e = np.ones(n, dtype=np.float32)
    na, nr = min(n, int(a * sr)), min(n, int(r * sr))
    if na:
        e[:na] = np.linspace(0, 1, na) ** 2
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr) ** 1.5
    return e


# ---------- 音色 ----------
TABLE_N = 4096
_tbl_cache = {}


def wavetable(kind):
    if kind not in _tbl_cache:
        ph = np.arange(TABLE_N) / TABLE_N * 2 * np.pi
        if kind == "pad":
            w = sum(np.sin(k * ph) / k * np.exp(-k / 4.5) for k in range(1, 16))
        elif kind == "string":
            w = sum(np.sin(k * ph) / k * np.exp(-k / 7) * (1 if k % 2 else 0.6) for k in range(1, 20))
        else:
            w = np.sin(ph) + 0.18 * np.sin(2 * ph)
        _tbl_cache[kind] = (w / np.abs(w).max()).astype(np.float32)
    return _tbl_cache[kind]


def osc(kind, freq, n, vib=0.0, vib_rate=5.0, phase0=None):
    t = np.arange(n) / SR
    f = freq * (1 + vib * np.sin(2 * np.pi * vib_rate * t + rng.uniform(0, 6.28)))
    ph = (phase0 if phase0 is not None else rng.uniform(0, 1)) + np.cumsum(f) / SR
    tbl = wavetable(kind)
    idx = (ph % 1.0) * TABLE_N
    i0 = idx.astype(np.int64) % TABLE_N
    frac = (idx - np.floor(idx)).astype(np.float32)
    return tbl[i0] * (1 - frac) + tbl[(i0 + 1) % TABLE_N] * frac


def pluck(freq, dur, bright=0.6, decay=0.9965):
    """Karplus-Strong 拨弦。按 (N+0.5)·f 的内部采样率合成后重采样，保证音高准确。"""
    n_per = max(8, int(round(48000 / freq)))
    sr_i = (n_per + 0.5) * freq
    total = int(dur * sr_i)
    noise = rng.uniform(-1, 1, n_per)
    # 初始激励略作平滑，bright 越小越柔和
    k = max(1, int((1 - bright) * 6))
    noise = np.convolve(noise, np.ones(k) / k, mode="same")
    y = np.zeros(total + n_per + 1)
    y[:n_per] = noise
    for s in range(n_per, total, n_per):
        e = min(s + n_per, total)
        a = y[s - n_per:e - n_per]
        b = y[s - n_per - 1:e - n_per - 1] if s > n_per else np.concatenate([[0.0], a[:-1]])
        y[s:e] = decay * 0.5 * (a + b)
    y = y[:total]
    t_out = np.arange(int(dur * SR)) / SR
    out = np.interp(t_out * sr_i, np.arange(total), y).astype(np.float32)
    att = np.minimum(1, np.arange(len(out)) / (0.003 * SR))
    return out * att * np.exp(-t_out / 1.6).astype(np.float32)


def taiko(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t / 0.05)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.55)
    skin = rng.normal(0, 1, n) * np.exp(-t / 0.025)
    skin = np.convolve(skin, np.ones(12) / 12, mode="same")
    return (body * 0.9 + skin * 0.35).astype(np.float32)


def kick(dur=0.7):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 42 + 38 * np.exp(-t / 0.04)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)).astype(np.float32)


def swell(dur=1.8):
    """逐渐增强的气声，用于章节转场前。"""
    n = int(dur * SR)
    x = rng.normal(0, 1, n).astype(np.float32)
    out = np.zeros(n, dtype=np.float32)
    y = 0.0
    t = np.arange(n) / n
    a = 0.004 + 0.12 * t ** 2       # 截止频率随时间升高
    for i in range(n):
        y += a[i] * (x[i] - y)
        out[i] = y
    out *= (t ** 2.2) * (1 - np.clip((t - 0.97) / 0.03, 0, 1))
    return out / (np.abs(out).max() + 1e-9)


def reverb_ir(dur=3.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2), dtype=np.float64)
    for c in range(2):
        noise = rng.normal(0, 1, n)
        noise = np.convolve(noise, np.ones(6) / 6, mode="same")   # 尾音略暗
        ir[:, c] = noise * np.exp(-t / 0.75) * np.minimum(1, t / 0.012)
    ir /= np.sqrt((ir ** 2).sum(axis=0))
    return ir


def fft_convolve(x, ir):
    n = len(x) + len(ir) - 1
    nfft = 1 << (n - 1).bit_length()
    out = np.zeros((len(x), 2), dtype=np.float32)
    for c in range(2):
        X = np.fft.rfft(x[:, c].astype(np.float64), nfft)
        H = np.fft.rfft(ir[:, c], nfft)
        out[:, c] = np.fft.irfft(X * H, nfft)[: len(x)].astype(np.float32)
    return out


def add(buf, sig, t0, gain=1.0, pan=0.0):
    i0 = int(round(t0 * SR))
    if i0 >= len(buf):
        return
    if i0 < 0:
        sig, i0 = sig[-i0:], 0
    sig = sig[: len(buf) - i0]
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i0:i0 + len(sig), 0] += sig * gain * gl * 1.4142
    buf[i0:i0 + len(sig), 1] += sig * gain * gr * 1.4142


def main():
    script = json.load(open(os.path.join(ROOT, "script.json"), encoding="utf-8"))
    timing = json.load(open(os.path.join(ROOT, "build", "timing.json"), encoding="utf-8"))
    total = timing["total"] + 1.5
    N = int(total * SR)
    scenes = [(tm["start"], tm["end"], sc) for sc, tm in zip(script["scenes"], timing["scenes"])]

    def scene_at(t):
        cur = scenes[0]
        for s in scenes:
            if s[0] <= t:
                cur = s
        return cur

    # 每层强度的平滑曲线（逐 10ms 采样后插值）
    grid = np.arange(0, total, 0.01)
    lv = {k: np.array([LEVEL[scene_at(t)[2].get("mood", "calm")][k] for t in grid]) for k in LEVEL["calm"]}
    for k in lv:
        w = int(2.0 / 0.01)
        lv[k] = np.convolve(np.pad(lv[k], (w, w), mode="edge"), np.ones(w) / w, mode="same")[w:-w]
    level = lambda k, t: float(np.interp(t, grid, lv[k]))
    level_curve = lambda k, n0, n: np.interp((n0 + np.arange(n)) / SR, grid, lv[k]).astype(np.float32)

    dry = np.zeros((N, 2), dtype=np.float32)
    pads = np.zeros((N, 2), dtype=np.float32)

    # 片尾最后几个和弦停在 F 大调
    n_slots = int(np.ceil(total / SLOT))
    ending_start = next(s for s in scenes if s[2]["type"] == "ending")[0]
    for k in range(n_slots):
        t0 = k * SLOT
        mood = scene_at(t0 + SLOT * 0.3)[2].get("mood", "calm")
        name = PROG[mood][k % 4]
        if t0 >= ending_start:
            name = ["Fadd9", "Bbmaj7", "Fadd9", "Fadd9"][min(3, int((t0 - ending_start) / SLOT))]
        pcs = CHORDS[name]
        dur = SLOT + 2.2
        n = int(dur * SR)
        e = env_adsr(n, 1.6, 2.4)
        lp = level_curve("pad", int(t0 * SR), n)
        # 铺底：根音 + 中音区和弦音，三支轻微失谐
        notes = [near(pcs[0], 50)] + [near(pc, 64) for pc in pcs]
        for j, m in enumerate(notes):
            for det, pan in ((-0.004, -0.6), (0.0, 0.0), (0.004, 0.6)):
                s = osc("pad", mtof(m) * (1 + det), n, vib=0.0015, vib_rate=0.3 + 0.2 * j)
                add(pads, s * e * lp, t0, 0.055 if j else 0.07, pan)
        # 低音
        b = osc("sine", mtof(near(pcs[0], 38)), n) * env_adsr(n, 0.08, 2.0) * level_curve("bass", int(t0 * SR), n)
        add(dry, b, t0, 0.32, 0.0)
        # 高音弦乐：慢起的长音
        hl = level("high", t0 + 2)
        if hl > 0.02:
            top = near(pcs[-1] if len(pcs) > 3 else pcs[1], 76)
            s = osc("string", mtof(top), n, vib=0.004, vib_rate=5.2) * env_adsr(n, 2.8, 2.6)
            add(pads, s * level_curve("high", int(t0 * SR), n), t0, 0.05, 0.25)

        # 拨弦琶音：每个八分音符按密度决定是否出声
        tones = sorted({near(pc, 74 + o) for pc in pcs for o in (-6, 0, 6) if pc in PENTA or name in ("A", "Gm")})
        if not tones:
            tones = [near(pc, 74) for pc in pcs]
        pat_r = np.random.default_rng(k * 31 + 7)
        idx = int(pat_r.integers(0, len(tones)))
        for e8 in range(16):
            te = t0 + e8 * BEAT / 2
            dens = level("pluck", te)
            on_beat = e8 % 2 == 0
            p = dens * (0.95 if on_beat else 0.55) * (1.0 if e8 % 8 == 0 else 0.85)
            if pat_r.random() < p:
                idx = int(np.clip(idx + pat_r.choice([-2, -1, 1, 1, 2]), 0, len(tones) - 1))
                m = tones[idx]
                vel = 0.5 + 0.4 * pat_r.random()
                add(dry, pluck(mtof(m), 2.6, bright=0.55 + 0.3 * vel), te + pat_r.normal(0, 0.006), 0.11 * vel,
                    pat_r.uniform(-0.5, 0.5))
        # 脉冲：每小节第一拍、第三拍
        for bb in range(2):
            for beat in (0, 2):
                tb = t0 + bb * BAR + beat * BEAT
                pl = level("pulse", tb)
                if pl > 0.05:
                    add(dry, kick(), tb, 0.30 * pl * (1 if beat == 0 else 0.6))

    # 片头与章节：气声 + 大鼓 + 五声音阶刮奏
    def gliss(t, base=62, count=11, span=0.9, gain=0.10):
        scale = [base + o + d for o in (0, 12, 24) for d in (0, 3, 5, 7, 10)]
        for i in range(count):
            add(dry, pluck(mtof(scale[i]), 2.4, bright=0.8), t + i * span / count, gain * (0.6 + 0.4 * i / count), -0.4 + 0.8 * i / count)

    for start, end, sc in scenes:
        if sc["type"] == "title":
            gliss(1.0)
            add(dry, taiko(), 1.0, 0.55)
        if sc["type"] == "chapter":
            add(dry, swell(), start - 1.7, 0.10, 0.0)
            add(dry, taiko(), start + 0.12, 0.75)
            add(dry, taiko(), start + 0.12 + BEAT * 1.5, 0.35)
            gliss(start + 0.7, count=9, span=0.7, gain=0.08)
        if sc["type"] == "ending":
            gliss(end - 4.0, count=13, span=1.2, gain=0.09)
            add(dry, taiko(), end - 4.2, 0.5)

    mix = pads + dry
    wet = fft_convolve(mix, reverb_ir())
    out = mix * 0.78 + wet * 0.55 + fft_convolve(pads, reverb_ir(1.2)) * 0.15
    # 首尾淡入淡出
    fi, fo = int(0.5 * SR), int(4.0 * SR)
    out[:fi] *= np.linspace(0, 1, fi)[:, None]
    end_n = int((timing["total"]) * SR)
    out[end_n - fo:end_n] *= np.linspace(1, 0, fo)[:, None] ** 1.5
    out[end_n:] = 0
    rms = np.sqrt((out[: end_n] ** 2).mean())
    out *= 10 ** (-20 / 20) / (rms + 1e-9)
    peak = np.abs(out).max()
    if peak > 0.95:
        out *= 0.95 / peak
    os.makedirs(os.path.join(ROOT, "build", "audio"), exist_ok=True)
    sf.write(os.path.join(ROOT, "build", "audio", "music.wav"), out, SR, subtype="FLOAT")
    print(f"配乐 {total:.1f} 秒，峰值 {np.abs(out).max():.2f}")


if __name__ == "__main__":
    main()
