"""加盟店一覧(data/franchises.csv)の管理と周辺加盟店の選定。

加盟店は増えていくため、正本は data/franchises.csv。マイマップはKML/CSVを
エクスポートして `import-franchises` で取り込む(マップを公開する必要はない)。
"""
from __future__ import annotations

import csv
import io
import re
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

from .jp import PREFECTURES, city_key

FIELDS = ["name", "prefecture", "city", "address", "url", "active", "shop", "service_area", "customer_no"]
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


# 政令指定都市(住所に都道府県が無い場合の補完用)
DESIGNATED = {"札幌市": "北海道", "仙台市": "宮城県", "さいたま市": "埼玉県", "千葉市": "千葉県", "横浜市": "神奈川県", "川崎市": "神奈川県",
              "相模原市": "神奈川県", "新潟市": "新潟県", "静岡市": "静岡県", "浜松市": "静岡県", "名古屋市": "愛知県", "京都市": "京都府",
              "大阪市": "大阪府", "堺市": "大阪府", "神戸市": "兵庫県", "岡山市": "岡山県", "広島市": "広島県", "北九州市": "福岡県",
              "福岡市": "福岡県", "熊本市": "熊本県"}
_PREF = re.compile("^(北海道|東京都|京都府|大阪府|.{2,3}県)")


def split_address(address: str) -> tuple[str, str]:
    """住所から (都道府県, 市区町村)。郡は落とし、政令市の区は市に統合する(行政区域データの名称に合わせる)。"""
    a = unicodedata.normalize("NFKC", address or "")
    a = re.sub(r"〒?\s*\d{3}-?\d{4}", " ", a).strip()
    m = _PREF.match(a)
    if m:
        pref, rest = m.group(1), a[m.end():]
    else:
        pref = next((v for k, v in DESIGNATED.items() if a.startswith(k)), "")
        rest = a
    rest = re.split(r"[\d\s]", rest, maxsplit=1)[0]
    if not rest or not pref:
        return pref, ""
    gun = rest.find("郡")
    shi = rest.find("市", 1)
    if gun >= 0 and (shi < 0 or gun < shi):
        m2 = re.match(r"[^\d\s]+?[町村]", rest[gun + 1:])
        return pref, m2.group(0) if m2 else ""
    if shi >= 0:
        return pref, rest[:shi + 1]
    ku = rest.find("区", 1)
    if pref == "東京都" and ku >= 0:
        return pref, rest[:ku + 1]
    m3 = re.match(r"[^\d\s]+?[町村]", rest)
    return pref, m3.group(0) if m3 else ""


_OLD = re.compile(r"[（(][^）)]*旧[^）)]*[）)]|＊旧[^【《\s]*|\*旧[^【《\s]*")


def clean_company(raw: str) -> dict:
    """「会社名（旧：…）【屋号】《対応エリア》」から 会社名・屋号・対応エリア を取り出す。"""
    raw = (raw or "").replace("\u3000", " ").strip()
    shop = (re.search(r"【([^】]*)】", raw) or [None, ""])[1].strip()
    area = (re.search(r"《([^》]*)》", raw) or [None, ""])[1].strip()
    name = re.split(r"[【《]", raw, maxsplit=1)[0]
    name = _OLD.sub("", name)
    name = re.sub(r"\s+", " ", name).strip()
    return {"name": name, "shop": shop, "service_area": area}


def parse_raw_csv(text: str) -> list[dict]:
    """加盟店CSV(列: [顧客番号,]会社名,住所)を解釈する。途中で改行された行(名称の分断・住所の分断)は結合する。"""
    rows = [[c.strip() for c in r] for r in csv.reader(io.StringIO(text.lstrip("\ufeff"))) if any(c.strip() for c in r)]
    if not rows:
        return []
    head = rows[0]
    has_no = "顧客番号" in head
    body = rows[1:]
    merged: list[list[str]] = []
    pending_name = ""
    for r in body:
        no, rest = (r[0], r[1:]) if has_no and len(r) >= 2 and re.match(r"^[A-Za-z]\d+$", r[0]) else ("", r)
        if not no and has_no and len(r) >= 1 and merged and not rest[:1] == [""] and not re.match(r"^[A-Za-z]\d+$", r[0]):
            rest = r   # 顧客番号の無い継続行
        if len(rest) == 1:                                     # 1列だけの行
            if merged and _PREF.match(unicodedata.normalize("NFKC", rest[0])) and re.fullmatch(r"〒?\s*\d{3}-?\d{4}", merged[-1][2] or ""):
                merged[-1][2] = merged[-1][2] + " " + rest[0]   # 郵便番号だけの住所の続き
            else:
                pending_name += rest[0]                         # 名称の前半(次の行と結合)
            continue
        name, addr = rest[0], rest[1] if len(rest) > 1 else ""
        if merged and merged[-1][1].count("【") > merged[-1][1].count("】") and name.startswith("】") and not merged[-1][2]:
            merged[-1][1] += name                               # 【…】の途中で改行された名称
            merged[-1][2] = addr
            continue
        if pending_name:
            name, pending_name = pending_name + name, ""
        merged.append([no, name, addr])
    out = []
    for no, name, addr in merged:
        if name.count("【") > name.count("】") and not addr:
            continue
        c = clean_company(name)
        pref, city = split_address(addr)
        out.append({**c, "customer_no": no, "address": unicodedata.normalize("NFKC", addr).strip(), "prefecture": pref, "city": city})
    return out


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
    elif text.splitlines()[0].replace(" ", "").startswith(("会社名,", "顧客番号,")):
        parsed = parse_raw_csv(text)
        unresolved = [r["name"] for r in parsed if not r["prefecture"] or not r["city"]]
        new = [{**r, "url": "", "active": "1"} for r in parsed if r["prefecture"] and r["city"]]
        cur = [] if replace else _all(dest)
        index = {(r["name"], r.get("address", "")): r for r in cur}
        for r in new:
            old = index.get((r["name"], r["address"]), {})
            index[(r["name"], r["address"])] = {**r, "url": old.get("url", "") or r["url"]}
        save(dest, list(index.values()))
        return len(new), unresolved
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
