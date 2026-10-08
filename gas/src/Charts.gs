/** 静的SVGグラフ(areasheet/charts.py の移植)。凡例を読ませず、値をグラフ上に直接表示する */

function f1_(x) { return x.toFixed(1); }

function donutSvg_(brackets) {
  var size = 360, w = size + 140, h = size + 70, cx = w / 2, cy = h / 2, rOut = size * 0.30, rIn = size * 0.18;
  var tot = brackets.reduce(function (s, b) { return s + b.share; }, 0) || 1;
  var top = 0;
  brackets.forEach(function (b, i) { if (b.share > brackets[top].share) top = i; });
  var order = brackets.map(function (b, i) { return i; }).filter(function (i) { return i !== top; })
    .sort(function (a, b) { return brackets[b].share - brackets[a].share; });
  var rank = {};
  order.forEach(function (i, n) { rank[i] = Math.min(n, 4); });
  var tints = ['var(--c-teal-700)', 'var(--c-teal-600)', 'var(--c-teal-500)', 'var(--c-teal-400)', 'var(--c-teal-300)'];
  var parts = [], ang = -Math.PI / 2;
  function p(r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  brackets.forEach(function (b, i) {
    var frac = b.share / tot, a0 = ang, a1 = ang + frac * 2 * Math.PI;
    ang = a1;
    var large = a1 - a0 > Math.PI ? 1 : 0;
    var q0 = p(rOut, a0), q1 = p(rOut, a1), q2 = p(rIn, a1), q3 = p(rIn, a0), path;
    if (frac >= 0.9999) {
      path = 'M' + f1_(cx - rOut) + ',' + f1_(cy) + 'a' + rOut + ',' + rOut + ' 0 1,0 ' + (2 * rOut) + ',0a' + rOut + ',' + rOut + ' 0 1,0 ' + (-2 * rOut) + ',0Z';
    } else {
      path = 'M' + f1_(q0[0]) + ',' + f1_(q0[1]) + 'A' + rOut + ',' + rOut + ' 0 ' + large + ' 1 ' + f1_(q1[0]) + ',' + f1_(q1[1]) +
        'L' + f1_(q2[0]) + ',' + f1_(q2[1]) + 'A' + rIn + ',' + rIn + ' 0 ' + large + ' 0 ' + f1_(q3[0]) + ',' + f1_(q3[1]) + 'Z';
    }
    var fill = i === top ? 'var(--c-accent)' : tints[rank[i]];
    parts.push('<path d="' + path + '" fill="' + fill + '" stroke="#fff" stroke-width="2" fill-rule="evenodd"/>');
    var am = (a0 + a1) / 2, l = p(rOut + 14, am), anchor = Math.cos(am) >= 0 ? 'start' : 'end';
    var pctv = roundHalfUp_(frac * 100, 1).toFixed(1), wt = i === top ? '700' : '500';
    parts.push('<text x="' + f1_(l[0]) + '" y="' + f1_(l[1] - 3) + '" text-anchor="' + anchor + '" class="ch-lab" font-weight="' + wt + '">' + esc_(b.label) + '</text>' +
      '<text x="' + f1_(l[0]) + '" y="' + f1_(l[1] + 17) + '" text-anchor="' + anchor + '" class="ch-val" font-weight="' + wt + '">' + pctv + '%</text>');
  });
  var desc = brackets.map(function (b) { return b.label + ' ' + roundHalfUp_(b.share * 100, 1).toFixed(1) + '%'; }).join('、');
  return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="年収階級別の世帯構成比: ' + esc_(desc) + '">' + parts.join('') + '</svg>';
}

/** rows: [[label, value, highlight]] */
function hbarsSvg_(rows, width) {
  width = width || 560;
  var unit = '万円', barH = 44, gap = 16, left = 70;
  var mx = Math.max.apply(null, rows.map(function (r) { return r[1]; })) || 1;
  var h = rows.length * (barH + gap) + gap, out = [];
  rows.forEach(function (r, i) {
    var y = gap + i * (barH + gap), hi = r[2];
    var bw = (width - left - (width > 400 ? 120 : 100)) * r[1] / mx;
    var fill = hi ? 'var(--c-accent)' : 'var(--c-teal-400)', wt = hi ? 700 : 500;
    out.push('<text x="' + (left - 10) + '" y="' + (y + barH / 2 + 6) + '" text-anchor="end" class="ch-lab" font-weight="' + wt + '">' + esc_(r[0]) + '</text>' +
      '<rect x="' + left + '" y="' + y + '" width="' + f1_(bw) + '" height="' + barH + '" rx="4" fill="' + fill + '"/>' +
      '<text x="' + f1_(left + bw + 10) + '" y="' + (y + barH / 2 + 8) + '" class="ch-val-lg" font-weight="' + wt + '">' + num_(r[1]) + '<tspan class="ch-unit">' + unit + '</tspan></text>');
  });
  return '<svg class="chart" viewBox="0 0 ' + width + ' ' + h + '" role="img" aria-label="平均世帯年収の比較">' + out.join('') + '</svg>';
}

function landBarsSvg_(items, compact) {
  var width = 720, height = 290;
  if (compact) { width = 340; height = 280; }
  var n = items.length, top = 40, bottom = 90, side = compact ? 8 : 20;
  var mx = Math.max.apply(null, items.map(function (r) { return r.tsubo_price_man || 0; })) || 1;
  var cw = (width - 2 * side) / n, bw = Math.min(96, cw * (compact ? 0.7 : 0.62)), ph = height - top - bottom, out = [];
  items.forEach(function (r, i) {
    var x = side + i * cw + (cw - bw) / 2, v = r.tsubo_price_man || 0, bh = ph * v / mx, hi = r.highlight;
    var fill = hi ? 'var(--c-accent)' : 'var(--c-teal-400)', cxm = x + bw / 2, wt = hi ? 700 : 500;
    var label = compact ? r.city.replace(/市$/, '') + '市' : r.city;
    out.push('<rect x="' + f1_(x) + '" y="' + f1_(top + ph - bh) + '" width="' + f1_(bw) + '" height="' + f1_(bh) + '" rx="4" fill="' + fill + '"/>' +
      '<text x="' + f1_(cxm) + '" y="' + f1_(top + ph - bh - 8) + '" text-anchor="middle" class="ch-val" font-weight="' + wt + '">' + num_(v) + (compact ? '' : '<tspan class="ch-unit">万円/坪</tspan>') + '</text>' +
      '<text x="' + f1_(cxm) + '" y="' + (top + ph + 26) + '" text-anchor="middle" class="ch-lab" font-weight="' + wt + '" style="font-size:' + (compact ? 13 : 15) + 'px">' + esc_(label) + '</text>' +
      '<text x="' + f1_(cxm) + '" y="' + (top + ph + 50) + '" text-anchor="middle" class="ch-sub">' + num_(r.listings) + '件</text>');
  });
  out.push('<line x1="' + side + '" x2="' + (width - side) + '" y1="' + (top + ph) + '" y2="' + (top + ph) + '" stroke="var(--c-line)" stroke-width="1.5"/>');
  return '<svg class="chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="坪単価(万円/坪)と物件数の比較">' + out.join('') + '</svg>';
}

function trendLinesSvg_(series, compact) {
  var labels = series.labels || [];
  var lines = Object.keys(series).filter(function (k) { return k !== 'labels' && Array.isArray(series[k]) && series[k].length === labels.length && labels.length; })
    .map(function (k) { return [k, series[k]]; });
  if (!lines.length) return null;
  var width = 760, height = 340, left = 56, right = 120, top = 16, bottom = 44;
  if (compact) { width = 340; height = 300; left = 44; right = 112; }
  var cols = { 'マンション': 'var(--c-accent)', '中古マンション': 'var(--c-accent)', '中古戸建': 'var(--c-teal-600)', '中古戸建て': 'var(--c-teal-600)', '土地': 'var(--c-slate)' };
  var vals = [0];
  lines.forEach(function (l) { l[1].forEach(function (x) { if (x != null) vals.push(x); }); });
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = (hi - lo) || 1;
  var pw = width - left - right, ph = height - top - bottom;
  function X(i) { return left + pw * i / Math.max(labels.length - 1, 1); }
  function Y(v) { return top + ph * (1 - (v - lo) / span); }
  var out = ['<line x1="' + left + '" x2="' + (left + pw) + '" y1="' + (top + ph) + '" y2="' + (top + ph) + '" stroke="var(--c-line)"/>'];
  for (var t = 0; t <= 4; t++) {
    var v = lo + span * t / 4;
    out.push('<line x1="' + left + '" x2="' + (left + pw) + '" y1="' + f1_(Y(v)) + '" y2="' + f1_(Y(v)) + '" stroke="var(--c-line)" stroke-dasharray="3 4"/>' +
      '<text x="' + (left - 8) + '" y="' + f1_(Y(v) + 5) + '" text-anchor="end" class="ch-sub">' + num_(Math.round(v)) + '</text>');
  }
  var step = Math.max(1, Math.floor(labels.length / (compact ? 3 : 6)));
  for (var i = 0; i < labels.length; i += step) {
    out.push('<text x="' + f1_(X(i)) + '" y="' + (height - 14) + '" text-anchor="middle" class="ch-sub">' + esc_(labels[i]) + '</text>');
  }
  lines.forEach(function (l) {
    var k = l[0], v = l[1], pts = [];
    v.forEach(function (x, i) { if (x != null) pts.push(f1_(X(i)) + ',' + f1_(Y(x))); });
    var c = cols[k] || 'var(--c-teal-400)', last = null;
    for (var j = v.length - 1; j >= 0; j--) if (v[j] != null) { last = j; break; }
    out.push('<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + c + '" stroke-width="3" stroke-linejoin="round"/>');
    if (last !== null) out.push('<text x="' + f1_(X(last) + 8) + '" y="' + f1_(Y(v[last]) + 5) + '" class="ch-lab" font-weight="700" fill="' + c + '">' + esc_(k) + '</text>');
  });
  return '<svg class="chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="直近3年間の価格推移(万円)">' + out.join('') + '</svg>';
}
