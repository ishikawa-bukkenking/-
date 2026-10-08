"""e-Stat API(政府統計の総合窓口)から、令和2年国勢調査の市区町村別世帯数を取得する。

注意: このコードは取得元に到達できない環境で書かれており、実機未検証。
ESTAT_APP_ID(無料のアプリケーションID)が無い/到達できない/該当値が見つからない場合は
例外(EstatError)を投げ、呼び出し側が入力欄にフォールバックする。
statsDataId は設定(estat.stats_data_id)で固定でき、未指定なら検索で探索する。
"""
from __future__ import annotations

import os
import re

import requests

BASE = "https://api.e-stat.go.jp/rest/3.0/app/json"
CENSUS_CODE = "00200521"
SOURCE = "総務省統計局 令和2年国勢調査(e-Stat)"


class EstatError(RuntimeError):
    pass


def _get(path: str, params: dict) -> dict:
    r = requests.get(f"{BASE}/{path}", params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def _households_from(data: dict) -> int | None:
    inf = data.get("GET_STATS_DATA", {}).get("STATISTICAL_DATA", {})
    objs = inf.get("CLASS_INF", {}).get("CLASS_OBJ", [])
    objs = objs if isinstance(objs, list) else [objs]
    want: dict[str, set] = {}
    for o in objs:
        cls = o.get("CLASS", [])
        cls = cls if isinstance(cls, list) else [cls]
        for c in cls:
            nm = c.get("@name", "")
            if "世帯" in nm and "一般" in nm or nm.strip() in ("世帯数", "総世帯数"):
                want.setdefault(o["@id"], set()).add(c["@code"])
    vals = inf.get("DATA_INF", {}).get("VALUE", [])
    vals = vals if isinstance(vals, list) else [vals]
    for v in vals:
        if want and all(v.get("@" + k) in codes for k, codes in want.items()):
            try:
                return int(str(v["$"]).replace(",", ""))
            except ValueError:
                continue
    return None


def fetch_households(area_code: str, app_id: str | None = None, stats_data_id: str | None = None) -> dict:
    app_id = app_id or os.environ.get("ESTAT_APP_ID")
    if not app_id:
        raise EstatError("ESTAT_APP_ID(e-StatのアプリケーションID)が未設定")
    try:
        ids = [stats_data_id] if stats_data_id else []
        if not ids:
            lst = _get("getStatsList", {"appId": app_id, "statsCode": CENSUS_CODE, "surveyYears": "2020",
                                        "searchWord": "世帯 市区町村", "limit": 20})
            tabs = lst.get("GET_STATS_LIST", {}).get("DATALIST_INF", {}).get("TABLE_INF", [])
            tabs = tabs if isinstance(tabs, list) else [tabs]
            ids = [t["@id"] for t in tabs if re.search(r"市区町村", str(t.get("TITLE", "")))][:5]
        for sid in ids:
            data = _get("getStatsData", {"appId": app_id, "statsDataId": sid, "cdArea": area_code,
                                         "metaGetFlg": "Y", "limit": 200})
            n = _households_from(data)
            if n:
                return {"value": n, "source": SOURCE, "stats_data_id": sid}
        raise EstatError("該当する世帯数の表・値が見つからなかった")
    except EstatError:
        raise
    except Exception as e:  # noqa: BLE001
        raise EstatError(f"e-Stat APIに接続/解析できない: {type(e).__name__}: {e}") from e
