#!/usr/bin/env bash
# 一键生成成片：旁白 → 配乐 → 混音 → 逐帧渲染 → 封装。
# 依赖：python3（numpy、soundfile、sherpa-onnx）、node + playwright（Chromium）、ffmpeg。
set -euo pipefail
cd "$(dirname "$0")/.."
export MODELS=${MODELS:-$PWD/build/models}

bash tools/fetch_models.sh
python3 tools/fetch_fonts.py
python3 tools/narrate.py "$@"          # 传 --check 可用语音识别校对旁白
python3 tools/music.py
python3 tools/mix.py
node tools/render.mjs video --workers "${WORKERS:-4}"
python3 tools/mux.py
