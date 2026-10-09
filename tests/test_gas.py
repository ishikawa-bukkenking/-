"""Apps Script 版(gas/)が Python 版と同じ結果を出すことの突き合わせテスト(node が必要)。"""
import csv
import json
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

from areasheet import cli, listings
from areasheet.pipeline import ROOT
from conftest import make_listings_csv

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node が無い")
GAS = ROOT / "gas"


def _plain(o):
    if isinstance(o, dict):
        return {k: _plain(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_plain(v) for v in o]
    return o.isoformat() if hasattr(o, "isoformat") else o


def run_js(**inp):
    subprocess.run(["python3", str(GAS / "build.py")], check=True, capture_output=True)
    r = subprocess.run(["node", str(GAS / "test" / "run.js")], input=json.dumps(inp), capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def py_model(tmp_path, cfg, name):
    p = tmp_path / f"{name}.yaml"
    p.write_text(yaml.safe_dump(cfg, allow_unicode=True), "utf8")
    res = cli.generate(p, out_root=tmp_path / "out", pdf=False, offline=True)
    return json.loads((Path(res["dir"]) / "data.json").read_text("utf8"))


def geo_dir(pref):
    return str(ROOT / "data" / "cache" / pref)


def franchises():
    return list(csv.DictReader((ROOT / "data" / "franchises.csv").open(encoding="utf-8-sig")))


def same(a, b):
    if isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in b)
    if isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    return a == pytest.approx(b) if isinstance(b, (int, float)) and not isinstance(b, bool) else a == b


def compare_models(py, js):
    for sec in ("totals", "income", "price_trend", "used_house", "used_mansion", "new_house"):
        for k, v in py["model"][sec].items():
            if k in ("source", "date", "ai_note", "heatmaps", "heatmap_image", "image", "series") or v is None:
                continue
            assert same(js["model"][sec][k], v), (sec, k, js["model"][sec][k], v)
    for k in ("tsubo_price_man", "listings", "price_man", "tsubo_note"):
        assert js["model"]["land"][k] == py["model"]["land"][k], k
    assert [r["keyword"] for r in js["model"]["keywords"]["rows"]] == [r["keyword"] for r in py["model"]["keywords"]["rows"]]
    assert [f["name"] for f in js["model"]["area"]["franchise"]["items"]] == [f["name"] for f in py["model"]["area"]["franchise"]["items"]]
    assert js["model"]["land"]["compare"]["suggested"] == py["model"]["land"]["compare"]["suggested"]
    assert js["model"]["meta"]["municipalities_in_prefecture"] == py["model"]["meta"]["municipalities_in_prefecture"]
    pm = {i["key"] for i in py["report"] if i["status"] == "missing"}
    jm = {i["key"] for i in js["report"] if i["status"] == "missing"}
    assert pm == jm, (pm ^ jm)


def test_ueda_parity(tmp_path):
    cfg = _plain(yaml.safe_load((ROOT / "configs" / "example-ueda.yaml").read_text("utf8")))
    py = py_model(tmp_path, cfg, "ueda")
    js = run_js(cfg=cfg, franchiseRows=franchises(), listingRows=[], geoDir=geo_dir("長野県"))
    compare_models(py, js)
    assert all(c["ok"] for c in js["checks"]), js["checks"]
    assert "noindex" in js["html"] and "https://cdn." not in js["html"]


def test_listings_csv_parity(tmp_path):
    csvp = make_listings_csv(tmp_path / "l.csv")
    cfg = {"company": "株式会社テスト工務店", "prefecture": "愛知県", "city": "岡崎市", "created": "2026-02-03",
           "inputs": {"listings_csv": str(csvp), "listings_source": "ダミー", "listings_date": "2026-02-01"}}
    py = py_model(tmp_path, cfg, "ok")
    rows = [{"type": r["type"], "price_man": float(r["price_man"]),
             **{k: (float(r[k]) if r[k] else None) for k in ("land_area_m2", "building_area_m2", "exclusive_area_m2", "age_years")},
             "zone": r["zone"]} for r in csv.DictReader(csvp.open(encoding="utf8"))]
    jcfg = {k: v for k, v in cfg.items()}
    jcfg["inputs"] = {"listings_source": "ダミー", "listings_date": "2026-02-01"}
    js = run_js(cfg=jcfg, franchiseRows=franchises(), listingRows=rows, geoDir=geo_dir("愛知県"))
    compare_models(py, js)
    for t in ("used_house", "new_house", "used_mansion"):
        assert js["model"][t]["heatmaps"].keys() == py["model"][t]["heatmaps"].keys()
        for k, h in py["model"][t]["heatmaps"].items():
            assert js["model"][t]["heatmaps"][k]["grid"] == h["grid"], (t, k)
    assert js["model"]["land"]["tsubo_price_low_rise_residential_man"] == py["model"]["land"]["tsubo_price_low_rise_residential_man"]
    assert all(c["ok"] for c in js["checks"])
    for s in ["上田", "リフォームワン", "ミライズ", "株式会社○○"]:
        assert s not in js["html"]


def sheet_values(cfg):
    """設定 → シートの「キー→表示文字列」(人が入力する形)"""
    i = cfg["inputs"]
    v = {"company": cfg["company"], "prefecture": cfg["prefecture"], "city": cfg["city"], "created": cfg["created"]}

    def put(prefix, d):
        for k, x in d.items():
            if isinstance(x, (str, int, float)):
                v[f"{prefix}.{k}"] = str(x)
    put("inputs.area", i["area"])
    put("inputs.income", {k: x for k, x in i["income"].items() if k != "brackets"})
    for n, b in enumerate(i["income"]["brackets"]):
        if "households" in b:
            v[f"bracket_hh.{n}"] = str(b["households"])
        v[f"bracket_sh.{n}"] = str(round(b["share"] * 100, 1))
    put("inputs.price_trend", {k: x for k, x in i["price_trend"].items() if k != "yearly_pct"})
    for n, y in enumerate(i["price_trend"]["yearly_pct"]):
        v[f"yearly.{n}"] = str(y)
    v["inputs.listings_source"], v["inputs.listings_date"] = i["listings_source"], str(i["listings_date"])
    for sec in ("land", "used_house", "used_mansion", "new_house"):
        put(f"inputs.{sec}", {k: x for k, x in i[sec].items() if k != "compare_cities"})
    for n, c in enumerate(i["land"]["compare_cities"]):
        v[f"compare.{n}"] = f"{c['city']},{c['tsubo_price_man']},{c['listings']}"
    v["inputs.keywords.source"], v["inputs.keywords.date"] = i["keywords"]["source"], str(i["keywords"]["date"])
    for r in i["keywords"]["rows"]:
        v[f"kw.{r['term']}"] = f"{r['monthly_volume']},{r['cpc_low_yen']},{r['cpc_high_yen']}"
    for n, c in enumerate(cfg["competitors"]):
        v[f"comp.{n}"] = f"{c['name']},{c['area']},{c['url']}"
    return v


def test_sheet_input_gives_same_result_as_config(tmp_path):
    cfg = _plain(yaml.safe_load((ROOT / "configs" / "example-ueda.yaml").read_text("utf8")))
    py = py_model(tmp_path, cfg, "ueda")
    js = run_js(vals=sheet_values(cfg), franchiseRows=franchises(), listingRows=[], geoDir=geo_dir("長野県"))
    compare_models(py, js)
    assert js["model"]["totals"]["listings_total"] == 414 and js["model"]["totals"]["brokerage_unit_display_man"] == 47


def test_blank_sheet_reports_missing_not_guesses(tmp_path):
    js = run_js(vals={"company": "株式会社テスト", "prefecture": "長野県", "city": "上田市"}, franchiseRows=franchises(),
                listingRows=[], geoDir=geo_dir("長野県"))
    assert js["model"]["totals"]["listings_total"] is None and js["model"]["income"]["body"] is None
    assert len([i for i in js["report"] if i["status"] == "missing"]) > 20
    assert "未入力" in js["html"]


def run_node(script, inp, *args):
    subprocess.run(["python3", str(GAS / "build.py")], check=True, capture_output=True)
    r = subprocess.run(["node", str(GAS / "test" / script), *args], input=json.dumps(inp), capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_input_system_api(tmp_path):
    """入力システムのサーバー側: 認証・作成・保存・検証・固定出典・入力日の自動記録・画像・加盟店・設定・URL作り直し"""
    cfg = _plain(yaml.safe_load((ROOT / "configs" / "example-ueda.yaml").read_text("utf8")))
    vals = {k: v for k, v in sheet_values(cfg).items() if k not in ("company", "prefecture", "city")}
    r = run_node("api_test.js", dict(values=vals, geoDir=geo_dir("長野県")))
    assert r["pwLen"] == 12 and r["pwKept"] and r["urlKept"]            # 初期設定の再実行で設定を壊さない
    assert r["autoUrl"] == "https://script.test/exec"                    # 公開URLはデプロイ済みURLを自動で使う
    assert all(r["noPwApi"]) and all(r["noPwApi2"])                      # パスワード無しでは全APIが拒否される
    assert r["login"] and r["createdId"] == 16
    assert not r["metaHasCta"] and not r["metaHasSource"] and not r["metaHidden"]   # 問い合わせURL・出典・取得日・自動記録は入力欄に出ない
    assert r["imageKeys"] == ["inputs.price_trend.image", "inputs.used_house.heatmap_image",
                              "inputs.used_mansion.heatmap_image", "inputs.new_house.heatmap_image"]
    assert set(r["valErr"]["errors"]) == {"inputs.income.city_avg_man", "bogus", "auto.date.income", "compare.0", "inputs.price_trend.image"}
    assert r["valErr"]["saved"] == 1                                     # 正しい項目だけ保存される
    assert r["save"]["errors"] == {} and r["dateAuto"] and r["createdAuto"]
    assert r["upBad"][0] and r["upBad"][1]                               # 画像以外の項目・画像以外のデータは拒否
    assert r["imgFlags"]["inputs.price_trend.image"] and r["imgRef"] and r["oldTrashed"] and r["clearedImg"]
    assert r["lpImgCount"] == 3 and r["lpFixedSources"] and r["lpDate"] and r["lpNoCta"]   # 画像(価格推移・分布表)+固定の加盟店画像
    assert r["totals"] == {"listings_total": 414, "brokerage": 47} and r["checksNg"] == []
    assert (r["fr0"], r["fr1"], r["fr2"]) == (2, 3, 2) and r["frBad"] and r["frStopped"]
    assert r["setBad"] and r["pwShort"] and r["settings"] == [1, 2, 50, "APPID"] and r["oldPwDead"] and r["point50"]
    assert r["rotated"] and r["lpBadId2"] and r["appPage"]
    assert r["noOldMenus"] == ["undefined"] * 4                          # 旧メニュー関数は残さない(web公開側から呼べないように)
    assert "ロック" in r["locked"]                                       # 誤りが続くと正しいパスワードでも拒否


def test_input_screen_in_browser(tmp_path):
    chrome = next(iter(sorted(Path("/opt/pw-browsers").glob("chromium-*/chrome-linux/chrome"))), None)
    import os
    core = os.environ.get("PLAYWRIGHT_CORE") or (str(ROOT / "node_modules" / "playwright-core" / "index.mjs")
                                                  if (ROOT / "node_modules" / "playwright-core").exists() else "")
    if not chrome or not core:
        pytest.skip("ブラウザまたは playwright-core が無い(npm i playwright-core / PLAYWRIGHT_CORE)")
    env = {**os.environ, "CHROME": str(chrome), "PLAYWRIGHT_CORE": core}
    r = subprocess.run(["node", str(GAS / "test" / "ui_test.mjs"), geo_dir("愛知県"), str(tmp_path)],
                       capture_output=True, text=True, env=env)
    assert r.returncode == 0, r.stderr[-800:]
    log = json.loads(r.stdout)
    assert "パスワードが違" in log["wrongPw"] and log["title"].endswith("岡崎市") and log["errors"] == []
    assert log["sheet"]["hh"] == "150000" and log["sheet"]["cmp"] == "豊田市,12,80" and log["sheet"]["pref"] == ""  # 不正値は保存されない
    assert log["badShown"] == 1 and log["hscroll"] == "375/375"
    assert log["imageSaved"] and log["fieldsNoCta"] == 0 and log["noSourceFields"] == 0 and log["frAdded"] and log["settingMax"] == 2
