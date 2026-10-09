"""gas/src/*.gs を、Apps Script に貼り付けやすい少数ファイル(gas/dist/)にまとめる。

使い方: python gas/build.py
  dist/Bundle.gs      … 全ロジック(+ CSS / JS を文字列定数として埋め込み)
  dist/Assets.gs      … ロゴ・王様などの画像(縮小して data URI 化)
  dist/appsscript.json … マニフェスト(ウェブアプリ: 実行=自分 / アクセス=全員)
"""
import base64
import io
import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ORDER = ["Jp", "Compute", "Geo", "Franchise", "Listings", "Charts", "Pipeline", "Render", "Sheet", "Admin", "Code"]


def data_uri(path: Path, height: int | None = None, fmt: str = "PNG", quality: int = 82) -> str:
    im = Image.open(path)
    if height and im.height > height:
        im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
    buf = io.BytesIO()
    if fmt == "JPEG":
        im.convert("RGB").save(buf, "JPEG", quality=quality, optimize=True)
        mime = "image/jpeg"
    else:
        im.save(buf, "PNG", optimize=True)
        mime = "image/png"
    return f"data:{mime};base64," + base64.b64encode(buf.getvalue()).decode()


def main() -> None:
    dist = HERE / "dist"
    dist.mkdir(exist_ok=True)
    parts = [(HERE / "src" / f"{n}.gs").read_text("utf8") for n in ORDER]
    css = (ROOT / "areasheet" / "static" / "style.css").read_text("utf8")
    js = (ROOT / "areasheet" / "static" / "app.js").read_text("utf8")
    app_html = (HERE / "src" / "app.html").read_text("utf8")
    consts = (f"/** 生成物(gas/build.py)。CSS/JS/入力画面のHTML を文字列定数として保持する */\n"
              f"var APP_HTML_ = {json.dumps(app_html, ensure_ascii=False)};\n"
              f"var STYLE_CSS_ = {json.dumps(css, ensure_ascii=False)};\n"
              f"var APP_JS_ = {json.dumps(js, ensure_ascii=False)};\n")
    (dist / "Bundle.gs").write_text("\n\n".join(parts) + "\n\n" + consts, "utf8")
    b, f = ROOT / "assets" / "brand", ROOT / "assets" / "fixed"
    assets = {
        "logoTeal": data_uri(b / "logo-teal.png"), "logoWhite": data_uri(b / "logo-white.png"),
        "king": data_uri(b / "king.png", 520), "thinker": data_uri(b / "thinker.png", 420),
        "listings": data_uri(f / "franchise-listings.png", 640, "JPEG"),
    }
    (dist / "Assets.gs").write_text("/** 生成物(gas/build.py)。差し替えは assets/ の画像を置き換えて再ビルド */\nvar ASSETS = "
                                    + json.dumps(assets, indent=1) + ";\n", "utf8")
    (dist / "appsscript.json").write_text(json.dumps({
        "timeZone": "Asia/Tokyo", "exceptionLogging": "STACKDRIVER", "runtimeVersion": "V8",
        "webapp": {"executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS"},
        "oauthScopes": ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/script.external_request",
                        "https://www.googleapis.com/auth/script.container.ui", "https://www.googleapis.com/auth/drive"],
    }, indent=2), "utf8")
    for p in sorted(dist.iterdir()):
        print(f"{p.name}: {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
