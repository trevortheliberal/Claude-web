"""混音：旁白按时间轴摆放，配乐在旁白出现时自动压低（ducking），输出 build/audio/mix.wav。"""
import json
import os

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
VOICE_RMS_DB = -18.0     # 旁白（有声部分）目标电平
MUSIC_DB = -1.5          # 配乐整体增益（相对 music.wav）
DUCK_DB = -11.0           # 旁白期间配乐再压低


def upsample(x, sr):
    """频域补零做整数倍上采样（24k → 48k）。"""
    if sr == SR:
        return x
    k = SR / sr
    assert abs(k - round(k)) < 1e-9, sr
    k = int(round(k))
    X = np.fft.rfft(x)
    Y = np.zeros(len(x) * k // 2 + 1, dtype=complex)
    Y[: len(X)] = X
    return np.fft.irfft(Y, len(x) * k) * k


def main():
    timing = json.load(open(os.path.join(ROOT, "build", "timing.json"), encoding="utf-8"))
    music, sr = sf.read(os.path.join(ROOT, "build", "audio", "music.wav"), dtype="float32")
    assert sr == SR
    n = int((timing["total"] + 0.5) * SR)
    music = np.pad(music, ((0, max(0, n - len(music))), (0, 0)))[:n]

    voice = np.zeros(n, dtype=np.float32)
    duck = np.zeros(n, dtype=np.float32)
    for ln in timing["narration"]:
        x, vsr = sf.read(os.path.join(ROOT, ln["file"]), dtype="float32")
        x = upsample(x.astype(np.float64), vsr)
        active = np.abs(x) > 0.02
        rms = np.sqrt((x[active] ** 2).mean()) if active.any() else 1e-3
        x *= 10 ** (VOICE_RMS_DB / 20) / rms
        i0 = int(round(ln["start"] * SR))
        seg = x[: n - i0]
        voice[i0:i0 + len(seg)] += seg.astype(np.float32)
        duck[max(0, i0 - int(0.25 * SR)):i0 + len(seg) + int(0.35 * SR)] = 1.0

    # 压低曲线做平滑，避免抽吸感
    w = int(0.4 * SR)
    kern = np.hanning(w)
    kern /= kern.sum()
    duck = np.convolve(duck, kern, mode="same")
    gain = 10 ** ((MUSIC_DB + DUCK_DB * duck) / 20)

    # 旁白轻微压缩：软限幅
    voice = np.tanh(voice * 1.6) / 1.6
    out = music * gain[:, None] + voice[:, None] * 0.98
    peak = np.abs(out).max()
    if peak > 0.97:
        out *= 0.97 / peak
    sf.write(os.path.join(ROOT, "build", "audio", "mix.wav"), out, SR, subtype="PCM_24")
    print(f"混音完成：{n / SR:.1f} 秒，峰值 {np.abs(out).max():.2f}")


if __name__ == "__main__":
    main()
