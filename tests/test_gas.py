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
    """入力システムのサーバー側: メールでの利用者確認・会社とエリア・保存・検証・固定出典・入力日の自動記録・画像・加盟店・設定"""
    cfg = _plain(yaml.safe_load((ROOT / "configs" / "example-ueda.yaml").read_text("utf8")))
    vals = {k: v for k, v in sheet_values(cfg).items() if k not in ("company", "prefecture", "city")}
    fx = ROOT / "tests" / "fixtures"
    r = run_node("api_test.js", dict(values=vals, geoDir=geo_dir("長野県"), rawCsv1=(fx / "franchise_raw_1.csv").read_text("utf-8"),
                                     rawCsv2=(fx / "franchise_raw_2.csv").read_text("utf-8")))
    assert r["sheets0"] == "エリア,会社,加盟店一覧,設定" and r["sheetsAfter"] and r["sheetsEnd"]   # 商談ごとにタブは増えない
    assert r["seedCount"] == 201                                                   # 添付CSVから作った加盟店一覧が最初から入る
    # ログイン: メールアドレスが @bukkenking.com のアカウントだけ(取得できない/社外/なりすましは全APIが拒否)
    assert r["deniedNoEmail"] and r["deniedGmail"] and r["deniedLookalike"] and r["whoami"] == "ishikawa@bukkenking.com"
    assert r["companies"] == 2 and r["areasOfFirst"] == 2 and r["siblings"] == 2    # 1社に複数のエリア
    assert all(r["badCreate"]) and r["metaClean"]
    assert r["imageKeys"] == ["inputs.price_trend.image", "inputs.used_house.heatmap_image",
                              "inputs.used_mansion.heatmap_image", "inputs.new_house.heatmap_image"]
    assert set(r["valErr"]["errors"]) == {"inputs.income.city_avg_man", "bogus", "auto.date.income", "compare.0", "inputs.price_trend.image", "company"}
    assert r["valErr"]["saved"] == 1 and r["save"]["errors"] == {} and r["dateAuto"]  # 正しい項目だけ保存/取得日は自動
    assert r["upBad"][0] and r["upBad"][1] and r["imgRef"] and r["oldTrashed"]
    assert r["lpImgCount"] == 3 and r["lpFixedSources"] and r["lpHas414"] and r["lpNoCta"] and r["lpAnonOk"]
    assert r["totals"] == {"listings_total": 414, "brokerage": 47} and r["checksNg"] == [] and r["missingStored"] == 3
    assert r["area2"] and r["status2"]                                              # 同じ会社の別エリアは別データ・別LP
    assert r["fr1"] and r["fr2"]                                                    # 上田市=同一市の2社、東御市=木楽ホーム
    assert r["frAdd"] and r["frBad"] and r["frStopped"] and r["frDel"] and r["frStoppedKept"]
    assert r["imp1"] == [0, 188, 0] and r["imp2"] == [0, 14, 0]                     # 添付CSVの再取り込みは更新のみ(重複しない)
    assert r["imp3"][:2] == [1, 0] and r["imp3"][2] == ["住所不明株式会社"] and r["impBad"]
    assert all(r["setBad"]) and r["settings"] == [1, 2, 50, "APPID", "https://script.google.com/macros/s/AKfycbxTEST/exec"]
    assert r["listUrl"] and r["point50"] and r["rotated"] and all(r["lpBadId"])
    assert r["areaDeleted"] and r["imagesTrashed"] and r["renamed"] and r["companyDeleted"]
    assert r["appPage"] and r["noOldFns"] == ["undefined"] * 6                      # パスワード方式・旧メニューは残さない


def test_franchise_csv_import_matches_python(tmp_path):
    """添付の加盟店CSV: 屋号・対応エリアの分離、改行で分断された行の結合、住所から市区町村の判定(Python版とJS版で一致)"""
    from areasheet import franchise
    fx = ROOT / "tests" / "fixtures"
    dest = tmp_path / "f.csv"
    for f in ("franchise_raw_1.csv", "franchise_raw_2.csv"):
        n, bad = franchise.import_file(fx / f, dest)
        assert bad == []
    rows = franchise.load(dest)
    assert len(rows) == 201
    by = {r["name"]: r for r in rows}
    assert by["株式会社TRUNK 不動産"]["city"] == "豊田市" and by["株式会社TRUNK 不動産"]["shop"].startswith("TRUNK不動産")   # 分断された名称
    assert by["株式会社イワベニ（ジオリーブグループ）"]["city"] == "盛岡市"                                                 # 郵便番号だけの住所の続き
    assert by["株式会社松下建設佐世保支店"]["city"] == "佐世保市" and by["株式会社松下建設佐世保支店"]["shop"] == "トチスマショップ佐世保店"
    assert by["スヴァーリエヒュース株式会社"]["city"] == "昭和町"                                                           # 郡は落とす
    assert by["株式会社横浜ホームビルド"]["city"] == "横浜市" and by["グッドハート株式会社"]["prefecture"] == "熊本県"        # 区は市に統合/県の補完
    assert "旧" not in "".join(r["name"] for r in rows)                                                                      # （旧：…）は表示名から除く
    # JS版(入力システムの取り込み)と同じ結果
    js = subprocess.run(["node", "-e", """
const fs=require('fs'),vm=require('vm');const ctx=vm.createContext({console});
vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),ctx);
let all=[];for(const f of process.argv.slice(2)){ctx.t=fs.readFileSync(f,'utf8');all.push(...vm.runInContext('parseFranchiseAny_(t)',ctx).rows);}
console.log(JSON.stringify(all));""", str(GAS / "dist" / "Bundle.gs"), str(fx / "franchise_raw_1.csv"), str(fx / "franchise_raw_2.csv")],
        capture_output=True, text=True)
    assert js.returncode == 0, js.stderr[-500:]
    jrows = {(r["name"], r["address"]): r for r in json.loads(js.stdout)}
    assert len(jrows) == 201
    for r in rows:
        j = jrows[(r["name"], r["address"])]
        assert (j["prefecture"], j["city"], j["shop"], j["service_area"]) == (r["prefecture"], r["city"], r["shop"], r["service_area"])


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
    assert "使えません" in log["deniedMsg"] and log["who"] == "ishikawa@bukkenking.com" and log["noLogin"] == 0   # パスワード欄は無い
    assert log["title"].endswith("岡崎市") and log["errors"] == []
    assert log["stored"]["hh"] == "150000" and log["stored"]["cmp"] == "豊田市,12,80" and log["stored"]["pref"] == ""  # 不正値は保存されない
    assert log["stored"]["date"] and log["badShown"] == 1 and log["hscroll"] == "375/375"
    assert log["imageSaved"] and log["fieldsNoCta"] == 0 and log["noSourceFields"] == 0
    assert log["sibChips"] == 2 and log["areasOfCompany"] == 2 and log["sheetNames"] == "エリア,会社,加盟店一覧,設定"   # 会社にエリアを追加。タブは増えない
    assert log["frShown"] == "登録済み(201件)" and log["frSearch"] == 3 and log["frImported"]
    assert log["settingMax"] == 2 and log["settingUrl"].endswith("/exec")
