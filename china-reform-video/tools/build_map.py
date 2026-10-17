"""把 ECharts 4.9.0 自带的中国地图（UTF8 编码 GeoJSON + 南海诸岛补丁）转换成 SVG 路径。

用法: python3 tools/build_map.py <echarts/package 目录> data/china_map.json

ECharts 以 Apache-2.0 许可发布；这里沿用它的投影方式（经度 × 0.75 的等距圆柱投影），
这样南海诸岛示意框的比例与原图一致。
"""
import json
import sys

ASPECT = 0.75   # ECharts geo 默认 aspectScale
WIDTH = 1000.0  # 输出 viewBox 宽度


def decode_ring(coords, offset, scale=1024.0):
    pts, px, py = [], offset[0], offset[1]
    for i in range(0, len(coords), 2):
        x = ord(coords[i]) - 64
        y = ord(coords[i + 1]) - 64
        x = (x >> 1) ^ (-(x & 1))
        y = (y >> 1) ^ (-(y & 1))
        x += px
        y += py
        px, py = x, y
        pts.append((x / scale, y / scale))
    return pts


def feature_rings(f):
    g = f["geometry"]
    if g["type"] == "Polygon":
        return [decode_ring(c, o) for c, o in zip(g["coordinates"], g["encodeOffsets"])]
    rings = []
    for poly, offs in zip(g["coordinates"], g["encodeOffsets"]):
        rings += [decode_ring(c, o) for c, o in zip(poly, offs)]
    return rings


def nanhai_rings():
    # 摘自 echarts/lib/coord/geo/fix/nanhai.js
    geo = (126, 25)
    pts = [[[0, 3.5], [7, 11.2], [15, 11.9], [30, 7], [42, 0.7], [52, 0.7], [56, 7.7], [59, 0.7], [64, 0.7], [64, 0], [5, 0], [0, 3.5]], [[13, 16.1], [19, 14.7], [16, 21.7], [11, 23.1], [13, 16.1]], [[12, 32.2], [14, 38.5], [15, 38.5], [13, 32.2], [12, 32.2]], [[16, 47.6], [12, 53.2], [13, 53.2], [18, 47.6], [16, 47.6]], [[6, 64.4], [8, 70], [9, 70], [8, 64.4], [6, 64.4]], [[23, 82.6], [29, 79.8], [30, 79.8], [25, 82.6], [23, 82.6]], [[37, 70.7], [43, 62.3], [44, 62.3], [39, 70.7], [37, 70.7]], [[48, 51.1], [51, 45.5], [53, 45.5], [50, 51.1], [48, 51.1]], [[51, 35], [51, 28.7], [53, 28.7], [53, 35], [51, 35]], [[52, 22.4], [55, 17.5], [56, 17.5], [53, 22.4], [52, 22.4]], [[58, 12.6], [62, 7], [63, 7], [60, 12.6], [58, 12.6]], [[0, 3.5], [0, 93.1], [64, 93.1], [64, 0], [63, 0], [63, 92.4], [1, 92.4], [1, 3.5], [0, 3.5]]]
    return [[(x / 10.5 + geo[0], y / (-10.5 / ASPECT) + geo[1]) for x, y in ring] for ring in pts]


def main(src, dst):
    d = json.load(open(f"{src}/map/json/china.json", encoding="utf-8"))
    provinces = {f["properties"]["name"]: feature_rings(f) for f in d["features"]}
    nanhai = nanhai_rings()

    allpts = [p for rings in list(provinces.values()) + [nanhai] for r in rings for p in r]
    lon0 = min(p[0] for p in allpts)
    lon1 = max(p[0] for p in allpts)
    lat0 = min(p[1] for p in allpts)
    lat1 = max(p[1] for p in allpts)
    s = WIDTH / ((lon1 - lon0) * ASPECT)
    height = (lat1 - lat0) * s

    def proj(lon, lat):
        return ((lon - lon0) * ASPECT * s, (lat1 - lat) * s)

    def path(rings, min_step=0.6):
        out = []
        for r in rings:
            xy = [proj(*p) for p in r]
            keep = [xy[0]]
            for p in xy[1:]:
                if abs(p[0] - keep[-1][0]) + abs(p[1] - keep[-1][1]) >= min_step:
                    keep.append(p)
            if len(keep) < 3:
                continue
            out.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in keep) + "Z")
        return "".join(out)

    res = {
        "source": "Apache ECharts 4.9.0 map/json/china.json + geo/fix/nanhai.js (Apache-2.0)",
        "width": WIDTH,
        "height": round(height, 1),
        "proj": {"lon0": lon0, "lat1": lat1, "aspect": ASPECT, "scale": s},
        "provinces": {k: path(v) for k, v in provinces.items()},
        "nanhai": path(nanhai, 0.0),
    }
    json.dump(res, open(dst, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{dst}: {len(res['provinces'])} 个省级区域, viewBox 1000x{height:.0f}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
