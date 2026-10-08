"""品質チェック(サンプルの「作成確認事項」スライドの自動化 + 内部整合性)。"""
from __future__ import annotations

import re
from pathlib import Path

from . import compute as C
from .jp import num

SAMPLE_STRINGS = ["上田", "リフォームワン", "ミライズ", "株式会社○○", "ピタットハウス", "ハウスドゥ", "アールハウス",
                  "one-estate.jp", "me-rise-fudosan", "pitat.com", "housedo.com", "rhouse.co.jp", "○○市", "長野"]


def consistency(model: dict) -> list[dict]:
    res = []

    def chk(name, ok, detail=""):
        res.append({"name": name, "ok": bool(ok), "detail": detail})

    counts = {t: model[t].get("listings") for t in C.TYPES}
    prices = {t: model[t].get("price_man") for t in C.TYPES}
    t = model["totals"]
    if t["listings_total"] is not None:
        chk("物件総数＝種別ごとの物件数の合計", t["listings_total"] == sum(counts.values()), f"{counts}")
        bu = sum((prices[k] * 0.03 + 6) * counts[k] for k in C.TYPES) / sum(counts.values())
        chk("仲介単価＝Σ(相場×3%+6万円)×物件数 / 物件総数(税抜)", abs(bu - t["brokerage_unit_man"]) < 0.01
            and t["brokerage_unit_display_man"] == int(bu + 0.5), f"{bu:.2f}")
        chk("POINT件数＝物件総数の切り上げ", t["point_listings_rounded"] >= t["listings_total"])
    tr = model["price_trend"]
    if tr.get("yearly_pct") and tr.get("city_3y_pct") is not None:
        chk("3年上昇率＝内訳の合計", abs(sum(tr["yearly_pct"]) - tr["city_3y_pct"]) <= 0.015,
            f"{sum(tr['yearly_pct']):.2f} vs {tr['city_3y_pct']}")
    inc = model["income"]
    if inc.get("share_sum") is not None:
        chk("年収階級の構成比の合計＝100%(±0.5)", abs(inc["share_sum"] * 100 - 100) <= 0.5, f"{inc['share_sum']*100:.1f}%")
    if inc.get("diff_vs_national_man") is not None:
        chk("全国平均との差＝全国平均−市の平均", inc["diff_vs_national_man"] == inc["national_avg_man"] - inc["city_avg_man"])
    return res


def summary_matches_html(model: dict, html: str) -> dict:
    m = re.search(r'id="summary".*?</section>', html, flags=re.S)
    seg = m.group(0) if m else ""
    miss = []
    for k in C.TYPES:
        p = model[k].get("price_man")
        if p is not None and num(p) not in seg:
            miss.append(f"{k}.price_man={num(p)}")
    return {"name": "P10の各数値＝各セクションの数値", "ok": not miss, "detail": ", ".join(miss)}


def residue(model: dict, files: dict[str, str]) -> list[dict]:
    m = model["meta"]
    own = m["company"] + m["prefecture"] + m["city"]
    bad = [s for s in SAMPLE_STRINGS if s not in own and not (s == "○○市")]
    out = []
    for fname, text in files.items():
        hits = sorted({s for s in bad if s in _strip_inputs(text, model)})
        out.append({"name": f"残骸チェック: {fname}", "ok": not hits, "detail": "検出: " + "、".join(hits) if hits else ""})
    html = files.get("index.html", "")
    out.append({"name": "会社名・市区町村・作成日が入力値になっている",
                "ok": all(x in html for x in (m["company"], m["city"], m["created_display"])), "detail": ""})
    out.append({"name": "「○○」プレースホルダが残っていない(会社名が○○を含む場合を除く)",
                "ok": ("○○" in m["company"]) or "○○" not in html, "detail": ""})
    return out


def _strip_inputs(text: str, model: dict) -> str:
    """利用者が設定で入力した値(加盟店名・競合名など)に含まれる語は、入力値として許容する。"""
    allowed = [f["name"] for f in model["area"]["franchise"]["items"]] + \
              [f.get("url", "") for f in model["area"]["franchise"]["items"]] + \
              [c["name"] for c in model["competitors"]["items"]] + [c["url"] for c in model["competitors"]["items"]] + \
              [f.get("area", "") for f in model["area"]["franchise"]["items"]]
    for a in filter(None, allowed):
        text = text.replace(a, "")
    return text


def run_all(model, rep, outdir: Path) -> dict:
    files = {n: (outdir / n).read_text("utf8") for n in ("index.html", "data.json", "report.md")}
    results = consistency(model) + [summary_matches_html(model, files["index.html"])] + residue(model, files)
    return {"ok": all(r["ok"] for r in results), "results": results}
