"""コマンドライン: python -m areasheet generate configs/xxx.yaml"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import checks, franchise, pipeline, render


def generate(config_path: str | Path, *, out_root: str | Path = "out", refresh: bool = False, pdf: bool = True,
             new_id: bool = False, offline: bool = False, strict: bool = False, run_checks: bool = True) -> dict:
    """生成処理の本体(将来のGAS/Webフォームからはこの関数、または CLI を呼び出す)。"""
    cfg = pipeline.load_config(Path(config_path))
    model, rep, extras = pipeline.build_model(cfg, refresh=refresh, offline=offline)
    out_root = Path(out_root)
    key = f"{cfg['company']}|{model['meta']['prefecture']}|{model['meta']['city']}"
    pid = render.publish_id(out_root, key, new_id)
    index = render.write_site(out_root / pid, model, rep, extras)
    result = {"id": pid, "dir": str(index.parent), "index": str(index), "missing": [i["key"] for i in rep.missing()],
              "pdf": None, "checks": None}
    if pdf:
        ok, info = render.write_pdf(index)
        result["pdf"] = info if ok else None
        if not ok:
            result["pdf_error"] = info
    if run_checks:
        result["checks"] = checks.run_all(model, rep, index.parent)
    if strict and result["missing"]:
        result["strict_failed"] = True
    return result


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="areasheet", description="エリア調査シートLPの自動生成")
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("generate", help="設定ファイル(YAML/JSON)からLPを生成")
    g.add_argument("config")
    g.add_argument("--out", default="out")
    g.add_argument("--refresh", action="store_true", help="取得済みデータを使わず再取得")
    g.add_argument("--no-pdf", action="store_true")
    g.add_argument("--new-id", action="store_true", help="公開URLのランダムIDを払い出し直す")
    g.add_argument("--offline", action="store_true", help="ネットワーク取得をしない(キャッシュと設定値のみ)")
    g.add_argument("--strict", action="store_true", help="未入力が残っていたら終了コード2")
    f = sub.add_parser("import-franchises", help="マイマップのKML/CSVを加盟店一覧(data/franchises.csv)に取り込む")
    f.add_argument("file")
    f.add_argument("--replace", action="store_true", help="既存一覧を置き換える(既定は追記・更新)")
    f.add_argument("--dest", default=str(pipeline.ROOT / "data" / "franchises.csv"))
    a = ap.parse_args(argv)
    if a.cmd == "import-franchises":
        n, bad = franchise.import_file(Path(a.file), Path(a.dest), a.replace)
        print(f"{n}件を取り込みました -> {a.dest}")
        if bad:
            print("住所から市区町村を判定できず除外:", "、".join(bad))
        return 0
    res = generate(a.config, out_root=a.out, refresh=a.refresh, pdf=not a.no_pdf, new_id=a.new_id,
                   offline=a.offline, strict=a.strict)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    if res.get("checks") and not res["checks"]["ok"]:
        return 1
    return 2 if res.get("strict_failed") else 0


if __name__ == "__main__":
    sys.exit(main())
