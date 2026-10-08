"""行政区域(国土数値情報由来)の取得・隣接判定・静的SVG地図。

データ: 国土数値情報「行政区域データ」(N03, 2021-01-01時点)を、
smartnews-smri/japan-topography が市区町村単位に分割して公開しているGeoJSONから取得する。
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

import requests

from .jp import PREF_CODE, city_key

GEO_URL = ("https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/"
           "data/municipality/geojson/s0010/N03-21_{code:02d}_210101.json")
GEO_SOURCE = "国土数値情報 行政区域データ(2021-01-01時点)"
GEO_LICENSE_NOTE = "出典: 国土数値情報(行政区域データ) 国土交通省 / 加工: smartnews-smri/japan-topography"


class GeoError(RuntimeError):
    pass


def fetch_prefecture(pref: str, cache_dir: Path, refresh: bool = False) -> dict:
    code = PREF_CODE[pref]
    path = cache_dir / f"geo_{code:02d}.json"
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding="utf8"))
    try:
        r = requests.get(GEO_URL.format(code=code), timeout=60)
        r.raise_for_status()
        data = r.json()
    except Exception as e:  # noqa: BLE001
        raise GeoError(f"行政区域データの取得に失敗: {e}") from e
    cache_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf8")
    return data


def muni_name(props: dict) -> str | None:
    """政令市の区は市に統合し、それ以外は N03_004 を名称とする。"""
    c3, c4 = props.get("N03_003"), props.get("N03_004")
    if c3 and c3.endswith("市") and c4 and c4.endswith("区"):
        return c3
    return c4


def muni_code(props: dict, name: str) -> str:
    code = props.get("N03_007") or ""
    return code


def _rings(geom: dict):
    if geom["type"] == "Polygon":
        yield geom["coordinates"]
    elif geom["type"] == "MultiPolygon":
        yield from geom["coordinates"]


class Prefecture:
    def __init__(self, pref: str, geojson: dict):
        self.pref = pref
        self.munis: dict[str, dict] = {}   # name -> {code, polys}
        for f in geojson["features"]:
            name = muni_name(f["properties"])
            if not name:
                continue
            m = self.munis.setdefault(name, {"code": f["properties"].get("N03_007", ""), "polys": []})
            m["polys"].extend(_rings(f["geometry"]))

    @property
    def count(self) -> int:
        return len(self.munis)

    def resolve(self, city: str) -> str:
        key = city_key(city)
        if key in self.munis:
            return key
        for suffix in ("市", "区", "町", "村"):
            if key + suffix in self.munis:
                return key + suffix
        cands = [n for n in self.munis if key and key[:2] in n][:8]
        raise GeoError(f"{self.pref}に「{city}」が見つかりません(2021年1月時点の市区町村名)。候補: {', '.join(cands)}")

    def code(self, name: str) -> str:
        return self.munis[name]["code"]

    def adjacency(self) -> dict[str, dict[str, int]]:
        """共有頂点数で隣接を判定(境界線の長さの代理値)。"""
        owners: dict[tuple, set] = defaultdict(set)
        for name, m in self.munis.items():
            for poly in m["polys"]:
                for ring in poly:
                    for x, y in ring:
                        owners[(round(x, 5), round(y, 5))].add(name)
        adj: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        for names in owners.values():
            if len(names) > 1:
                for a in names:
                    for b in names:
                        if a != b:
                            adj[a][b] += 1
        return {a: {b: n for b, n in d.items() if n >= 2} for a, d in adj.items()}

    def neighbors(self, name: str) -> list[str]:
        d = self.adjacency().get(name, {})
        return [b for b, _ in sorted(d.items(), key=lambda kv: -kv[1])]


def _ring_area_centroid(ring):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    if a == 0:
        return 0.0, ring[0][0], ring[0][1]
    return abs(a) / 2, cx / (3 * a), cy / (3 * a)


def render_svg(pref: Prefecture, target: str, width: int = 640, label: bool = True) -> str:
    """都道府県の市区町村境界を描画し、対象市区町村をハイライトした静的SVG。"""
    rings = []
    for name, m in pref.munis.items():
        for poly in m["polys"]:
            area, cx, cy = _ring_area_centroid(poly[0])
            rings.append((name, poly, area, cx, cy))
    tot = sum(r[2] for r in rings) or 1
    mx = sum(r[3] * r[2] for r in rings) / tot
    my = sum(r[4] * r[2] for r in rings) / tot
    keep = [r for r in rings if math.hypot(r[3] - mx, r[4] - my) < 5.0 or r[0] == target]
    lon0 = min(x for r in keep for x, _ in r[1][0])
    lon1 = max(x for r in keep for x, _ in r[1][0])
    lat0 = min(y for r in keep for _, y in r[1][0])
    lat1 = max(y for r in keep for _, y in r[1][0])
    k = math.cos(math.radians((lat0 + lat1) / 2))
    w_deg, h_deg = (lon1 - lon0) * k, lat1 - lat0
    pad = 8
    scale = (width - 2 * pad) / w_deg
    height = int(h_deg * scale + 2 * pad)

    def pt(x, y):
        return f"{(x - lon0) * k * scale + pad:.1f},{(lat1 - y) * scale + pad:.1f}"

    paths_other, paths_target = [], []
    for name, poly, *_ in keep:
        d = ""
        for ring in poly:
            pts, last = [], None
            for x, y in ring:
                p = pt(x, y)
                if p != last:
                    pts.append(p)
                    last = p
            if len(pts) >= 3:
                d += "M" + "L".join(pts) + "Z"
        (paths_target if name == target else paths_other).append(f'<path d="{d}"/>')
    cx_t = cy_t = None
    best = 0
    for name, poly, area, cx, cy in keep:
        if name == target and area > best:
            best, cx_t, cy_t = area, cx, cy
    tx, ty = (pt(cx_t, cy_t).split(",") if cx_t is not None else ("0", "0"))
    # ラベルは地図の外側(上部)へ引き出さず、対象の真上に白縁つきで置く
    lab = (f'<text class="map-label" x="{tx}" y="{float(ty) - 10:.1f}" text-anchor="middle">{target}</text>'
           if label else "")
    return (f'<svg class="area-map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" '
            f'aria-label="{pref.pref}の地図。{target}を強調表示">'
            f'<g class="map-other">{"".join(paths_other)}</g><g class="map-target">{"".join(paths_target)}</g>{lab}</svg>')
