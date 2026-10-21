"""src/slides.src.html のロゴ(__LOGO__)をbase64にして slides.html を作る。"""
import base64, pathlib
root = pathlib.Path(__file__).parent
logo = base64.b64encode((root / "assets/logo-color.png").read_bytes()).decode()
src = (root / "src/slides.src.html").read_text(encoding="utf-8")
(root / "slides.html").write_text(src.replace("__LOGO__", "data:image/png;base64," + logo), encoding="utf-8")
