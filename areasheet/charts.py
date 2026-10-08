"""静的SVGグラフ(凡例を読ませず、値をグラフ上に直接表示する)。色はCSS変数で指定し、印刷でも潰れないようにする。"""
from __future__ import annotations

import math
from html import escape

from .jp import num, round_half_up


def donut(brackets: list[dict], size: int = 360) -> str:
    """年収階級の構成比。ラベルは各区画の外側に直接表示。"""
    w, h, cx, cy, r_out, r_in = size + 140, size + 70, (size + 140) / 2, (size + 70) / 2, size * 0.30, size * 0.18
    tot = sum(b["share"] for b in brackets) or 1
    top = max(range(len(brackets)), key=lambda i: brackets[i]["share"])
    order = sorted((i for i in range(len(brackets)) if i != top), key=lambda i: -brackets[i]["share"])
    rank = {i: min(n, 4) for n, i in enumerate(order)}   # 大きい区画ほど濃い
    tints = ["var(--c-teal-700)", "var(--c-teal-600)", "var(--c-teal-500)", "var(--c-teal-400)", "var(--c-teal-300)"]
    parts, ang = [], -math.pi / 2
    for i, b in enumerate(brackets):
        frac = b["share"] / tot
        a0, a1 = ang, ang + frac * 2 * math.pi
        ang = a1
        large = 1 if a1 - a0 > math.pi else 0
        p = lambda r, a: (cx + r * math.cos(a), cy + r * math.sin(a))  # noqa: E731
        x0, y0, x1, y1 = *p(r_out, a0), *p(r_out, a1)
        x2, y2, x3, y3 = *p(r_in, a1), *p(r_in, a0)
        if frac >= 0.9999:
            path = (f"M{cx-r_out:.1f},{cy:.1f}a{r_out},{r_out} 0 1,0 {2*r_out},0a{r_out},{r_out} 0 1,0 {-2*r_out},0Z"
                    f"M{cx-r_in:.1f},{cy:.1f}a{r_in},{r_in} 0 1,1 {2*r_in},0a{r_in},{r_in} 0 1,1 {-2*r_in},0Z")
        else:
            path = (f"M{x0:.1f},{y0:.1f}A{r_out},{r_out} 0 {large} 1 {x1:.1f},{y1:.1f}L{x2:.1f},{y2:.1f}"
                    f"A{r_in},{r_in} 0 {large} 0 {x3:.1f},{y3:.1f}Z")
        fill = "var(--c-accent)" if i == top else tints[rank[i]]
        parts.append(f'<path d="{path}" fill="{fill}" stroke="#fff" stroke-width="2" fill-rule="evenodd"/>')
        am = (a0 + a1) / 2
        lx, ly = p(r_out + 14, am)
        anchor = "start" if math.cos(am) >= 0 else "end"
        pct = round_half_up(frac * 100, 1)
        weight = "700" if i == top else "500"
        parts.append(f'<text x="{lx:.1f}" y="{ly-3:.1f}" text-anchor="{anchor}" class="ch-lab" font-weight="{weight}">'
                     f'{escape(b["label"])}</text>'
                     f'<text x="{lx:.1f}" y="{ly+17:.1f}" text-anchor="{anchor}" class="ch-val" font-weight="{weight}">{pct:.1f}%</text>')
    desc = "、".join(f'{b["label"]} {round_half_up(b["share"]*100,1):.1f}%' for b in brackets)
    return (f'<svg class="chart" viewBox="0 0 {w} {h}" role="img" aria-label="年収階級別の世帯構成比: {escape(desc)}">'
            + "".join(parts) + "</svg>")


def hbars(rows: list[tuple[str, float, bool]], unit: str = "万円", width: int = 560) -> str:  # width=340 でスマホ用
    """横棒グラフ(強調行だけオレンジ)。"""
    bar_h, gap, left = 44, 16, 70
    mx = max(v for _, v, _ in rows) or 1
    h = len(rows) * (bar_h + gap) + gap
    out = []
    for i, (lab, v, hi) in enumerate(rows):
        y = gap + i * (bar_h + gap)
        bw = (width - left - (120 if width > 400 else 100)) * v / mx
        fill = "var(--c-accent)" if hi else "var(--c-teal-400)"
        out.append(f'<text x="{left-10}" y="{y+bar_h/2+6}" text-anchor="end" class="ch-lab" font-weight="{700 if hi else 500}">{escape(lab)}</text>'
                   f'<rect x="{left}" y="{y}" width="{bw:.1f}" height="{bar_h}" rx="4" fill="{fill}"/>'
                   f'<text x="{left+bw+10:.1f}" y="{y+bar_h/2+8}" class="ch-val-lg" font-weight="{700 if hi else 500}">{num(v)}<tspan class="ch-unit">{unit}</tspan></text>')
    return f'<svg class="chart" viewBox="0 0 {width} {h}" role="img" aria-label="平均世帯年収の比較">{"".join(out)}</svg>'


def land_bars(items: list[dict], width: int = 720, height: int = 290, compact: bool = False) -> str:
    """坪単価(棒)と物件数(下段の数値)。対象市のみオレンジ。"""
    n = len(items)
    if compact:
        width, height = 340, 280
    top, bottom, side = 40, 90, 8 if compact else 20
    mx = max((r["tsubo_price_man"] or 0) for r in items) or 1
    cw = (width - 2 * side) / n
    bw = min(96, cw * (0.7 if compact else 0.62))
    ph = height - top - bottom
    out = []
    for i, r in enumerate(items):
        x = side + i * cw + (cw - bw) / 2
        v = r["tsubo_price_man"] or 0
        bh = ph * v / mx
        hi = r.get("highlight")
        fill = "var(--c-accent)" if hi else "var(--c-teal-400)"
        cxm = x + bw / 2
        out.append(f'<rect x="{x:.1f}" y="{top+ph-bh:.1f}" width="{bw:.1f}" height="{bh:.1f}" rx="4" fill="{fill}"/>'
                   f'<text x="{cxm:.1f}" y="{top+ph-bh-8:.1f}" text-anchor="middle" class="ch-val" font-weight="{700 if hi else 500}">{num(v)}{"" if compact else '<tspan class="ch-unit">万円/坪</tspan>'}</text>'
                   f'<text x="{cxm:.1f}" y="{top+ph+26}" text-anchor="middle" class="ch-lab" font-weight="{700 if hi else 500}" style="font-size:{13 if compact else 15}px">{escape(r["city"].removesuffix("市") + "市" if compact else r["city"])}</text>'
                   f'<text x="{cxm:.1f}" y="{top+ph+50}" text-anchor="middle" class="ch-sub">{num(r["listings"])}件</text>')
    out.append(f'<line x1="{side}" x2="{width-side}" y1="{top+ph}" y2="{top+ph}" stroke="var(--c-line)" stroke-width="1.5"/>')
    return f'<svg class="chart" viewBox="0 0 {width} {height}" role="img" aria-label="坪単価(万円/坪)と物件数の比較">{"".join(out)}</svg>'


def trend_lines(series: dict, width: int = 760, height: int = 340, compact: bool = False) -> str | None:
    labels = series.get("labels") or []
    lines = [(k, v) for k, v in series.items() if k != "labels" and isinstance(v, list) and len(v) == len(labels) and labels]
    if not lines:
        return None
    cols = {"中古マンション": "var(--c-accent)", "中古戸建": "var(--c-teal-600)", "中古戸建て": "var(--c-teal-600)", "土地": "var(--c-slate)"}
    if compact:
        width, height = 340, 300
    left, right, top, bottom = (44, 112, 16, 44) if compact else (56, 120, 16, 44)
    vals = [x for _, v in lines for x in v if x is not None]
    lo, hi = min(vals + [0]), max(vals)
    span = (hi - lo) or 1
    pw, ph = width - left - right, height - top - bottom
    X = lambda i: left + pw * i / max(len(labels) - 1, 1)  # noqa: E731
    Y = lambda v: top + ph * (1 - (v - lo) / span)         # noqa: E731
    out = [f'<line x1="{left}" x2="{left+pw}" y1="{top+ph}" y2="{top+ph}" stroke="var(--c-line)"/>']
    for t in range(0, 5):
        v = lo + span * t / 4
        out.append(f'<line x1="{left}" x2="{left+pw}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="var(--c-line)" stroke-dasharray="3 4"/>'
                   f'<text x="{left-8}" y="{Y(v)+5:.1f}" text-anchor="end" class="ch-sub">{num(round(v))}</text>')
    step = max(1, len(labels) // (3 if compact else 6))
    for i in range(0, len(labels), step):
        out.append(f'<text x="{X(i):.1f}" y="{height-14}" text-anchor="middle" class="ch-sub">{escape(str(labels[i]))}</text>')
    for k, v in lines:
        pts = " ".join(f"{X(i):.1f},{Y(x):.1f}" for i, x in enumerate(v) if x is not None)
        c = cols.get(k, "var(--c-teal-400)")
        last = next((i for i in range(len(v) - 1, -1, -1) if v[i] is not None), None)
        out.append(f'<polyline points="{pts}" fill="none" stroke="{c}" stroke-width="3" stroke-linejoin="round"/>')
        if last is not None:
            out.append(f'<text x="{X(last)+8:.1f}" y="{Y(v[last])+5:.1f}" class="ch-lab" font-weight="700" fill="{c}">{escape(k)}</text>')
    return f'<svg class="chart" viewBox="0 0 {width} {height}" role="img" aria-label="直近3年間の価格推移(万円)">{"".join(out)}</svg>'
