"""加盟店一覧(data/franchises.csv)の管理と周辺加盟店の選定。

加盟店は増えていくため、正本は data/franchises.csv。マイマップはKML/CSVを
エクスポートして `import-franchises` で取り込む(マップを公開する必要はない)。
"""
from __future__ import annotations

import csv
import re
import xml.etree.ElementTree as ET
from pathlib import Path

from .jp import PREFECTURES, city_key

FIELDS = ["name", "prefecture", "city", "address", "url", "active"]
_ADDR = re.compile(r"(北海道|東京都|京都府|大阪府|.{2,3}県)\s*([^\d\s\-ー−]*?[市区町村])")
_TIERS = ("same_city", "adjacent", "same_prefecture")


def load(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f)]
    return [r for r in rows if (r.get("active") or "1").strip() not in ("0", "false", "no", "停止")]


def save(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in FIELDS})


def split_address(address: str) -> tuple[str, str]:
    m = _ADDR.search(address.replace("　", " "))
    if not m:
        return "", ""
    pref, city = m.group(1), m.group(2)
    # 「郡」を含む町村は郡名を落とす(例: 北佐久郡軽井沢町 -> 軽井沢町)
    city = re.sub(r"^.*郡", "", city)
    return pref, city


def parse_kml(text: str) -> list[dict]:
    root = ET.fromstring(text)
    out = []
    for pm in root.iter():
        if not pm.tag.endswith("Placemark"):
            continue
        d = {"name": "", "address": "", "url": ""}
        for ch in pm.iter():
            tag = ch.tag.split("}")[-1]
            if tag == "name" and ch.text and not d["name"]:
                d["name"] = ch.text.strip()
            elif tag == "address" and ch.text:
                d["address"] = ch.text.strip()
            elif tag == "description" and ch.text:
                m = re.search(r"https?://[^\s<\"']+", ch.text)
                if m and not d["url"]:
                    d["url"] = m.group(0)
                if not d["address"]:
                    d["address"] = re.sub(r"<[^>]+>", " ", ch.text).strip()
            elif tag == "Data":
                key, val = ch.get("name", ""), "".join(v.text or "" for v in ch if v.tag.endswith("value"))
                if key in ("住所", "address", "所在地") and val:
                    d["address"] = val.strip()
                elif key in ("URL", "url", "HP", "ホームページ") and val:
                    d["url"] = val.strip()
        out.append(d)
    return out


def import_file(src: Path, dest: Path, replace: bool = False) -> tuple[int, list[str]]:
    """KML または CSV を取り込む。戻り値: (件数, 住所から市区町村を判定できなかった名称)"""
    text = src.read_text(encoding="utf-8-sig")
    if src.suffix.lower() == ".kml" or text.lstrip().startswith("<?xml"):
        rows = parse_kml(text)
    else:
        rows = list(csv.DictReader(text.splitlines()))
    unresolved, new = [], []
    for r in rows:
        r = {k.strip(): (v or "").strip() for k, v in r.items() if k}
        r.setdefault("name", r.get("名称", ""))
        addr = r.get("address") or r.get("住所") or r.get("所在地") or ""
        r["address"] = addr
        r["url"] = r.get("url") or r.get("URL") or ""
        if not r.get("prefecture") or not r.get("city"):
            r["prefecture"], r["city"] = split_address(addr)
        if not r["prefecture"] or not r["city"]:
            unresolved.append(r["name"])
            continue
        r["active"] = r.get("active", "1") or "1"
        new.append(r)
    cur = [] if replace else _all(dest)
    index = {(r["name"], r["prefecture"], r["city"]): r for r in cur}
    for r in new:
        index[(r["name"], r["prefecture"], r["city"])] = r
    save(dest, list(index.values()))
    return len(new), unresolved


def _all(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def select(rows: list[dict], pref: str, city: str, neighbors: list[str], *, max_count: int = 3,
           tiers: list[str] | None = None, stop_at_first_tier: bool = True, exclude: list[str] | None = None) -> dict:
    """既定: 同一市 → 隣接市 → 同一県 の順に、最初に該当があった段階の加盟店(最大 max_count 社)。"""
    tiers = tiers or list(_TIERS)
    bad = [t for t in tiers if t not in _TIERS]
    if bad:
        raise ValueError(f"franchise.tiers が不正です: {bad}(使える値: {_TIERS})")
    excl = {city_key(x) for x in (exclude or [])}
    pool = [r for r in rows if r.get("prefecture") == pref and city_key(r["name"]) not in excl]
    picked: list[dict] = []
    used_tiers: list[str] = []

    def add(cands, tier):
        for r in cands:
            if len(picked) >= max_count:
                return
            if r not in picked:
                picked.append({**r, "tier": tier})
                if tier not in used_tiers:
                    used_tiers.append(tier)

    for tier in tiers:
        if tier == "same_city":
            c = [r for r in pool if r["city"] == city]
        elif tier == "adjacent":
            order = {n: i for i, n in enumerate(neighbors)}
            c = sorted((r for r in pool if r["city"] in order), key=lambda r: order[r["city"]])
        else:
            c = [r for r in pool if r["city"] != city]
        add(c, tier)
        if picked and stop_at_first_tier:
            break
    return {"items": picked, "tiers_used": used_tiers, "rule": {"max": max_count, "tiers": tiers,
                                                                   "stop_at_first_tier": stop_at_first_tier}}
