#!/usr/bin/env bash
# 下载语音合成（ZipVoice、Kokoro v1.1-zh）、音色参考录音与校对用语音识别（SenseVoice）模型，放到 $MODELS（默认 build/models）。
set -euo pipefail
cd "$(dirname "$0")/.."
MODELS=${MODELS:-$PWD/build/models}
mkdir -p "$MODELS"
BASE=https://github.com/k2-fsa/sherpa-onnx/releases/download
get() {  # get <目录名> <URL> [只解压的路径通配]
  [ -d "$MODELS/$1" ] && return
  echo "下载 $1 ..."
  curl -sSL "$2" | tar xj -C "$MODELS" ${3:+--wildcards "$3"}
}
get sherpa-onnx-zipvoice-distill-zh-en-emilia "$BASE/tts-models/sherpa-onnx-zipvoice-distill-zh-en-emilia.tar.bz2"
get sherpa-onnx-zipvoice-distill-int8-zh-en-emilia "$BASE/tts-models/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia.tar.bz2"
[ -f "$MODELS/vocos_24khz.onnx" ] || curl -sSL -o "$MODELS/vocos_24khz.onnx" "$BASE/vocoder-models/vocos_24khz.onnx"
get sherpa-onnx-paraformer-zh-small-2024-03-09 "$BASE/asr-models/sherpa-onnx-paraformer-zh-small-2024-03-09.tar.bz2" "*test_wavs*"
get kokoro-multi-lang-v1_1 "$BASE/tts-models/kokoro-multi-lang-v1_1.tar.bz2"
get sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17 "$BASE/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2"
