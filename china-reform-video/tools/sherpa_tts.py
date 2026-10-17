"""sherpa-onnx 封装：Kokoro 中文语音合成 + SenseVoice 语音识别（用于校对旁白）。

模型目录由环境变量 MODELS 指定，下载方式见 tools/fetch_models.sh。
"""
import os

import numpy as np
import sherpa_onnx
import soundfile as sf

M = os.environ.get("MODELS", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build", "models"))


def kokoro():
    k = f"{M}/kokoro-multi-lang-v1_1"
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=f"{k}/model.onnx", voices=f"{k}/voices.bin", tokens=f"{k}/tokens.txt",
                data_dir=f"{k}/espeak-ng-data", dict_dir=f"{k}/dict",
                lexicon=f"{k}/lexicon-us-en.txt,{k}/lexicon-zh.txt"),
            num_threads=4),
        rule_fsts=f"{k}/phone-zh.fst,{k}/date-zh.fst,{k}/number-zh.fst",
        max_num_sentences=1)
    return sherpa_onnx.OfflineTts(cfg)


def asr():
    v = f"{M}/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
    return sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=f"{v}/model.int8.onnx", tokens=f"{v}/tokens.txt",
        language="zh", use_itn=True, num_threads=4)


def transcribe(rec, path):
    x, sr = sf.read(path, dtype="float32")
    if x.ndim > 1:
        x = x.mean(axis=1)
    s = rec.create_stream()
    s.accept_waveform(sr, np.ascontiguousarray(x))
    rec.decode_stream(s)
    return s.result.text
