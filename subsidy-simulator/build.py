"""template.html に、params.json・calc.js・ロゴを埋め込み、1つのHTMLにする。
使い方: python3 subsidy-simulator/build.py   → subsidy-simulator/dist/index.html
外部への通信はない(ライブラリ・フォント・解析ツールを読み込まない)。
"""
import base64, json, pathlib
here = pathlib.Path(__file__).resolve().parent
tpl = (here / "template.html").read_text(encoding="utf-8")
params = json.dumps(json.load(open(here / "params.json", encoding="utf-8")), ensure_ascii=False).replace("</", "<\\/")
calc = (here / "calc.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
logo = "data:image/png;base64," + base64.b64encode((here / "assets" / "logo.png").read_bytes()).decode()
out = tpl.replace("{{PARAMS}}", params).replace("{{CALC}}", calc).replace("{{LOGO}}", logo)
(here / "dist").mkdir(exist_ok=True)
(here / "dist" / "index.html").write_text(out, encoding="utf-8")
print("dist/index.html", len(out.encode()) // 1024, "KB")
# Google Apps Script 用(同じ中身。gas/ の中にコピーする)
(here / "gas" / "index.html").write_text(out, encoding="utf-8")
print("gas/index.html (Apps Script 用)")
