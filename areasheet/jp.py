"""日本語表記・都道府県コード・数値整形のユーティリティ。"""
from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal

PREFECTURES = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
    "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
    "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
    "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
    "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
]
PREF_CODE = {n: i + 1 for i, n in enumerate(PREFECTURES)}
_SHORT = {n[:-1]: n for n in PREFECTURES if n != "北海道"}
_SHORT["北海道"] = "北海道"


def normalize_prefecture(name: str) -> str:
    name = name.strip()
    if name in PREF_CODE:
        return name
    if name in _SHORT:
        return _SHORT[name]
    raise ValueError(f"都道府県名を解釈できません: {name!r}")


def round_half_up(x: float, ndigits: int = 0) -> float:
    q = Decimal(1).scaleb(-ndigits)
    return float(Decimal(str(x)).quantize(q, rounding=ROUND_HALF_UP))


def ceil_to(x: float, unit: int) -> int:
    return int(math.ceil(x / unit) * unit)


def num(x, ndigits: int | None = None) -> str:
    """桁区切りカンマ。小数は ndigits 指定時のみ固定桁、未指定は末尾0を落とす。"""
    if x is None:
        return ""
    if ndigits is not None:
        return f"{round_half_up(x, ndigits):,.{ndigits}f}"
    if float(x).is_integer():
        return f"{int(x):,}"
    s = f"{x:,.4f}".rstrip("0").rstrip(".")
    return s


def man(x) -> str:
    return f"{num(x)}万円"


def pct(x, ndigits: int = 1) -> str:
    return f"{round_half_up(x, ndigits):.{ndigits}f}%"


def city_key(name: str) -> str:
    return name.replace(" ", "").replace("　", "")
