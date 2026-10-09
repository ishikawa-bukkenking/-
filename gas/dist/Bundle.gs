/** 日本語表記・数値整形(areasheet/jp.py の移植) */

var PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県',
  '埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県',
  '岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県',
  '佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

function prefCode_(name) { return PREFECTURES.indexOf(name) + 1; }

function normalizePrefecture_(name) {
  name = String(name || '').trim();
  if (PREFECTURES.indexOf(name) >= 0) return name;
  for (var i = 0; i < PREFECTURES.length; i++) {
    if (PREFECTURES[i] !== '北海道' && PREFECTURES[i].slice(0, -1) === name) return PREFECTURES[i];
  }
  throw new Error('都道府県名を解釈できません: ' + name);
}

/** 四捨五入(0から遠い方向へ。Pythonの ROUND_HALF_UP と同じ) */
function roundHalfUp_(x, nd) {
  nd = nd || 0;
  var s = x < 0 ? -1 : 1, a = Math.abs(x);
  return s * Number(Math.round(Number(a + 'e' + nd)) + 'e-' + nd);
}

function ceilTo_(x, unit) { return Math.ceil(x / unit) * unit; }

function commas_(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/** 桁区切りカンマ。nd 未指定時は小数の末尾0を落とす */
function num_(x, nd) {
  if (x === null || x === undefined || x === '') return '';
  x = Number(x);
  var neg = x < 0 ? '-' : '';
  var a = Math.abs(x);
  var body;
  if (nd !== undefined && nd !== null) {
    body = roundHalfUp_(a, nd).toFixed(nd);
  } else if (Number.isInteger(a)) {
    body = String(a);
  } else {
    body = a.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }
  var parts = body.split('.');
  return neg + commas_(parts[0]) + (parts[1] !== undefined ? '.' + parts[1] : '');
}

function cityKey_(name) { return String(name || '').replace(/[ 　]/g, ''); }

function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate_(iso) {
  var m = String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return String(iso);
  return Number(m[1]) + '/' + Number(m[2]) + '/' + Number(m[3]);
}


/** 算出・文章生成ルール(areasheet/compute.py の移植) */

var TYPES = ['used_mansion', 'land', 'new_house', 'used_house'];

function listingsTotal_(counts) {
  var sum = 0;
  for (var i = 0; i < TYPES.length; i++) {
    var v = counts[TYPES[i]];
    if (v === null || v === undefined) return null;
    sum += v;
  }
  return sum;
}

function brokerageFee_(priceMan) { return priceMan * 0.03 + 6.0; }

function brokerageUnit_(prices, counts) {
  var n = 0, tot = 0;
  for (var i = 0; i < TYPES.length; i++) {
    var t = TYPES[i];
    if (prices[t] == null || counts[t] == null) return null;
    n += counts[t];
    tot += brokerageFee_(prices[t]) * counts[t];
  }
  return n === 0 ? null : tot / n;
}

function bracketPhrase_(label) {
  return label.replace('万以', '万円以').replace('万未', '万円未').replace('万〜', '万円〜');
}

function incomeView_(city, pref, d) {
  var out = Object.assign({}, d);
  var c = d.city_avg_man, n = d.national_avg_man;
  out.diff_vs_national_man = (c == null || n == null) ? null : n - c; // 全国 − 市
  var br = (d.brackets || []).map(function (b) { return Object.assign({}, b); });
  if (br.length) {
    var hh = br.map(function (b) { return b.households; });
    if (hh.every(function (h) { return h != null; }) && hh.reduce(function (a, b) { return a + b; }, 0) > 0) {
      var tot = hh.reduce(function (a, b) { return a + b; }, 0);
      br.forEach(function (b) { if (b.share == null) b.share = b.households / tot; });
    }
    out.brackets = br;
    if (br.every(function (b) { return b.share != null; })) {
      out.share_sum = br.reduce(function (a, b) { return a + b.share; }, 0);
      var top = br.reduce(function (m, b) { return b.share > m.share ? b : m; }, br[0]);
      out.largest_bracket = { label: top.label, households: top.households, share: top.share };
    }
  }
  var rank = d.rank_in_prefecture, N = d.municipalities_in_prefecture;
  if (rank && N && c != null && n != null) {
    var rel = c < n ? '下' : c > n ? '上' : '同じ';
    out.headline = pref + 'で' + rank + '位/' + N + '市町村中　全国平均より' + rel;
    var lb = out.largest_bracket;
    if (lb && lb.households != null) {
      var diff = Math.abs(n - c);
      var verb = c > n ? '上回る' : '下回る';
      var diffTxt = diff ? num_(diff) + '万円' + verb + '結果になりました' : '同水準の結果になりました';
      out.body = city + 'の平均年収は' + num_(c) + '万円です。' + pref + 'の' + N + '市町村の中で' + rank +
        '位となり、全国の平均年収からは' + diffTxt + '。' +
        '年収階級別にみると年収' + bracketPhrase_(lb.label) + 'の世帯が一番多く' +
        num_(lb.households) + '世帯（' + roundHalfUp_(lb.share * 100, 1).toFixed(1) + '%）となります。';
    }
  }
  return out;
}

function trendJudge_(cityPct, prefPct, threshold) {
  var diff = cityPct - prefPct;
  if (Math.abs(diff) <= threshold + 1e-9) return '同程度';
  return diff > 0 ? '高い' : '低い';
}

function trendView_(city, pref, d, threshold) {
  var out = Object.assign({}, d);
  var y = d.yearly_pct;
  if (d.city_3y_pct == null && y && y.length === 3) {
    out.city_3y_pct = roundHalfUp_(y[0] + y[1] + y[2], 2);
    out.city_3y_pct_derived = true;
  }
  var c = out.city_3y_pct, p = out.prefecture_3y_pct;
  if (c != null && p != null) {
    out.judgement_vs_prefecture = trendJudge_(c, p, threshold);
    out.diff_pt = roundHalfUp_(c - p, 2);
  }
  if (c != null && p != null && y && y.length === 3) {
    var verb = c >= 0 ? '上昇' : '下落';
    out.body = city + 'の標準的な物件の価格は直近の3年間で' + num_(Math.abs(c), 2) + '%程度' + verb + 'しています。' +
      'これは' + city + 'のある' + pref + 'の変動の' + num_(p, 2) + '%に比べて' + out.judgement_vs_prefecture + 'の水準です。' +
      'この3年間の価格上昇率を内訳でみると、初年度' + num_(y[0], 2) + '%、2年目' + num_(y[1], 2) + '%、' +
      '3年目' + num_(y[2], 2) + '%となっています。';
  }
  return out;
}

function pointText_(total, unit) {
  var n = ceilTo_(total, unit);
  return '商圏で' + num_(n) + '件前後の物件情報数を担保できれば、商圏No.1の情報量を担保するHPを作り上げることが実証される';
}


/** 行政区域(国土数値情報由来)の取得・隣接判定・静的SVG地図(areasheet/geo.py の移植) */

var GEO_URL_ = 'https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/municipality/geojson/s0010/N03-21_{code}_210101.json';
var GEO_SOURCE = '国土数値情報 行政区域データ(2021-01-01時点)';
var GEO_LICENSE_NOTE = '出典: 国土数値情報(行政区域データ) 国土交通省 / 加工: smartnews-smri/japan-topography';

function muniName_(p) {
  var c3 = p.N03_003, c4 = p.N03_004;
  if (c3 && /市$/.test(c3) && c4 && /区$/.test(c4)) return c3;
  return c4 || null;
}

function polysOf_(geom) {
  return geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
}

function buildPrefecture_(pref, geojson) {
  var munis = {}, order = [];
  geojson.features.forEach(function (f) {
    var name = muniName_(f.properties);
    if (!name) return;
    if (!munis[name]) { munis[name] = { code: f.properties.N03_007 || '', polys: [] }; order.push(name); }
    polysOf_(f.geometry).forEach(function (p) { munis[name].polys.push(p); });
  });
  return { pref: pref, munis: munis, names: order };
}

function resolveCity_(P, city) {
  var key = cityKey_(city);
  if (P.munis[key]) return key;
  var sfx = ['市', '区', '町', '村'];
  for (var i = 0; i < sfx.length; i++) if (P.munis[key + sfx[i]]) return key + sfx[i];
  var cands = P.names.filter(function (n) { return key && n.indexOf(key.slice(0, 2)) >= 0; }).slice(0, 8);
  throw new Error(P.pref + 'に「' + city + '」が見つかりません(2021年1月時点の市区町村名)。候補: ' + cands.join('、'));
}

function vkey_(pt) { return pt[0].toFixed(5) + ',' + pt[1].toFixed(5); }

/** 対象と共有頂点が2つ以上ある市区町村を、共有頂点の多い順に返す */
function neighborsOf_(P, name) {
  var mine = {};
  P.munis[name].polys.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(function (pt) { mine[vkey_(pt)] = 1; }); }); });
  var res = [];
  P.names.forEach(function (other) {
    if (other === name) return;
    var seen = {}, n = 0;
    P.munis[other].polys.forEach(function (poly) {
      poly.forEach(function (ring) {
        ring.forEach(function (pt) { var k = vkey_(pt); if (mine[k] && !seen[k]) { seen[k] = 1; n++; } });
      });
    });
    if (n >= 2) res.push([other, n]);
  });
  res.sort(function (a, b) { return b[1] - a[1]; });
  return res.map(function (r) { return r[0]; });
}

function ringAreaCentroid_(ring) {
  var a = 0, cx = 0, cy = 0;
  for (var i = 0; i < ring.length - 1; i++) {
    var x0 = ring[i][0], y0 = ring[i][1], x1 = ring[i + 1][0], y1 = ring[i + 1][1];
    var c = x0 * y1 - x1 * y0;
    a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  if (a === 0) return [0, ring[0][0], ring[0][1]];
  return [Math.abs(a) / 2, cx / (3 * a), cy / (3 * a)];
}

function renderMapSvg_(P, target) {
  var width = 640, rings = [];
  P.names.forEach(function (name) {
    P.munis[name].polys.forEach(function (poly) {
      var ac = ringAreaCentroid_(poly[0]);
      rings.push({ name: name, poly: poly, area: ac[0], cx: ac[1], cy: ac[2] });
    });
  });
  var tot = rings.reduce(function (s, r) { return s + r.area; }, 0) || 1;
  var mx = rings.reduce(function (s, r) { return s + r.cx * r.area; }, 0) / tot;
  var my = rings.reduce(function (s, r) { return s + r.cy * r.area; }, 0) / tot;
  var keep = rings.filter(function (r) { return Math.hypot(r.cx - mx, r.cy - my) < 5.0 || r.name === target; });
  var lon0 = Infinity, lon1 = -Infinity, lat0 = Infinity, lat1 = -Infinity;
  keep.forEach(function (r) { r.poly[0].forEach(function (p) {
    if (p[0] < lon0) lon0 = p[0]; if (p[0] > lon1) lon1 = p[0];
    if (p[1] < lat0) lat0 = p[1]; if (p[1] > lat1) lat1 = p[1];
  }); });
  var k = Math.cos((lat0 + lat1) / 2 * Math.PI / 180);
  var wDeg = (lon1 - lon0) * k, hDeg = lat1 - lat0, pad = 8;
  var scale = (width - 2 * pad) / wDeg;
  var height = Math.floor(hDeg * scale + 2 * pad);
  function pt(x, y) { return ((x - lon0) * k * scale + pad).toFixed(1) + ',' + ((lat1 - y) * scale + pad).toFixed(1); }
  var other = [], tgt = [];
  keep.forEach(function (r) {
    var d = '';
    r.poly.forEach(function (ring) {
      var pts = [], last = null;
      ring.forEach(function (p) { var s = pt(p[0], p[1]); if (s !== last) { pts.push(s); last = s; } });
      if (pts.length >= 3) d += 'M' + pts.join('L') + 'Z';
    });
    (r.name === target ? tgt : other).push('<path d="' + d + '"/>');
  });
  var best = 0, cxT = null, cyT = null;
  keep.forEach(function (r) { if (r.name === target && r.area > best) { best = r.area; cxT = r.cx; cyT = r.cy; } });
  var t = cxT !== null ? pt(cxT, cyT).split(',') : ['0', '0'];
  var lab = '<text class="map-label" x="' + t[0] + '" y="' + (parseFloat(t[1]) - 10).toFixed(1) + '" text-anchor="middle">' + esc_(target) + '</text>';
  return '<svg class="area-map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' +
    esc_(P.pref) + 'の地図。' + esc_(target) + 'を強調表示"><g class="map-other">' + other.join('') + '</g><g class="map-target">' + tgt.join('') + '</g>' + lab + '</svg>';
}

/** 都道府県の境界を取得し、(対象市の)地図SVG・隣接市・市町村数・団体コードを返す。結果はキャッシュする */
function loadGeo_(services, pref, city) {
  var cacheKey = 'geo2:' + pref + ':' + city;
  var hit = services.cacheGet(cacheKey);
  if (hit) return JSON.parse(hit);
  var geojson = services.fetchJson(GEO_URL_.replace('{code}', ('0' + prefCode_(pref)).slice(-2)));
  var P = buildPrefecture_(pref, geojson);
  var name = resolveCity_(P, city);
  var res = { city: name, code: P.munis[name].code, count: P.names.length, neighbors: neighborsOf_(P, name), svg: renderMapSvg_(P, name) };
  services.cachePut(cacheKey, JSON.stringify(res));
  return res;
}


/** 周辺加盟店の選定(areasheet/franchise.py の移植)。一覧は 加盟店一覧 シートから読む */

var FR_TIERS_ = ['same_city', 'adjacent', 'same_prefecture'];

/** 既定: 同一市 → 隣接市 → 同一県 の順に、最初に該当があった段階の加盟店(最大 max 社) */
function selectFranchise_(rows, pref, city, neighbors, opt) {
  opt = opt || {};
  var max = opt.max || 3, tiers = opt.tiers || FR_TIERS_, stop = opt.stop_at_first_tier !== false;
  tiers.forEach(function (t) { if (FR_TIERS_.indexOf(t) < 0) throw new Error('franchise.tiers が不正です: ' + t); });
  var pool = rows.filter(function (r) { return r.prefecture === pref; });
  var picked = [], used = [];
  function add(cands, tier) {
    cands.forEach(function (r) {
      if (picked.length >= max || picked.indexOf(r) >= 0) return;
      picked.push(r); r._tier = tier;
      if (used.indexOf(tier) < 0) used.push(tier);
    });
  }
  for (var i = 0; i < tiers.length; i++) {
    var tier = tiers[i], c;
    if (tier === 'same_city') c = pool.filter(function (r) { return r.city === city; });
    else if (tier === 'adjacent') {
      c = pool.filter(function (r) { return neighbors.indexOf(r.city) >= 0; })
        .sort(function (a, b) { return neighbors.indexOf(a.city) - neighbors.indexOf(b.city); });
    } else c = pool.filter(function (r) { return r.city !== city; });
    add(c, tier);
    if (picked.length && stop) break;
  }
  return { items: picked.map(function (r) {
    return { name: r.name, prefecture: r.prefecture, city: r.city, url: r.url || '', area: r.prefecture + ' ' + r.city, tier: r._tier };
  }), tiers_used: used };
}


/** 物件データから相場・中央値・分布表を集計(areasheet/listings.py の移植) */

var TSUBO_ = 3.305785;
var TYPE_ALIASES_ = {
  land: ['土地', 'land'], used_house: ['中古戸建て', '中古戸建', '中古一戸建て', 'used_house'],
  used_mansion: ['中古マンション', 'マンション', 'used_mansion'], new_house: ['新築戸建て', '新築戸建', '新築一戸建て', 'new_house']
};
var PRICE_EDGES_ = [2000, 3000, 4000, 5000, 6000, 7000, 10000];
var AREA_EDGES_ = {
  land_area_m2: [60, 70, 80, 90, 100, 110, 120, 130, 140, 150],
  building_area_m2: [60, 70, 80, 90, 100, 110, 120, 130],
  exclusive_area_m2: [40, 50, 60, 70, 80, 90, 100]
};

function medianOf_(xs) {
  var a = xs.slice().sort(function (x, y) { return x - y; }), n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}
function med_(rows, key, nd) {
  var xs = rows.map(function (r) { return r[key]; }).filter(function (v) { return v != null && !isNaN(v); });
  if (!xs.length) return null;
  return roundHalfUp_(medianOf_(xs), nd || 0);
}
function heat_(rows, areaKey) {
  var edges = AREA_EDGES_[areaKey], pe = PRICE_EDGES_;
  var pts = rows.filter(function (r) { return r[areaKey] != null; });
  if (!pts.length) return null;
  var grid = [];
  for (var i = 0; i <= edges.length; i++) { grid.push(new Array(pe.length + 1).fill(0)); }
  pts.forEach(function (r) {
    var a = r[areaKey], p = r.price_man, i = edges.length, j = pe.length;
    for (var n = 0; n < edges.length; n++) if (a <= edges[n]) { i = n; break; }
    for (var m = 0; m < pe.length; m++) if (p < pe[m]) { j = m; break; }
    grid[i][j]++;
  });
  var rl = edges.map(function (e) { return '〜' + e + '㎡'; }).concat([edges[edges.length - 1] + '㎡超']);
  var cl = ['〜' + num_(pe[0])].concat(pe.map(function (e) { return e < 10000 ? num_(e) + '〜' : '1億〜'; }));
  var mx = 0; grid.forEach(function (r) { r.forEach(function (v) { if (v > mx) mx = v; }); });
  return { rows: rl, cols: cl, grid: grid, max: mx };
}

/** rows: [{type, price_man, land_area_m2, building_area_m2, exclusive_area_m2, age_years, zone}] */
function summarizeListings_(rows) {
  var by = {};
  Object.keys(TYPE_ALIASES_).forEach(function (k) { by[k] = []; });
  rows.forEach(function (r) {
    var key = null;
    Object.keys(TYPE_ALIASES_).forEach(function (k) { if (TYPE_ALIASES_[k].indexOf(String(r.type).trim()) >= 0) key = k; });
    if (key && r.price_man != null && !isNaN(r.price_man)) by[key].push(r);
  });
  var res = {};
  Object.keys(by).forEach(function (key) {
    var rs = by[key];
    if (!rs.length) return;
    var s = { listings: rs.length, price_man: med_(rs, 'price_man') };
    if (key === 'land') {
      rs.forEach(function (r) { if (r.land_area_m2) { r.tsubo = r.price_man / (r.land_area_m2 / TSUBO_); r.per_m2 = r.price_man / r.land_area_m2; } });
      var low = rs.filter(function (r) { return r.zone && String(r.zone).indexOf('低層') >= 0; });
      var oth = rs.filter(function (r) { return r.zone && String(r.zone).indexOf('住居') >= 0 && String(r.zone).indexOf('低層') < 0; });
      s.tsubo_price_man = med_(rs, 'tsubo', 1);
      s.tsubo_price_low_rise_residential_man = med_(low, 'tsubo', 1);
      s.tsubo_price_other_residential_man = med_(oth, 'tsubo', 1);
      s.price_per_m2_man = med_(rs, 'per_m2', 1);
      s.land_area_median_m2 = med_(rs, 'land_area_m2');
    } else if (key === 'used_mansion') {
      rs.forEach(function (r) { if (r.exclusive_area_m2) r.per_m2 = r.price_man / r.exclusive_area_m2; });
      s.exclusive_area_median_m2 = med_(rs, 'exclusive_area_m2'); s.age_median_years = med_(rs, 'age_years');
      s.price_per_m2_man = med_(rs, 'per_m2', 1);
      s.heatmaps = { exclusive_area_m2: heat_(rs, 'exclusive_area_m2') };
    } else {
      s.building_area_median_m2 = med_(rs, 'building_area_m2'); s.land_area_median_m2 = med_(rs, 'land_area_m2');
      s.heatmaps = { land_area_m2: heat_(rs, 'land_area_m2'), building_area_m2: heat_(rs, 'building_area_m2') };
      if (key === 'used_house') s.age_median_years = med_(rs, 'age_years');
    }
    res[key] = s;
  });
  return res;
}


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


/** 設定(シート)→ 取得 → 集計 → モデルと取得レポート(areasheet/pipeline.py の移植) */

var PRICE_NOTES = [
  '※この情報は不動産価格を保証するものではありません。',
  '※相場価格はSUUMOでの最終掲載時の価格をもとに算出しています。',
  '※相場価格は成約価格を表すものではありません'];

function deepMerge_(base, over) {
  var out = JSON.parse(JSON.stringify(base || {}));
  Object.keys(over || {}).forEach(function (k) {
    var v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge_(out[k], v);
    else if (v !== undefined) out[k] = v;
  });
  return out;
}

function Report_() { this.items = []; }
Report_.prototype.add = function (key, label, status, method, reason) {
  this.items.push({ key: key, label: label, status: status, method: method || '', reason: reason || '' });
};
Report_.prototype.missing = function () { return this.items.filter(function (i) { return i.status === 'missing'; }); };

function empty_(v) { return v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && v !== null && !Array.isArray(v) && !Object.keys(v).length); }

function status_(rep, key, label, value, hint) {
  if (empty_(value)) rep.add(key, label, 'missing', '', '未入力。' + hint);
  else rep.add(key, label, 'input', '入力システム');
}

function src_(sec, created, rep, key) {
  var s = sec.source;
  if (!s) { rep.add(key + '.source', key + ' 出典名', 'missing', '', '出典名(source)が未設定'); s = '出典未設定'; }
  var d = sec.date;
  if (!d) { d = created; rep.add(key + '.date', key + ' 取得日', 'input', '', 'date未設定のため作成日を表示'); }
  return [s, fmtDate_(d)];
}

var KEYS_ = {
  income: ['city_avg_man', 'prefecture_avg_man', 'national_avg_man', 'rank_in_prefecture', 'municipalities_in_prefecture', 'headline', 'body', 'brackets', 'largest_bracket', 'share_sum', 'diff_vs_national_man'],
  price_trend: ['city_3y_pct', 'prefecture_3y_pct', 'yearly_pct', 'series', 'image', 'body', 'judgement_vs_prefecture'],
  land: ['tsubo_price_man', 'tsubo_price_low_rise_residential_man', 'tsubo_price_other_residential_man', 'listings', 'price_man', 'price_per_m2_man', 'land_area_median_m2', 'heatmaps', 'heatmap_image'],
  used_house: ['price_man', 'listings', 'building_area_median_m2', 'land_area_median_m2', 'age_median_years', 'heatmaps', 'heatmap_image'],
  used_mansion: ['price_man', 'listings', 'exclusive_area_median_m2', 'age_median_years', 'heatmaps', 'heatmap_image'],
  new_house: ['price_man', 'listings', 'building_area_median_m2', 'land_area_median_m2', 'heatmaps', 'heatmap_image']
};

/**
 * cfg: 会社名・商圏・inputs など(YAML設定と同じ構造)
 * services: { cacheGet, cachePut, fetchJson, estatHouseholds(areaCode) }
 * data: { franchiseRows: [], listingRows: [] }
 */
function buildModel_(cfg, services, data) {
  var rep = new Report_();
  var pref = normalizePrefecture_(cfg.prefecture), city = cfg.city, created = cfg.created;
  var inputs = cfg.inputs || {}, opts = deepMerge_({
    trend_same_threshold_pt: 1.0, point_round_unit: 10, compare_city_count: 5,
    franchise: { max: 3, tiers: ['same_city', 'adjacent', 'same_prefecture'], stop_at_first_tier: true }
  }, cfg.options || {});
  var now = services.now ? services.now() : new Date().toISOString();

  var geo = null;
  try {
    geo = loadGeo_(services, pref, city);
    city = geo.city;
    rep.add('area.map', '対象市区町村の地図', 'auto', GEO_SOURCE);
  } catch (e) {
    if (String(e.message).indexOf('見つかりません') >= 0) throw e;
    rep.add('area.map', '対象市区町村の地図', 'missing', '', String(e.message));
  }
  var munis = geo ? geo.count : null, neighbors = geo ? geo.neighbors : [], areaCode = geo ? geo.code : '';

  var model = { meta: { company: cfg.company, prefecture: pref, city: city, created: created, created_display: fmtDate_(created),
    generated_at: now, municipalities_in_prefecture: munis, area_code: areaCode, map_source: GEO_LICENSE_NOTE } };

  // --- 対象エリア ---
  var areaIn = inputs.area || {}, hh = { value: null };
  if (areaIn.households != null) {
    hh = { value: areaIn.households, source: areaIn.source || '入力値', fetched_at: String(areaIn.date || created) };
    rep.add('area.households', '世帯数', 'input', '入力システム');
  } else {
    try {
      if (!services.estatHouseholds) throw new Error('e-Stat のアプリケーションIDが未設定');
      var got = services.estatHouseholds(areaCode);
      hh = { value: got.value, source: got.source, fetched_at: now };
      rep.add('area.households', '世帯数', 'auto', got.source);
    } catch (e) {
      rep.add('area.households', '世帯数', 'missing', '', e.message + '。入力システムの「世帯数」に入力');
    }
  }
  model.area = { households: hh.value, households_source: hh.source || null,
    households_date: hh.value ? fmtDate_(String(hh.fetched_at).slice(0, 10)) : null };

  var frOver = cfg.nearby_franchise, sel;
  if (frOver && frOver.length) {
    sel = { items: frOver.map(function (r) { return { name: r.name, area: r.area || '', url: r.url || '', tier: 'override' }; }), tiers_used: ['override'] };
    rep.add('area.franchise', '周辺加盟店', 'input', '上書き');
  } else {
    var rows = data.franchiseRows || [];
    sel = selectFranchise_(rows, pref, city, neighbors, opts.franchise);
    rep.add('area.franchise', '周辺加盟店', rows.length ? 'auto' : 'missing', '加盟店一覧から選定', rows.length ? '' : '加盟店一覧が空です(入力システムの「加盟店」で追加)');
  }
  model.area.franchise = sel;

  // --- 年収 ---
  var incIn = JSON.parse(JSON.stringify(inputs.income || {}));
  if (incIn.municipalities_in_prefecture == null && munis) incIn.municipalities_in_prefecture = munis;
  var inc = incomeView_(city, pref, incIn);
  var s1 = src_(incIn, created, rep, 'income'); inc.source = s1[0]; inc.date = s1[1];
  model.income = inc;
  [['city_avg_man', '市の平均年収'], ['prefecture_avg_man', '県平均年収'], ['national_avg_man', '全国平均年収'],
   ['rank_in_prefecture', '県内順位'], ['brackets', '年収階級別の世帯構成']].forEach(function (p) {
    status_(rep, 'income.' + p[0], p[1], inc[p[0]], '入力システムの年収');
  });

  // --- 価格推移 ---
  var trIn = JSON.parse(JSON.stringify(inputs.price_trend || {}));
  var tr = trendView_(city, pref, trIn, opts.trend_same_threshold_pt);
  var s2 = src_(trIn, created, rep, 'price_trend'); tr.source = s2[0]; tr.date = s2[1];
  tr.ai_note = ['※以下の条件でAI査定した参考価格', '・マンション：築10年/専有面積70㎡', '・一戸建て：築10年/延床面積70㎡', '・土地：敷地面積70㎡'];
  model.price_trend = tr;
  [['city_3y_pct', '市の3年上昇率'], ['prefecture_3y_pct', '県の3年上昇率'], ['yearly_pct', '年ごとの内訳']].forEach(function (p) {
    status_(rep, 'price_trend.' + p[0], p[1], tr[p[0]], '入力システムの価格推移');
  });
  status_(rep, 'price_trend.chart', '価格推移グラフ', tr.series || tr.image, '価格推移グラフの画像');

  // --- 物件(シートの物件データ → 手入力で上書き) ---
  var csvStats = (data.listingRows && data.listingRows.length) ? summarizeListings_(data.listingRows) : {};
  if (data.listingRows && data.listingRows.length) rep.add('listings_data', '物件データ', 'csv', '物件データ(' + data.listingRows.length + '行)');
  [['land', '土地'], ['used_house', '中古戸建て'], ['used_mansion', '中古マンション'], ['new_house', '新築戸建て']].forEach(function (p) {
    var key = p[0], label = p[1], cs = csvStats[key] || {}, secIn = inputs[key] || {};
    var sec = deepMerge_(cs, secIn), fromCsv = !!csvStats[key];
    var source = secIn.source || inputs.listings_source || (fromCsv ? (inputs.listings_source || '自社物件データ') : null);
    var date = secIn.date || inputs.listings_date || (fromCsv ? created : null);
    var sd = src_({ source: source, date: date }, created, rep, key); sec.source = sd[0]; sec.date = sd[1];
    model[key] = sec;
    status_(rep, key + '.price_man', label + ' 売却価格相場', sec.price_man, label + 'の入力');
    status_(rep, key + '.listings', label + ' 物件数', sec.listings, label + 'の入力');
    if (key !== 'land') status_(rep, key + '.heatmap', label + ' 面積×価格の分布', sec.heatmaps || sec.heatmap_image, '分布表の画像');
  });
  var land = model.land;
  [['tsubo_price_man', '坪単価'], ['tsubo_price_low_rise_residential_man', '低層住居専用地域の坪単価'], ['tsubo_price_other_residential_man', 'その他の住居専用地域の坪単価']].forEach(function (p) {
    status_(rep, 'land.' + p[0], p[1], land[p[0]], '土地の入力');
  });
  var lsIn = inputs.land_summary || {};
  ['price_man', 'price_per_m2_man', 'land_area_median_m2'].forEach(function (k) { if (lsIn[k] != null) land[k] = lsIn[k]; });
  [['price_man', '土地 売却価格相場(まとめ用)'], ['price_per_m2_man', '土地 ㎡単価'], ['land_area_median_m2', '土地 土地面積(中央値)']].forEach(function (p) {
    status_(rep, 'land_summary.' + p[0], p[1], land[p[0]], '土地の入力');
  });
  var low = land.tsubo_price_low_rise_residential_man, oth = land.tsubo_price_other_residential_man, allp = land.tsubo_price_man;
  land.tsubo_note = !!(allp != null && low != null && oth != null && allp < Math.min(low, oth));
  land.compare = compare_(cfg, land, city, neighbors, rep, opts);

  // --- キーワード ---
  var kwIn = inputs.keywords || {};
  var terms = kwIn.terms || ['土地', '中古マンション', '不動産', '中古物件'];
  var given = {};
  (kwIn.rows || []).forEach(function (r) { given[r.term] = r; });
  var rows2 = terms.map(function (t) {
    var r = given[t] || {};
    status_(rep, 'keywords.' + t, '検索ボリューム「' + city + ' ' + t + '」', r.monthly_volume, '入力システムの検索ボリューム。Google広告APIは未接続');
    return { keyword: city + '　' + t, term: t, monthly_volume: r.monthly_volume == null ? null : r.monthly_volume,
      cpc_low_yen: r.cpc_low_yen == null ? null : r.cpc_low_yen, cpc_high_yen: r.cpc_high_yen == null ? null : r.cpc_high_yen };
  });
  rows2.sort(function (a, b) { return (b.monthly_volume == null ? -1 : b.monthly_volume) - (a.monthly_volume == null ? -1 : a.monthly_volume); });
  var kwSrc = kwIn.source || (Object.keys(given).length ? 'google広告調べ' : null);
  var s3 = src_({ source: kwSrc, date: kwIn.date }, created, rep, 'keywords');
  model.keywords = { rows: rows2, source: s3[0], date: s3[1] };

  // --- まとめ ---
  var counts = {}, prices = {};
  TYPES.forEach(function (t) { counts[t] = model[t].listings == null ? null : model[t].listings; prices[t] = model[t].price_man == null ? null : model[t].price_man; });
  var total = listingsTotal_(counts), bu = brokerageUnit_(prices, counts);
  var sdates = TYPES.map(function (t) { return model[t].date; });
  var uniq = sdates.filter(function (d, i) { return sdates.indexOf(d) === i; });
  var srcs = TYPES.map(function (t) { return model[t].source; }).filter(function (d, i, a) { return a.indexOf(d) === i; });
  model.totals = {
    listings_total: total, brokerage_unit_man: bu == null ? null : roundHalfUp_(bu, 2),
    brokerage_unit_display_man: bu == null ? null : roundHalfUp_(bu, 0),
    point_listings_rounded: total == null ? null : ceilTo_(total, opts.point_round_unit),
    point_text: total == null ? null : pointText_(total, opts.point_round_unit),
    source: srcs.join('・'), date: uniq.length === 1 ? sdates[0] : sdates.slice().sort(function (a, b) { return new Date(a.replace(/\//g, '-')) - new Date(b.replace(/\//g, '-')); }).pop()
  };
  rep.add('totals.listings_total', '物件総数', total != null ? 'calc' : 'missing', '4種別の物件数の合計', total != null ? '' : '4種別すべての物件数が必要');
  rep.add('totals.brokerage_unit', '仲介単価', bu != null ? 'calc' : 'missing', '各種別(相場×3%+6万円)の物件数による加重平均(税抜)', bu != null ? '' : '4種別すべての相場と物件数が必要');

  // --- 近隣不動産会社 ---
  var comps = cfg.competitors || [];
  model.competitors = { items: comps.map(function (c) { return { name: c.name, area: c.area || city, url: c.url || '', listing_count: c.listing_count == null ? null : c.listing_count }; }),
    queries: [city + '　不動産', city + '　土地', city + '　中古'] };
  rep.add('competitors', '近隣不動産会社3社', comps.length >= 3 ? 'input' : 'missing', comps.length ? '入力システム' : '',
    comps.length >= 3 ? '' : '検索結果の自動取得は規約上行わない。入力システムの「近隣不動産会社」に3社入力(検索語: ' + model.competitors.queries.join(' / ') + ')');
  model.competitors.items.forEach(function (c) {
    rep.add('competitors.count.' + c.name, c.name + ' 掲載物件数', c.listing_count != null ? 'input' : 'optional', c.listing_count != null ? '入力システム' : '',
      c.listing_count != null ? '' : '各社サイトの構造が異なり自動取得しない。任意(サンプルも空欄)');
  });
  model.cta_url = cfg.cta_url || null;
  rep.add('hero', 'ヒーロー・結論の指標', 'calc', '入力値と計算値から生成');
  rep.add('fixed.listings_image', '加盟店様の物件情報量(画像)', 'fixed', '固定画像');
  rep.add('fixed.question', '問いかけ', 'fixed', 'サンプルから流用');

  model._mapSvg = geo ? geo.svg : null;
  Object.keys(KEYS_).forEach(function (sec) { KEYS_[sec].forEach(function (k) { if (model[sec][k] === undefined) model[sec][k] = null; }); });
  return { model: model, report: rep };
}

function compare_(cfg, land, city, neighbors, rep, opts) {
  var given = cfg.compare_cities || ((cfg.inputs || {}).land || {}).compare_cities;
  var n = opts.compare_city_count;
  var suggestion = neighbors.filter(function (x) { return /市$/.test(x); }).slice(0, Math.max(0, n - 1));
  var items = (given || []).map(function (r) { var o = Object.assign({}, r); o.highlight = (o.city === city); return o; });
  if (items.length && !items.some(function (r) { return r.highlight; })) {
    items.push({ city: city, tsubo_price_man: land.tsubo_price_man, listings: land.listings, highlight: true });
  }
  items.forEach(function (r) {
    if (r.highlight) {
      if (land.tsubo_price_man != null) r.tsubo_price_man = land.tsubo_price_man;
      if (land.listings != null) r.listings = land.listings;
    }
  });
  if (!items.length) {
    rep.add('land.compare', '土地 比較5市の坪単価・物件数', 'missing', '',
      '比較市の値が未入力。人口データが未接続のため、隣接市(境界の長い順)を候補として提示: ' + suggestion.join('、') + '。入力システムの「比較市」に 市名・坪単価・物件数 を入力');
  } else {
    var bad = items.filter(function (r) { return r.tsubo_price_man == null || r.listings == null; }).map(function (r) { return r.city; });
    rep.add('land.compare', '土地 比較5市の坪単価・物件数', bad.length ? 'missing' : 'input', '設定値', bad.length ? '値が欠けている市: ' + bad.join('、') : '');
  }
  return { items: items, suggested: suggestion };
}


/** モデル → LPのHTML(areasheet/render.py + templates/index.html.j2 の移植) */

var TOC_ = [['area', '対象エリア'], ['income', '年収'], ['trend', '価格推移'], ['land', '土地'], ['used_house', '中古戸建て'],
  ['used_mansion', '中古マンション'], ['new_house', '新築戸建て'], ['search', '検索ボリューム'], ['summary', 'まとめ'], ['point', 'POINT'], ['competitors', '近隣HP']];

function slot_(label, keys) {
  return '<div class="slot" role="note"><b>未入力: ' + esc_(label) + '</b>入力システムで入力してください: ' +
    keys.map(function (k) { return '<code>' + esc_(k) + '</code>'; }).join(' / ') + '</div>';
}
function kpi_(value, unit, label, cls, nd) {
  var body = value != null
    ? '<span data-count="' + value + '">' + num_(value, nd) + '</span><span class="u">' + unit + '</span>'
    : '<span aria-label="未入力">—</span>';
  return '<div class="kpi ' + (cls || '') + '"><div class="kpi-num num">' + body + '</div><div class="kpi-label">' + esc_(label) + '</div></div>';
}
function srcline_(sec) { return '<p class="src">（' + esc_(sec.date) + '　' + esc_(sec.source) + '）</p>'; }

function heat_html_(h, title) {
  var th = h.cols.map(function (c) { return '<th scope="col">' + esc_(c) + '</th>'; }).join('');
  var body = h.rows.map(function (r, i) {
    return '<tr><th scope="row">' + esc_(r) + '</th>' + h.grid[i].map(function (v) {
      if (!v) return '<td></td>';
      var a = (0.12 + 0.55 * v / h.max).toFixed(2), col = v / h.max > 0.7 ? '#fff' : '#212121';
      return '<td style="background:rgba(0,151,167,' + a + ');color:' + col + '">' + v + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<div class="heat-wrap"><table class="heat"><caption>' + esc_(title) + '（件数／横軸は価格・万円）</caption><thead><tr><th scope="col"></th>' + th + '</tr></thead><tbody>' + body + '</tbody></table></div>';
}

function houseSection_(id, no, sec, label) {
  var ok = sec.price_man != null && sec.listings != null;
  var h2 = ok ? esc_(label) + 'の相場は<span class="em">' + num_(sec.price_man) + '万円</span>、物件数は<span class="em">' + num_(sec.listings) + '件</span>' : esc_(label) + 'の価格相場・物件数';
  var s = '<section class="sec' + (no % 2 === 0 ? ' alt' : '') + '" id="' + id + '"><div class="wrap rv"><p class="sec-no">' + ('0' + no).slice(-2) + '　' + esc_(label) + '</p><h2>' + h2 + '</h2>';
  s += '<div class="grid g2" style="max-width:640px">' + kpi_(sec.price_man, '万円', '売却価格相場') + kpi_(sec.listings, '件', '物件数') + '</div>';
  if (!ok) s += '<div style="margin-top:16px">' + slot_(label + 'の相場・物件数', [label + 'の相場・物件数']) + '</div>';
  s += '<div style="margin-top:28px">';
  if (sec.heatmap_image) {
    s += '<figure class="fig"><img src="' + esc_(sec.heatmap_image) + '" alt="' + esc_(label) + 'の面積と価格の分布表" loading="lazy"></figure>';
  } else if (sec.heatmaps) {
    var keys = Object.keys(sec.heatmaps).filter(function (k) { return sec.heatmaps[k]; });
    s += '<div class="grid' + (keys.length > 1 ? ' g2' : '') + '">' + keys.map(function (k) {
      return heat_html_(sec.heatmaps[k], (k === 'land_area_m2' ? '土地面積' : k === 'building_area_m2' ? '建物面積' : '専有面積') + '×価格');
    }).join('') + '</div>';
  } else {
    s += slot_('面積×価格の分布', [label + 'の分布表(画像)']);
  }
  s += '</div><ul class="notes note">' + PRICE_NOTES.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>' + srcline_(sec) + '</div></section>';
  return s;
}

function typeCard_(title, sec, rows) {
  var s = '<div class="card tcard"><h3>' + esc_(title) + '</h3><dl><dd class="big" style="grid-column:1/-1;text-align:left">' +
    (sec.price_man != null ? num_(sec.price_man) + '<span style="font-size:.5em;font-weight:500">万円</span>' : '—') +
    '</dd><dt style="grid-column:1/-1;margin-top:-4px">売却価格相場</dt><hr>';
  rows.forEach(function (r) { s += '<dt>' + esc_(r[0]) + '</dt><dd>' + (r[1] != null ? num_(r[1]) + r[2] : '—') + '</dd>'; });
  return s + '</dl></div>';
}

function renderPage_(model, report, assets, styleCss) {
  var m = model.meta, a = model.area, inc = model.income, tr = model.price_trend, land = model.land, kw = model.keywords,
    t = model.totals, comp = model.competitors, uh = model.used_house, um = model.used_mansion, nh = model.new_house;
  var missing = report.missing().length;
  var br = inc.brackets || [];
  var donut = (br.length && br.every(function (b) { return b.share != null; })) ? donutSvg_(br) : null;
  var haveBars = inc.city_avg_man != null && inc.prefecture_avg_man != null && inc.national_avg_man != null;
  function barsFor(w) { return hbarsSvg_([[m.city, inc.city_avg_man, true], [m.prefecture, inc.prefecture_avg_man, false], ['全国', inc.national_avg_man, false]], w); }
  var trendD = tr.series ? trendLinesSvg_(tr.series, false) : null, trendC = tr.series ? trendLinesSvg_(tr.series, true) : null;
  var items = land.compare.items;
  var landOk = items.length && items.every(function (r) { return r.tsubo_price_man != null && r.listings != null; });
  var vols = kw.rows.map(function (r) { return r.monthly_volume; }).filter(function (v) { return v != null; });
  var kwMax = vols.length ? Math.max.apply(null, vols) : 1;
  var kwMissing = kw.rows.some(function (r) { return r.monthly_volume == null || r.cpc_low_yen == null; });
  var toc = [['top', '表紙']].concat(TOC_);
  var h = [];
  h.push('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow,noarchive,noimageindex"><title>エリア調査シート｜' + esc_(m.company) + ' 御中｜' + esc_(m.city) + '</title>' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap">' +
    '<style>' + styleCss + '</style><script>document.documentElement.classList.add("js")</script></head><body>');
  if (missing) h.push('<div class="draft"><div class="wrap"><b>下書き</b><span>未入力の項目が' + missing + '件あります(黄色の枠)。入力システムで入力すると、このページを再読み込みするだけで反映されます。</span></div></div>');
  h.push('<nav class="nav" aria-label="ページ内移動"><div class="wrap"><img src="' + assets.logoTeal + '" alt="物件王">' +
    toc.map(function (x) { return '<a class="i" href="#' + x[0] + '">' + x[1] + '</a>'; }).join('') + '</div></nav>');
  // hero
  h.push('<header class="hero" id="top"><div class="wrap"><div><p class="eyebrow">エリア調査シート</p><h1>' + esc_(m.company) + '<small>御中</small></h1>' +
    '<p><span class="pill">' + esc_(m.prefecture) + '　' + esc_(m.city) + '</span><span class="date">' + m.created_display + ' 作成</span></p></div>' +
    '<img class="king" src="' + assets.king + '" alt="物件王の王様キャラクター"><div class="conclusions rv">' +
    kpi_(t.listings_total, '件', '物件総数', 'accent') + kpi_(t.brokerage_unit_display_man, '万円', '仲介単価(約)', 'accent') +
    '<div class="kpi"><div class="kpi-num">' + esc_(m.city) + '</div><div class="kpi-label">調査した商圏(' + esc_(m.prefecture) + ')</div></div></div>' +
    '<nav class="anchors" aria-label="セクション">' + toc.filter(function (x) { return x[0] !== 'top'; }).map(function (x) { return '<a href="#' + x[0] + '">' + x[1] + '</a>'; }).join('') + '</nav>' +
    (model.cta_url ? '<div><a class="btn" href="' + esc_(model.cta_url) + '">お問い合わせ・資料請求</a></div>' : '') + '</div></header><main>');
  // 01 area
  h.push('<section class="sec" id="area"><div class="wrap rv"><p class="sec-no">01　対象エリア</p><h2>' +
    (a.households != null ? esc_(m.city) + 'を商圏に、<span class="em">' + num_(a.households) + '世帯</span>のエリアを調査しました' : esc_(m.city) + 'を商圏としたエリアを調査しました') +
    '</h2><div class="split"><div>' + (model._mapSvg || slot_('地図', ['行政区域データの取得に失敗'])) + '</div><div class="grid">' + kpi_(a.households, '世帯', '世帯数', 'flat') +
    (a.households == null ? slot_('世帯数', ['世帯数']) : '') + '<div class="card"><p class="sub">周辺加盟店</p>' +
    (a.franchise.items.length ? '<ul class="fr">' + a.franchise.items.map(function (f) {
      return '<li><b>' + esc_(f.name) + '様</b><span>※' + esc_(f.area) + '</span>' + (f.url ? '<br><a href="' + esc_(f.url) + '" rel="noopener noreferrer" target="_blank">' + esc_(f.url) + '</a>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="empty">周辺に加盟店なし</p>') + '</div></div></div>' +
    (a.households != null ? '<p class="src">（' + esc_(a.households_date) + '　' + esc_(a.households_source) + '）</p>' : '') + '</div></section>');
  // 02 income
  h.push('<section class="sec alt" id="income"><div class="wrap rv"><p class="sec-no">02　年収</p><h2>' + esc_(inc.headline || (m.city + 'の平均世帯年収')) + '</h2>' +
    (inc.body ? '<p class="lead">' + esc_(inc.body) + '</p>' : slot_('年収の説明文', ['平均年収・順位・階級別世帯数'])) +
    '<div class="split"><div class="card"><p class="sub">平均世帯年収</p>' +
    (haveBars ? '<div class="chart-d">' + barsFor(560) + '</div><div class="chart-c">' + barsFor(340) + '</div>' : slot_('平均世帯年収', ['市の平均年収', '県平均', '全国平均'])) + '</div>' +
    '<div class="card"><p class="sub">年収階級別の世帯構成比</p>' +
    (donut ? '<div class="chart-d">' + donut + '</div><div class="chart-c"><ul class="dlist">' + br.map(function (b) {
      var top = inc.largest_bracket && b.label === inc.largest_bracket.label, p = roundHalfUp_(b.share * 100, 1);
      return '<li' + (top ? ' class="top"' : '') + '><span>' + esc_(b.label) + '</span><b class="num">' + p + '%</b><i style="width:' + p + '%" aria-hidden="true"></i></li>';
    }).join('') + '</ul></div>' : slot_('年収階級別の世帯構成', ['年収階級の世帯数(5区分)または構成比'])) + '</div></div>' + srcline_(inc) + '</div></section>');
  // 03 trend
  var c3 = tr.city_3y_pct;
  h.push('<section class="sec" id="trend"><div class="wrap rv"><p class="sec-no">03　価格推移</p><h2>' +
    (c3 != null ? '直近3年で価格は<span class="em">' + num_(c3, 2) + '%' + (c3 >= 0 ? '上昇' : '下落') + '</span>' + (tr.judgement_vs_prefecture ? '、' + esc_(m.prefecture) + 'と' + tr.judgement_vs_prefecture : '') : '直近3年間の価格推移') + '</h2>' +
    (tr.body ? '<p class="lead">' + esc_(tr.body) + '</p>' : slot_('価格推移の説明文', ['市の3年上昇率(空欄可)', '県の3年上昇率', '年ごとの内訳(3年分)'])) +
    '<div class="grid g4" style="margin-bottom:24px">' + kpi_(tr.city_3y_pct, '%', m.city + ' 3年間', 'accent', 2) + kpi_(tr.prefecture_3y_pct, '%', m.prefecture + ' 3年間', 'flat', 2) +
    (tr.yearly_pct ? '<div class="kpi flat" style="grid-column:span 2"><div style="display:flex;gap:24px;flex-wrap:wrap">' + ['初年度', '2年目', '3年目'].map(function (lab, i) {
      return '<div><div class="kpi-num num" style="font-size:1.75rem">' + num_(tr.yearly_pct[i], 2) + '<span class="u">%</span></div><div class="kpi-label" style="display:block">' + lab + '</div></div>';
    }).join('') + '</div></div>' : '') + '</div><div class="card">' +
    (tr.image ? '<figure class="fig" style="border:0;padding:0"><img src="' + esc_(tr.image) + '" alt="' + esc_(m.city) + 'の住宅価格推移グラフ"></figure>' :
      trendD ? '<div class="chart-d">' + trendD + '</div><div class="chart-c">' + trendC + '</div>' :
        slot_('価格推移グラフ', ['価格推移グラフ(画像)'])) +
    '<ul class="notes note" style="margin-top:14px">' + tr.ai_note.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul></div>' + srcline_(tr) + '</div></section>');
  // 04 land
  h.push('<section class="sec alt" id="land"><div class="wrap rv"><p class="sec-no">04　土地</p><h2>' +
    (land.tsubo_price_man != null ? esc_(m.city) + 'の土地相場は<span class="em">坪' + num_(land.tsubo_price_man) + '万円</span>' + (land.listings != null ? '、物件数は<span class="em">' + num_(land.listings) + '件</span>' : '') : esc_(m.city) + 'の土地価格相場・物件数') +
    '</h2><div class="grid g4">' + kpi_(land.tsubo_price_man, '万円/坪', '坪単価', 'accent') + kpi_(land.tsubo_price_low_rise_residential_man, '万円/坪', '低層住居専用地域相場', 'flat') +
    kpi_(land.tsubo_price_other_residential_man, '万円/坪', 'それ以外の住居専用地域', 'flat') + kpi_(land.listings, '件', '物件数', 'flat') + '</div>' +
    (land.tsubo_note ? '<p class="note" style="margin-top:12px">※「坪単価」は用途地域を問わず全物件を対象とした中央値のため、用途地域別の相場より低くなる場合があります。</p>' : '') +
    ((land.tsubo_price_man == null || land.listings == null) ? '<div style="margin-top:14px">' + slot_('土地の坪単価・物件数', ['土地の坪単価・物件数']) + '</div>' : '') +
    '<div class="card" style="margin-top:24px"><p class="sub">' + esc_(m.city) + 'と近隣・県内主要市の比較（坪単価と物件数）</p>' +
    (landOk ? '<div class="chart-d">' + landBarsSvg_(items, false) + '</div><div class="chart-c">' + landBarsSvg_(items, true) + '</div>' :
      slot_('比較5市の坪単価・物件数', ['比較市(市名,坪単価,物件数)'].concat(land.compare.suggested.length ? ['候補(隣接市): ' + land.compare.suggested.join('、')] : []))) + '</div>' + srcline_(land) + '</div></section>');
  h.push(houseSection_('used_house', 5, uh, '中古戸建て'), houseSection_('used_mansion', 6, um, '中古マンション'), houseSection_('new_house', 7, nh, '新築戸建て'));
  // 08 search
  var top0 = kw.rows[0];
  h.push('<section class="sec alt" id="search"><div class="wrap rv"><p class="sec-no">08　検索ボリューム</p><h2>' +
    (top0 && top0.monthly_volume != null ? '「' + esc_(top0.keyword) + '」は<span class="em">月に約' + num_(top0.monthly_volume) + '回</span>検索されています' : esc_(m.city) + 'の不動産関連キーワードの検索ボリューム') +
    '</h2><div class="card"><table class="kw"><thead><tr><th scope="col">検索キーワード</th><th scope="col">月間平均検索ボリューム</th><th scope="col">予想クリック単価</th></tr></thead><tbody>' +
    kw.rows.map(function (r) {
      return '<tr><td>' + esc_(r.keyword) + '</td><td class="v num">' + (r.monthly_volume != null ? num_(r.monthly_volume) + '<span class="bar" style="width:' + roundHalfUp_(100 * r.monthly_volume / kwMax, 1) + '%" aria-hidden="true"></span>' : '<span class="note">未入力</span>') +
        '</td><td class="num">' + (r.cpc_low_yen != null && r.cpc_high_yen != null ? '￥' + num_(r.cpc_low_yen) + '～￥' + num_(r.cpc_high_yen) : '<span class="note">未入力</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    (kwMissing ? '<div style="margin-top:14px">' + slot_('検索ボリューム・クリック単価', ['月間ボリューム・CPC下限・CPC上限']) + '</div>' : '') +
    '<p class="src">（' + esc_(kw.date) + '　' + esc_(kw.source) + '）</p></div></section>');
  // 09 summary
  h.push('<section class="sec" id="summary"><div class="wrap rv"><p class="sec-no">09　物件総数・売却相場まとめ</p><h2>' +
    (t.listings_total != null ? '物件総数<span class="em">' + num_(t.listings_total) + '件</span>、仲介単価は約<span class="em">' + t.brokerage_unit_display_man + '万円</span>' : '物件総数・売却相場まとめ') + '</h2>' +
    '<div class="big2">' + kpi_(t.brokerage_unit_display_man, '万円', '仲介単価(約)', 'accent') + kpi_(t.listings_total, '件', '物件総数', 'accent') + '</div>' +
    (t.listings_total == null ? slot_('物件総数・仲介単価', ['4種別すべての相場と物件数(各セクションの入力)']) : '') +
    '<div class="grid tgrid" style="margin-top:16px">' +
    typeCard_('マンション', um, [['専有面積（中央値）', um.exclusive_area_median_m2, '㎡'], ['築年数（中央値）', um.age_median_years, '年']]) +
    typeCard_('土地', land, [['平米単価相場（中央値）', land.price_per_m2_man, '万円/㎡'], ['土地面積（中央値）', land.land_area_median_m2, '㎡']]) +
    typeCard_('新築一戸建て', nh, [['建物面積（中央値）', nh.building_area_median_m2, '㎡'], ['土地面積（中央値）', nh.land_area_median_m2, '㎡']]) +
    typeCard_('中古一戸建て', uh, [['建物面積（中央値）', uh.building_area_median_m2, '㎡'], ['土地面積（中央値）', uh.land_area_median_m2, '㎡'], ['築年数（中央値）', uh.age_median_years, '年']]) +
    '</div><p class="note" style="margin-top:16px">※仲介単価は加重平均で計算しております</p>' + srcline_(t) + '</div></section></main>');
  // point
  h.push('<section class="point" id="point"><div class="wrap rv"><img src="' + assets.king + '" alt="物件王の王様キャラクター"><div><span class="tag">POINT</span>' +
    (t.point_listings_rounded != null ? '<p class="t">商圏で<b class="num">' + num_(t.point_listings_rounded) + '件</b>前後の物件情報数を担保できれば、商圏No.1の情報量を担保するHPを作り上げることが実証される</p>' :
      '<div class="slot"><b>未入力: 物件総数</b>4種別の物件数が揃うと自動で表示されます。</div>') + '</div></div></section>');
  // competitors
  h.push('<section class="sec" id="competitors"><div class="wrap rv comp"><p class="sec-no">10　近隣不動産会社のHP</p><h2>近隣不動産会社のHPだと・・・</h2>' +
    (comp.items.length ? '<div class="grid g3">' + comp.items.map(function (c) {
      return '<div class="card"><p class="name">▼' + esc_(c.name) + '（' + esc_(c.area) + '）</p>' + (c.url ? '<p><a href="' + esc_(c.url) + '" rel="noopener noreferrer" target="_blank" style="word-break:break-all;font-size:.875rem">' + esc_(c.url) + '</a></p>' : '') +
        '<p class="cnt">掲載物件数：' + (c.listing_count != null ? '<b class="num">' + num_(c.listing_count) + '</b>件' : '<span class="note">未入力</span>') + '</p></div>';
    }).join('') + '</div>' + (comp.items.length < 3 ? '<div style="margin-top:14px">' + slot_('近隣不動産会社(3社)・掲載物件数', ['近隣不動産会社(名称,所在市,URL,掲載物件数)', '検索語: ' + comp.queries.join(' / ')]) + '</div>' : '') :
      slot_('近隣不動産会社3社', ['近隣不動産会社(名称,所在市,URL,掲載物件数)', '検索語: ' + comp.queries.join(' / ')])) +
    '<p class="note" style="margin-top:20px">※「' + esc_(m.city) + '　不動産・土地・中古」とそれぞれ検索し、その中から、SEO上位のものを選んでおります</p></div></section>');
  h.push('<section class="sec alt" id="listings"><div class="wrap rv"><p class="sec-no">11　弊社加盟店様の物件情報量</p><h2>弊社加盟店様の物件情報量</h2><figure class="fig"><img src="' + assets.listings + '" alt="加盟店様のホームページの物件掲載例" loading="lazy"></figure></div></section>');
  h.push('<section class="sec q" id="question"><div class="wrap rv"><img class="th" src="' + assets.thinker + '" alt="考え込む男性のイラスト"><h2>どちらのサイトが<br>エンドユーザー様にとって<br><span class="em">魅力的なサイト</span>でしょうか？</h2>' +
    (model.cta_url ? '<a class="btn" href="' + esc_(model.cta_url) + '">お問い合わせ・資料請求</a>' : '') + '<button class="btn" style="background:#fff;border:2px solid var(--c-ink)" onclick="window.print()">PDFで保存(印刷)</button></div></section>');
  h.push('<footer class="foot"><div class="wrap"><p>' + esc_(m.company) + ' 御中　' + esc_(m.prefecture) + esc_(m.city) + '　エリア調査シート（' + m.created_display + ' 作成）</p><p>' + esc_(m.map_source) + '</p><p><img src="' + assets.logoTeal + '" alt="物件王" style="height:22px;margin-top:10px"></p></div></footer>');
  h.push('<script>' + APP_JS_ + '</script></body></html>');
  return h.join('');
}

/** 生成のたびに走る品質チェック(areasheet/checks.py の移植) */
function runChecks_(model, html) {
  var res = [];
  function chk(name, ok, detail) { res.push({ name: name, ok: !!ok, detail: detail || '' }); }
  var counts = {}, prices = {};
  TYPES.forEach(function (t) { counts[t] = model[t].listings; prices[t] = model[t].price_man; });
  var t = model.totals;
  if (t.listings_total != null) {
    chk('物件総数＝種別ごとの物件数の合計', t.listings_total === TYPES.reduce(function (s, k) { return s + counts[k]; }, 0));
    var bu = TYPES.reduce(function (s, k) { return s + (prices[k] * 0.03 + 6) * counts[k]; }, 0) / t.listings_total;
    chk('仲介単価＝Σ(相場×3%+6万円)×物件数 / 物件総数(税抜)', Math.abs(bu - t.brokerage_unit_man) < 0.01, bu.toFixed(2));
  }
  var tr = model.price_trend;
  if (tr.yearly_pct && tr.city_3y_pct != null) chk('3年上昇率＝内訳の合計', Math.abs(tr.yearly_pct[0] + tr.yearly_pct[1] + tr.yearly_pct[2] - tr.city_3y_pct) <= 0.015);
  if (model.income.share_sum != null) chk('年収階級の構成比の合計＝100%(±0.5)', Math.abs(model.income.share_sum * 100 - 100) <= 0.5, (model.income.share_sum * 100).toFixed(1) + '%');
  return res;
}


/** スプレッドシート ⇔ 設定(商談先タブの項目定義・読み取り・初期設定) */

var SHEET_LIST_ = '商談先一覧', SHEET_FR_ = '加盟店一覧', SHEET_LISTINGS_ = '物件データ', SHEET_SETTINGS_ = '設定';
var BRACKET_LABELS_ = ['300万未満', '300万〜500万未満', '500万〜700万未満', '700万〜1000万未満', '1000万以上'];
var FIELD_START_ROW_ = 5;

/**
 * 入力項目の定義。t: text|num|date|list|image。req: 必須(未入力なら状態に出る)。hidden: 自動記録(画面に出さない)
 * 出典は固定、取得日は「その区分を最後に入力した日」が自動で入る(auto.date.*)。
 */
var FIXED_SOURCES_ = {
  area: '総務省統計局 令和2年国勢調査', income: 'LIFULL HOME\'S調べ', price_trend: 'LIFULL HOME\'S調べ',
  listings: 'REINS調べ', keywords: 'Google広告調べ'
};
var FIELDS_ = [
  { h: '基本情報' },
  { k: 'company', l: '会社名', req: 1, d: '例: 株式会社○○(先方の会社名。表紙に表示)' },
  { k: 'prefecture', l: '都道府県', req: 1, d: '例: 長野県' },
  { k: 'city', l: '市区町村', req: 1, d: '例: 上田市(2021年1月時点の名称)' },
  { k: 'created', l: '作成日', t: 'date', d: '空欄なら、この商談先を追加した日' },
  { h: '対象エリア(出典: 総務省統計局 令和2年国勢調査)' },
  { k: 'inputs.area.households', l: '世帯数', t: 'num', req: 1, d: '空欄のまま、設定にe-StatのアプリケーションIDがあれば自動取得を試みる' },
  { h: '年収(出典: LIFULL HOME\'S調べ)' },
  { k: 'inputs.income.city_avg_man', l: '市の平均世帯年収(万円)', t: 'num', req: 1 },
  { k: 'inputs.income.prefecture_avg_man', l: '県の平均世帯年収(万円)', t: 'num', req: 1 },
  { k: 'inputs.income.national_avg_man', l: '全国の平均世帯年収(万円)', t: 'num', req: 1 },
  { k: 'inputs.income.rank_in_prefecture', l: '県内順位(位)', t: 'num', req: 1 },
  { k: 'inputs.income.municipalities_in_prefecture', l: '県内の市町村数', t: 'num', d: '空欄なら行政区域データから自動' },
  { k: 'bracket_hh.0', l: '世帯数: 300万未満', t: 'num', d: '世帯数か構成比(%)のどちらか(両方でも可)を5区分すべてに' },
  { k: 'bracket_hh.1', l: '世帯数: 300万〜500万未満', t: 'num' },
  { k: 'bracket_hh.2', l: '世帯数: 500万〜700万未満', t: 'num' },
  { k: 'bracket_hh.3', l: '世帯数: 700万〜1000万未満', t: 'num' },
  { k: 'bracket_hh.4', l: '世帯数: 1000万以上', t: 'num' },
  { k: 'bracket_sh.0', l: '構成比(%): 300万未満', t: 'num', d: '例: 38.9' },
  { k: 'bracket_sh.1', l: '構成比(%): 300万〜500万未満', t: 'num' },
  { k: 'bracket_sh.2', l: '構成比(%): 500万〜700万未満', t: 'num' },
  { k: 'bracket_sh.3', l: '構成比(%): 700万〜1000万未満', t: 'num' },
  { k: 'bracket_sh.4', l: '構成比(%): 1000万以上', t: 'num' },
  { h: '価格推移(出典: LIFULL HOME\'S調べ)' },
  { k: 'inputs.price_trend.city_3y_pct', l: '市の3年上昇率(%)', t: 'num', d: '空欄なら内訳の合計' },
  { k: 'inputs.price_trend.prefecture_3y_pct', l: '県の3年上昇率(%)', t: 'num', req: 1 },
  { k: 'yearly.0', l: '内訳: 初年度(%)', t: 'num', req: 1 },
  { k: 'yearly.1', l: '内訳: 2年目(%)', t: 'num', req: 1 },
  { k: 'yearly.2', l: '内訳: 3年目(%)', t: 'num', req: 1 },
  { k: 'inputs.price_trend.image', l: '価格推移グラフ(画像)', t: 'image', req: 1, d: 'グラフのスクリーンショットなどの画像' },
  { h: '土地(出典: REINS調べ)' },
  { k: 'inputs.land.tsubo_price_man', l: '坪単価(万円/坪)', t: 'num', req: 1 },
  { k: 'inputs.land.tsubo_price_low_rise_residential_man', l: '低層住居専用地域の相場(万円/坪)', t: 'num', req: 1 },
  { k: 'inputs.land.tsubo_price_other_residential_man', l: 'それ以外の住居専用地域(万円/坪)', t: 'num', req: 1 },
  { k: 'inputs.land.listings', l: '土地の物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.land.price_man', l: '土地の売却価格相場(万円)', t: 'num', req: 1, d: 'まとめ(P10)に表示' },
  { k: 'inputs.land.price_per_m2_man', l: '土地の平米単価(万円/㎡)', t: 'num', req: 1 },
  { k: 'inputs.land.land_area_median_m2', l: '土地面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'compare.0', l: '比較市1', t: 'list', req: 1, d: '対象市を含む5市。対象市の値は上の坪単価・物件数が使われる' },
  { k: 'compare.1', l: '比較市2', t: 'list', req: 1 },
  { k: 'compare.2', l: '比較市3', t: 'list', req: 1 },
  { k: 'compare.3', l: '比較市4', t: 'list', req: 1 },
  { k: 'compare.4', l: '比較市5', t: 'list', req: 1 },
  { h: '中古戸建て(出典: REINS調べ)' },
  { k: 'inputs.used_house.price_man', l: '売却価格相場(万円)', t: 'num', req: 1 },
  { k: 'inputs.used_house.listings', l: '物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.used_house.building_area_median_m2', l: '建物面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.used_house.land_area_median_m2', l: '土地面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.used_house.age_median_years', l: '築年数の中央値(年)', t: 'num', req: 1 },
  { k: 'inputs.used_house.heatmap_image', l: '面積×価格の分布表(画像)', t: 'image', req: 1 },
  { h: '中古マンション(出典: REINS調べ)' },
  { k: 'inputs.used_mansion.price_man', l: '売却価格相場(万円)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.listings', l: '物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.exclusive_area_median_m2', l: '専有面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.age_median_years', l: '築年数の中央値(年)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.heatmap_image', l: '面積×価格の分布表(画像)', t: 'image', req: 1 },
  { h: '新築戸建て(出典: REINS調べ)' },
  { k: 'inputs.new_house.price_man', l: '売却価格相場(万円)', t: 'num', req: 1 },
  { k: 'inputs.new_house.listings', l: '物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.new_house.building_area_median_m2', l: '建物面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.new_house.land_area_median_m2', l: '土地面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.new_house.heatmap_image', l: '面積×価格の分布表(画像)', t: 'image', req: 1 },
  { h: '検索ボリューム(出典: Google広告調べ)' },
  { k: 'kw.土地', l: '「{市} 土地」', t: 'list', req: 1 },
  { k: 'kw.中古マンション', l: '「{市} 中古マンション」', t: 'list', req: 1 },
  { k: 'kw.不動産', l: '「{市} 不動産」', t: 'list', req: 1 },
  { k: 'kw.中古物件', l: '「{市} 中古物件」', t: 'list', req: 1 },
  { h: '近隣不動産会社(「{市} 不動産」「{市} 土地」「{市} 中古」で検索したSEO上位3社)' },
  { k: 'comp.0', l: '近隣不動産会社1', t: 'list', req: 1 },
  { k: 'comp.1', l: '近隣不動産会社2', t: 'list', req: 1 },
  { k: 'comp.2', l: '近隣不動産会社3', t: 'list', req: 1 },
  { h: '自動記録(編集不要)' },
  { k: 'auto.created', l: '(自動)追加した日', hidden: 1 },
  { k: 'auto.date.area', l: '(自動)世帯数の入力日', hidden: 1 },
  { k: 'auto.date.income', l: '(自動)年収の入力日', hidden: 1 },
  { k: 'auto.date.price_trend', l: '(自動)価格推移の入力日', hidden: 1 },
  { k: 'auto.date.listings', l: '(自動)物件データの入力日', hidden: 1 },
  { k: 'auto.date.keywords', l: '(自動)検索ボリュームの入力日', hidden: 1 }
];

/** 値を書いたとき、取得日(入力日)を更新する区分 */
function dateKeyFor_(key) {
  if (key === 'inputs.area.households') return 'auto.date.area';
  if (/^inputs\.income\.|^bracket_/.test(key)) return 'auto.date.income';
  if (/^inputs\.price_trend\.|^yearly\./.test(key)) return 'auto.date.price_trend';
  if (/^inputs\.(land|used_house|used_mansion|new_house)\.|^compare\./.test(key)) return 'auto.date.listings';
  if (/^kw\./.test(key)) return 'auto.date.keywords';
  return null;
}
function isImageKey_(key) { return /\.image$|\.heatmap_image$/.test(key) && FIELDS_.some(function (f) { return f.k === key && f.t === 'image'; }); }

function parseNum_(s) {
  if (s === null || s === undefined) return undefined;
  s = String(s).replace(/[,，\s％%円件万㎡坪位年世帯]/g, '').replace(/[０-９．]/g, function (c) { return c === '．' ? '.' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  if (s === '' || isNaN(Number(s))) return undefined;
  return Number(s);
}
function parseDate_(s) {
  if (s === null || s === undefined || String(s).trim() === '') return undefined;
  var m = String(s).trim().match(/^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/);
  if (!m) return undefined;
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}
function splitList_(s) { return String(s).split(/[,，]/).map(function (x) { return x.trim(); }); }

function setPath_(obj, path, val) {
  var ks = path.split('.'), o = obj;
  for (var i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = val;
}

/** 商談先タブの値(キー→表示文字列)を設定オブジェクトに変換する。純粋関数(テスト可) */
function valuesToConfig_(vals, today) {
  var cfg = { inputs: {} }, hh = [], sh = [], yearly = [], series = {}, compare = [], comp = [], kw = [];
  FIELDS_.forEach(function (f) {
    if (f.h) return;
    var raw = vals[f.k];
    if (raw === undefined || String(raw).trim() === '') return;
    var k = f.k, v;
    if (f.t === 'image') v = String(raw).trim(); else if (f.t === 'num') v = parseNum_(raw); else if (f.t === 'date') v = parseDate_(raw); else if (f.t === 'list') v = splitList_(raw); else v = String(raw).trim();
    if (v === undefined) return;
    var m;
    if ((m = k.match(/^bracket_hh\.(\d)$/))) hh[+m[1]] = v;
    else if ((m = k.match(/^bracket_sh\.(\d)$/))) sh[+m[1]] = v;
    else if ((m = k.match(/^yearly\.(\d)$/))) yearly[+m[1]] = v;
    else if ((m = k.match(/^series\.(.+)$/))) series[m[1]] = m[1] === 'labels' ? v : v.map(parseNum_);
    else if ((m = k.match(/^compare\.(\d)$/))) { if (v[0]) compare.push({ city: v[0], tsubo_price_man: parseNum_(v[1]), listings: parseNum_(v[2]) }); }
    else if ((m = k.match(/^comp\.(\d)$/))) { if (v[0]) comp.push({ name: v[0], area: v[1] || undefined, url: v[2] || undefined, listing_count: parseNum_(v[3]) }); }
    else if ((m = k.match(/^kw\.(.+)$/))) kw.push({ term: m[1], monthly_volume: parseNum_(v[0]), cpc_low_yen: parseNum_(v[1]), cpc_high_yen: parseNum_(v[2]) });
    else if (k.indexOf('auto.') === 0) { /* 下で処理 */ }
    else setPath_(cfg, k, v);
  });
  var auto = function (k) { var x = vals[k]; return x ? parseDate_(x) : undefined; };
  cfg.created = cfg.created || auto('auto.created') || today;
  cfg.inputs.area = cfg.inputs.area || {}; cfg.inputs.income = cfg.inputs.income || {}; cfg.inputs.price_trend = cfg.inputs.price_trend || {};
  cfg.inputs.keywords = cfg.inputs.keywords || {};
  cfg.inputs.area.source = FIXED_SOURCES_.area; cfg.inputs.area.date = auto('auto.date.area');
  cfg.inputs.income.source = FIXED_SOURCES_.income; cfg.inputs.income.date = auto('auto.date.income');
  cfg.inputs.price_trend.source = FIXED_SOURCES_.price_trend; cfg.inputs.price_trend.date = auto('auto.date.price_trend');
  cfg.inputs.keywords.source = FIXED_SOURCES_.keywords; cfg.inputs.keywords.date = auto('auto.date.keywords');
  cfg.inputs.listings_source = FIXED_SOURCES_.listings; cfg.inputs.listings_date = auto('auto.date.listings');
  var any = false, brackets = [];
  for (var i = 0; i < 5; i++) {
    var b = { label: BRACKET_LABELS_[i] };
    if (hh[i] !== undefined) { b.households = hh[i]; any = true; }
    if (sh[i] !== undefined) { b.share = sh[i] / 100; any = true; }
    brackets.push(b);
  }
  if (any) { cfg.inputs.income = cfg.inputs.income || {}; cfg.inputs.income.brackets = brackets; }
  if (yearly.length === 3 && yearly.every(function (x) { return x !== undefined; })) { cfg.inputs.price_trend = cfg.inputs.price_trend || {}; cfg.inputs.price_trend.yearly_pct = yearly; }
  // series: 画面からは入力しない(互換用)
  if (series.labels && Object.keys(series).length > 1) { cfg.inputs.price_trend = cfg.inputs.price_trend || {}; cfg.inputs.price_trend.series = series; }
  if (compare.length) { cfg.inputs.land = cfg.inputs.land || {}; cfg.inputs.land.compare_cities = compare; }
  if (kw.length) { cfg.inputs.keywords = cfg.inputs.keywords || {}; cfg.inputs.keywords.rows = kw; }
  if (comp.length) cfg.competitors = comp;
  return cfg;
}

/** 物件データシートの行(2行目以降)→ 指定IDの行だけ集計用の形に */
function listingRowsFor_(values, id) {
  var out = [];
  values.forEach(function (r) {
    if (String(r[0]).trim() !== id) return;
    out.push({ type: String(r[1]).trim(), price_man: parseNum_(r[2]), land_area_m2: parseNum_(r[3]), building_area_m2: parseNum_(r[4]),
      exclusive_area_m2: parseNum_(r[5]), age_years: parseNum_(r[6]), zone: String(r[7] || '').trim() });
  });
  return out;
}

function franchiseRowsFrom_(values) {
  return values.filter(function (r) { return String(r[0]).trim() && !/^(×|停止|0|無効)$/.test(String(r[5]).trim()); })
    .map(function (r) { return { name: String(r[0]).trim(), prefecture: String(r[1]).trim(), city: String(r[2]).trim(), address: String(r[3]).trim(), url: String(r[4]).trim() }; });
}


/** 入力システム用: 複数項目をカンマで束ねる欄の列見出し */
function colsFor_(key) {
  if (/^compare\./.test(key)) return ['市名', '坪単価(万円/坪)', '物件数(件)'];
  if (/^comp\./.test(key)) return ['名称', '所在市', 'URL', '掲載物件数(任意)'];
  if (/^kw\./.test(key)) return ['月間検索ボリューム', 'CPC下限(円)', 'CPC上限(円)'];
  return null;
}

/** クライアントに渡す項目定義 */
function fieldsMeta_() {
  var out = [];
  FIELDS_.forEach(function (f) {
    if (f.hidden) return;
    if (f.h) { if (f.h !== '自動記録(編集不要)') out.push({ h: f.h.replace(/\{市\}/g, '○○市') }); return; }
    out.push({ k: f.k, l: f.l.replace('{市}', '○○市'), t: f.t || 'text', req: f.req ? 1 : 0, d: f.d || '', cols: colsFor_(f.k) });
  });
  return out;
}

/** 値の検証。問題があればメッセージ、なければ '' */
function validateValue_(key, value) {
  var f = null;
  FIELDS_.forEach(function (x) { if (x.k === key) f = x; });
  if (!f || f.hidden) return '不明な項目です';
  if (f.t === 'image') return '画像はアップロードで登録してください';
  value = String(value);
  if (value.length > 600) return '長すぎます(600文字まで)';
  if (value.trim() === '') return '';
  if (key === 'prefecture') { try { normalizePrefecture_(value); } catch (e) { return e.message; } return ''; }
  if (f.t === 'num' && parseNum_(value) === undefined) return '数値で入力してください';
  if (f.t === 'date' && parseDate_(value) === undefined) return '日付は 2026-01-19 の形で入力してください';
  if (f.t === 'list' && colsFor_(key)) {
    var parts = splitList_(value);
    var numCols = /^compare\./.test(key) ? [1, 2] : /^comp\./.test(key) ? [3] : [0, 1, 2];
    for (var i = 0; i < numCols.length; i++) {
      var v = parts[numCols[i]];
      if (v !== undefined && v !== '' && parseNum_(v) === undefined) return colsFor_(key)[numCols[i]] + 'は数値で入力してください';
    }
  }
  return '';
}


/** 既存の商談先タブに、新しい項目(画像・自動記録)の行が無ければ末尾に足す */
function syncTabRows_(sh) {
  var last = Math.max(sh.getLastRow(), FIELD_START_ROW_ - 1);
  var keys = last >= FIELD_START_ROW_ ? sh.getRange(FIELD_START_ROW_, 5, last - FIELD_START_ROW_ + 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  var add = [];
  FIELDS_.forEach(function (f) { if (!f.h && keys.indexOf(f.k) < 0) add.push([f.l, '', '', f.d || '', f.k]); });
  if (add.length) sh.getRange(last + 1, 1, add.length, 5).setValues(add);
  return add.length;
}


/** 入力システム(ウェブアプリ上の入力画面)のサーバー側。すべての api_* はパスワードを検証する */

function newPassword_() {
  var chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
  for (var i = 0; i < 12; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function appPage_() {
  return HtmlService.createHtmlOutput(APP_HTML_).setTitle('エリア調査シート 入力システム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** パスワード検証。失敗が続くと一時的にロックする(総当たり対策) */
function requireAuth_(pw) {
  var cache = CacheService.getScriptCache(), fails = Number(cache.get('authfail') || 0);
  if (fails >= 10) throw new Error('パスワードの誤りが続いたため、10分間ロックしました。');
  var real = readSettings_().pw;
  if (!real) throw new Error('「設定」シートのB6にパスワードを入れてください(初期設定で自動作成されます)。');
  var given = String(pw || ''), ok = given.length === real.length, diff = 0;
  for (var i = 0; i < real.length; i++) diff |= (real.charCodeAt(i) ^ (given.charCodeAt(i) || 0));
  if (!ok || diff !== 0) { cache.put('authfail', String(fails + 1), 600); throw new Error('パスワードが違います。'); }
  if (fails) cache.remove('authfail');
}

function lpUrl_(settings, id) { return settings.url ? settings.url + '?id=' + id : ''; }

function api_login(pw) {
  requireAuth_(pw);
  return { ok: true, url: readSettings_().url };
}

function api_list(pw) {
  requireAuth_(pw);
  var ss = ss_(), sh = ss.getSheetByName(SHEET_LIST_), st = readSettings_(), out = [];
  if (!sh || sh.getLastRow() < 2) return { items: out, hasUrl: !!st.url };
  sh.getRange(2, 1, sh.getLastRow() - 1, 5).getDisplayValues().forEach(function (r) {
    if (String(r[0]).trim()) out.push({ id: String(r[0]).trim(), company: r[1], tab: r[2], status: r[4], url: lpUrl_(st, String(r[0]).trim()) });
  });
  return { items: out.reverse(), hasUrl: !!st.url };
}

function api_create(pw, company, pref, city) {
  requireAuth_(pw);
  company = String(company || '').trim(); city = String(city || '').trim();
  if (!company || !city) throw new Error('会社名と市区町村を入力してください。');
  var c = createProspect_(ss_(), company, normalizePrefecture_(pref), city);
  return { id: c.id };
}

function api_get(pw, id) {
  requireAuth_(pw);
  var p = findProspect_(String(id || '').trim());
  if (!p) throw new Error('商談先が見つかりません。');
  syncTabRows_(ss_().getSheetByName(p.tab));
  var st = readSettings_(), vals = readTabValues_(p.tab), images = {};
  FIELDS_.forEach(function (f) { if (f.t === 'image') images[f.k] = /^drive:/.test(vals[f.k] || ''); });
  return { id: p.id, tab: p.tab, fields: fieldsMeta_(), values: vals, images: images, url: lpUrl_(st, p.id), prefectures: PREFECTURES };
}

function trashImage_(ref) {
  var m = String(ref || '').match(/^drive:([A-Za-z0-9_-]+)$/);
  if (m) { try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) { /* 既に無ければ何もしない */ } }
}

function today_() { return todayIso_(); }

/** changes: { キー: 値 }。検証に通った項目だけ書き込み、エラーは項目ごとに返す。区分ごとの取得日(入力日)を自動で更新 */
function api_save(pw, id, changes) {
  requireAuth_(pw);
  var p = findProspect_(String(id || '').trim());
  if (!p) throw new Error('商談先が見つかりません。');
  var sh = ss_().getSheetByName(p.tab);
  syncTabRows_(sh);
  var last = sh.getLastRow(), errors = {}, saved = 0, touched = {};
  var keys = sh.getRange(FIELD_START_ROW_, 5, last - FIELD_START_ROW_ + 1, 1).getValues().map(function (r) { return String(r[0]); });
  Object.keys(changes || {}).forEach(function (k) {
    var v = changes[k] === null || changes[k] === undefined ? '' : String(changes[k]);
    var isImg = isImageKey_(k);
    var err = isImg ? (v.trim() === '' ? '' : '画像はアップロードで登録してください') : validateValue_(k, v);
    if (err) { errors[k] = err; return; }
    var row = keys.indexOf(k);
    if (row < 0) { errors[k] = 'シートに項目が見つかりません'; return; }
    var cell = sh.getRange(FIELD_START_ROW_ + row, 2);
    if (isImg) trashImage_(cell.getValue());
    cell.setValue(v.trim());
    var dk = dateKeyFor_(k); if (dk) touched[dk] = 1;
    saved++;
  });
  Object.keys(touched).forEach(function (dk) { var r = keys.indexOf(dk); if (r >= 0) sh.getRange(FIELD_START_ROW_ + r, 2).setValue(today_()); });
  return { saved: saved, errors: errors };
}

function imageFolder_() {
  var props = PropertiesService.getScriptProperties(), fid = props.getProperty('IMGFOLDER');
  if (fid) { try { return DriveApp.getFolderById(fid); } catch (e) { /* 作り直す */ } }
  var f = DriveApp.createFolder('エリア調査シート 画像');
  props.setProperty('IMGFOLDER', f.getId());
  return f;
}

/** 画像のアップロード(ブラウザ側で縮小済みの data URL)。Driveの非公開フォルダに保存し、LPには埋め込みで表示する */
function api_uploadImage(pw, id, key, dataUrl) {
  requireAuth_(pw);
  var p = findProspect_(String(id || '').trim());
  if (!p) throw new Error('商談先が見つかりません。');
  if (!isImageKey_(key)) throw new Error('画像を登録できない項目です。');
  var m = String(dataUrl || '').match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+\/=]+)$/);
  if (!m) throw new Error('JPEGまたはPNGの画像を選んでください。');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('画像が大きすぎます(5MBまで)。');
  var mime = 'image/' + m[1];
  var file = imageFolder_().createFile(Utilities.newBlob(bytes, mime, p.id + '_' + key.replace(/[^A-Za-z0-9_]/g, '_') + (m[1] === 'png' ? '.png' : '.jpg')));
  var sh = ss_().getSheetByName(p.tab);
  syncTabRows_(sh);
  var last = sh.getLastRow(), keys = sh.getRange(FIELD_START_ROW_, 5, last - FIELD_START_ROW_ + 1, 1).getValues().map(function (r) { return String(r[0]); });
  var row = keys.indexOf(key), cell = sh.getRange(FIELD_START_ROW_ + row, 2);
  trashImage_(cell.getValue());
  cell.setValue('drive:' + file.getId());
  var dk = dateKeyFor_(key), dr = dk ? keys.indexOf(dk) : -1;
  if (dr >= 0) sh.getRange(FIELD_START_ROW_ + dr, 2).setValue(today_());
  return { ok: true };
}

/** 未入力の項目と整合性チェック(LPを組み立てて判定) */
function api_status(pw, id) {
  requireAuth_(pw);
  var p = findProspect_(String(id || '').trim());
  if (!p) throw new Error('商談先が見つかりません。');
  var r = buildProspect_(p.id, p.tab);
  return {
    missing: r.report.missing().map(function (i) { return { key: i.key, label: i.label, reason: i.reason }; }),
    checksNg: r.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name + (c.detail ? '(' + c.detail + ')' : ''); }),
    city: r.model.meta.city, households: r.model.area.households,
    totals: { listings_total: r.model.totals.listings_total, brokerage: r.model.totals.brokerage_unit_display_man }
  };
}

/** URLを作り直す(旧URLは無効になる) */
function api_rotate(pw, id) {
  requireAuth_(pw);
  var p = findProspect_(String(id || '').trim());
  if (!p) throw new Error('商談先が見つかりません。');
  var ss = ss_(), ls = ss.getSheetByName(SHEET_LIST_), nid = newId_();
  ls.getRange(2, 1, ls.getLastRow() - 1, 1).getValues().forEach(function (r, i) { if (String(r[0]).trim() === p.id) ls.getRange(i + 2, 1).setValue(nid); });
  ss.getSheetByName(p.tab).getRange('B2').setValue(nid);
  return { id: nid };
}

// ---------- 加盟店の管理(保存先は 加盟店一覧 シート) ----------
function frSheet_() {
  var sh = ss_().getSheetByName(SHEET_FR_);
  if (!sh) throw new Error('「初期設定」が済んでいません。');
  return sh;
}
function isActive_(v) { return !/^(×|停止|0|無効)$/.test(String(v).trim()); }

function api_fr_list(pw) {
  requireAuth_(pw);
  var sh = frSheet_(), out = [];
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 6).getDisplayValues().forEach(function (r, i) {
    if (String(r[0]).trim()) out.push({ i: i, name: r[0], prefecture: r[1], city: r[2], url: r[4], active: isActive_(r[5]) });
  });
  return { items: out, prefectures: PREFECTURES };
}

function api_fr_save(pw, idx, rec) {
  requireAuth_(pw);
  rec = rec || {};
  var name = String(rec.name || '').trim(), city = String(rec.city || '').trim(), url = String(rec.url || '').trim();
  if (!name || !city) throw new Error('名称と市区町村を入力してください。');
  var pref = normalizePrefecture_(rec.prefecture);
  if (url && !/^https?:\/\//.test(url)) throw new Error('URLは https:// から始めてください。');
  var sh = frSheet_(), row = Number(idx) >= 0 ? Number(idx) + 2 : Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(row, 1, 1, 6).setValues([[name, pref, city, pref + ' ' + city, url, rec.active === false ? '×' : '']]);
  return { ok: true };
}

function api_fr_delete(pw, idx) {
  requireAuth_(pw);
  var sh = frSheet_(), row = Number(idx) + 2;
  if (!(Number(idx) >= 0) || row > sh.getLastRow()) throw new Error('対象が見つかりません。');
  sh.deleteRow(row);
  return { ok: true };
}

// ---------- 設定(保存先は 設定 シート) ----------
function api_settings_get(pw) {
  requireAuth_(pw);
  var s = readSettings_();
  return { estat: s.estat, max: s.max, threshold: s.threshold, unit: s.unit, url: s.url };
}

function api_settings_set(pw, v) {
  requireAuth_(pw);
  v = v || {};
  var max = parseNum_(v.max), th = parseNum_(v.threshold), unit = parseNum_(v.unit);
  if (!(max >= 1 && max <= 10)) throw new Error('周辺加盟店の最大社数は1〜10で入力してください。');
  if (th === undefined || th < 0) throw new Error('「同程度」の範囲は0以上の数で入力してください。');
  if (!(unit >= 1)) throw new Error('切り上げ単位は1以上で入力してください。');
  var sh = ss_().getSheetByName(SHEET_SETTINGS_);
  sh.getRange('B2').setValue(String(v.estat || '').trim()); sh.getRange('B3').setValue(String(max));
  sh.getRange('B4').setValue(String(th)); sh.getRange('B5').setValue(String(unit));
  var newPw = String(v.newPw || '');
  if (newPw) {
    if (newPw.length < 8) throw new Error('パスワードは8文字以上にしてください。');
    sh.getRange('B6').setValue(newPw);
  }
  return { ok: true, pwChanged: !!newPw };
}


/**
 * エリア調査シート LP(Google スプレッドシート連携版)
 *  - シートが正本。商談先ごとのタブに入力すると、LPのURLを開き直すだけで最新内容が表示される。
 *  - 公開は「ウェブアプリ」。URL は  <ウェブアプリURL>?id=<商談先ID>
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('エリア調査シート')
    .addItem('初期設定(最初に1回)', 'menuSetup')
    .addItem('入力システムのURLとパスワードを表示', 'menuShowApp')
    .addToUi();
}

// ---------- サービス層(テストでは差し替える) ----------
function cacheGet_(key) {
  var c = CacheService.getScriptCache(), n = c.get(key + '#n');
  if (!n) return null;
  var parts = [];
  for (var i = 0; i < Number(n); i++) { var p = c.get(key + '#' + i); if (p === null) return null; parts.push(p); }
  return parts.join('');
}
function cachePut_(key, str) {
  var c = CacheService.getScriptCache(), size = 90000, n = Math.ceil(str.length / size), kv = {};
  for (var i = 0; i < n; i++) kv[key + '#' + i] = str.slice(i * size, (i + 1) * size);
  kv[key + '#n'] = String(n);
  c.putAll(kv, 21600);
}
function fetchJson_(url) {
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('取得に失敗しました(' + r.getResponseCode() + '): ' + url);
  return JSON.parse(r.getContentText());
}

/** e-Stat API から令和2年国勢調査の世帯数を取得(実機未検証。失敗時は入力欄へ) */
function estatHouseholds_(appId, areaCode) {
  var base = 'https://api.e-stat.go.jp/rest/3.0/app/json/';
  function get(path, params) {
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetchJson_(base + path + '?' + q);
  }
  var lst = get('getStatsList', { appId: appId, statsCode: '00200521', surveyYears: '2020', searchWord: '世帯 市区町村', limit: 20 });
  var tabs = ((lst.GET_STATS_LIST || {}).DATALIST_INF || {}).TABLE_INF || [];
  tabs = Array.isArray(tabs) ? tabs : [tabs];
  var ids = tabs.filter(function (t) { return /市区町村/.test(String(t.TITLE && (t.TITLE.$ || t.TITLE))); }).map(function (t) { return t['@id']; }).slice(0, 5);
  for (var i = 0; i < ids.length; i++) {
    var d = get('getStatsData', { appId: appId, statsDataId: ids[i], cdArea: areaCode, metaGetFlg: 'Y', limit: 200 });
    var inf = (d.GET_STATS_DATA || {}).STATISTICAL_DATA || {};
    var objs = ((inf.CLASS_INF || {}).CLASS_OBJ) || [];
    objs = Array.isArray(objs) ? objs : [objs];
    var want = {};
    objs.forEach(function (o) {
      var cls = Array.isArray(o.CLASS) ? o.CLASS : [o.CLASS];
      cls.forEach(function (c) {
        var nm = (c && c['@name']) || '';
        if ((nm.indexOf('世帯') >= 0 && nm.indexOf('一般') >= 0) || nm === '世帯数' || nm === '総世帯数') { want[o['@id']] = want[o['@id']] || []; want[o['@id']].push(c['@code']); }
      });
    });
    var vals = (inf.DATA_INF || {}).VALUE || [];
    vals = Array.isArray(vals) ? vals : [vals];
    for (var j = 0; j < vals.length; j++) {
      var v = vals[j];
      if (Object.keys(want).length && Object.keys(want).every(function (k) { return want[k].indexOf(v['@' + k]) >= 0; })) {
        var n = parseInt(String(v.$).replace(/,/g, ''), 10);
        if (n) return { value: n, source: '総務省統計局 令和2年国勢調査(e-Stat)' };
      }
    }
  }
  throw new Error('該当する世帯数の表・値が見つからなかった');
}

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SSID');
  if (id) return SpreadsheetApp.openById(id);
  var a = SpreadsheetApp.getActiveSpreadsheet();
  if (a) PropertiesService.getScriptProperties().setProperty('SSID', a.getId());
  return a;
}

/** 設定シート(保存先)の読み取り。公開URLは B1 に入っていればそれ、無ければデプロイ済みウェブアプリのURLを自動で使う */
function readSettings_() {
  var sh = ss_().getSheetByName(SHEET_SETTINGS_), o = { url: '', estat: '', pw: '', max: 3, threshold: 1, unit: 10, opts: {} };
  if (sh) {
    var v = sh.getRange(1, 2, 6, 1).getDisplayValues().map(function (r) { return r[0]; });
    o.url = v[0].trim(); o.estat = v[1].trim(); o.pw = String(v[5] || '').trim();
    var mx = parseNum_(v[2]), th = parseNum_(v[3]), unit = parseNum_(v[4]);
    if (mx) o.max = mx; if (th !== undefined) o.threshold = th; if (unit) o.unit = unit;
  }
  if (!o.url) { try { o.url = ScriptApp.getService().getUrl() || ''; } catch (e) { o.url = ''; } }
  o.opts.franchise = { max: o.max }; o.opts.trend_same_threshold_pt = o.threshold; o.opts.point_round_unit = o.unit;
  return o;
}

function realServices_(settings) {
  var s = { cacheGet: cacheGet_, cachePut: cachePut_, fetchJson: fetchJson_, now: function () { return new Date().toISOString(); } };
  if (settings.estat) s.estatHouseholds = function (code) { return estatHouseholds_(settings.estat, code); };
  return s;
}

function findProspect_(id) {
  var sh = ss_().getSheetByName(SHEET_LIST_);
  if (!sh || sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).trim() === id && id) return { id: id, tab: String(rows[i][2]).trim() };
  return null;
}

function readTabValues_(tab) {
  var sh = ss_().getSheetByName(tab);
  if (!sh) throw new Error('タブが見つかりません: ' + tab);
  var last = sh.getLastRow(), vals = {};
  if (last < FIELD_START_ROW_) return vals;
  sh.getRange(FIELD_START_ROW_, 1, last - FIELD_START_ROW_ + 1, 5).getDisplayValues().forEach(function (r) { if (r[4]) vals[r[4]] = r[1]; });
  return vals;
}

function todayIso_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'); }

/** Drive に保存した画像(drive:<ID>)を data URI にして返す(LPに埋め込むため、Driveの共有設定は不要) */
function imageDataUri_(ref) {
  var m = String(ref || '').match(/^drive:([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  var key = 'img:' + m[1], hit = cacheGet_(key);
  if (hit) return hit;
  try {
    var blob = DriveApp.getFileById(m[1]).getBlob();
    var uri = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    if (uri.length < 400000) cachePut_(key, uri);
    return uri;
  } catch (e) { return null; }
}

function resolveImages_(cfg) {
  var inp = cfg.inputs || {};
  [['price_trend', 'image'], ['used_house', 'heatmap_image'], ['used_mansion', 'heatmap_image'], ['new_house', 'heatmap_image']].forEach(function (p) {
    var sec = inp[p[0]];
    if (sec && sec[p[1]]) { var uri = imageDataUri_(sec[p[1]]); if (uri) sec[p[1]] = uri; else delete sec[p[1]]; }
  });
}

/** 商談先タブ → { model, report, html, checks } */
function buildProspect_(id, tab) {
  var settings = readSettings_(), ss = ss_();
  var sheet = ss.getSheetByName(tab);
  if (sheet) syncTabRows_(sheet);
  var cfg = valuesToConfig_(readTabValues_(tab), todayIso_());
  cfg.options = settings.opts;
  resolveImages_(cfg);
  var frSh = ss.getSheetByName(SHEET_FR_), liSh = ss.getSheetByName(SHEET_LISTINGS_);
  var data = {
    franchiseRows: frSh && frSh.getLastRow() > 1 ? franchiseRowsFrom_(frSh.getRange(2, 1, frSh.getLastRow() - 1, 6).getDisplayValues()) : [],
    listingRows: liSh && liSh.getLastRow() > 1 ? listingRowsFor_(liSh.getRange(2, 1, liSh.getLastRow() - 1, 8).getDisplayValues(), id) : []
  };
  var built = buildModel_(cfg, realServices_(settings), data);
  var html = renderPage_(built.model, built.report, ASSETS, STYLE_CSS_);
  return { model: built.model, report: built.report, html: html, checks: runChecks_(built.model, html) };
}

// ---------- ウェブアプリ ----------
function doGet(e) {
  var page = String((e && e.parameter && e.parameter.page) || '').trim();
  var id = String((e && e.parameter && e.parameter.id) || '').trim();
  if (page === 'app' || (!id && !page)) return appPage_();
  var p = /^[A-Za-z0-9]{8,40}$/.test(id) ? findProspect_(id) : null;
  if (!p) return errorPage_('ページが見つかりません。URLをご確認ください。');
  try {
    var r = buildProspect_(p.id, p.tab);
    return HtmlService.createHtmlOutput(r.html).setTitle('エリア調査シート').addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    console.error(err && err.stack || err);
    return errorPage_('ページを表示できませんでした。作成者にご連絡ください。(' + String(err.message || err).slice(0, 120) + ')');
  }
}

function errorPage_(msg) {
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="font-family:sans-serif;padding:40px;line-height:1.8"><p>' + esc_(msg) + '</p></body>').setTitle('エリア調査シート');
}

// ---------- メニュー操作 ----------
function newId_() {
  var chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
  for (var i = 0; i < 16; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function menuSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SSID', ss.getId());
  setupSheets_(ss);
  SpreadsheetApp.getUi().alert('初期設定が完了しました。\n\n入力システムのパスワード: ' + readSettings_().pw + '\n(「設定」シートのB6。入力システム内でも変更できます)\n\n次の手順:\n1. 拡張機能 → Apps Script → デプロイ → 新しいデプロイ → 種類「ウェブアプリ」\n   (実行ユーザー: 自分 / アクセスできるユーザー: 全員)\n2. 発行されたURL(…/exec)を開くと「入力システム」が使えます。\n   以降の入力・加盟店の管理・設定は、すべて入力システムで行います。このシートは保存先です。');
}

function menuShowApp() {
  var s = readSettings_();
  SpreadsheetApp.getUi().alert('入力システムのURL:\n' + (s.url || '(未デプロイ。拡張機能 → Apps Script → デプロイ から、ウェブアプリとしてデプロイしてください)') + '\n\nパスワード: ' + s.pw);
}

function setupSheets_(ss) {
  var st = ss.getSheetByName(SHEET_SETTINGS_) || ss.insertSheet(SHEET_SETTINGS_);
  var defs = [
    ['公開URL(通常は空欄でOK)', '', '空欄ならデプロイ済みのウェブアプリのURLを自動で使う。独自のURLを使う場合のみ入力'],
    ['e-Stat アプリケーションID', '', '任意。入れると世帯数の自動取得を試みる'],
    ['周辺加盟店の最大社数', 3, ''],
    ['県との差が「同程度」とみなす範囲(ポイント)', 1, ''],
    ['POINTの切り上げ単位(件)', 10, '414件→420件'],
    ['入力システムのパスワード', '', '入力システム(…/exec を開く)のパスワード。自動で作成。入力システム内でも変更できる']];
  defs.forEach(function (d, i) {
    st.getRange(i + 1, 1).setValue(d[0]); st.getRange(i + 1, 3).setValue(d[2]);
    var b = st.getRange(i + 1, 2);
    if (String(b.getDisplayValue ? b.getDisplayValue() : b.getValue()).trim() === '') b.setValue(d[1]);   // 既存の入力は消さない
  });
  var pwCell = st.getRange(6, 2);
  if (String(pwCell.getValue()).trim() === '') pwCell.setValue(newPassword_());
  st.getRange('B1:B6').setNumberFormat('@');
  st.setColumnWidth(1, 300); st.setColumnWidth(2, 360); st.setColumnWidth(3, 420);
  var ls = ss.getSheetByName(SHEET_LIST_) || ss.insertSheet(SHEET_LIST_);
  if (ls.getLastRow() < 1) {
    ls.getRange(1, 1, 1, 5).setValues([['ID', '会社名', 'タブ名', '(予備)', '状態']]).setFontWeight('bold');
    ls.setFrozenRows(1); ls.setColumnWidth(1, 150); ls.setColumnWidth(2, 220); ls.setColumnWidth(3, 200); ls.setColumnWidth(4, 520); ls.setColumnWidth(5, 120);
  }
  var fr = ss.getSheetByName(SHEET_FR_);
  if (!fr) {
    fr = ss.insertSheet(SHEET_FR_);
    fr.getRange(1, 1, 1, 6).setValues([['名称', '都道府県', '市区町村', '住所', 'URL', '有効(×で停止)']]).setFontWeight('bold');
    fr.getRange(2, 1, 2, 5).setValues([
      ['リフォームワン株式会社', '長野県', '上田市', '長野県 上田市', 'https://www.one-estate.jp/'],
      ['ミライズ不動産株式会社', '長野県', '上田市', '長野県 上田市', 'https://www.me-rise-fudosan.jp/']]);
    fr.setFrozenRows(1); fr.setColumnWidth(1, 240); fr.setColumnWidth(4, 260); fr.setColumnWidth(5, 320);
    fr.getRange('A1').setNote('加盟店が増えたら、ここに1行ずつ追加してください。LPの「周辺加盟店」は、ここから(同一市→隣接市→同一県の順に)自動で選ばれます。');
  }
}

function prospectTabName_(ss, company) {
  var base = ('商談_' + company).replace(/[\[\]\*\?\/\\:]/g, '').slice(0, 40), name = base, n = 2;
  while (ss.getSheetByName(name)) name = base + '_' + (n++);
  return name;
}

function buildProspectTab_(ss, company, pref, city, id) {
  var sh = ss.insertSheet(prospectTabName_(ss, company));
  var rows = [], styles = [];
  FIELDS_.forEach(function (f, i) {
    var r = FIELD_START_ROW_ + i;
    if (f.h) { rows.push([f.h, '', '', '', '']); styles.push({ r: r, h: true }); return; }
    var init = f.k === 'company' ? company : f.k === 'prefecture' ? pref : f.k === 'city' ? city : f.k === 'auto.created' ? todayIso_() : '';
    rows.push([f.l, init, f.req ? '=IF(B' + r + '="","未入力","")' : '', f.d || '', f.k]);
  });
  sh.getRange(FIELD_START_ROW_, 1, rows.length, 5).setValues(rows);
  sh.getRange(FIELD_START_ROW_, 2, rows.length, 1).setNumberFormat('@');
  sh.getRange(1, 1, 3, 2).setValues([['状態', '=IF(COUNTIF(C:C,"未入力")=0,"入力完了","未入力 "&COUNTIF(C:C,"未入力")&"件")'], ['ID', id],
    ['このタブについて', '入力システム(…/exec)のデータ保存先です。入力は入力システムで行ってください。']]);
  sh.getRange(4, 1, 1, 5).setValues([['項目', '値', '状態', '説明', 'キー']]).setFontWeight('bold').setBackground('#E0F2F4');
  sh.getRange('A1:A3').setFontWeight('bold');
  sh.setColumnWidth(1, 330); sh.setColumnWidth(2, 360); sh.setColumnWidth(3, 70); sh.setColumnWidth(4, 520);
  sh.hideColumns(5);
  sh.setFrozenRows(4);
  styles.forEach(function (s) { sh.getRange(s.r, 1, 1, 4).setBackground('#007482').setFontColor('#FFFFFF').setFontWeight('bold'); });
  sh.getRange(FIELD_START_ROW_, 3, rows.length, 1).setFontColor('#B00020').setFontWeight('bold');
  sh.getRange(FIELD_START_ROW_, 4, rows.length, 1).setFontColor('#595959');
  return sh;
}

/** 商談先タブを作り、一覧に登録する。戻り値: { id, sheet } */
function createProspect_(ss, company, pref, city) {
  pref = normalizePrefecture_(pref);
  var id = newId_(), sh = buildProspectTab_(ss, company, pref, city, id), ls = ss.getSheetByName(SHEET_LIST_), r = ls.getLastRow() + 1, q = "'" + sh.getName() + "'";
  var companyRow = FIELD_START_ROW_ + FIELDS_.map(function (f) { return f.k; }).indexOf('company');
  ls.getRange(r, 1, 1, 5).setValues([[id, '=INDIRECT("' + q + '!B' + companyRow + '")', sh.getName(), '', '=IFERROR(INDIRECT("' + q + '!B1"),"")']]);
  return { id: id, sheet: sh };
}


/** 生成物(gas/build.py)。CSS/JS/入力画面のHTML を文字列定数として保持する */
var APP_HTML_ = "<!doctype html>\n<html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<meta name=\"robots\" content=\"noindex,nofollow\"><title>エリア調査シート 入力システム</title>\n<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap\">\n<style>\n:root{--teal:#007482;--teal-l:#E0F2F4;--accent:#FFAB40;--text:#212121;--sub:#595959;--line:#d5dde0;--bg:#F4F7F8;--warn:#b26a00;--warn-bg:#fff8ec;--err:#B00020;\n --f:\"Noto Sans JP\",\"Hiragino Kaku Gothic ProN\",Meiryo,sans-serif}\n*{box-sizing:border-box}\nbody{margin:0;font-family:var(--f);color:var(--text);background:var(--bg);line-height:1.7;font-size:16px}\nheader.top{background:var(--teal);color:#fff;padding:12px 16px;position:sticky;top:0;z-index:10;display:flex;gap:12px;align-items:center;flex-wrap:wrap}\nheader.top h1{font-size:1.05rem;margin:0;flex:1;min-width:200px}\nmain{max-width:980px;margin:0 auto;padding:20px 16px 80px}\nbutton,.btn{font:inherit;cursor:pointer;border:0;border-radius:999px;padding:10px 20px;background:var(--accent);color:var(--text);font-weight:700;text-decoration:none;display:inline-block;min-height:44px}\nbutton.ghost,.btn.ghost{background:#fff;color:var(--teal);border:2px solid var(--teal)}\nheader button.ghost{background:transparent;color:#fff;border-color:#fff}\nbutton:disabled{opacity:.5;cursor:default}\ninput,select{font:inherit;width:100%;padding:10px 12px;border:1px solid #aab7bb;border-radius:8px;background:#fff;min-height:44px}\ninput:focus,select:focus,button:focus-visible{outline:3px solid var(--teal);outline-offset:1px}\n.card{background:#fff;border-radius:14px;padding:20px;margin-bottom:16px;box-shadow:0 1px 0 rgba(0,0,0,.04)}\n.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}\n.grow{flex:1;min-width:160px}\n.chip{display:inline-block;border-radius:999px;padding:2px 12px;font-size:.8125rem;font-weight:700;background:var(--teal-l);color:var(--teal)}\n.chip.need{background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn)}\n.msg{color:var(--err);font-size:.9375rem;margin-top:8px}\n.note{font-size:.8125rem;color:var(--sub)}\n.item{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:14px 0;border-bottom:1px solid var(--line)}\n.item:last-child{border:0}.item b{font-size:1.05rem}\ndetails.sec{background:#fff;border-radius:14px;margin-bottom:12px;overflow:hidden}\ndetails.sec>summary{cursor:pointer;padding:14px 18px;font-weight:700;background:var(--teal);color:#fff;list-style:none;display:flex;justify-content:space-between;gap:8px}\ndetails.sec>summary::-webkit-details-marker{display:none}\ndetails.sec .body{padding:8px 18px 18px}\n.field{padding:12px 0;border-bottom:1px solid #eef2f3}.field:last-child{border:0}\n.field label{font-weight:500;display:block;margin-bottom:4px}\n.req{font-size:.75rem;background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn);border-radius:4px;padding:0 6px;margin-left:6px;font-weight:700}\n.field.need input{border-color:var(--warn);background:var(--warn-bg)}\n.field.bad input{border-color:var(--err)}\n.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}\n.cols span{font-size:.75rem;color:var(--sub);display:block}\n.hint{font-size:.8125rem;color:var(--sub);margin-top:4px}\n.err{font-size:.8125rem;color:var(--err);margin-top:4px}\n.imgbox{display:flex;gap:12px;align-items:center;flex-wrap:wrap}\n.imgbox img{max-height:90px;max-width:160px;border:1px solid var(--line);border-radius:6px;background:#fff}\n.imgbox input[type=file]{display:none}\n.tbl{width:100%;border-collapse:collapse}.tbl td{padding:10px 6px;border-bottom:1px solid var(--line);vertical-align:middle}\nlabel.chk{display:flex;gap:8px;align-items:center;min-height:44px}label.chk input{width:auto;min-height:0}\n#miss{margin:0;padding-left:1.2em;font-size:.875rem}\n#miss li{margin:2px 0}\n#saved{font-size:.875rem}\n@media (max-width:640px){main{padding:12px 12px 80px}.card{padding:14px}}\n</style></head><body>\n<header class=\"top\"><h1 id=\"title\">エリア調査シート 入力システム</h1><span id=\"hstat\" class=\"chip\" hidden></span><span id=\"saved\"></span>\n<button class=\"ghost\" id=\"back\" hidden>← 一覧</button><button class=\"ghost\" id=\"navfr\" hidden>加盟店</button><button class=\"ghost\" id=\"navset\" hidden>設定</button><button class=\"ghost\" id=\"logout\" hidden>ログアウト</button></header>\n<main id=\"main\"></main>\n<script>\nvar imgs = {}, pw = '', cur = null, dirty = {}, timer = null, saving = false, meta = [], vals = {};\nvar $ = function (id) { return document.getElementById(id); };\nfunction el(tag, attrs, kids) {\n  var e = document.createElement(tag);\n  Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); });\n  (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });\n  return e;\n}\nfunction call(name, args, ok) {\n  busy(true);\n  var r = google.script.run.withSuccessHandler(function (res) { busy(false); ok(res); })\n    .withFailureHandler(function (e) { busy(false); var m = String(e && e.message || e).replace(/^Error:\\s*/, ''); if (/パスワードが違|ロック/.test(m)) { try { sessionStorage.removeItem('pw'); } catch (x) {} } show(m, true); });\n  r[name].apply(r, args);\n}\nfunction busy(b) { document.body.style.cursor = b ? 'progress' : ''; }\nfunction show(msg, bad) { var m = $('msg'); if (m) { m.textContent = msg; m.className = bad ? 'msg' : 'note'; } else if (bad) { alert(msg); } }\nfunction setSaved(t, bad) { var s = $('saved'); s.textContent = t; s.style.color = bad ? '#ffd0d0' : '#fff'; }\n\nfunction chrome(inApp, back) {\n  $('hstat').hidden = true; $('back').hidden = !back; $('logout').hidden = !inApp; $('navfr').hidden = !inApp; $('navset').hidden = !inApp;\n}\n/* ---- ログイン ---- */\nfunction viewLogin() {\n  cur = null; chrome(false, false); $('title').textContent = 'エリア調査シート 入力システム'; setSaved('');\n  var inp = el('input', { type: 'password', id: 'pw', placeholder: 'パスワード', autocomplete: 'current-password' });\n  var btn = el('button', { text: 'ログイン' });\n  var go = function () { var p = inp.value; if (!p) return; call('api_login', [p], function () { pw = p; sessionStorage.setItem('pw', p); route(); }); };\n  btn.onclick = go; inp.onkeydown = function (e) { if (e.key === 'Enter') go(); };\n  $('main').replaceChildren(el('div', { class: 'card', style: 'max-width:420px;margin:40px auto' }, [\n    el('h2', { text: 'ログイン', style: 'margin-top:0' }),\n    el('p', { class: 'note', text: 'パスワードは、スプレッドシートの「設定」シートのB6にあります。' }), inp, el('div', { style: 'height:12px' }), btn, el('p', { id: 'msg', class: 'msg' })]));\n  inp.focus();\n}\n\n/* ---- 一覧 ---- */\nfunction viewList() {\n  cur = null; chrome(true, false); $('title').textContent = '商談先の一覧'; setSaved('');\n  call('api_list', [pw], function (r) {\n    var wrap = el('div', {});\n    var add = el('div', { class: 'card' }, [el('h2', { text: '新しい商談先を追加', style: 'margin-top:0;font-size:1.1rem' })]);\n    var c1 = el('input', { id: 'nc', placeholder: '先方の会社名(例: 株式会社○○)' });\n    var sel = el('select', { id: 'np' }); ['都道府県を選ぶ'].concat(window.__prefs || []).forEach(function (p, i) { sel.appendChild(el('option', { value: i ? p : '', text: p })); });\n    var c3 = el('input', { id: 'ncity', placeholder: '市区町村(例: 上田市)' });\n    var ab = el('button', { text: '追加して入力を始める' });\n    ab.onclick = function () {\n      if (!c1.value.trim() || !sel.value || !c3.value.trim()) { $('msg').textContent = '会社名・都道府県・市区町村を入力してください。'; return; }\n      call('api_create', [pw, c1.value, sel.value, c3.value], function (x) { openProspect(x.id); });\n    };\n    add.appendChild(el('div', { class: 'row' }, [el('div', { class: 'grow' }, [c1]), el('div', { style: 'width:180px;flex:none' }, [sel]), el('div', { class: 'grow' }, [c3]), ab]));\n    add.appendChild(el('p', { id: 'msg', class: 'msg' }));\n    wrap.appendChild(add);\n    var list = el('div', { class: 'card' }, [el('h2', { text: '作成済み(' + r.items.length + '件)', style: 'margin-top:0;font-size:1.1rem' })]);\n    if (!r.items.length) list.appendChild(el('p', { class: 'note', text: 'まだありません。上のフォームから追加してください。' }));\n    r.items.forEach(function (it) {\n      var need = /未入力/.test(it.status);\n      var row = el('div', { class: 'item' }, [el('div', { class: 'grow' }, [el('b', { text: it.company || it.tab }), el('br'), el('span', { class: 'chip' + (need ? ' need' : ''), text: it.status || '' })])]);\n      var ed = el('button', { text: '入力する' }); ed.onclick = function () { openProspect(it.id); };\n      row.appendChild(ed);\n      if (it.url) { row.appendChild(el('a', { class: 'btn ghost', href: it.url, target: '_blank', rel: 'noopener', text: 'LPを開く' }));\n        var cp = el('button', { class: 'ghost', text: 'URLをコピー' }); cp.onclick = function () { copyText(it.url, cp); }; row.appendChild(cp); }\n      list.appendChild(row);\n    });\n    if (!r.hasUrl) list.appendChild(el('p', { class: 'note', text: '※ウェブアプリとしてデプロイすると、LPのURLがここに出ます。' }));\n    wrap.appendChild(list); $('main').replaceChildren(wrap);\n  });\n}\nfunction copyText(t, btn) {\n  var done = function () { var o = btn.textContent; btn.textContent = 'コピーしました'; setTimeout(function () { btn.textContent = o; }, 1500); };\n  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { prompt('コピーしてください', t); });\n  else prompt('コピーしてください', t);\n}\nfunction openProspect(id) { location.hash = 'id=' + id; route(); }\n\n/* ---- 入力画面 ---- */\nfunction splitCols(v, n) { var a = String(v || '').split(/[,，]/).map(function (x) { return x.trim(); }); while (a.length < n) a.push(''); return a; }\nfunction joinCols(a) { return a.every(function (x) { return !x.trim(); }) ? '' : a.map(function (x) { return x.trim(); }).join(','); }\nfunction markDirty(k, v) { dirty[k] = v; vals[k] = v; refreshNeed(); setSaved('入力中…'); clearTimeout(timer); timer = setTimeout(flush, 700); }\nfunction flush() {\n  if (saving) { timer = setTimeout(flush, 400); return; }\n  var ch = dirty; dirty = {}; if (!Object.keys(ch).length) return;\n  saving = true; setSaved('保存中…');\n  google.script.run.withSuccessHandler(function (r) {\n    saving = false;\n    document.querySelectorAll('.field').forEach(function (f) { f.classList.remove('bad'); var e = f.querySelector('.err'); if (e) e.remove(); });\n    var bad = Object.keys(r.errors);\n    bad.forEach(function (k) { var f = document.querySelector('[data-k=\"' + k + '\"]'); if (f) { f.classList.add('bad'); f.appendChild(el('div', { class: 'err', text: r.errors[k] + '(この項目は保存されていません)' })); } });\n    setSaved(bad.length ? '保存できない項目があります' : '保存しました ' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }), bad.length > 0);\n    loadStatus();\n  }).withFailureHandler(function (e) { saving = false; setSaved('保存に失敗: ' + (e.message || e), true); Object.keys(ch).forEach(function (k) { dirty[k] = ch[k]; }); })\n    .api_save(pw, cur, ch);\n}\nfunction refreshNeed() {\n  document.querySelectorAll('.field[data-req=\"1\"]').forEach(function (f) {\n    var v = vals[f.getAttribute('data-k')]; f.classList.toggle('need', !v || !String(v).replace(/[,，\\s]/g, ''));\n  });\n  document.querySelectorAll('details.sec').forEach(function (d) {\n    var n = d.querySelectorAll('.field.need').length, c = d.querySelector('.cnt');\n    c.textContent = n ? '未入力 ' + n : '入力済み'; c.style.opacity = n ? '1' : '.7';\n  });\n}\nfunction loadStatus() {\n  google.script.run.withSuccessHandler(function (s) {\n    var chip = $('stat'); if (!chip || !cur) return;\n    var hs = $('hstat'); hs.hidden = false; hs.textContent = s.missing.length ? '未入力 ' + s.missing.length + '件' : '入力完了'; hs.className = 'chip' + (s.missing.length ? ' need' : '');\n    chip.textContent = s.missing.length ? '未入力・未取得 ' + s.missing.length + '件' : '入力完了';\n    chip.className = 'chip' + (s.missing.length ? ' need' : '');\n    var ul = $('miss'); ul.replaceChildren();\n    s.missing.slice(0, 40).forEach(function (m) { ul.appendChild(el('li', { text: m.label })); });\n    s.checksNg.forEach(function (c) { ul.appendChild(el('li', { text: '整合性チェックNG: ' + c, style: 'color:#B00020' })); });\n    var t = $('totals'); if (t) t.textContent = s.totals.listings_total != null ? '物件総数 ' + s.totals.listings_total + '件 / 仲介単価 約' + s.totals.brokerage + '万円' : '';\n  }).withFailureHandler(function () {}).api_status(pw, cur);\n}\nfunction shrink(file, cb, fail) {\n  if (!/^image\\/(jpeg|png|webp|gif)$/.test(file.type)) { fail('JPEG・PNGなどの画像を選んでください。'); return; }\n  var rd = new FileReader();\n  rd.onerror = function () { fail('画像を読み込めませんでした。'); };\n  rd.onload = function () {\n    var im = new Image();\n    im.onerror = function () { fail('画像を開けませんでした。'); };\n    im.onload = function () {\n      var max = 1800, k = Math.min(1, max / Math.max(im.width, im.height)), cv = document.createElement('canvas');\n      cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);\n      var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);\n      cb(cv.toDataURL('image/jpeg', 0.88));\n    };\n    im.src = rd.result;\n  };\n  rd.readAsDataURL(file);\n}\nfunction imageField(f, wrap) {\n  var st = el('span', { class: 'note' }), th = el('img', { alt: f.l + 'のプレビュー' }), file = el('input', { type: 'file', accept: 'image/*', id: 'f_' + f.k.replace(/\\W/g, '_') });\n  th.hidden = true;\n  var pick = el('label', { class: 'btn ghost', for: file.id, text: '画像を選ぶ' }), del = el('button', { class: 'ghost', text: '削除', type: 'button' });\n  var sync = function () { var has = !!imgs[f.k]; st.textContent = has ? 'アップロード済み' : '未登録'; del.hidden = !has; pick.textContent = has ? '画像を差し替える' : '画像を選ぶ'; vals[f.k] = has ? 'drive:set' : ''; refreshNeed(); };\n  file.onchange = function () {\n    var fl = file.files[0]; if (!fl) return; st.textContent = '処理中…'; setSaved('画像をアップロード中…');\n    shrink(fl, function (uri) {\n      th.src = uri; th.hidden = false;\n      google.script.run.withSuccessHandler(function () { imgs[f.k] = true; sync(); setSaved('画像を保存しました'); loadStatus(); })\n        .withFailureHandler(function (e) { st.textContent = '失敗: ' + (e.message || e); setSaved('画像を保存できませんでした', true); }).api_uploadImage(pw, cur, f.k, uri);\n    }, function (m) { st.textContent = m; setSaved(m, true); });\n    file.value = '';\n  };\n  del.onclick = function () {\n    google.script.run.withSuccessHandler(function () { imgs[f.k] = false; th.hidden = true; sync(); setSaved('削除しました'); loadStatus(); })\n      .withFailureHandler(function (e) { setSaved('削除できませんでした: ' + (e.message || e), true); }).api_save(pw, cur, (function () { var o = {}; o[f.k] = ''; return o; })());\n  };\n  wrap.appendChild(el('div', { class: 'imgbox' }, [th, pick, file, del, st])); sync();\n}\nfunction fieldView(f) {\n  var wrap = el('div', { class: 'field', 'data-k': f.k, 'data-req': f.req ? '1' : '0' });\n  var lab = el('label', { text: f.l }); if (f.req) lab.appendChild(el('span', { class: 'req', text: '必須' })); wrap.appendChild(lab);\n  var v = vals[f.k] || '';\n  if (f.t === 'image') { imageField(f, wrap); if (f.d) wrap.appendChild(el('div', { class: 'hint', text: f.d })); return wrap; }\n  if (f.cols) {\n    var parts = splitCols(v, f.cols.length), inputs = [], grid = el('div', { class: 'cols' });\n    f.cols.forEach(function (c, i) {\n      var inp = el('input', { type: 'text', value: parts[i], inputmode: /数|円|件|坪|%/.test(c) && !/名|URL|市/.test(c) ? 'decimal' : 'text', 'aria-label': f.l + ' ' + c });\n      inp.oninput = function () { markDirty(f.k, joinCols(inputs.map(function (x) { return x.value; }))); };\n      inputs.push(inp); grid.appendChild(el('div', {}, [el('span', { text: c }), inp]));\n    });\n    wrap.appendChild(grid);\n  } else {\n    var inp;\n    if (f.k === 'prefecture') { inp = el('select', {}); [''].concat(window.__prefs).forEach(function (p) { var o = el('option', { value: p, text: p || '選んでください' }); if (p === v) o.selected = true; inp.appendChild(o); }); inp.onchange = function () { markDirty(f.k, inp.value); }; }\n    else { inp = el('input', { type: f.t === 'date' ? 'date' : 'text', value: v, inputmode: f.t === 'num' ? 'decimal' : 'text' }); inp.oninput = function () { markDirty(f.k, inp.value); }; }\n    inp.setAttribute('aria-label', f.l); wrap.appendChild(inp);\n  }\n  if (f.d) wrap.appendChild(el('div', { class: 'hint', text: f.d }));\n  return wrap;\n}\nfunction viewEdit(id) {\n  call('api_get', [pw, id], function (r) {\n    cur = r.id; meta = r.fields; vals = r.values; dirty = {}; window.__prefs = r.prefectures;\n    chrome(true, true); imgs = r.images || {};\n    $('title').textContent = (vals.company || '') + '　' + (vals.city || '');\n    var top = el('div', { class: 'card' }, [\n      el('div', { class: 'row' }, [el('span', { id: 'stat', class: 'chip need', text: '確認中…' }), el('span', { id: 'totals', class: 'note' })]),\n      el('details', { style: 'margin-top:8px' }, [el('summary', { text: '未入力・未取得の項目を見る', style: 'cursor:pointer' }), el('ul', { id: 'miss' })]),\n      el('div', { class: 'row', style: 'margin-top:12px' }, [])]);\n    var acts = top.lastChild;\n    if (r.url) { acts.appendChild(el('a', { class: 'btn', href: r.url, target: '_blank', rel: 'noopener', text: 'LPを開いて確認' }));\n      var cp = el('button', { class: 'ghost', text: 'URLをコピー' }); cp.onclick = function () { copyText(r.url, cp); }; acts.appendChild(cp); }\n    else acts.appendChild(el('span', { class: 'note', text: '※ウェブアプリとしてデプロイすると、LPを開くボタンが出ます。' }));\n    var rot = el('button', { class: 'ghost', text: 'URLを作り直す' }), armed = false;\n    rot.onclick = function () {\n      if (!armed) { armed = true; rot.textContent = '旧URLが無効になります。もう一度押すと実行'; setTimeout(function () { armed = false; rot.textContent = 'URLを作り直す'; }, 4000); return; }\n      call('api_rotate', [pw, cur], function (x) { openProspect(x.id); });\n    };\n    acts.appendChild(rot);\n    acts.appendChild(el('span', { class: 'note', text: '入力は自動で保存されます。' }));\n    var wrap = el('div', {}), sec = null, body = null, n = 0;\n    meta.forEach(function (f) {\n      if (f.h) { sec = el('details', { class: 'sec' }); sec.appendChild(el('summary', {}, [el('span', { text: f.h }), el('span', { class: 'cnt' })])); body = el('div', { class: 'body' }); sec.appendChild(body); wrap.appendChild(sec); }\n      else if (body) body.appendChild(fieldView(f));\n    });\n    $('main').replaceChildren(top, wrap); refreshNeed(); loadStatus();\n    document.querySelectorAll('details.sec').forEach(function (d, i) { d.open = i < 2 || !!d.querySelector('.field.need'); });\n  });\n}\n\n/* ---- 加盟店 ---- */\nfunction viewFranchises() {\n  cur = null; chrome(true, true); $('title').textContent = '加盟店の管理'; setSaved('');\n  call('api_fr_list', [pw], function (r) {\n    var wrap = el('div', {});\n    var form = el('div', { class: 'card' }, [el('h2', { text: '加盟店を追加', style: 'margin-top:0;font-size:1.1rem' })]);\n    function formRow(rec, idx) {\n      var nm = el('input', { placeholder: '名称(例: ○○工務店株式会社)', value: rec.name || '' });\n      var sel = el('select', {}); [''].concat(r.prefectures).forEach(function (p) { var o = el('option', { value: p, text: p || '都道府県' }); if (p === rec.prefecture) o.selected = true; sel.appendChild(o); });\n      var ct = el('input', { placeholder: '市区町村', value: rec.city || '' }), ur = el('input', { placeholder: 'URL(https://…)', value: rec.url || '' });\n      var ck = el('input', { type: 'checkbox' }); ck.checked = rec.active !== false;\n      var sv = el('button', { text: idx >= 0 ? '保存' : '追加' }), msg = el('span', { class: 'note' });\n      sv.onclick = function () {\n        call('api_fr_save', [pw, idx, { name: nm.value, prefecture: sel.value, city: ct.value, url: ur.value, active: ck.checked }], function () { viewFranchises(); });\n      };\n      var row = el('div', { class: 'row', style: 'margin:8px 0' }, [el('div', { class: 'grow' }, [nm]), el('div', { style: 'width:150px;flex:none' }, [sel]), el('div', { class: 'grow' }, [ct]), el('div', { class: 'grow' }, [ur]),\n        el('label', { class: 'chk' }, [ck, document.createTextNode('有効')]), sv]);\n      if (idx >= 0) { var dl = el('button', { class: 'ghost', text: '削除' }), a2 = false;\n        dl.onclick = function () { if (!a2) { a2 = true; dl.textContent = 'もう一度押すと削除'; setTimeout(function () { a2 = false; dl.textContent = '削除'; }, 4000); return; }\n          call('api_fr_delete', [pw, idx], function () { viewFranchises(); }); };\n        row.appendChild(dl); }\n      return row;\n    }\n    form.appendChild(formRow({}, -1)); form.appendChild(el('p', { class: 'note', text: 'LPの「周辺加盟店」は、ここから(同一市→隣接市→同一県の順に)自動で選ばれます。「有効」を外すと選ばれなくなります。' }));\n    wrap.appendChild(form);\n    var list = el('div', { class: 'card' }, [el('h2', { text: '登録済み(' + r.items.length + '件)', style: 'margin-top:0;font-size:1.1rem' })]);\n    r.items.forEach(function (it) { list.appendChild(formRow(it, it.i)); });\n    if (!r.items.length) list.appendChild(el('p', { class: 'note', text: 'まだありません。' }));\n    wrap.appendChild(list); $('main').replaceChildren(wrap);\n  });\n}\n\n/* ---- 設定 ---- */\nfunction viewSettings() {\n  cur = null; chrome(true, true); $('title').textContent = '設定'; setSaved('');\n  call('api_settings_get', [pw], function (r) {\n    var f = {};\n    function line(label, key, val, hint, type) {\n      f[key] = el('input', { type: type || 'text', value: val, id: 's_' + key, autocomplete: 'off' });\n      return el('div', { class: 'field' }, [el('label', { text: label, for: 's_' + key }), f[key], hint ? el('div', { class: 'hint', text: hint }) : '']);\n    }\n    var card = el('div', { class: 'card' }, [\n      line('周辺加盟店の最大社数', 'max', r.max, '1〜10'), line('県との差が「同程度」とみなす範囲(ポイント)', 'threshold', r.threshold, '価格推移の文章で「同程度」と判定する範囲'),\n      line('POINTの切り上げ単位(件)', 'unit', r.unit, '例: 10 なら 414件→420件'),\n      line('e-Stat アプリケーションID(任意)', 'estat', r.estat, '入れると、世帯数が空欄のとき自動取得を試みます(実機未検証)'),\n      line('パスワードを変更する場合のみ入力', 'newPw', '', '8文字以上。空欄なら変更しません', 'password')]);\n    var sv = el('button', { text: '保存する' }), msg = el('p', { id: 'msg', class: 'note' });\n    sv.onclick = function () {\n      var np = f.newPw.value;\n      call('api_settings_set', [pw, { max: f.max.value, threshold: f.threshold.value, unit: f.unit.value, estat: f.estat.value, newPw: np }], function (x) {\n        if (x.pwChanged) { pw = np; try { sessionStorage.setItem('pw', np); } catch (e) {} f.newPw.value = ''; }\n        $('msg').textContent = '保存しました' + (x.pwChanged ? '(パスワードを変更しました)' : ''); $('msg').className = 'note';\n      });\n    };\n    card.appendChild(sv); card.appendChild(msg);\n    card.appendChild(el('p', { class: 'note', text: 'LPのURLの形: ' + (r.url ? r.url + '?id=…' : '(ウェブアプリとしてデプロイすると表示されます)') }));\n    $('main').replaceChildren(card);\n  });\n}\n\n/* ---- ルーティング ---- */\nfunction route() {\n  var h = location.hash || '', m = /id=([A-Za-z0-9]+)/.exec(h);\n  if (!pw) { viewLogin(); return; }\n  if (m) viewEdit(m[1]); else if (h === '#fr') viewFranchises(); else if (h === '#set') viewSettings(); else viewList();\n}\n$('back').onclick = function () { flushNow(function () { location.hash = ''; route(); }); };\n$('navfr').onclick = function () { flushNow(function () { location.hash = 'fr'; route(); }); };\n$('navset').onclick = function () { flushNow(function () { location.hash = 'set'; route(); }); };\n$('logout').onclick = function () { flushNow(function () { pw = ''; sessionStorage.removeItem('pw'); location.hash = ''; viewLogin(); }); };\nfunction flushNow(next) { clearTimeout(timer); if (Object.keys(dirty).length || saving) { flush(); setTimeout(next, 900); } else next(); }\nwindow.addEventListener('beforeunload', function (e) { if (Object.keys(dirty).length) { flush(); e.preventDefault(); e.returnValue = ''; } });\nwindow.__prefs = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];\ntry { pw = sessionStorage.getItem('pw') || ''; } catch (e) { pw = ''; }\nif (pw) { google.script.run.withSuccessHandler(route).withFailureHandler(function () { pw = ''; viewLogin(); }).api_login(pw); } else viewLogin();\nwindow.addEventListener('hashchange', function () { if (pw) route(); });\n</script></body></html>\n";
var STYLE_CSS_ = "/* エリア調査シート LP — ブランド: ティール 0097A7 / 強調: オレンジ FFAB40 */\n:root{\n  --c-teal:#0097A7; --c-deep:#007482; --c-ink:#00606B;\n  --c-teal-300:#9bd5dc; --c-teal-400:#6cc0ca; --c-teal-500:#3fa9b6; --c-teal-600:#0097A7; --c-teal-700:#00798A;\n  --c-accent:#FFAB40; --c-slate:#78909C;\n  --c-text:#212121; --c-sub:#595959; --c-bg:#fff; --c-alt:#F4F7F8; --c-line:#d5dde0;\n  --f: \"Noto Sans JP\",\"Hiragino Kaku Gothic ProN\",\"Hiragino Sans\",Meiryo,\"Yu Gothic\",sans-serif;\n  --wrap:70rem; --r:14px;\n}\n*{box-sizing:border-box}\nhtml{font-size:100%;scroll-behavior:smooth;-webkit-text-size-adjust:100%}\n@media (min-width:1700px){html{font-size:125%}}   /* 大画面・プロジェクター */\n@media (min-width:2400px){html{font-size:150%}}\n@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}\nbody{margin:0;font-family:var(--f);color:var(--c-text);background:var(--c-bg);font-size:1rem;line-height:1.85;\n  font-feature-settings:\"palt\" 1,\"pkna\" 1;line-break:strict;word-break:normal;overflow-wrap:anywhere;text-wrap:pretty;\n  -webkit-font-smoothing:antialiased}\nh1,h2,h3,p{margin:0}\nh2,h3,.kpi-num{line-break:strict;text-wrap:balance}\nimg,svg{max-width:100%;height:auto}\na{color:var(--c-ink)}\n.wrap{max-width:var(--wrap);margin:0 auto;padding:0 20px}\n.num{font-feature-settings:\"tnum\" 1;font-variant-numeric:tabular-nums}\n\n/* nav */\n.nav{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.97);border-bottom:1px solid var(--c-line)}\n.nav .wrap{display:flex;align-items:center;gap:20px;min-height:56px;overflow-x:auto;scrollbar-width:none}\n.nav .wrap::-webkit-scrollbar{display:none}\n.nav img{height:26px;width:auto;flex:none}\n.nav a.i{flex:none;font-size:.875rem;font-weight:500;text-decoration:none;color:var(--c-sub);padding:14px 4px;white-space:nowrap}\n.nav a.i:hover,.nav a.i:focus-visible{color:var(--c-ink);text-decoration:underline}\n\n/* hero */\n.hero{background:var(--c-deep);color:#fff;position:relative;overflow:hidden}\n.hero::after{content:\"\";position:absolute;right:-8%;top:-30%;width:46%;aspect-ratio:1;border-radius:50%;background:var(--c-teal);opacity:.55}\n.hero .wrap{position:relative;z-index:1;display:grid;grid-template-columns:1fr auto;gap:32px;align-items:end;padding-top:56px;padding-bottom:40px}\n.eyebrow{font-weight:700;letter-spacing:.12em;font-size:1rem}\n.hero h1{font-size:clamp(1.75rem,4.4vw,3rem);line-height:1.35;font-weight:700;margin:8px 0 16px}\n.hero h1 small{font-size:.5em;font-weight:500;margin-left:.4em}\n.pill{display:inline-block;background:#fff;color:var(--c-ink);font-weight:700;border-radius:999px;padding:4px 18px;font-size:1.125rem}\n.hero .date{margin-left:14px;font-size:.9375rem}\n.king{width:clamp(120px,18vw,220px);align-self:end;margin-bottom:-40px}\n.conclusions{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:20px}\n.kpi{background:#fff;color:var(--c-text);border-radius:var(--r);padding:16px 20px;display:flex;flex-direction:column;gap:2px}\n.kpi-label{font-size:.875rem;color:var(--c-sub);font-weight:500;line-height:1.5;order:2}\n.kpi-num{order:1;font-weight:700;font-size:clamp(1.75rem,4vw,2.75rem);line-height:1.2;color:var(--c-ink)}\n.kpi-num .u{font-size:.45em;font-weight:500;margin-left:.15em;color:var(--c-sub)}\n.kpi.accent .kpi-num{color:var(--c-text)}\n.kpi.accent{border-bottom:6px solid var(--c-accent)}\n.anchors{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px 10px;margin-top:6px}\n.anchors a{color:#fff;border:1px solid rgba(255,255,255,.7);border-radius:999px;padding:8px 16px;font-size:.875rem;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}\n.anchors a:hover,.anchors a:focus-visible{background:#fff;color:var(--c-ink)}\n\n/* sections */\n.sec{padding:72px 0 56px}\n.sec.alt{background:var(--c-alt)}\n.sec-no{font-size:.875rem;font-weight:700;letter-spacing:.12em;color:var(--c-ink);margin-bottom:6px}\n.sec h2{font-size:clamp(1.375rem,3vw,2rem);line-height:1.5;font-weight:700;margin-bottom:28px;max-width:34em}\n.sec h2 .em{color:var(--c-ink)}\n.lead{max-width:44em;margin-bottom:28px}\n.src{font-size:.8125rem;color:var(--c-sub);text-align:right;margin-top:24px;line-height:1.6}\n.note{font-size:.8125rem;color:var(--c-sub);line-height:1.7}\n.notes{list-style:none;margin:24px 0 0;padding:0}\n.card{background:#fff;border:1px solid var(--c-line);border-radius:var(--r);padding:24px}\n.sec.alt .card{border-color:transparent}\n.grid{display:grid;gap:16px}\n.tgrid{grid-template-columns:repeat(4,1fr)}\n.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}\n.split{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start}\n.kpi.flat{background:#fff;border:1px solid var(--c-line)}\n.sec.alt .kpi.flat{border-color:transparent}\n.sub{font-size:1rem;font-weight:700;margin:0 0 10px}\n.chart{width:100%;display:block}\n.ch-lab{font:500 15px var(--f);fill:var(--c-text)}\n.ch-val{font:700 17px var(--f);fill:var(--c-text);font-feature-settings:\"tnum\" 1}\n.ch-val-lg{font:700 22px var(--f);fill:var(--c-text);font-feature-settings:\"tnum\" 1}\n.ch-unit{font:500 12px var(--f);fill:var(--c-sub)}\n.ch-sub{font:500 13px var(--f);fill:var(--c-sub)}\n\n.chart-c{display:none}\n.dlist{list-style:none;margin:0;padding:0;display:grid;gap:12px}\n.dlist li{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:baseline;font-size:.9375rem}\n.dlist b{font-size:1.25rem}\n.dlist i{grid-column:1/-1;height:10px;border-radius:5px;background:var(--c-teal-400)}\n.dlist li.top i{background:var(--c-accent)}.dlist li.top{font-weight:700}\n/* area */\n.area-map{width:auto;max-width:100%;max-height:560px;margin:0 auto;display:block}\n.area-map .map-other path{fill:#e3ebed;stroke:#fff;stroke-width:1}\n.area-map .map-target path{fill:var(--c-accent);stroke:#fff;stroke-width:1.5}\n.map-label{font:700 16px var(--f);fill:var(--c-text);paint-order:stroke;stroke:#fff;stroke-width:4px}\n.fr{list-style:none;margin:0;padding:0;display:grid;gap:10px}\n.fr li{background:#fff;border:1px solid var(--c-line);border-radius:10px;padding:12px 16px;line-height:1.6}\n.sec.alt .fr li{border-color:transparent}\n.fr b{display:block}.fr span{font-size:.875rem;color:var(--c-sub)}\n.fr a{font-size:.875rem;word-break:break-all}\n.empty{color:var(--c-sub);padding:14px 0}\n\n/* heatmap */\n.heat-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}\n.heat{border-collapse:collapse;font-size:.8125rem;min-width:520px;width:100%}\n.heat th,.heat td{border:1px solid var(--c-line);padding:6px 8px;text-align:center;line-height:1.4}\n.heat th{background:var(--c-alt);font-weight:500;color:var(--c-sub);white-space:nowrap}\n.heat td{font-weight:700;font-feature-settings:\"tnum\" 1}\n.heat caption{caption-side:top;text-align:left;font-weight:700;font-size:.9375rem;padding-bottom:8px}\n\n/* summary */\n.big2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}\n.big2 .kpi-num{font-size:clamp(2.25rem,6vw,4rem)}\n.tcard h3{font-size:1.0625rem;border-left:6px solid var(--c-teal);padding-left:10px;margin-bottom:12px}\n.tcard dl{margin:0;display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:.9375rem;line-height:1.5}\n.tcard dt{color:var(--c-sub)}.tcard dd{margin:0;font-weight:700;text-align:right;font-feature-settings:\"tnum\" 1}\n.tcard dd.big{font-size:1.75rem;color:var(--c-ink);line-height:1.2}\n.tcard hr{border:0;border-top:1px solid var(--c-line);grid-column:1/-1;margin:6px 0;width:100%}\n\n/* keywords */\n.kw{width:100%;border-collapse:collapse}\n.kw th{font-size:.875rem;color:var(--c-sub);font-weight:500;text-align:left;padding:8px 12px;border-bottom:2px solid var(--c-line)}\n.kw td{padding:14px 12px;border-bottom:1px solid var(--c-line);vertical-align:middle}\n.kw td.v{font-size:1.5rem;font-weight:700;color:var(--c-ink)}\n.bar{display:block;height:8px;border-radius:4px;background:var(--c-teal-400);margin-top:6px}\n.kw tr:first-child .bar{background:var(--c-accent)}\n@media (max-width:640px){.kw thead{display:none}.kw,.kw tbody,.kw tr,.kw td{display:block}.kw tr{padding:10px 0;border-bottom:1px solid var(--c-line)}.kw td{border:0;padding:2px 0}}\n\n/* point */\n.point{background:var(--c-deep);color:#fff;padding:72px 0}\n.point .wrap{display:grid;grid-template-columns:auto 1fr;gap:40px;align-items:center}\n.point img{width:clamp(110px,16vw,190px)}\n.point .tag{display:inline-block;background:var(--c-accent);color:var(--c-text);font-weight:700;padding:2px 16px;border-radius:6px;letter-spacing:.1em;margin-bottom:12px}\n.point p.t{font-size:clamp(1.25rem,2.8vw,1.875rem);font-weight:700;line-height:1.65;max-width:30em}\n.point p.t b{color:var(--c-accent);font-size:1.25em}\n\n/* competitors */\n.comp .name{font-weight:700;font-size:1.0625rem}\n.comp .cnt{font-size:.9375rem;margin-top:10px}.comp .cnt b{font-size:1.75rem;color:var(--c-ink)}\n.fig{background:#fff;border:1px solid var(--c-line);border-radius:var(--r);padding:12px;margin:0}\n.fig img{width:100%;display:block;border-radius:6px}\n\n/* question */\n.q{text-align:center}\n.q .wrap{display:flex;flex-direction:column;align-items:center;gap:20px}\n.q img.th{width:clamp(180px,24vw,300px)}\n.q h2{margin:0 auto;max-width:22em;font-size:clamp(1.5rem,3.4vw,2.25rem)}\n.btn{display:inline-flex;align-items:center;justify-content:center;min-height:56px;padding:0 36px;border-radius:999px;background:var(--c-accent);color:var(--c-text);font-weight:700;font-size:1.125rem;text-decoration:none;box-shadow:0 2px 0 rgba(0,0,0,.18)}\n.btn:hover,.btn:focus-visible{filter:brightness(.95);outline:3px solid var(--c-text);outline-offset:3px}\n.hero .btn{margin-top:8px}\n\n/* 未入力スロット(管理者向け。取得レポートと対応) */\n.slot{border:2px dashed #b26a00;background:#fff8ec;color:#5a3600;border-radius:10px;padding:14px 18px;font-size:.875rem;line-height:1.7}\n.slot b{display:block;margin-bottom:2px}.slot code{font-size:.8125rem;background:#fff;padding:1px 6px;border-radius:4px;word-break:break-all}\n.draft{background:#5a3600;color:#fff;font-size:.875rem;padding:10px 0;line-height:1.6}\n.draft .wrap{display:flex;gap:12px;flex-wrap:wrap;align-items:center}\n.foot{padding:40px 0 56px;font-size:.8125rem;color:var(--c-sub);background:#fff;border-top:1px solid var(--c-line)}\n.foot p+p{margin-top:6px}\n\n/* motion: JS有効時のみ隠す。reduced-motion では無効 */\n.js .rv{opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease}\n.js .rv.in{opacity:1;transform:none}\n@media (prefers-reduced-motion:reduce){.js .rv{opacity:1;transform:none;transition:none}}\n\n@media (max-width:900px){\n  .g4{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(2,1fr)}.tgrid{grid-template-columns:repeat(2,1fr)}\n  .split{grid-template-columns:1fr}\n}\n@media (max-width:640px){\n  .hero .wrap{grid-template-columns:1fr;padding-top:36px}\n  .king{position:absolute;right:12px;top:-6px;width:96px;margin:0;opacity:1}\n  .hero h1{padding-right:90px}\n  .hero .date{display:block;margin:8px 0 0}\n  .conclusions,.big2,.g2,.g3{grid-template-columns:1fr}\n  .g4{grid-template-columns:repeat(2,1fr)}.g4 .kpi{padding:14px}.tgrid{grid-template-columns:1fr}\n  .heat{min-width:480px}\n  .chart-d{display:none}.chart-c{display:block}\n  .point .wrap{grid-template-columns:1fr;text-align:left}.point img{width:96px}\n  .sec{padding:48px 0 36px}\n  .card{padding:18px}\n  .src{text-align:left}\n}\n\n/* 印刷/PDF: A4横・セクションごとに改ページ */\n@page{size:A4 landscape;margin:9mm}\n@media print{\n  html{font-size:15px}\n  body{-webkit-print-color-adjust:exact;print-color-adjust:exact;line-height:1.6}\n  .nav,.btn,.anchors,.draft{display:none!important}\n  .js .rv{opacity:1!important;transform:none!important}\n  .hero,.sec,.point,.q,.foot{break-before:page;break-inside:avoid;page-break-before:always}\n  .hero{break-before:auto;page-break-before:auto}\n  .hero .wrap{padding-top:28px;padding-bottom:30px}\n  .king{margin-bottom:-30px}\n  .sec,.point{padding:6mm 0}\n  .sec h2{margin-bottom:12px}.lead{margin-bottom:12px}\n  .sec.alt{background:var(--c-alt)}\n  .card,.kpi,.fr li{break-inside:avoid}\n  .src{margin-top:10px}\n  .area-map{max-width:340px}\n  .chart{max-height:80mm}\n  .fig img{max-height:92mm;width:auto;margin:0 auto}\n  .heat{font-size:10px}.heat th,.heat td{padding:3px 5px}\n  .foot{padding:6mm 0;break-before:avoid;page-break-before:avoid}\n  a{text-decoration:none;color:inherit}\n  /* 印刷はつねにPC幅のレイアウト */\n  .wrap{max-width:none;padding:0 4mm}\n  .g4,.tgrid{grid-template-columns:repeat(4,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g2{grid-template-columns:repeat(2,1fr)}\n  .split{grid-template-columns:1fr 1fr;gap:16px}\n  .conclusions{grid-template-columns:repeat(3,1fr)}.big2{grid-template-columns:1fr 1fr}\n  .hero .wrap{grid-template-columns:1fr auto}.point .wrap{grid-template-columns:auto 1fr}\n  .hero h1{padding-right:0}.king{position:static;width:150px}\n  .chart-d{display:block!important}.chart-c{display:none!important}\n  .area-map{max-height:120mm}\n  .kw thead{display:table-header-group}.kw,.kw tbody{display:table-row-group}.kw tr{display:table-row}.kw td{display:table-cell;padding:6px 10px}\n  .kw{display:table}.kw tbody{display:table-row-group}\n  .sec{padding:4mm 0}.card{padding:12px}\n  .kpi{padding:10px 14px}\n}\n";
var APP_JS_ = "/* スクロールに合わせた控えめなフェードイン / 数字のカウントアップ(reduced-motionでは無効) */\n(function () {\n  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;\n  var els = document.querySelectorAll('.rv');\n  if (reduce || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }\n  function count(el) {\n    var end = parseFloat(el.getAttribute('data-count')); if (isNaN(end)) return;\n    var dec = (String(el.getAttribute('data-count')).split('.')[1] || '').length;\n    var t0 = null, dur = 700, orig = el.textContent;\n    function step(t) { if (!t0) t0 = t; var p = Math.min((t - t0) / dur, 1), v = end * (1 - Math.pow(1 - p, 3));\n      el.textContent = p < 1 ? v.toLocaleString('ja-JP', { maximumFractionDigits: dec, minimumFractionDigits: dec }) : orig;\n      if (p < 1) requestAnimationFrame(step); }\n    requestAnimationFrame(step);\n  }\n  var io = new IntersectionObserver(function (es) {\n    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in');\n      e.target.querySelectorAll('[data-count]').forEach(count); io.unobserve(e.target); } });\n  }, { threshold: 0.12 });\n  els.forEach(function (e) { io.observe(e); });\n  window.addEventListener('beforeprint', function () { els.forEach(function (e) { e.classList.add('in'); }); });\n})();\n";
