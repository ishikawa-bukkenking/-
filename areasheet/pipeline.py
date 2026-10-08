"""設定の読み込み → 取得 → 集計 → モデル(data.json) と取得レポートの作成。"""
from __future__ import annotations

import copy
import datetime as dt
import json
from pathlib import Path

import yaml

from . import compute as C
from . import estat, franchise, geo, listings
from .jp import normalize_prefecture

ROOT = Path(__file__).resolve().parent.parent
DEFAULTS = {
    "options": {
        "trend_same_threshold_pt": 1.0,     # 県との差がこの範囲内なら「同程度」
        "point_round_unit": 10,             # POINTの切り上げ単位(414→420)
        "compare_city_count": 5,
        "franchise": {"max": 3, "tiers": ["same_city", "adjacent", "same_prefecture"], "stop_at_first_tier": True},
    },
}
SECTION_NOTE = "※この情報は不動産価格を保証するものではありません。"
PRICE_NOTES = [
    "※この情報は不動産価格を保証するものではありません。",
    "※相場価格はSUUMOでの最終掲載時の価格をもとに算出しています。",
    "※相場価格は成約価格を表すものではありません",
]


def _deep(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        out[k] = _deep(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load_config(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    cfg = json.loads(text) if path.suffix == ".json" else yaml.safe_load(text)
    cfg = _deep(DEFAULTS, cfg or {})
    for k in ("company", "prefecture", "city"):
        if not cfg.get(k):
            raise ValueError(f"設定に {k} が必要です")
    cfg["prefecture"] = normalize_prefecture(cfg["prefecture"])
    created = cfg.get("created")
    if isinstance(created, dt.date):
        created = created.isoformat()
    cfg["created"] = created or dt.date.today().isoformat()
    cfg["_base"] = str(path.resolve().parent)
    return cfg


def fmt_date(iso: str) -> str:
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{y}/{m}/{d}"


class Report:
    def __init__(self):
        self.items: list[dict] = []

    def add(self, key: str, label: str, status: str, method: str = "", reason: str = ""):
        """status: auto=自動取得 / calc=計算 / input=設定値 / csv=CSV取込 / fixed=固定 / missing=未取得 / optional=任意の空欄"""
        self.items.append({"key": key, "label": label, "status": status, "method": method, "reason": reason})

    def missing(self):
        return [i for i in self.items if i["status"] == "missing"]


def _src(sec: dict, default: str, created: str, rep: Report, key: str) -> tuple[str, str]:
    src = sec.get("source")
    if not src:
        rep.add(f"{key}.source", f"{key} 出典名", "missing", reason="出典名(source)が未設定。設定ファイルに実際の出典を書いてください")
        src = "出典未設定"
    date = sec.get("date")
    if isinstance(date, dt.date):
        date = date.isoformat()
    if not date:
        date = created
        rep.add(f"{key}.date", f"{key} 取得日", "input", reason="date未設定のため作成日を表示")
    return src, fmt_date(str(date))


def build_model(cfg: dict, *, refresh: bool = False, cache_root: Path | None = None, offline: bool = False,
                franchise_csv: Path | None = None) -> tuple[dict, Report, dict]:
    """戻り値: (モデル, 取得レポート, 描画用の追加情報(地図SVG等))"""
    rep = Report()
    pref, city, created = cfg["prefecture"], cfg["city"], cfg["created"]
    base = Path(cfg["_base"])
    inputs = cfg.get("inputs") or {}
    opts = cfg["options"]
    now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    cache_root = cache_root or ROOT / "data" / "cache"
    extras: dict = {}

    # --- 行政区域(地図・隣接・市町村数) ---
    cache = cache_root / f"{pref}"
    prefecture = None
    try:
        prefecture = geo.Prefecture(pref, geo.fetch_prefecture(pref, cache, refresh))
        city = prefecture.resolve(city)
        rep.add("area.map", "対象市区町村の地図", "auto", geo.GEO_SOURCE)
    except geo.GeoError as e:
        if "見つかりません" in str(e):
            raise
        rep.add("area.map", "対象市区町村の地図", "missing", reason=str(e))
    munis = prefecture.count if prefecture else None
    neighbors = prefecture.neighbors(city) if prefecture else []
    area_code = prefecture.code(city) if prefecture else ""
    if prefecture:
        extras["map_svg"] = geo.render_svg(prefecture, city)

    model: dict = {
        "meta": {"company": cfg["company"], "prefecture": pref, "city": city, "created": created,
                 "created_display": fmt_date(created), "generated_at": now, "municipalities_in_prefecture": munis,
                 "area_code": area_code, "map_source": geo.GEO_LICENSE_NOTE},
    }

    # --- 対象エリア ---
    area_in = inputs.get("area") or {}
    hh = {"value": None}
    if area_in.get("households") is not None:
        hh = {"value": area_in["households"], "source": area_in.get("source", "入力値"), "method": "input",
              "fetched_at": str(area_in.get("date") or created)}
        rep.add("area.households", "世帯数", "input", "設定値")
    else:
        cached = cache / f"households_{area_code}.json"
        try:
            if offline:
                raise estat.EstatError("--offline 指定")
            if cached.exists() and not refresh:
                hh = {**json.loads(cached.read_text("utf8")), "method": "auto(cache)"}
            else:
                got = estat.fetch_households(area_code, stats_data_id=(cfg.get("estat") or {}).get("stats_data_id"))
                cache.mkdir(parents=True, exist_ok=True)
                got["fetched_at"] = now
                cached.write_text(json.dumps(got, ensure_ascii=False), "utf8")
                hh = {**got, "method": "auto"}
            rep.add("area.households", "世帯数", "auto", hh["source"])
        except estat.EstatError as e:
            rep.add("area.households", "世帯数", "missing",
                    reason=f"{e}。設定の inputs.area.households に入力(出典は inputs.area.source)")
    model["area"] = {"households": hh["value"], "households_source": hh.get("source"),
                     "households_date": fmt_date(str(hh.get("fetched_at", now))[:10]) if hh.get("value") else None}

    # 周辺加盟店
    fr_over = cfg.get("nearby_franchise")
    if fr_over:
        items = [{"name": r["name"], "area": r.get("area", ""), "url": r.get("url", ""), "tier": "override"} for r in fr_over]
        sel = {"items": items, "tiers_used": ["override"], "rule": "設定による上書き"}
        rep.add("area.franchise", "周辺加盟店", "input", "設定による上書き")
    else:
        fcsv = franchise_csv or ROOT / "data" / "franchises.csv"
        rows = franchise.load(fcsv)
        sel = franchise.select(rows, pref, city, neighbors, **{
            "max_count": opts["franchise"]["max"], "tiers": opts["franchise"]["tiers"],
            "stop_at_first_tier": opts["franchise"]["stop_at_first_tier"]})
        for it in sel["items"]:
            it["area"] = f"{it['prefecture']} {it['city']}"
        rep.add("area.franchise", "周辺加盟店", "auto" if rows else "missing", f"{fcsv.name} から選定",
                "" if rows else "加盟店一覧が空です。import-franchises で取り込んでください")
    model["area"]["franchise"] = sel

    # --- 年収 ---
    inc_in = copy.deepcopy(inputs.get("income") or {})
    if inc_in.get("municipalities_in_prefecture") is None and munis:
        inc_in["municipalities_in_prefecture"] = munis
    inc = C.income_view(city, pref, inc_in)
    inc["source"], inc["date"] = _src(inc_in, "", created, rep, "income")
    model["income"] = inc
    for k, lab in [("city_avg_man", "市の平均年収"), ("prefecture_avg_man", "県平均年収"), ("national_avg_man", "全国平均年収"),
                   ("rank_in_prefecture", "県内順位"), ("brackets", "年収階級別の世帯構成")]:
        _status(rep, f"income.{k}", lab, inc.get(k), "inputs.income." + k)

    # --- 価格推移 ---
    tr_in = copy.deepcopy(inputs.get("price_trend") or {})
    tr = C.trend_view(city, pref, tr_in, opts["trend_same_threshold_pt"])
    tr["source"], tr["date"] = _src(tr_in, "", created, rep, "price_trend")
    tr["ai_note"] = ["※以下の条件でAI査定した参考価格",
                     "・マンション：築10年/専有面積70㎡", "・一戸建て：築10年/延床面積70㎡", "・土地：敷地面積70㎡"]
    if tr_in.get("image"):
        tr["image"] = _asset(tr_in["image"], base, extras, "trend")
    model["price_trend"] = tr
    for k, lab in [("city_3y_pct", "市の3年上昇率"), ("prefecture_3y_pct", "県の3年上昇率"), ("yearly_pct", "年ごとの内訳")]:
        _status(rep, f"price_trend.{k}", lab, tr.get(k), "inputs.price_trend." + k)
    _status(rep, "price_trend.chart", "価格推移グラフ", tr.get("series") or tr.get("image"),
            "inputs.price_trend.series(数値)または inputs.price_trend.image(画像)")

    # --- 物件(CSV → 設定値で上書き) ---
    csv_stats: dict = {}
    csv_src = None
    if inputs.get("listings_csv"):
        p = (base / inputs["listings_csv"]).resolve()
        csv_stats = listings.summarize(p, city)
        csv_src = {"source": inputs.get("listings_source", "自社物件データ(CSV)"),
                   "date": inputs.get("listings_date", created)}
        rep.add("listings_csv", "物件データCSV", "csv", p.name)
    for key, label in [("land", "土地"), ("used_house", "中古戸建て"), ("used_mansion", "中古マンション"),
                       ("new_house", "新築戸建て")]:
        cs = dict(csv_stats.get(key, {}))
        if "count" in cs:
            cs["listings"] = cs.pop("count")
        sec_in = inputs.get(key) or {}
        sec = _deep(cs, copy.deepcopy(sec_in))
        from_csv = key in csv_stats
        src = sec_in.get("source") or inputs.get("listings_source") or (csv_src["source"] if from_csv else None)
        date = sec_in.get("date") or inputs.get("listings_date") or (csv_src["date"] if from_csv else None)
        sec["source"], sec["date"] = _src({"source": src, "date": date}, "", created, rep, key)
        if sec_in.get("heatmap_image"):
            sec["heatmap_image"] = _asset(sec_in["heatmap_image"], base, extras, f"heat_{key}")
        model[key] = sec
        _status(rep, f"{key}.price_man", f"{label} 売却価格相場", sec.get("price_man"), f"inputs.{key}.price_man またはCSV")
        _status(rep, f"{key}.listings", f"{label} 物件数", sec.get("listings"), f"inputs.{key}.listings またはCSV")
        if key != "land":   # サンプルでも土地(P5)に分布表は無い
            _status(rep, f"{key}.heatmap", f"{label} 面積×価格の分布",
                    sec.get("heatmaps") or sec.get("heatmap_image"), "物件データCSV または inputs.%s.heatmap_image" % key)
    land = model["land"]
    for k, lab in [("tsubo_price_man", "坪単価"), ("tsubo_price_low_rise_residential_man", "低層住居専用地域の坪単価"),
                   ("tsubo_price_other_residential_man", "その他の住居専用地域の坪単価")]:
        _status(rep, f"land.{k}", lab, land.get(k), f"inputs.land.{k} またはCSV(zone列)")
    # 土地まとめ(P10): P5と同じ取得元から
    ls_in = inputs.get("land_summary") or {}
    land["price_man"] = ls_in.get("price_man", land.get("price_man"))
    land["price_per_m2_man"] = ls_in.get("price_per_m2_man", land.get("price_per_m2_man"))
    land["land_area_median_m2"] = ls_in.get("land_area_median_m2", land.get("land_area_median_m2"))
    for k, lab in [("price_man", "土地 売却価格相場(まとめ用)"), ("price_per_m2_man", "土地 ㎡単価"),
                   ("land_area_median_m2", "土地 土地面積(中央値)")]:
        _status(rep, f"land_summary.{k}", lab, land.get(k), f"inputs.land.{k} またはCSV")
    low, oth, allp = (land.get("tsubo_price_low_rise_residential_man"), land.get("tsubo_price_other_residential_man"),
                      land.get("tsubo_price_man"))
    land["tsubo_note"] = bool(allp is not None and low is not None and oth is not None and allp < min(low, oth))
    land["compare"] = _compare(cfg, land, city, prefecture, neighbors, rep, opts)

    # --- キーワード ---
    kw_in = inputs.get("keywords") or {}
    terms = kw_in.get("terms") or ["土地", "中古マンション", "不動産", "中古物件"]
    given = {r.get("term"): r for r in kw_in.get("rows", [])}
    rows = []
    for t in terms:
        r = given.get(t) or {}
        rows.append({"keyword": f"{city}　{t}", "term": t, "monthly_volume": r.get("monthly_volume"),
                     "cpc_low_yen": r.get("cpc_low_yen"), "cpc_high_yen": r.get("cpc_high_yen")})
        _status(rep, f"keywords.{t}", f"検索ボリューム「{city} {t}」", r.get("monthly_volume"),
                "inputs.keywords.rows(term/monthly_volume/cpc_low_yen/cpc_high_yen)。Google広告APIは未接続")
    rows.sort(key=lambda r: -(r["monthly_volume"] or -1))
    ksrc, kdate = _src(kw_in if kw_in.get("source") else {**kw_in, "source": "google広告調べ" if given else None},
                       "", created, rep, "keywords")
    model["keywords"] = {"rows": rows, "source": ksrc, "date": kdate}

    # --- まとめ(P10): P5〜P8の値から集計・転記(二重入力なし) ---
    counts = {t: model[t].get("listings") for t in C.TYPES}
    prices = {t: model[t].get("price_man") for t in C.TYPES}
    total = C.listings_total(counts)
    bu = C.brokerage_unit(prices, counts)
    summary = {"listings_total": total, "brokerage_unit_man": None if bu is None else round(bu + 1e-9, 2)}
    summary["brokerage_unit_display_man"] = None if bu is None else int(C.round_half_up(bu, 0))
    summary["point_listings_rounded"] = None if total is None else C.point_rounded(total, opts["point_round_unit"])
    summary["point_text"] = None if total is None else C.point_text(total, opts["point_round_unit"])
    sdates = [model[t]["date"] for t in C.TYPES]
    summary["source"] = "・".join(dict.fromkeys(model[t]["source"] for t in C.TYPES))
    summary["date"] = sdates[0] if len(set(sdates)) == 1 else max(sdates)
    model["totals"] = summary
    rep.add("totals.listings_total", "物件総数", "calc" if total is not None else "missing",
            "4種別の物件数の合計", "" if total is not None else "4種別すべての物件数が必要")
    rep.add("totals.brokerage_unit", "仲介単価", "calc" if bu is not None else "missing",
            "各種別(相場×3%+6万円)の物件数による加重平均(税抜)", "" if bu is not None else "4種別すべての相場と物件数が必要")

    # --- 近隣不動産会社 ---
    comps = cfg.get("competitors") or []
    model["competitors"] = {
        "items": [{"name": c["name"], "area": c.get("area", city), "url": c.get("url", ""),
                   "listing_count": c.get("listing_count")} for c in comps],
        "queries": [f"{city}　不動産", f"{city}　土地", f"{city}　中古"],
    }
    rep.add("competitors", "近隣不動産会社3社", "input" if len(comps) >= 3 else "missing",
            "設定値" if comps else "",
            "" if len(comps) >= 3 else "検索結果の自動取得は規約上行わない。設定の competitors に3社を入力(検索語はdata.json参照)")
    for c in model["competitors"]["items"]:
        rep.add(f"competitors.count.{c['name']}", f"{c['name']} 掲載物件数", "input" if c["listing_count"] is not None else "optional",
                "設定値" if c["listing_count"] is not None else "",
                "" if c["listing_count"] is not None else "各社サイトの構造が異なり自動取得しない。任意(サンプルも空欄)。competitors[].listing_count に入力")
    model["cta_url"] = cfg.get("cta_url") or None
    _ensure(model)
    rep.add("hero", "ヒーロー・結論の指標", "calc", "入力値と計算値から生成")
    rep.add("fixed.listings_image", "加盟店様の物件情報量(画像)", "fixed", "assets/fixed/franchise-listings.png")
    rep.add("fixed.question", "問いかけ", "fixed", "サンプルから流用")
    return model, rep, extras


def _status(rep: Report, key: str, label: str, value, hint: str):
    if value in (None, "", [], {}):
        rep.add(key, label, "missing", reason=f"未入力。{hint}")
    else:
        rep.add(key, label, "input", "設定値/CSV")


def _asset(rel: str, base: Path, extras: dict, name: str) -> str:
    p = (base / rel).resolve()
    out = f"assets/user/{name}{p.suffix.lower()}"
    extras.setdefault("copy", {})[out] = str(p)
    return out


def _compare(cfg, land, city, prefecture, neighbors, rep, opts):
    given = (cfg.get("compare_cities") or (cfg.get("inputs") or {}).get("land", {}).get("compare_cities"))
    n = opts["compare_city_count"]
    suggestion = [x for x in neighbors if x.endswith("市")][:max(0, n - 1)]
    items = []
    for r in given or []:
        r = dict(r)
        r["highlight"] = (r["city"] == city)
        items.append(r)
    if items and not any(r["highlight"] for r in items):
        items.append({"city": city, "tsubo_price_man": land.get("tsubo_price_man"), "listings": land.get("listings"),
                      "highlight": True})
    for r in items:
        if r["highlight"]:
            r["tsubo_price_man"] = land.get("tsubo_price_man", r.get("tsubo_price_man"))
            r["listings"] = land.get("listings", r.get("listings"))
    if not items:
        rep.add("land.compare", "土地 比較5市の坪単価・物件数", "missing",
                reason=("比較市の値が未入力。既定ルール(同一県の人口上位2市+隣接市の人口上位2市)の人口データは未接続のため、"
                        f"隣接市(境界の長い順)を候補として提示: {', '.join(suggestion)}。"
                        "inputs.land.compare_cities に city/tsubo_price_man/listings を入力"))
    else:
        bad = [r["city"] for r in items if r.get("tsubo_price_man") is None or r.get("listings") is None]
        rep.add("land.compare", "土地 比較5市の坪単価・物件数", "missing" if bad else "input",
                "設定値", f"値が欠けている市: {', '.join(bad)}" if bad else "")
    return {"items": items, "suggested": suggestion}


_KEYS = {
    "income": ["city_avg_man", "prefecture_avg_man", "national_avg_man", "rank_in_prefecture", "municipalities_in_prefecture",
               "headline", "body", "brackets", "largest_bracket", "share_sum", "diff_vs_national_man"],
    "price_trend": ["city_3y_pct", "prefecture_3y_pct", "yearly_pct", "series", "image", "body", "judgement_vs_prefecture"],
    "land": ["tsubo_price_man", "tsubo_price_low_rise_residential_man", "tsubo_price_other_residential_man", "listings",
             "price_man", "price_per_m2_man", "land_area_median_m2", "heatmaps", "heatmap_image"],
    "used_house": ["price_man", "listings", "building_area_median_m2", "land_area_median_m2", "age_median_years",
                   "heatmaps", "heatmap_image"],
    "used_mansion": ["price_man", "listings", "exclusive_area_median_m2", "age_median_years", "heatmaps", "heatmap_image"],
    "new_house": ["price_man", "listings", "building_area_median_m2", "land_area_median_m2", "heatmaps", "heatmap_image"],
}


def _ensure(model: dict) -> None:
    """テンプレートが参照するキーを必ず存在させる(未取得は None)。"""
    for sec, keys in _KEYS.items():
        for k in keys:
            model[sec].setdefault(k, None)
