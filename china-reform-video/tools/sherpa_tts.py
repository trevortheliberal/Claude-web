"""sherpa-onnx 封装：中文语音合成（ZipVoice 零样本 / Kokoro）+ SenseVoice 语音识别（用于校对旁白）。

模型目录由环境变量 MODELS 指定，下载方式见 tools/fetch_models.sh。
"""
import os

import numpy as np
import sherpa_onnx
import soundfile as sf

M = os.environ.get("MODELS", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build", "models"))

# ZipVoice 的音色参考：录音 + 对应文字
PROMPTS = {
    # sherpa-onnx paraformer 模型自带的测试录音（一段讲座）
    "lecture": ("sherpa-onnx-paraformer-zh-small-2024-03-09/test_wavs/1.wav",
                "重点呢想谈三个问题。首先呢就是这一轮全球金融动荡的表现。"),
}


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


def zipvoice():
    z = f"{M}/sherpa-onnx-zipvoice-distill-zh-en-emilia"            # fp32 模型
    z8 = f"{M}/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia"      # 新版拼音词典与音素表
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            zipvoice=sherpa_onnx.OfflineTtsZipvoiceModelConfig(
                tokens=f"{z8}/tokens.txt", encoder=f"{z}/text_encoder.onnx", decoder=f"{z}/fm_decoder.onnx",
                vocoder=f"{M}/vocos_24khz.onnx", data_dir=f"{z8}/espeak-ng-data", lexicon=f"{z8}/lexicon.txt",
                guidance_scale=1.0),
            num_threads=4),
        max_num_sentences=1)
    return sherpa_onnx.OfflineTts(cfg)


def load_voice(voice):
    """按 script.json 的 voice 配置返回 synth(text) -> (samples, sample_rate)。"""
    if voice["engine"] == "kokoro":
        tts = kokoro()
        def synth(text):
            a = tts.generate(text, sid=voice["sid"], speed=voice["speed"])
            return np.asarray(a.samples, dtype=np.float32), a.sample_rate
        return synth
    tts = zipvoice()
    wav, prompt_text = PROMPTS[voice["prompt"]]
    x, sr = sf.read(os.path.join(M, wav), dtype="float32")
    prompt = (x if x.ndim == 1 else x.mean(axis=1)).tolist()
    def synth(text):
        a = tts.generate(text, prompt_text, prompt, sr, voice["speed"], voice.get("steps", 8))
        return np.asarray(a.samples, dtype=np.float32), a.sample_rate
    return synth


def asr(itn=True):
    v = f"{M}/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
    return sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=f"{v}/model.int8.onnx", tokens=f"{v}/tokens.txt",
        language="zh", use_itn=itn, num_threads=4)


def recognize(rec, path):
    x, sr = sf.read(path, dtype="float32")
    if x.ndim > 1:
        x = x.mean(axis=1)
    s = rec.create_stream()
    s.accept_waveform(sr, np.ascontiguousarray(x))
    rec.decode_stream(s)
    return s.result


def transcribe(rec, path):
    return recognize(rec, path).text


def char_times(rec, path, text):
    """用识别结果的逐字时间戳，估计 text 中每个字在音频里出现的时刻（秒）。rec 需关闭 ITN。"""
    import difflib
    r = recognize(rec, path)
    hyp, ts = "", []
    for tok, t in zip(r.tokens, r.timestamps):
        hyp += tok
        ts += [t] * len(tok)
    out = [None] * len(text)
    for a, b, n in difflib.SequenceMatcher(None, text, hyp, autojunk=False).get_matching_blocks():
        for i in range(n):
            out[a + i] = ts[b + i]
    known = [i for i, v in enumerate(out) if v is not None]
    if not known:
        return [0.0] * len(text)
    return list(np.interp(range(len(text)), known, [out[i] for i in known]))
