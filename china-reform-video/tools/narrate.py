"""旁白合成 + 时间轴。

读取 script.json，逐句用 Kokoro（sherpa-onnx）合成旁白，然后按句长排出整部片子的时间轴：
  build/audio/lines/<scene>_<i>.wav   每句旁白（24 kHz 单声道）
  build/timing.json                   场景起止、每句起止、字幕分段
  output/字幕.srt                      同步字幕

用法:
  MODELS=<模型目录> python3 tools/narrate.py [--check]
  --check 用 SenseVoice 识别合成结果，与原文比对，列出可能读错的句子。
"""
import hashlib
import json
import os
import re
import sys

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
LINES = os.path.join(BUILD, "audio", "lines")

FPS = 30
OVERLAP = 0.6       # 相邻场景交叉淡化时长
LEAD = 0.9          # 场景开始到第一句旁白
GAP = 0.45          # 句间停顿
TAIL = 1.1          # 最后一句结束到场景结束
SUB_MAX = 22        # 字幕每屏最多字数（短片段可放宽）

CN = "零一二三四五六七八九"


def cn_int(n):
    """100 以内的整数转中文读法。"""
    if n < 10:
        return CN[n]
    tens, ones = divmod(n, 10)
    return ("" if tens == 1 else CN[tens]) + "十" + (CN[ones] if ones else "")


def tts_text(s):
    """把显示文本改写成更适合合成的读法。"""
    s = s.replace("“", "").replace("”", "").replace("——", "，").replace("·", "")
    # 数字% → 百分之数字
    s = re.sub(r"(\d+(?:\.\d+)?)%", r"百分之\1", s)
    # “15年”“90年代” 这类非公元纪年，避免被读成“一五年”“九零年代”
    s = re.sub(r"(?<!\d)(\d{1,2})年", lambda m: cn_int(int(m.group(1))) + "年", s)
    return s


def sub_chunks(text):
    """把一句旁白切成适合单屏显示的字幕片段。"""
    parts = re.split(r"(?<=[，。；：！？])", text)
    chunks, cur = [], ""
    for p in parts:
        if not p:
            continue
        n = len(cur) + len(p)
        if cur and n > SUB_MAX and not ((len(cur) < 8 or len(p) < 6) and n <= SUB_MAX + 6):
            chunks.append(cur)
            cur = p
        else:
            cur += p
    if cur:
        chunks.append(cur)
    out = []
    for c in chunks:
        while len(c) > SUB_MAX + 4:          # 无标点的超长片段：在靠近中间、不拆数字的位置切开
            out.append(c[:best_cut(c)])
            c = c[len(out[-1]):]
        out.append(c)
    return [re.sub(r"[，。；：]$", "", c) for c in out]


def best_cut(c):
    unit = "年月日亿万元吨个人%号级倍"
    best, score = len(c) // 2, 1e9
    for i in range(6, len(c) - 5):
        a, b = c[i - 1], c[i]
        if a.isascii() and a.isalnum() or b.isascii() and b.isalnum() or b in unit or b in "”）":
            continue
        s = abs(i - len(c) / 2)
        if a in "的到从在和与是了将把" or b in "从到在和与把被为对，":
            s -= 4
        if s < score:
            best, score = i, s
    return best


def weight(s):
    return max(1, len(re.sub(r"[，。；：！？“”、—·\s]", "", s)))


def trim(x, sr, thr=0.012, pad=0.04):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(pad * sr))
    b = min(len(x), idx[-1] + int(pad * sr))
    return x[a:b]


def srt_time(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main():
    check = "--check" in sys.argv
    script = json.load(open(os.path.join(ROOT, "script.json"), encoding="utf-8"))
    voice = script["voice"]
    os.makedirs(LINES, exist_ok=True)

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    engine = None

    timing = {"fps": FPS, "scenes": [], "subs": []}
    t = 0.0
    for si, sc in enumerate(script["scenes"]):
        start = 0.0 if si == 0 else t - OVERLAP
        cur = start + sc.get("lead", LEAD)
        lines = []
        for li, text in enumerate(sc.get("lines", [])):
            say = tts_text(text)
            key = hashlib.sha1(f"{voice}|{say}".encode()).hexdigest()[:10]
            path = os.path.join(LINES, f"{sc['id']}_{li}_{key}.wav")
            if not os.path.exists(path):
                if engine is None:
                    import sherpa_tts
                    engine = sherpa_tts.kokoro()
                a = engine.generate(say, sid=voice["sid"], speed=voice["speed"])
                sf.write(path, trim(np.asarray(a.samples, dtype=np.float32), a.sample_rate), a.sample_rate)
                print(f"  合成 {sc['id']}#{li}: {text}")
            dur = sf.info(path).duration
            lines.append({"text": text, "say": say, "file": os.path.relpath(path, ROOT),
                          "start": round(cur, 3), "dur": round(dur, 3)})
            # 字幕：按字数比例在本句时长内分配
            chunks = sub_chunks(text)
            total = sum(weight(c) for c in chunks)
            ct = cur
            for c in chunks:
                cd = dur * weight(c) / total
                timing["subs"].append({"start": round(ct, 3), "end": round(ct + cd, 3), "text": c})
                ct += cd
            cur += dur + GAP
        if lines:
            end = cur - GAP + sc.get("tail", TAIL)
        else:
            end = start + sc.get("duration", 4.0)
        timing["scenes"].append({
            "id": sc["id"], "start": round(start, 3), "end": round(end, 3),
            "lines": [{k: v for k, v in ln.items() if k in ("start", "dur")} for ln in lines]})
        timing.setdefault("narration", []).extend(
            {"file": ln["file"], "start": ln["start"], "dur": ln["dur"]} for ln in lines)
        t = end

    timing["total"] = round(t, 3)
    timing["frames"] = int(np.ceil(t * FPS))
    json.dump(timing, open(os.path.join(BUILD, "timing.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    os.makedirs(os.path.join(ROOT, "output"), exist_ok=True)
    with open(os.path.join(ROOT, "output", "字幕.srt"), "w", encoding="utf-8") as f:
        for i, s in enumerate(timing["subs"], 1):
            f.write(f"{i}\n{srt_time(s['start'])} --> {srt_time(s['end'])}\n{s['text']}\n\n")

    m, s = divmod(t, 60)
    print(f"共 {len(timing['scenes'])} 个场景，{len(timing['narration'])} 句旁白，总时长 {int(m)}分{s:.1f}秒")

    if check:
        import difflib
        import sherpa_tts
        rec = sherpa_tts.asr()
        norm = lambda s: re.sub(r"[^\w]", "", s)
        for sc in script["scenes"]:
            for li, text in enumerate(sc.get("lines", [])):
                path = next(n["file"] for n in timing["narration"]
                            if os.path.basename(n["file"]).startswith(f"{sc['id']}_{li}_"))
                hyp = sherpa_tts.transcribe(rec, os.path.join(ROOT, path))
                r = difflib.SequenceMatcher(None, norm(tts_text(text)), norm(hyp)).ratio()
                flag = "  " if r > 0.9 else "!!"
                print(f"{flag} {r:.2f} {sc['id']}#{li}\n     原文: {text}\n     识别: {hyp}")


if __name__ == "__main__":
    main()
