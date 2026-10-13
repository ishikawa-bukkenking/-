"""算出・文章生成ルール(サンプルから確認済みのもの)。純粋関数のみ。"""
from __future__ import annotations

from .jp import ceil_sig, num, round_half_up

TYPES = ("used_mansion", "land", "new_house", "used_house")
TYPE_LABEL = {"used_mansion": "マンション", "land": "土地", "new_house": "新築一戸建て", "used_house": "中古一戸建て"}
BROKERAGE_RATE, BROKERAGE_FIXED_MAN = 0.03, 6.0


def listings_total(counts: dict) -> int | None:
    vals = [counts.get(t) for t in TYPES]
    return None if any(v is None for v in vals) else int(sum(vals))


def brokerage_fee(price_man: float) -> float:
    """1件あたりの仲介手数料(税抜・万円) = 売却価格相場×3% + 6万円"""
    return price_man * BROKERAGE_RATE + BROKERAGE_FIXED_MAN


def brokerage_unit(prices: dict, counts: dict) -> float | None:
    if any(prices.get(t) is None or counts.get(t) is None for t in TYPES):
        return None
    n = sum(counts[t] for t in TYPES)
    if n == 0:
        return None
    return sum(brokerage_fee(prices[t]) * counts[t] for t in TYPES) / n


def point_rounded(total: int, unit: int | None = None) -> int:
    """POINTに載せる件数。上位2桁で切り上げる(414→420、1,898→1,900)。unit を指定した場合はその単位で切り上げる。"""
    if unit:
        return int(-(-total // unit) * unit)
    return ceil_sig(total, 2)


def income_view(city: str, pref: str, d: dict) -> dict:
    out = dict(d)
    c, n = d.get("city_avg_man"), d.get("national_avg_man")
    out["diff_vs_national_man"] = None if c is None or n is None else n - c   # 全国 − 市
    br = d.get("brackets") or []
    if br:
        hh = [b.get("households") for b in br]
        if all(h is not None for h in hh) and sum(hh) > 0:
            tot = sum(hh)
            for b, h in zip(br, hh):
                b["share"] = b.get("share") if b.get("share") is not None else h / tot
        out["brackets"] = br
        shares = [b.get("share") for b in br]
        if all(s is not None for s in shares):
            out["share_sum"] = sum(shares)
            top = max(br, key=lambda b: b["share"])
            out["largest_bracket"] = {"label": top["label"], "households": top.get("households"), "share": top["share"]}
    rank, N = d.get("rank_in_prefecture"), d.get("municipalities_in_prefecture")
    if rank and N and c is not None and n is not None:
        rel = "下" if c < n else "上" if c > n else "同じ"
        out["headline"] = f"{pref}で{rank}位/{N}市町村中　全国平均より{rel}"
        lb = out.get("largest_bracket")
        if lb:
            verb = "上回る" if c > n else "下回る" if c < n else "同水準となる"
            diff = abs(n - c)
            diff_txt = (f"{num(diff)}万円{verb}結果になりました" if diff else "同水準の結果になりました")
            head = (f"{city}の平均年収は{num(c)}万円です。{pref}の{N}市町村の中で{rank}位となり、"
                    f"全国の平均年収からは{diff_txt}。")
            pct_txt = f"{round_half_up(lb['share'] * 100, 1):.1f}%"
            if lb.get("households") is not None:
                out["body"] = head + (f"年収階級別にみると年収{_bracket_phrase(lb['label'])}の世帯が"
                                      f"一番多く{num(lb['households'])}世帯（{pct_txt}）となります。")
            else:
                out["body"] = head + f"年収階級別にみると、年収{_bracket_phrase(lb['label'])}の世帯が最も多く、全体の{pct_txt}を占めています。"
    return out


def _bracket_phrase(label: str) -> str:
    # "300万未満" -> "300万円未満", "1000万以上" -> "1000万円以上", "300万〜500万未満" -> "300万円〜500万円未満"
    return label.replace("万以", "万円以").replace("万未", "万円未").replace("万〜", "万円〜").replace("500万未", "500万円未")


def trend_judge(city_pct: float, pref_pct: float, threshold: float = 1.0) -> str:
    diff = city_pct - pref_pct
    if abs(diff) <= threshold + 1e-9:
        return "同程度"
    return "高い" if diff > 0 else "低い"


def _change(v: float) -> str:
    """変化率を「◯%の上昇/下落」の形で言い表す(0付近は「ほぼ横ばい」)。"""
    if abs(v) < 0.005:
        return "ほぼ横ばい"
    return f"{num(abs(v), 2)}%の{'上昇' if v > 0 else '下落'}"


def _signed(v: float) -> str:
    return f"{'+' if v > 0 else '−' if v < 0 else ''}{num(abs(v), 2)}%"


def trend_text(city: str, pref: str, c: float, p: float, y: list, judge: str) -> str:
    """価格推移の説明文。数値の事実を穏やかな表現で伝える(「高い/低い」と断定せず「やや上回る/下回る」とする)。"""
    rel = {"同程度": "おおむね同程度の水準です", "高い": "やや上回る水準です", "低い": "やや下回る水準です"}[judge]
    first = f"{city}の標準的な物件の価格は、直近3年間で{_change(c)}となりました。"
    second = f"{pref}全体の変動（{_signed(p)}）と比べると、{rel}。"
    if all(v >= 0.005 for v in y) or all(v <= -0.005 for v in y):
        word = "上昇" if y[0] > 0 else "下落"
        third = f"年ごとにみると、1年目は{num(abs(y[0]), 2)}%、2年目は{num(abs(y[1]), 2)}%、3年目は{num(abs(y[2]), 2)}%の{word}でした。"
    else:
        third = f"年ごとにみると、1年目は{_change(y[0])}、2年目は{_change(y[1])}、3年目は{_change(y[2])}でした。"
    return first + second + third


def trend_view(city: str, pref: str, d: dict, threshold: float = 1.0) -> dict:
    out = dict(d)
    y = d.get("yearly_pct")
    if d.get("city_3y_pct") is None and y and len(y) == 3:
        out["city_3y_pct"] = round(sum(y), 2)
        out["city_3y_pct_derived"] = True
    c, p = out.get("city_3y_pct"), out.get("prefecture_3y_pct")
    if c is not None and p is not None:
        out["judgement_vs_prefecture"] = trend_judge(c, p, threshold)
        out["diff_pt"] = round(c - p, 2)
    if c is not None and p is not None and y and len(y) == 3:
        out["body"] = trend_text(city, pref, c, p, y, out["judgement_vs_prefecture"])
    return out


def point_text(total: int, unit: int | None = None) -> str:
    n = point_rounded(total, unit)
    return (f"商圏で約{num(n)}件の物件情報数を担保できれば、"
            f"商圏No.1の情報量を担保するHPを作り上げることが実証される")
