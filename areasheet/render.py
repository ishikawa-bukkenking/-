"""モデル → 静的HTML(LP)/data.json/取得レポート/PDF の書き出し。"""
from __future__ import annotations

import json
import secrets
import shutil
import subprocess
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from . import charts, jp
from .pipeline import PRICE_NOTES, ROOT, Report

PKG = Path(__file__).resolve().parent
STATUS_LABEL = {"auto": "自動取得", "calc": "計算", "input": "設定値/入力", "csv": "CSV取込", "fixed": "固定", "missing": "未取得", "optional": "任意(空欄)"}


def _env() -> Environment:
    env = Environment(loader=FileSystemLoader(PKG / "templates"), autoescape=select_autoescape(["j2", "html"]),
                      undefined=StrictUndefined)
    env.filters["num"] = lambda v, nd=None: jp.num(v, nd)
    return env


TOC = [("area", "対象エリア"), ("income", "年収"), ("trend", "価格推移"), ("land", "土地"), ("used_house", "中古戸建て"),
       ("used_mansion", "中古マンション"), ("new_house", "新築戸建て"), ("search", "検索ボリューム"), ("summary", "まとめ"),
       ("point", "POINT"), ("competitors", "近隣HP")]


def build_context(model: dict, rep: Report, extras: dict) -> dict:
    inc, tr, land, kw = model["income"], model["price_trend"], model["land"], model["keywords"]
    donut = bars = None
    br = inc.get("brackets") or []
    if br and all(b.get("share") is not None for b in br):
        donut = charts.donut(br)
    if all(inc.get(k) is not None for k in ("city_avg_man", "prefecture_avg_man", "national_avg_man")):
        bars = charts.hbars([(model["meta"]["city"], inc["city_avg_man"], True),
                             (model["meta"]["prefecture"], inc["prefecture_avg_man"], False),
                             ("全国", inc["national_avg_man"], False)])
    bars_c = None
    if bars:
        bars_c = charts.hbars([(model["meta"]["city"], inc["city_avg_man"], True),
                               (model["meta"]["prefecture"], inc["prefecture_avg_man"], False),
                               ("全国", inc["national_avg_man"], False)], width=340)
    trend_svg = charts.trend_lines(tr["series"]) if tr.get("series") else None
    trend_svg_c = charts.trend_lines(tr["series"], compact=True) if tr.get("series") else None
    items = land["compare"]["items"]
    land_svg = charts.land_bars(items) if items and all(
        r.get("tsubo_price_man") is not None and r.get("listings") is not None for r in items) else None
    land_svg_c = charts.land_bars(items, compact=True) if land_svg else None
    vols = [r["monthly_volume"] for r in kw["rows"] if r["monthly_volume"] is not None]
    return dict(
        m=model["meta"], a=model["area"], inc=inc, tr=tr, land=land, uh=model["used_house"], um=model["used_mansion"],
        nh=model["new_house"], kw=kw, t=model["totals"], comp=model["competitors"], cta_url=model["cta_url"],
        map_svg=extras.get("map_svg"), donut=donut, bars=bars, trend_svg=trend_svg, land_svg=land_svg, land_svg_c=land_svg_c, bars_c=bars_c, trend_svg_c=trend_svg_c,
        kw_max=max(vols) if vols else 1, kw_missing=any(r["monthly_volume"] is None or r["cpc_low_yen"] is None
                                                       for r in kw["rows"]),
        missing=len(rep.missing()), toc=[("top", "表紙")] + TOC, notes=PRICE_NOTES)


def publish_id(out_root: Path, key: str, rotate: bool = False) -> str:
    """同じ(会社,県,市)には同じランダムIDを再利用する(共有URLが変わらない)。--new-id で払い出し直し。"""
    idx_path = out_root / ".ids.json"
    idx = json.loads(idx_path.read_text("utf8")) if idx_path.exists() else {}
    if rotate or key not in idx:
        idx[key] = secrets.token_urlsafe(12).replace("_", "x").replace("-", "y")
        out_root.mkdir(parents=True, exist_ok=True)
        idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=2), "utf8")
    return idx[key]


def write_site(outdir: Path, model: dict, rep: Report, extras: dict) -> Path:
    if outdir.exists():
        shutil.rmtree(outdir)
    (outdir / "assets" / "css").mkdir(parents=True)
    (outdir / "assets" / "js").mkdir(parents=True)
    shutil.copytree(ROOT / "assets" / "brand", outdir / "assets" / "brand")
    shutil.copytree(ROOT / "assets" / "fixed", outdir / "assets" / "fixed")
    shutil.copytree(PKG / "static" / "fonts", outdir / "assets" / "css" / "fonts")
    shutil.copy(PKG / "static" / "fonts.css", outdir / "assets" / "css" / "fonts.css")
    shutil.copy(PKG / "static" / "style.css", outdir / "assets" / "css" / "style.css")
    shutil.copy(PKG / "static" / "app.js", outdir / "assets" / "js" / "app.js")
    for rel, src in (extras.get("copy") or {}).items():
        dst = outdir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(src, dst)
    html = _env().get_template("index.html.j2").render(**build_context(model, rep, extras))
    (outdir / "index.html").write_text(html, "utf8")
    (outdir / "robots.txt").write_text("User-agent: *\nDisallow: /\n", "utf8")
    # 取得した全データ(出典・取得日時つき)と取得レポート
    (outdir / "data.json").write_text(json.dumps({"model": model, "report": rep.items}, ensure_ascii=False, indent=2), "utf8")
    (outdir / "report.md").write_text(report_md(model, rep), "utf8")
    return outdir / "index.html"


def report_md(model: dict, rep: Report) -> str:
    m = model["meta"]
    lines = [f"# 取得レポート　{m['company']} / {m['prefecture']}{m['city']}", "", f"生成: {m['generated_at']}　作成日: {m['created']}", ""]
    miss = rep.missing()
    lines += [f"## 自動で埋められなかった項目({len(miss)}件)", ""]
    lines += [f"- **{i['label']}** (`{i['key']}`): {i['reason']}" for i in miss] or ["なし"]
    opt = [i for i in rep.items if i["status"] == "optional"]
    if opt:
        lines += ["", f"## 任意項目(空欄のまま)({len(opt)}件)", ""] + [f"- {i['label']}: {i['reason']}" for i in opt]
    lines += ["", "## 全項目", "", "| 状態 | 項目 | 方法 | 備考 |", "|---|---|---|---|"]
    for i in rep.items:
        lines.append(f"| {STATUS_LABEL[i['status']]} | {i['label']} | {i['method']} | {i['reason']} |")
    return "\n".join(lines) + "\n"


def find_chromium() -> str | None:
    cand = [shutil.which(x) for x in ("chromium", "chromium-browser", "google-chrome")]
    cand += [str(p) for p in sorted(Path("/opt/pw-browsers").glob("chromium-*/chrome-linux/chrome"))]
    cand += ["/opt/pw-browsers/chromium/chrome-linux/chrome"]
    return next((c for c in cand if c and Path(c).exists()), None)


def write_pdf(index: Path) -> tuple[bool, str]:
    chrome = find_chromium()
    if not chrome:
        return False, "Chromium が見つかりません。ブラウザの印刷(A4横)から保存してください"
    pdf = index.parent / "area-survey.pdf"
    r = subprocess.run([chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                        "--run-all-compositor-stages-before-draw", "--virtual-time-budget=5000",
                        f"--print-to-pdf={pdf}", index.resolve().as_uri()], capture_output=True, text=True, timeout=180)
    return pdf.exists(), (r.stderr[-300:] if not pdf.exists() else str(pdf))
