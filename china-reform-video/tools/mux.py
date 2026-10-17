"""合成成片：响度标准化（EBU R128，两遍 loudnorm，-16 LUFS）后与画面封装为 MP4。

用法: python3 tools/mux.py [video.mp4] [输出.mp4]
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = "I=-16:TP=-1.5:LRA=11"


def main():
    video = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "build", "video.mp4")
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "output", "大潮-中国改革开放简史.mp4")
    audio = os.path.join(ROOT, "build", "audio", "mix.wav")

    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", audio, "-af", f"loudnorm={TARGET}:print_format=json",
                        "-f", "null", "-"], capture_output=True, text=True, check=True)
    m = json.loads(re.findall(r"\{[^{}]*\}", r.stderr)[-1])
    af = (f"loudnorm={TARGET}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,"
          "aresample=48000")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", video, "-i", audio,
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", af, "-c:a", "aac", "-b:a", "192k",
                    "-shortest", "-movflags", "+faststart",
                    "-metadata", "title=大潮：中国改革开放简史（1978—2026）", "-metadata:s:a:0", "language=chi",
                    out], check=True)
    print(f"成片：{out}（原始响度 {m['input_i']} LUFS → -16 LUFS）")


if __name__ == "__main__":
    main()
