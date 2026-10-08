#!/usr/bin/env python3
"""共有用の画像(assets/og.jpg 1200x630)とアプリアイコンを作る。Playwright と Chromium が必要。
  python3 tools/make_og.py
"""
import os, sys, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTO = os.path.join(ROOT, "images/dishes/lunch-aburi.webp")
CHROME = os.environ.get("CHROME_PATH")
OG = f"""<!doctype html><meta charset=utf-8>
<link href="https://fonts.googleapis.com/css2?family=Yusei+Magic&family=Zen+Maru+Gothic:wght@700&display=swap" rel=stylesheet>
<style>*{{box-sizing:border-box}}body{{margin:0;width:1200px;height:630px;background:#FFF8E6;font-family:'Zen Maru Gothic';color:#582A13;position:relative;overflow:hidden}}
.noren{{position:absolute;left:0;right:0;top:0;height:74px;background:#C14E18;color:#fff;font:400 38px/74px 'Yusei Magic';padding-left:56px;letter-spacing:.1em}}
.t{{position:absolute;left:56px;top:130px;width:560px}}
.t p{{margin:0;font:400 66px/1.28 'Yusei Magic'}} .t em{{font-style:normal;color:#C14E18;background:linear-gradient(transparent 62%,#F8DF63 62%)}}
.t small{{display:block;margin-top:22px;font:700 28px/1.6 'Zen Maru Gothic'}}
.tel{{position:absolute;left:56px;bottom:46px;background:#A8420F;color:#fff;border-radius:999px;font:700 38px/1 'Zen Maru Gothic';padding:20px 38px}}
img{{position:absolute;right:48px;top:112px;width:560px;height:393px;object-fit:cover;border-radius:28px;border:10px solid #fff;box-shadow:0 10px 28px rgba(88,42,19,.25)}}
.tag{{position:absolute;left:606px;top:84px;transform:rotate(-6deg);background:#C14E18;color:#fff;font:400 34px/1 'Yusei Magic';padding:16px 26px;border-radius:8px}}
</style><div class=noren>中華料理 大門</div>
<div class=t><p>創業<em>50年以上</em>。<br>変わらない、<br>家族の町中華。</p><small>毎週火曜定休 ／ テイクアウトOK</small></div>
<div class=tel>📞 058-253-2355</div><img src="file://{PHOTO}"><div class=tag>一番人気です♪</div>"""
ICON = """<!doctype html><meta charset=utf-8><style>body{margin:0;width:180px;height:180px;background:#C14E18;display:flex;align-items:center;justify-content:center;position:relative}
div{position:absolute;inset:14px;border:5px solid #F8DF63;border-radius:26px}
b{font:700 112px/1 'Noto Sans CJK JP','Hiragino Maru Gothic ProN',sans-serif;color:#FFF8E6;margin-top:6px}</style><div></div><b>門</b>"""
with sync_playwright() as p:
    kw = {"args": ["--no-sandbox"]}
    if CHROME: kw["executable_path"] = CHROME
    b = p.chromium.launch(**kw)
    d = tempfile.mkdtemp()
    for name, html, w, h, out, kind in [("og", OG, 1200, 630, "assets/og.jpg", "jpeg"), ("icon", ICON, 180, 180, "assets/apple-touch-icon.png", "png")]:
        f = os.path.join(d, name + ".html"); open(f, "w", encoding="utf-8").write(html)
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.goto("file://" + f); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(800)
        kw2 = {"path": os.path.join(ROOT, out), "type": kind}
        if kind == "jpeg": kw2["quality"] = 86
        pg.screenshot(**kw2)
    b.close()
print("ok")
