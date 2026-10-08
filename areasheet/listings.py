"""物件データCSV(自社保有データ等)から、相場・中央値・分布表を集計する。

CSV列(ヘッダ名は日本語/英語どちらも可):
  type            土地 / 中古戸建て / 中古マンション / 新築戸建て
  price_man       価格(万円)
  land_area_m2    土地面積(㎡)
  building_area_m2 建物面積(㎡)   exclusive_area_m2 専有面積(㎡)
  age_years       築年数
  zone            用途地域(「低層」を含む=低層住居専用、「住居」を含む=その他の住居専用)
  city            市区町村(任意。設定の city と一致する行だけ使う)
"""
from __future__ import annotations

import csv
import statistics
from pathlib import Path

from .jp import round_half_up

TSUBO = 3.305785
TYPE_ALIASES = {
    "land": ["土地", "land"],
    "used_house": ["中古戸建て", "中古戸建", "中古一戸建て", "used_house"],
    "used_mansion": ["中古マンション", "マンション", "used_mansion"],
    "new_house": ["新築戸建て", "新築戸建", "新築一戸建て", "new_house"],
}
COLS = {
    "type": ["type", "種別"], "price_man": ["price_man", "価格", "価格(万円)"],
    "land_area_m2": ["land_area_m2", "土地面積"], "building_area_m2": ["building_area_m2", "建物面積"],
    "exclusive_area_m2": ["exclusive_area_m2", "専有面積"], "age_years": ["age_years", "築年数"],
    "zone": ["zone", "用途地域"], "city": ["city", "市区町村"],
}
PRICE_EDGES = [2000, 3000, 4000, 5000, 6000, 7000, 10000]
AREA_EDGES = {"land_area_m2": list(range(60, 151, 10)), "building_area_m2": list(range(60, 131, 10)),
              "exclusive_area_m2": list(range(40, 101, 10))}


def _f(v):
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def read_csv(path: Path, city: str | None = None) -> dict[str, list[dict]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        rd = csv.DictReader(f)
        head = {k: next((h for h in names if h in (rd.fieldnames or [])), None) for k, names in COLS.items()}
        out: dict[str, list[dict]] = {k: [] for k in TYPE_ALIASES}
        for r in rd:
            t = (r.get(head["type"]) or "").strip() if head["type"] else ""
            key = next((k for k, al in TYPE_ALIASES.items() if t in al), None)
            if not key:
                continue
            if city and head["city"] and (r.get(head["city"]) or "").strip() not in ("", city):
                continue
            row = {k: (r.get(h) if h else None) for k, h in head.items()}
            for k in ("price_man", "land_area_m2", "building_area_m2", "exclusive_area_m2", "age_years"):
                row[k] = _f(row[k])
            if row["price_man"] is None:
                continue
            out[key].append(row)
    return out


def _med(rows, key, nd: int = 0):
    """中央値。万円・㎡・年は整数(四捨五入)、単価は小数1桁で返す。"""
    xs = [r[key] for r in rows if r.get(key) is not None]
    if not xs:
        return None
    v = round_half_up(statistics.median(xs), nd)
    return int(v) if nd == 0 else v


def _heat(rows, area_key):
    edges, pe = AREA_EDGES[area_key], PRICE_EDGES
    pts = [(r[area_key], r["price_man"]) for r in rows if r.get(area_key) is not None]
    if not pts:
        return None
    grid = [[0] * (len(pe) + 1) for _ in range(len(edges) + 1)]
    for a, p in pts:
        i = next((n for n, e in enumerate(edges) if a <= e), len(edges))
        j = next((n for n, e in enumerate(pe) if p < e), len(pe))
        grid[i][j] += 1
    rl = [f"〜{e}㎡" for e in edges] + [f"{edges[-1]}㎡超"]
    cl = [f"〜{pe[0]:,}"] + [f"{pe[n]:,}〜" if pe[n] < 10000 else "1億〜" for n in range(len(pe))]
    return {"rows": rl, "cols": cl, "grid": grid, "max": max(max(r) for r in grid)}


def summarize(path: Path, city: str | None = None) -> dict:
    data = read_csv(path, city)
    res: dict = {}
    for key, rows in data.items():
        if not rows:
            continue
        s = {"count": len(rows), "price_man": _med(rows, "price_man")}
        if key == "land":
            for r in rows:
                if r["land_area_m2"]:
                    r["tsubo"] = r["price_man"] / (r["land_area_m2"] / TSUBO)
                    r["per_m2"] = r["price_man"] / r["land_area_m2"]
            z = lambda r, f: r.get("zone") and f(r["zone"])  # noqa: E731
            s["tsubo_price_man"] = _med(rows, "tsubo", 1)
            s["tsubo_price_low_rise_residential_man"] = _med([r for r in rows if z(r, lambda v: "低層" in v)], "tsubo", 1)
            s["tsubo_price_other_residential_man"] = _med(
                [r for r in rows if z(r, lambda v: "住居" in v and "低層" not in v)], "tsubo", 1)
            s["price_per_m2_man"] = _med(rows, "per_m2", 1)
            s["land_area_median_m2"] = _med(rows, "land_area_m2")
            s["heatmaps"] = {"land_area_m2": _heat(rows, "land_area_m2")}
        elif key == "used_mansion":
            for r in rows:
                if r["exclusive_area_m2"]:
                    r["per_m2"] = r["price_man"] / r["exclusive_area_m2"]
            s.update(exclusive_area_median_m2=_med(rows, "exclusive_area_m2"), age_median_years=_med(rows, "age_years"),
                     price_per_m2_man=_med(rows, "per_m2", 1),
                     heatmaps={"exclusive_area_m2": _heat(rows, "exclusive_area_m2")})
        else:
            s.update(building_area_median_m2=_med(rows, "building_area_m2"), land_area_median_m2=_med(rows, "land_area_m2"),
                     heatmaps={"land_area_m2": _heat(rows, "land_area_m2"), "building_area_m2": _heat(rows, "building_area_m2")})
            if key == "used_house":
                s["age_median_years"] = _med(rows, "age_years")
        res[key] = s
    return res
