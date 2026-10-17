"""从 Google Fonts 下载画面用到的字体（SIL OFL），只保留实际用到的字符所在的分片。

输出 web/fonts/*.woff2 与 web/fonts/fonts.css。
"""
import json
import os
import re
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "fonts")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
FAMILIES = [
    "Noto Serif SC:wght@500;700;900",
    "Noto Sans SC:wght@300;400;500;700",
    "Ma Shan Zheng",
]


def used_chars():
    text = open(os.path.join(ROOT, "script.json"), encoding="utf-8").read()
    for name in os.listdir(os.path.join(ROOT, "web")):
        if name.endswith((".js", ".html", ".css")):
            text += open(os.path.join(ROOT, "web", name), encoding="utf-8").read()
    chars = set(text) | set("0123456789.,%×→—·：；，。“”（）亿万元年")
    return {ord(c) for c in chars}


def parse_range(s):
    out = []
    for part in s.split(","):
        part = part.strip().replace("U+", "")
        if "-" in part:
            a, b = part.split("-")
            out.append((int(a, 16), int(b, 16)))
        elif "?" in part:
            out.append((int(part.replace("?", "0"), 16), int(part.replace("?", "f"), 16)))
        else:
            out.append((int(part, 16), int(part, 16)))
    return out


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    os.makedirs(OUT, exist_ok=True)
    chars = used_chars()
    css_out, n = [], 0
    for fam in FAMILIES:
        url = "https://fonts.googleapis.com/css2?family=" + urllib.parse.quote(fam, safe=":;@") + "&display=block"
        css = get(url).decode()
        for block in re.findall(r"@font-face\s*{[^}]*}", css):
            rng = re.search(r"unicode-range:\s*([^;]+);", block)
            src = re.search(r"url\((https://[^)]+)\)", block).group(1)
            if rng and not any(a <= c <= b for a, b in parse_range(rng.group(1)) for c in chars):
                continue
            name = re.sub(r"[^\w.]", "_", src.split("/s/")[-1])
            path = os.path.join(OUT, name)
            if not os.path.exists(path):
                open(path, "wb").write(get(src))
                n += 1
            css_out.append(block.replace(src, name))
    open(os.path.join(OUT, "fonts.css"), "w").write("\n".join(css_out) + "\n")
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"字体：{len(css_out)} 个分片（新下载 {n} 个），共 {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
