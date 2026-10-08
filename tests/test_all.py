import json
from pathlib import Path

import pytest
import yaml

from areasheet import cli, compute as C, franchise, jp, listings
from areasheet.pipeline import ROOT
from conftest import make_listings_csv

SAMPLE = json.loads((Path(__file__).parent / "fixtures" / "sample_ueda.json").read_text("utf8"))


# --- 純粋な計算(サンプルの数値で検証) ---
def test_totals_and_brokerage():
    s = SAMPLE
    types = {"used_mansion": "used_mansion", "land": "land_summary", "new_house": "new_house", "used_house": "used_house"}
    counts = {"used_mansion": 4, "land": 90, "new_house": 81, "used_house": 239}
    prices = {"used_mansion": 700, "land": 766, "new_house": 2280, "used_house": 1280}
    assert C.listings_total(counts) == s["totals"]["listings_total"] == 414
    assert round(C.brokerage_unit(prices, counts), 2) == 46.75
    assert C.point_rounded(414, 10) == s["totals"]["point_listings_rounded"]


def test_texts_match_sample():
    inc = SAMPLE["income"]
    v = C.income_view("上田市", "長野県", {"city_avg_man": 476, "national_avg_man": 503, "rank_in_prefecture": 72,
                                         "municipalities_in_prefecture": 77,
                                         "brackets": [{"label": "300万未満", "share": .389, "households": 24340},
                                                      {"label": "300万〜500万未満", "share": .285}, {"label": "500万〜700万未満", "share": .167},
                                                      {"label": "700万〜1000万未満", "share": .106}, {"label": "1000万以上", "share": .053}]})
    assert v["headline"] == inc["headline"] and v["body"] == inc["body"]
    t = C.trend_view("上田市", "長野県", {"prefecture_3y_pct": 7.28, "yearly_pct": [0.83, 0.01, 6.38]})
    assert t["body"] == SAMPLE["price_trend"]["body"] and t["judgement_vs_prefecture"] == "同程度"


def test_trend_judge_threshold():
    assert C.trend_judge(9, 7.28) == "高い" and C.trend_judge(5, 7.28) == "低い" and C.trend_judge(7.2, 7.28, 0.1) == "同程度"


def test_jp_format():
    assert jp.round_half_up(46.75, 0) == 47 and jp.num(70809) == "70,809" and jp.num(12.8) == "12.8"


# --- 加盟店の選定 ---
ROWS = [{"name": "A", "prefecture": "長野県", "city": "上田市"}, {"name": "B", "prefecture": "長野県", "city": "東御市"},
        {"name": "C", "prefecture": "長野県", "city": "松本市"}, {"name": "D", "prefecture": "愛知県", "city": "岡崎市"}]


def test_franchise_tiers():
    s = franchise.select(ROWS, "長野県", "上田市", ["東御市"])
    assert [r["name"] for r in s["items"]] == ["A"]
    s = franchise.select(ROWS, "長野県", "小諸市", ["東御市"])
    assert [r["name"] for r in s["items"]] == ["B"]
    s = franchise.select(ROWS, "長野県", "小諸市", ["軽井沢町"])
    assert [r["name"] for r in s["items"]] == ["A", "B", "C"][:3]
    assert franchise.select(ROWS, "静岡県", "浜松市", [])["items"] == []


def test_franchise_import_kml(tmp_path):
    kml = tmp_path / "m.kml"
    kml.write_text('<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>テスト工務店</name>'
                   '<description>https://example.com/ 愛知県岡崎市康生町1-1</description><address>愛知県岡崎市康生町1-1</address>'
                   '</Placemark></Document></kml>', "utf8")
    dest = tmp_path / "f.csv"
    n, bad = franchise.import_file(kml, dest)
    row = franchise.load(dest)[0]
    assert n == 1 and not bad and row["city"] == "岡崎市" and row["url"] == "https://example.com/"


def test_listings_csv(tmp_path):
    st = listings.summarize(make_listings_csv(tmp_path / "l.csv"))
    assert st["land"]["count"] == 60 and st["land"]["tsubo_price_low_rise_residential_man"] is not None
    assert st["used_house"]["heatmaps"]["land_area_m2"]["max"] > 0


# --- 生成の通しテスト(行政区域データの取得にネットワークが必要) ---
def _gen(tmp_path, cfg, name):
    p = tmp_path / f"{name}.yaml"
    p.write_text(yaml.safe_dump(cfg, allow_unicode=True), "utf8")
    return cli.generate(p, out_root=tmp_path / "out", pdf=False, offline=True)


def test_regression_ueda(tmp_path):
    cfg = yaml.safe_load((ROOT / "configs" / "example-ueda.yaml").read_text("utf8"))
    res = _gen(tmp_path, cfg, "ueda")
    assert res["checks"]["ok"], res["checks"]
    m = json.loads((Path(res["dir"]) / "data.json").read_text("utf8"))["model"]
    assert m["totals"]["listings_total"] == SAMPLE["totals"]["listings_total"]
    assert m["totals"]["brokerage_unit_display_man"] == SAMPLE["totals"]["brokerage_unit_man"]
    assert m["income"]["body"] == SAMPLE["income"]["body"]
    assert m["meta"]["municipalities_in_prefecture"] == SAMPLE["income"]["municipalities_in_prefecture"]
    assert [r["keyword"] for r in m["keywords"]["rows"]][:2] == ["上田市　土地", "上田市　中古マンション"]
    assert [f["name"] for f in m["area"]["franchise"]["items"]] == [f["name"] for f in SAMPLE["area"]["nearby_franchise"]]
    html = (Path(res["dir"]) / "index.html").read_text("utf8")
    assert 'name="robots" content="noindex' in html and "https://fonts." not in html and "cdn." not in html


def test_no_residue_other_city(tmp_path):
    csv = make_listings_csv(tmp_path / "l.csv")
    cfg = {"company": "株式会社テスト工務店", "prefecture": "愛知県", "city": "岡崎市", "created": "2026-02-03",
           "cta_url": "https://example.com/contact",
           "competitors": [{"name": f"ダミー不動産{i}", "area": "岡崎市", "url": f"https://example.com/{i}"} for i in range(3)],
           "inputs": {"listings_csv": str(csv), "listings_source": "ダミーCSV", "listings_date": "2026-02-01",
                      "area": {"households": 150000, "source": "ダミー"},
                      "income": {"source": "ダミー", "date": "2026-02-01", "city_avg_man": 520, "prefecture_avg_man": 540,
                                 "national_avg_man": 503, "rank_in_prefecture": 20,
                                 "brackets": [{"label": l, "households": h} for l, h in zip(
                                     ["300万未満", "300万〜500万未満", "500万〜700万未満", "700万〜1000万未満", "1000万以上"], [20, 30, 25, 15, 10])]},
                      "price_trend": {"source": "ダミー", "date": "2026-02-01", "prefecture_3y_pct": 5.0, "yearly_pct": [1.0, 2.0, 4.0],
                                      "series": {"labels": ["2023", "2024", "2025"], "中古マンション": [1000, 1100, 1300],
                                                 "中古戸建て": [1500, 1550, 1600], "土地": [500, 510, 520]}},
                      "keywords": {"source": "ダミー", "date": "2026-02-01",
                                   "rows": [{"term": "土地", "monthly_volume": 500, "cpc_low_yen": 5, "cpc_high_yen": 100}]}}}
    res = _gen(tmp_path, cfg, "okazaki")
    assert res["checks"]["ok"], [r for r in res["checks"]["results"] if not r["ok"]]
    html = (Path(res["dir"]) / "index.html").read_text("utf8")
    for s in ["上田", "リフォームワン", "ミライズ", "株式会社○○", "ピタットハウス", "長野"]:
        assert s not in html
    assert "岡崎市" in html and "2026/2/3" in html and "周辺に加盟店なし" in html and "お問い合わせ" in html
    assert 'class="heat"' in html and "<polyline" in html


def test_unknown_city_is_rejected(tmp_path):
    with pytest.raises(Exception, match="見つかりません"):
        _gen(tmp_path, {"company": "x", "prefecture": "愛知県", "city": "存在しない市"}, "bad")
