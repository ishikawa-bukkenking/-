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

/** 上位 digits 桁で切り上げる(414→420、1,898→1,900、1,901→2,000) */
function ceilSig_(x, digits) {
  var n = Math.ceil(x);
  if (n <= 0) return 0;
  var mag = Math.pow(10, Math.max(0, String(n).length - (digits || 2)));
  return Math.ceil(n / mag) * mag;
}

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
    if (lb) {
      var diff = Math.abs(n - c);
      var verb = c > n ? '上回る' : '下回る';
      var diffTxt = diff ? num_(diff) + '万円' + verb + '結果になりました' : '同水準の結果になりました';
      var head = city + 'の平均年収は' + num_(c) + '万円です。' + pref + 'の' + N + '市町村の中で' + rank + '位となり、全国の平均年収からは' + diffTxt + '。';
      var pctTxt = roundHalfUp_(lb.share * 100, 1).toFixed(1) + '%';
      out.body = lb.households != null
        ? head + '年収階級別にみると年収' + bracketPhrase_(lb.label) + 'の世帯が一番多く' + num_(lb.households) + '世帯（' + pctTxt + '）となります。'
        : head + '年収階級別にみると、年収' + bracketPhrase_(lb.label) + 'の世帯が最も多く、全体の' + pctTxt + 'を占めています。';
    }
  }
  return out;
}

function trendJudge_(cityPct, prefPct, threshold) {
  var diff = cityPct - prefPct;
  if (Math.abs(diff) <= threshold + 1e-9) return '同程度';
  return diff > 0 ? '高い' : '低い';
}

function change_(v) {
  if (Math.abs(v) < 0.005) return 'ほぼ横ばい';
  return num_(Math.abs(v), 2) + '%の' + (v > 0 ? '上昇' : '下落');
}
function signed_(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + num_(Math.abs(v), 2) + '%'; }

/** 価格推移の説明文。数値の事実を穏やかな表現で伝える(「高い/低い」と断定せず「やや上回る/下回る」とする) */
function trendText_(city, pref, c, p, y, judge) {
  var rel = { '同程度': 'おおむね同程度の水準です', '高い': 'やや上回る水準です', '低い': 'やや下回る水準です' }[judge];
  var first = city + 'の標準的な物件の価格は、直近3年間で' + change_(c) + 'となりました。';
  var second = pref + '全体の変動（' + signed_(p) + '）と比べると、' + rel + '。';
  var allUp = y.every(function (v) { return v >= 0.005; }), allDown = y.every(function (v) { return v <= -0.005; }), third;
  if (allUp || allDown) third = '年ごとにみると、1年目は' + num_(Math.abs(y[0]), 2) + '%、2年目は' + num_(Math.abs(y[1]), 2) + '%、3年目は' + num_(Math.abs(y[2]), 2) + '%の' + (allUp ? '上昇' : '下落') + 'でした。';
  else third = '年ごとにみると、1年目は' + change_(y[0]) + '、2年目は' + change_(y[1]) + '、3年目は' + change_(y[2]) + 'でした。';
  return first + second + third;
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
  if (c != null && p != null && y && y.length === 3) out.body = trendText_(city, pref, c, p, y, out.judgement_vs_prefecture);
  return out;
}

/** POINTに載せる件数。上位2桁で切り上げる(414→420、1,898→1,900) */
function pointRounded_(total) { return ceilSig_(total, 2); }

function pointText_(total) {
  var n = pointRounded_(total);
  return '商圏で約' + num_(n) + '件の物件情報数を担保できれば、商圏No.1の情報量を担保するHPを作り上げることが実証される';
}


/** 行政区域(国土数値情報由来)の取得・隣接判定・静的SVG地図(areasheet/geo.py の移植) */

var GEO_URL_ = 'https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/municipality/geojson/s0010/N03-21_{code}_210101.json';
var GEO_SOURCE = '国土数値情報 行政区域データ(2021-01-01時点)';
var GEO_LICENSE_NOTE = '出典: 国土数値情報(行政区域データ) 国土交通省 / 加工: smartnews-smri/japan-topography';

/** 政令指定都市の団体コード(市全体を選んだときの世帯数取得用) */
var DESIGNATED_CODES_ = { '札幌市': '01100', '仙台市': '04100', 'さいたま市': '11100', '千葉市': '12100', '横浜市': '14100', '川崎市': '14130', '相模原市': '14150',
  '新潟市': '15100', '静岡市': '22100', '浜松市': '22130', '名古屋市': '23100', '京都市': '26100', '大阪市': '27100', '堺市': '27140', '神戸市': '28100',
  '岡山市': '33100', '広島市': '34100', '北九州市': '40100', '福岡市': '40130', '熊本市': '43100' };

/** 政令指定都市の区なら { parent: '横浜市', ward: '横浜市中区' } */
function wardParts_(p) {
  var c3 = p.N03_003, c4 = p.N03_004;
  if (c3 && /市$/.test(c3) && c4 && /区$/.test(c4)) return { parent: c3, ward: c3 + c4 };
  return null;
}
function muniName_(p) {
  var c3 = p.N03_003, c4 = p.N03_004;
  if (c3 && /市$/.test(c3) && c4 && /区$/.test(c4)) return c3;
  return c4 || null;
}

function polysOf_(geom) {
  return geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
}

/** 政令指定都市は「市全体(横浜市)」と「各区(横浜市中区)」の両方を選べるようにする */
function buildPrefecture_(pref, geojson) {
  var munis = {}, order = [];
  function add(name, code, polys, extra) {
    if (!munis[name]) { munis[name] = Object.assign({ code: code || '', polys: [] }, extra || {}); order.push(name); }
    polys.forEach(function (p) { munis[name].polys.push(p); });
  }
  geojson.features.forEach(function (f) {
    var pr = wardParts_(f.properties), polys = polysOf_(f.geometry), code = f.properties.N03_007 || '';
    if (pr) {
      add(pr.parent, DESIGNATED_CODES_[pr.parent] || code, polys, { agg: true });
      add(pr.ward, code, polys, { ward: true, parent: pr.parent });
      return;
    }
    var name = muniName_(f.properties);
    if (name) add(name, code, polys);
  });
  var count = order.filter(function (n) { return !munis[n].ward; }).length;   // 市町村数(区は数えない)
  return { pref: pref, munis: munis, names: order, count: count };
}

/** 地図・隣接の判定に使う名前の集まり。区を選んだときは区単位、それ以外は市単位(二重に描かない) */
function viewNames_(P, target) {
  var wardView = !!(P.munis[target] && P.munis[target].ward);
  return P.names.filter(function (n) { return wardView ? !P.munis[n].agg : !P.munis[n].ward; });
}

function resolveCity_(P, city) {
  var key = cityKey_(city);
  if (P.munis[key]) return key;
  var sfx = ['市', '区', '町', '村'];
  for (var i = 0; i < sfx.length; i++) if (P.munis[key + sfx[i]]) return key + sfx[i];
  // 「中区」のように市名を省いた区名: 県内で1つに決まるなら採用(複数あれば候補を出す)
  var wards = P.names.filter(function (n) { return P.munis[n].ward && n.slice(-key.length) === key; });
  if (key && /区$/.test(key) && wards.length === 1) return wards[0];
  if (key && /区$/.test(key) && wards.length > 1) throw new Error(P.pref + 'に「' + city + '」が複数あります。市名から入力してください。候補: ' + wards.join('、'));
  var cands = P.names.filter(function (n) { return key && n.indexOf(key.slice(0, 2)) >= 0; }).slice(0, 8);
  throw new Error(P.pref + 'に「' + city + '」が見つかりません(2021年1月時点の市区町村名)。候補: ' + cands.join('、'));
}

function vkey_(pt) { return pt[0].toFixed(5) + ',' + pt[1].toFixed(5); }

/** 対象と共有頂点が2つ以上ある市区町村を、共有頂点の多い順に返す */
function neighborsOf_(P, name) {
  var mine = {};
  P.munis[name].polys.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(function (pt) { mine[vkey_(pt)] = 1; }); }); });
  var res = [];
  viewNames_(P, name).forEach(function (other) {
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

function renderMapSvg_(P, target, focus) {   // focus: 市区町村名の配列を渡すと、それらだけを拡大して描く(ピン用)
  var width = 640, rings = [];
  viewNames_(P, target).forEach(function (name) {
    P.munis[name].polys.forEach(function (poly) {
      var ac = ringAreaCentroid_(poly[0]);
      rings.push({ name: name, poly: poly, area: ac[0], cx: ac[1], cy: ac[2] });
    });
  });
  var tot = rings.reduce(function (s, r) { return s + r.area; }, 0) || 1;
  var mx = rings.reduce(function (s, r) { return s + r.cx * r.area; }, 0) / tot;
  var my = rings.reduce(function (s, r) { return s + r.cy * r.area; }, 0) / tot;
  var keep = focus ? rings.filter(function (r) { return focus.indexOf(r.name) >= 0; }) : rings.filter(function (r) { return Math.hypot(r.cx - mx, r.cy - my) < 5.0 || r.name === target; });
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
  if (focus) {   // 拡大図では、周りの市町村名も小さく添える
    var big = {};
    keep.forEach(function (r) { if (r.name !== target && (!big[r.name] || r.area > big[r.name].area)) big[r.name] = r; });
    Object.keys(big).forEach(function (n) { var q = pt(big[n].cx, big[n].cy).split(','); lab += '<text class="map-sub" x="' + q[0] + '" y="' + q[1] + '" text-anchor="middle">' + esc_(n) + '</text>'; });
  }
  var svg = '<svg class="area-map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' +
    esc_(P.pref) + 'の地図。' + esc_(target) + 'を強調表示"><g class="map-other">' + other.join('') + '</g><g class="map-target">' + tgt.join('') + '</g>' + lab + '</svg>';
  return { svg: svg, proj: { lon0: lon0, lat1: lat1, k: k, scale: scale, pad: pad, width: width, height: height } };
}

/** 緯度経度 → 地図上の座標。地図の範囲外ならnull */
function projectPoint_(proj, lat, lon) {
  var x = (lon - proj.lon0) * proj.k * proj.scale + proj.pad, y = (proj.lat1 - lat) * proj.scale + proj.pad;
  if (!(x >= 0 && x <= proj.width && y >= 0 && y <= proj.height)) return null;
  return [x, y];
}

/** 地図SVGにピンを立てる。pins: [{kind:'client'|'fr', n, name, x, y}] */
function addPinsToSvg_(svg, pins) {
  if (!pins.length) return svg;
  var out = pins.map(function (p) {
    var client = p.kind === 'client', fill = client ? 'var(--c-accent)' : 'var(--c-teal-700)', r = client ? 18 : 17;
    var x = p.x.toFixed(1), y = p.y.toFixed(1);
    // 先端が(x,y)に来るしずく型のピン
    var d = 'M' + x + ',' + y + 'c' + (-r * 0.2) + ',' + (-r * 0.9) + ' ' + (-r) + ',' + (-r * 1.2) + ' ' + (-r) + ',' + (-r * 2.1) + 'a' + r + ',' + r + ' 0 1,1 ' + (2 * r) + ',0c0,' + (r * 0.9) + ' ' + (-r * 0.8) + ',' + (r * 1.2) + ' ' + (-r) + ',' + (r * 2.1) + 'z';
    var cy = (p.y - r * 2.1 + r * 0.05).toFixed(1);
    var g = '<g class="pin ' + (client ? 'pin-client' : 'pin-fr') + '"><title>' + esc_(p.name) + '</title><path d="' + d + '" fill="' + fill + '" stroke="#fff" stroke-width="2"/>' +
      (client ? '<circle cx="' + x + '" cy="' + cy + '" r="5" fill="#fff"/>' : '<text x="' + x + '" y="' + (parseFloat(cy) + 6) + '" text-anchor="middle" class="pin-no">' + p.n + '</text>');
    if (client) g += '<text x="' + (p.x + r + 4).toFixed(1) + '" y="' + (parseFloat(cy) + 5) + '" class="map-label">御社</text>';
    return g + '</g>';
  });
  // 後ろ(下)のピンから描いて、手前のピンが隠れないようにする。御社は最前面
  out.sort(function (a, b) { return (a.indexOf('pin-client') >= 0 ? 1 : 0) - (b.indexOf('pin-client') >= 0 ? 1 : 0); });
  return svg.replace('</svg>', out.join('') + '</svg>');
}

/** 都道府県の境界を取得し、(対象市の)地図SVG・隣接市・市町村数・団体コードを返す。結果はキャッシュする */
function loadGeo_(services, pref, city) {
  var cacheKey = 'geo5:' + pref + ':' + city;
  var hit = services.cacheGet(cacheKey);
  if (hit) return JSON.parse(hit);
  var geojson = services.fetchJson(GEO_URL_.replace('{code}', ('0' + prefCode_(pref)).slice(-2)));
  var P = buildPrefecture_(pref, geojson);
  var name = resolveCity_(P, city);
  var res = { city: name, isWard: !!P.munis[name].ward, code: P.munis[name].code, count: P.count, neighbors: neighborsOf_(P, name) };
  // 加盟店の隣接判定用: 区は親の市に置き換える(加盟店の市は「横浜市」のように市単位で持っているため)
  res.neighborCities = res.neighbors.map(function (n) { return P.munis[n].parent || n; }).filter(function (n, i, a) { return a.indexOf(n) === i; });
  var m = renderMapSvg_(P, name); res.svg = m.svg; res.proj = m.proj;
  var z = renderMapSvg_(P, name, [name].concat(res.neighbors)); res.zsvg = z.svg; res.zproj = z.proj;
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
    if (tier === 'same_city') {
      var wm = String(city).match(/^(.+市)(.+区)$/);   // 政令市の区を選んだとき: 住所にその区が入っている加盟店も「同じ市区」とみなす
      c = pool.filter(function (r) { return r.city === city || (wm && r.city === wm[1] && String(r.address || '').indexOf(city) >= 0); });
    }
    else if (tier === 'adjacent') {
      c = pool.filter(function (r) { return neighbors.indexOf(r.city) >= 0 && r.city !== city; })
        .sort(function (a, b) { return neighbors.indexOf(a.city) - neighbors.indexOf(b.city); });
    } else c = pool.filter(function (r) { return r.city !== city; });
    add(c, tier);
    if (picked.length && stop) break;
  }
  return { items: picked.map(function (r) {
    return { name: r.name, prefecture: r.prefecture, city: r.city, address: r.address || '', url: r.url || '', area: r.prefecture + ' ' + r.city, tier: r._tier };
  }), tiers_used: used };
}

// ---------- 加盟店CSVの取り込み(areasheet/franchise.py の移植) ----------
var DESIGNATED_ = { '札幌市': '北海道', '仙台市': '宮城県', 'さいたま市': '埼玉県', '千葉市': '千葉県', '横浜市': '神奈川県', '川崎市': '神奈川県', '相模原市': '神奈川県',
  '新潟市': '新潟県', '静岡市': '静岡県', '浜松市': '静岡県', '名古屋市': '愛知県', '京都市': '京都府', '大阪市': '大阪府', '堺市': '大阪府', '神戸市': '兵庫県',
  '岡山市': '岡山県', '広島市': '広島県', '北九州市': '福岡県', '福岡市': '福岡県', '熊本市': '熊本県' };

/** RFC4180のCSVを行列にする(引用符・引用符内の改行に対応) */
function parseCsv_(text) {
  var rows = [], row = [], cur = '', q = false;
  text = String(text).replace(/^﻿/, '');
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/** 住所から {prefecture, city}。郡は落とし、政令市の区は市に統合する */
function splitAddress_(address) {
  var a = String(address || '').normalize('NFKC').replace(/〒?\s*\d{3}-?\d{4}/g, ' ').trim();
  var m = a.match(/^(北海道|東京都|京都府|大阪府|.{2,3}県)/), pref = '', rest;
  if (m) { pref = m[1]; rest = a.slice(m[0].length); }
  else {
    rest = a;
    Object.keys(DESIGNATED_).forEach(function (k) { if (!pref && a.indexOf(k) === 0) pref = DESIGNATED_[k]; });
  }
  rest = rest.split(/[\d\s]/)[0];
  if (!rest || !pref) return { prefecture: pref, city: '' };
  var gun = rest.indexOf('郡'), shi = rest.indexOf('市', 1);
  if (gun >= 0 && (shi < 0 || gun < shi)) {
    var m2 = rest.slice(gun + 1).match(/^[^\d\s]+?[町村]/);
    return { prefecture: pref, city: m2 ? m2[0] : '' };
  }
  if (shi >= 0) return { prefecture: pref, city: rest.slice(0, shi + 1) };
  var ku = rest.indexOf('区', 1);
  if (pref === '東京都' && ku >= 0) return { prefecture: pref, city: rest.slice(0, ku + 1) };
  var m3 = rest.match(/^[^\d\s]+?[町村]/);
  return { prefecture: pref, city: m3 ? m3[0] : '' };
}

/** 「会社名（旧：…）【屋号】《対応エリア》」から会社名・屋号・対応エリアを取り出す */
function cleanCompany_(raw) {
  raw = String(raw || '').replace(/　/g, ' ').trim();
  var shop = (raw.match(/【([^】]*)】/) || [0, ''])[1].trim(), area = (raw.match(/《([^》]*)》/) || [0, ''])[1].trim();
  var name = raw.split(/[【《]/)[0].replace(/[（(][^）)]*旧[^）)]*[）)]|＊旧[^【《\s]*|\*旧[^【《\s]*/g, '').replace(/\s+/g, ' ').trim();
  return { name: name, shop: shop, service_area: area };
}

/** 加盟店CSV(列: [顧客番号,]会社名,住所)。途中で改行された行(名称・住所の分断)は結合する */
function parseFranchiseRaw_(text) {
  var rows = parseCsv_(text).map(function (r) { return r.map(function (c) { return c.trim(); }); }).filter(function (r) { return r.some(function (c) { return c; }); });
  if (!rows.length) return [];
  var head = rows[0].map(function (h) { return h.replace(/\s/g, ''); });
  var hasNo = head.indexOf('顧客番号') >= 0, merged = [], pending = '';
  var urlCol = -1;
  head.forEach(function (h, i) { if (urlCol < 0 && ['URL', 'url', 'HP', 'ＨＰ', 'ホームページ'].indexOf(h) >= 0) urlCol = hasNo ? i - 1 : i; });
  var PREF_RE = /^(北海道|東京都|京都府|大阪府|.{2,3}県)/;
  rows.slice(1).forEach(function (r) {
    var no = '', rest = r;
    if (hasNo && r.length >= 2 && /^[A-Za-z]\d+$/.test(r[0])) { no = r[0]; rest = r.slice(1); }
    if (rest.length === 1) {
      var last = merged[merged.length - 1];
      if (last && PREF_RE.test(rest[0].normalize('NFKC')) && /^〒?\s*\d{3}-?\d{4}$/.test(last[2] || '')) last[2] = last[2] + ' ' + rest[0];
      else pending += rest[0];
      return;
    }
    var name = rest[0], addr = rest[1] || '', url = urlCol >= 0 ? (rest[urlCol] || '') : '', prev = merged[merged.length - 1];
    if (prev && (prev[1].split('【').length > prev[1].split('】').length) && name.indexOf('】') === 0 && !prev[2]) { prev[1] += name; prev[2] = addr; return; }
    if (pending) { name = pending + name; pending = ''; }
    merged.push([no, name, addr, url]);
  });
  var out = [];
  merged.forEach(function (m) {
    if (m[1].split('【').length > m[1].split('】').length && !m[2]) return;
    var c = cleanCompany_(m[1]), a = splitAddress_(m[2]);
    out.push({ name: c.name, shop: c.shop, service_area: c.service_area, customer_no: m[0], url: /^https?:\/\//.test(m[3] || '') ? m[3] : '', address: String(m[2]).normalize('NFKC').trim(), prefecture: a.prefecture, city: a.city });
  });
  return out;
}

/** 取り込み用に整形済みの一覧CSV(列: name,prefecture,city,address,url,active,shop,service_area,customer_no)を読む */
function parseFranchiseClean_(text) {
  var rows = parseCsv_(text), head = rows.shift() || [];
  return rows.filter(function (r) { return r.some(function (c) { return c; }); }).map(function (r) {
    var o = {}; head.forEach(function (h, i) { o[h.trim()] = (r[i] || '').trim(); }); return o;
  });
}

/** CSVの種類を判定して 加盟店のレコード配列を返す */
function parseFranchiseAny_(text) {
  var first = String(text).replace(/^﻿/, '').split(/\r?\n/)[0].replace(/\s/g, '');
  if (/^(会社名,|顧客番号,)/.test(first)) return { rows: parseFranchiseRaw_(text), kind: 'raw' };
  if (/^name,/.test(first)) return { rows: parseFranchiseClean_(text), kind: 'clean' };
  throw new Error('CSVの1行目は「会社名,住所」または「顧客番号,会社名,住所」にしてください。');
}

/** 加盟店一覧シートへ取り込む。名称+住所が同じ行は更新(URL・有効/停止は維持)、無ければ追加。戻り値: 追加・更新件数と、都道府県/市区町村を判定できなかった名称 */
function importFranchiseRows_(sh, recs) {
  var last = sh.getLastRow(), cur = last > 1 ? sh.getRange(2, 1, last - 1, 9).getDisplayValues() : [], index = {};
  cur.forEach(function (r, i) { index[r[0] + '|' + r[3]] = i; });
  var added = 0, updated = 0, unresolved = [];
  recs.forEach(function (r) {
    if (!r.name) return;
    if (!r.prefecture || !r.city) { unresolved.push(r.name); return; }
    var key = r.name + '|' + r.address, row = [r.name, r.prefecture, r.city, r.address, r.url || '', (r.active === '0' || r.active === '×') ? '×' : '', r.shop || '', r.service_area || '', r.customer_no || ''];
    if (index[key] !== undefined) {
      var old = cur[index[key]]; row[4] = row[4] || old[4]; row[5] = old[5];
      cur[index[key]] = row; updated++;
    } else { index[key] = cur.length; cur.push(row); added++; }
  });
  if (cur.length) sh.getRange(2, 1, cur.length, 9).setValues(cur);
  return { added: added, updated: updated, unresolved: unresolved };
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
  var width = 720, height = 250;
  if (compact) { width = 340; height = 240; }
  var n = items.length, top = 40, bottom = 50, side = compact ? 8 : 20;
  var mx = Math.max.apply(null, items.map(function (r) { return r.tsubo_price_man || 0; })) || 1;
  var cw = (width - 2 * side) / n, bw = Math.min(96, cw * (compact ? 0.7 : 0.62)), ph = height - top - bottom, out = [];
  items.forEach(function (r, i) {
    var x = side + i * cw + (cw - bw) / 2, v = r.tsubo_price_man || 0, bh = ph * v / mx, hi = r.highlight;
    var fill = hi ? 'var(--c-accent)' : 'var(--c-teal-400)', cxm = x + bw / 2, wt = hi ? 700 : 500;
    var label = compact ? r.city.replace(/市$/, '') + '市' : r.city;
    out.push('<rect x="' + f1_(x) + '" y="' + f1_(top + ph - bh) + '" width="' + f1_(bw) + '" height="' + f1_(bh) + '" rx="4" fill="' + fill + '"/>' +
      '<text x="' + f1_(cxm) + '" y="' + f1_(top + ph - bh - 8) + '" text-anchor="middle" class="ch-val" font-weight="' + wt + '">' + num_(v) + (compact ? '' : '<tspan class="ch-unit">万円/坪</tspan>') + '</text>' +
      '<text x="' + f1_(cxm) + '" y="' + (top + ph + 26) + '" text-anchor="middle" class="ch-lab" font-weight="' + wt + '" style="font-size:' + (compact ? 13 : 15) + 'px">' + esc_(label) + '</text>');
  });
  out.push('<line x1="' + side + '" x2="' + (width - side) + '" y1="' + (top + ph) + '" y2="' + (top + ph) + '" stroke="var(--c-line)" stroke-width="1.5"/>');
  return '<svg class="chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="坪単価(万円/坪)の比較">' + out.join('') + '</svg>';
}

function trendLinesSvg_(series, compact) {
  var labels = series.labels || [];
  var lines = Object.keys(series).filter(function (k) { return k !== 'labels' && Array.isArray(series[k]) && series[k].length === labels.length && labels.length; })
    .map(function (k) { return [k, series[k]]; });
  if (!lines.length) return null;
  var width = 760, height = 230, left = 56, right = 120, top = 24, bottom = 40;
  if (compact) { width = 340; height = 300; left = 44; right = 112; }
  right += 40;
  var unit = series.unit || '';
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
  var ends = [];
  lines.forEach(function (l) {
    var k = l[0], v = l[1], pts = [];
    v.forEach(function (x, i) { if (x != null) pts.push(f1_(X(i)) + ',' + f1_(Y(x))); });
    var c = cols[k] || 'var(--c-teal-400)', last = null;
    for (var j = v.length - 1; j >= 0; j--) if (v[j] != null) { last = j; break; }
    out.push('<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + c + '" stroke-width="3" stroke-linejoin="round"/>');
    if (last !== null) ends.push({ k: k, c: c, x: X(last) + 8, y: Y(v[last]), val: num_(v[last], Math.abs(v[last]) < 100 && v[last] % 1 ? 1 : 0) + unit });
  });
  // 線の右端の名前と値は、重ならないよう上下に離して置く
  ends.sort(function (p, q) { return p.y - q.y; });
  var gap = Math.min(46, (ph + 30) / Math.max(ends.length, 1)), prev = -1e9;
  ends.forEach(function (e) { e.ly = Math.max(e.y, prev + gap); prev = e.ly; });
  var over = ends.length ? ends[ends.length - 1].ly - (top + ph + 6) : 0;
  if (over > 0) ends.forEach(function (e) { e.ly -= over; });
  ends.forEach(function (e) {
    out.push('<text x="' + f1_(e.x) + '" y="' + f1_(e.ly + 2) + '" class="ch-lab" font-weight="700" fill="' + e.c + '">' + esc_(e.k) + '</text><text x="' + f1_(e.x) + '" y="' + f1_(e.ly + 22) + '" class="ch-val" fill="' + e.c + '">' + e.val + '</text>');
  });
  if (unit) out.push('<text x="' + left + '" y="12" class="ch-sub">単位: ' + esc_(unit) + '</text>');
  return '<svg class="chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="直近3年間の価格推移(万円)">' + out.join('') + '</svg>';
}

/** 価格推移が棒グラフのとき: 時点ごとに系列を並べた棒。値を棒の上に表示 */
function trendBarsSvg_(series, compact) {
  var labels = series.labels || [], unit = series.unit || '';
  var lines = Object.keys(series).filter(function (k) { return Array.isArray(series[k]) && series[k].length === labels.length && labels.length; }).map(function (k) { return [k, series[k]]; });
  if (!lines.length) return null;
  var width = compact ? 340 : 760, height = compact ? 320 : 360, left = 8, top = 28, bottom = 70, ph = height - top - bottom;
  var all = [0]; lines.forEach(function (l) { l[1].forEach(function (x) { if (x != null) all.push(x); }); });
  var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), span = (hi - lo) || 1;
  var gw = (width - 2 * left) / labels.length, bw = Math.min(46, gw * 0.8 / lines.length);
  var cols = ['var(--c-accent)', 'var(--c-teal-600)', 'var(--c-slate)', 'var(--c-teal-400)'];
  function Y(v) { return top + ph * (1 - (v - lo) / span); }
  var out = ['<line x1="' + left + '" x2="' + (width - left) + '" y1="' + f1_(Y(0)) + '" y2="' + f1_(Y(0)) + '" stroke="var(--c-line)" stroke-width="1.5"/>'];
  labels.forEach(function (lab, i) {
    var gx = left + i * gw + (gw - bw * lines.length) / 2;
    lines.forEach(function (l, j) {
      var v = l[1][i]; if (v == null) return;
      var y0 = Y(0), y1 = Y(v), x = gx + j * bw, yy = Math.min(y0, y1), h = Math.abs(y0 - y1);
      out.push('<rect x="' + f1_(x) + '" y="' + f1_(yy) + '" width="' + f1_(bw - 3) + '" height="' + f1_(Math.max(h, 1)) + '" rx="3" fill="' + cols[j % cols.length] + '"/>' +
        '<text x="' + f1_(x + (bw - 3) / 2) + '" y="' + f1_(v >= 0 ? yy - 6 : yy + h + 16) + '" text-anchor="middle" class="ch-val" style="font-size:' + (compact ? 11 : 14) + 'px">' + num_(v, Math.abs(v) < 100 && v % 1 ? 1 : 0) + '</text>');
    });
    out.push('<text x="' + f1_(left + i * gw + gw / 2) + '" y="' + (height - 40) + '" text-anchor="middle" class="ch-sub">' + esc_(lab) + '</text>');
  });
  var lx = left;
  lines.forEach(function (l, j) {
    out.push('<rect x="' + lx + '" y="' + (height - 24) + '" width="14" height="14" rx="3" fill="' + cols[j % cols.length] + '"/><text x="' + (lx + 20) + '" y="' + (height - 12) + '" class="ch-lab">' + esc_(l[0]) + '</text>');
    lx += 40 + String(l[0]).length * 15;
  });
  if (unit) out.push('<text x="' + (width - left) + '" y="14" text-anchor="end" class="ch-sub">単位: ' + esc_(unit) + '</text>');
  return '<svg class="chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="価格推移(棒グラフ)">' + out.join('') + '</svg>';
}
function trendChart_(series, compact) { return series.type === 'bar' ? trendBarsSvg_(series, compact) : trendLinesSvg_(series, compact); }


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
  land: ['tsubo_price_man', 'tsubo_price_low_rise_residential_man', 'tsubo_price_other_residential_man', 'listings', 'price_man', 'price_per_m2_man', 'land_area_median_m2', 'heatmaps', 'heatmap_image', 'table'],
  used_house: ['price_man', 'listings', 'building_area_median_m2', 'land_area_median_m2', 'age_median_years', 'heatmaps', 'heatmap_image', 'table'],
  used_mansion: ['price_man', 'listings', 'exclusive_area_median_m2', 'age_median_years', 'heatmaps', 'heatmap_image', 'table'],
  new_house: ['price_man', 'listings', 'building_area_median_m2', 'land_area_median_m2', 'heatmaps', 'heatmap_image', 'table']
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
    trend_same_threshold_pt: 1.0, compare_city_count: 5,
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
  var frNeighbors = geo ? (geo.neighborCities || geo.neighbors) : [];   // 加盟店の市単位の隣接(区は親の市)

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
      hh = { value: got.value, source: got.source, fetched_at: got.date || now };
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
    sel = selectFranchise_(rows, pref, city, frNeighbors, opts.franchise);
    rep.add('area.franchise', '周辺加盟店', rows.length ? 'auto' : 'missing', '加盟店一覧から選定', rows.length ? '' : '加盟店一覧が空です(入力システムの「加盟店」で追加)');
  }
  model.area.franchise = sel;
  var noHp = sel.items.filter(function (f) { return !f.url; }).map(function (f) { return f.name; });
  rep.add('area.franchise_hp', '周辺加盟店の不動産HP', noHp.length ? 'optional' : 'input', '加盟店一覧のURL',
    noHp.length ? 'HP(URL)が未登録: ' + noHp.join('、') + '。入力システムの「加盟店」で登録するとLPに表示されます' : '');

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
  var trendOn = !(cfg.sections && cfg.sections.price_trend === false);   // 価格推移を表示しない設定にできる
  var trIn = JSON.parse(JSON.stringify(inputs.price_trend || {}));
  var tr = trendView_(city, pref, trIn, opts.trend_same_threshold_pt);
  tr.hidden = !trendOn;
  var s2 = trendOn ? src_(trIn, created, rep, 'price_trend') : ['', '']; tr.source = s2[0]; tr.date = s2[1];
  tr.ai_note = ['※以下の条件でAI査定した参考価格', '・マンション：築10年/専有面積70㎡', '・一戸建て：築10年/延床面積70㎡', '・土地：敷地面積70㎡'];
  model.price_trend = tr;
  if (trendOn) {
    [['city_3y_pct', '市の3年上昇率'], ['prefecture_3y_pct', '県の3年上昇率'], ['yearly_pct', '年ごとの内訳']].forEach(function (p) {
      status_(rep, 'price_trend.' + p[0], p[1], tr[p[0]], '入力システムの価格推移');
    });
    status_(rep, 'price_trend.chart', '価格推移グラフ', tr.series || tr.image, '価格推移グラフの画像');
  } else rep.add('price_trend', '価格推移', 'optional', '', 'LPに表示しない設定');

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
    if (key !== 'land') status_(rep, key + '.heatmap', label + ' 面積×価格の分布', sec.heatmaps || sec.table || sec.heatmap_image, '分布表の画像');
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
    point_listings_rounded: total == null ? null : pointRounded_(total),
    point_text: total == null ? null : pointText_(total),
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

  // --- 地図のピン(商談先の住所・周辺加盟店。住所は Googleマップのジオコーダで位置を求める) ---
  var pinsOn = !(cfg.sections && cfg.sections.pins === false);   // ピンを表示しない設定にできる
  var pins = [], clientAddr = pinsOn ? String(((inputs.client || {}).address) || '').trim() : '';
  function locate_(addr, name, kind, n, expect) {
    if (!services.geocode || !pinsOn) return null;
    var g = null;
    try { g = services.geocode(addr, expect); } catch (e) { g = null; }
    var ok = g && g.lat != null;
    return { kind: kind, n: n, name: name, address: addr, lat: ok ? g.lat : null, lng: ok ? g.lng : null, source: ok ? g.source || '' : '', precise: ok ? g.precise !== false : false,
      on_map: false, why: ok ? '' : (g && g.why) || '住所から位置を特定できませんでした' };
  }
  if (clientAddr) { var cp = locate_(clientAddr, cfg.company || '御社', 'client', 0, { pref: pref, city: city }); if (cp) pins.push(cp); }
  var frNoAddr = [];
  model.area.franchise.items.forEach(function (f, i) {
    f.pin_no = null;
    if (!pinsOn) return;
    if (!f.address) { frNoAddr.push(f.name); return; }
    var fp = locate_(/^(北海道|東京都|大阪府|京都府|.{2,3}県)/.test(f.address) ? f.address : f.prefecture + f.address, f.name, 'fr', i + 1, { pref: f.prefecture, city: f.city });
    if (fp) pins.push(fp);
  });
  // 全ピンが入る範囲で、なるべく拡大した地図(対象市+隣接市)を使う。入らなければ県全体の地図
  var located = pins.filter(function (x) { return x.lat !== null; }), mapSvg = geo ? geo.svg : null, mapProj = geo ? geo.proj : null;
  // 区を選んだときは、県全体では区が小さすぎるので、いつも拡大した地図を使う
  if (geo && geo.zproj && ((geo.isWard && !located.length) || (located.length && located.every(function (x) { return projectPoint_(geo.zproj, x.lat, x.lng); })))) { mapSvg = geo.zsvg; mapProj = geo.zproj; }
  pins.forEach(function (x) {
    if (x.lat === null || !mapProj) return;
    var xy = projectPoint_(mapProj, x.lat, x.lng);
    if (xy) { x.on_map = true; x.x = xy[0]; x.y = xy[1]; } else x.why = '地図の範囲の外です';
  });
  model.area.franchise.items.forEach(function (f, i) { f.pin_no = pins.some(function (x) { return x.kind === 'fr' && x.n === i + 1 && x.on_map; }) ? i + 1 : null; });
  var cpin = pins.filter(function (x) { return x.kind === 'client'; })[0];
  if (!pinsOn) rep.add('area.pins', '地図のピン', 'optional', '', 'LPに表示しない設定');
  else rep.add('area.pin_client', '商談先のピン', cpin ? (cpin.on_map && cpin.precise ? 'auto' : 'optional') : 'optional', cpin ? '商談先の住所 + ' + (cpin.source || '位置検索') : '',
    cpin ? (cpin.on_map ? (cpin.precise ? '' : '住所が大まかなため位置は概算です。番地まで入力してください') : '商談先の住所(' + clientAddr + ')のピンを立てられません: ' + cpin.why) : '商談先の住所が未入力のため、地図に商談先のピンを立てていません(入力すると立ちます)');
  var frFail = pins.filter(function (x) { return x.kind === 'fr' && !x.on_map; }).map(function (x) { return x.name + '(' + x.why + ')'; });
  var frRough = pins.filter(function (x) { return x.kind === 'fr' && x.on_map && !x.precise; }).map(function (x) { return x.name; });
  if (pinsOn && model.area.franchise.items.length) rep.add('area.pin_franchise', '周辺加盟店のピン', frNoAddr.length || frFail.length || frRough.length ? 'optional' : 'auto', '加盟店一覧の住所 + Googleマップ',
    (frNoAddr.length ? '住所が未登録でピンなし: ' + frNoAddr.join('、') + '。' : '') + (frFail.length ? 'ピンを立てられない: ' + frFail.join('、') + '。' : '') + (frRough.length ? '住所が大まかで位置が概算: ' + frRough.join('、') : ''));
  model.area.pins = pins.map(function (x) { return { kind: x.kind, n: x.n, name: x.name, address: x.address, lat: x.lat, lng: x.lng, source: x.source, precise: x.precise, on_map: x.on_map, why: x.why }; });
  model._mapSvg = mapSvg ? addPinsToSvg_(mapSvg, pins.filter(function (x) { return x.on_map; })) : null;
  Object.keys(KEYS_).forEach(function (sec) { KEYS_[sec].forEach(function (k) { if (model[sec][k] === undefined) model[sec][k] = null; }); });
  return { model: model, report: rep };
}

function compare_(cfg, land, city, neighbors, rep, opts) {
  var given = cfg.compare_cities || ((cfg.inputs || {}).land || {}).compare_cities;
  var n = opts.compare_city_count;
  var suggestion = neighbors.filter(function (x) { return /市$/.test(x); }).slice(0, Math.max(0, n - 1));
  var items = (given || []).map(function (r) { var o = Object.assign({}, r); o.highlight = (cityKey_(o.city) === cityKey_(city)); return o; });
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
    rep.add('land.compare', '土地 近隣・県内主要市の坪単価', 'missing', '',
      '比較市の値が未入力。人口データが未接続のため、隣接市(境界の長い順)を候補として提示: ' + suggestion.join('、') + '。入力システムの「比較市」に 市名・坪単価 を入力(5市そろっていなくても可)');
  } else {
    var bad = items.filter(function (r) { return r.tsubo_price_man == null; }).map(function (r) { return r.city; });
    rep.add('land.compare', '土地 近隣・県内主要市の坪単価', bad.length === items.length ? 'missing' : 'input', '設定値', bad.length ? '坪単価が空の市はグラフに出しません: ' + bad.join('、') : '');
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

function mapLegend_(pins) {
  var on = (pins || []).filter(function (x) { return x.on_map; });
  if (!on.length) return '';
  var parts = [];
  if (on.some(function (x) { return x.kind === 'client'; })) parts.push('<span><i class="lg lg-client" aria-hidden="true"></i>御社</span>');
  if (on.some(function (x) { return x.kind === 'fr'; })) parts.push('<span><i class="lg lg-fr" aria-hidden="true"></i>周辺加盟店(番号は右の一覧と同じ)</span>');
  return '<p class="map-legend">' + parts.join('') + '</p>';
}

function houseSection_(id, no, sec, label) {   // no: 表示用の連番(文字列)
  var ok = sec.price_man != null && sec.listings != null;
  var h2 = ok ? esc_(label) + 'の相場は<span class="em">' + num_(sec.price_man) + '万円</span>、物件数は<span class="em">' + num_(sec.listings) + '件</span>' : esc_(label) + 'の価格相場・物件数';
  var s = '<section class="sec' + (Number(no) % 2 === 0 ? ' alt' : '') + '" id="' + id + '"><div class="wrap rv"><p class="sec-no">' + no + '　' + esc_(label) + '</p><h2>' + h2 + '</h2>';
  s += '<div class="grid g2" style="max-width:640px">' + kpi_(sec.price_man, '万円', '売却価格相場') + kpi_(sec.listings, '件', '物件数') + '</div>';
  if (!ok) s += '<div style="margin-top:16px">' + slot_(label + 'の相場・物件数', [label + 'の相場・物件数']) + '</div>';
  s += '<div style="margin-top:28px">';
  if (sec.table) {
    s += '<div class="grid">' + heat_html_(tableToHeat_(sec.table), sec.table.caption || '面積×価格') + '</div>';
  } else if (sec.heatmap_image) {
    s += '<figure class="fig"><img class="uimg" src="' + esc_(sec.heatmap_image) + '" alt="' + esc_(label) + 'の面積と価格の分布表" loading="lazy"></figure>';
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
  var trendD = tr.series ? trendChart_(tr.series, false) : null, trendC = tr.series ? trendChart_(tr.series, true) : null;
  var items = land.compare.items.filter(function (r) { return r.tsubo_price_man != null; })
    .map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) { return (b.r.highlight ? 1 : 0) - (a.r.highlight ? 1 : 0) || a.i - b.i; }).map(function (x) { return x.r; });   // 選んだ市区町村を一番左に(オレンジ)   // 坪単価が入っている市だけ表示(空欄の行は使わない。5市そろっていなくてよい)
  var landOk = items.length > 0;
  var vols = kw.rows.map(function (r) { return r.monthly_volume; }).filter(function (v) { return v != null; });
  var kwMax = vols.length ? Math.max.apply(null, vols) : 1;
  var kwMissing = kw.rows.some(function (r) { return r.monthly_volume == null || r.cpc_low_yen == null; });
  var trendOn = !tr.hidden;
  var toc = [['top', '表紙']].concat(TOC_.filter(function (x) { return trendOn || x[0] !== 'trend'; }));
  var n = 0, N = function () { n++; return ('0' + n).slice(-2); };
  var alt = function () { return (n + 1) % 2 === 0 ? ' alt' : ''; };   // 次の連番が偶数なら薄いグレーの背景(非表示のセクションがあっても交互になる)
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
    '<img class="king" src="' + assets.king + '" alt="物件王の王様キャラクター">' +
    '<nav class="anchors" aria-label="セクション">' + toc.filter(function (x) { return x[0] !== 'top'; }).map(function (x) { return '<a href="#' + x[0] + '">' + x[1] + '</a>'; }).join('') + '</nav>' +
    (model.cta_url ? '<div><a class="btn" href="' + esc_(model.cta_url) + '">お問い合わせ・資料請求</a></div>' : '') + '</div></header><main>');
  // 01 area
  h.push('<section class="sec' + alt() + '" id="area"><div class="wrap rv"><p class="sec-no">' + N() + '　対象エリア</p><h2>' +
    (a.households != null ? esc_(m.city) + 'を商圏に、<span class="em">' + num_(a.households) + '世帯</span>のエリアを調査しました' : esc_(m.city) + 'を商圏としたエリアを調査しました') +
    '</h2><div class="split"><div>' + (model._mapSvg || slot_('地図', ['行政区域データの取得に失敗'])) + mapLegend_(a.pins) + '</div><div class="grid">' + kpi_(a.households, '世帯', '世帯数', 'flat') +
    (a.households == null ? slot_('世帯数', ['世帯数']) : '') + '<div class="card"><p class="sub">周辺加盟店</p>' +
    (a.franchise.items.length ? '<ul class="fr">' + a.franchise.items.map(function (f) {
      return '<li><b>' + (f.pin_no ? '<span class="pinno">' + f.pin_no + '</span>' : '') + esc_(f.name) + '様</b><span>※' + esc_(f.area) + '</span>' + (f.url ? '<br><span class="note">不動産HP：</span><a href="' + esc_(f.url) + '" rel="noopener noreferrer" target="_blank">' + esc_(f.url) + '</a>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="empty">周辺に加盟店なし</p>') + '</div></div></div>' +
    (a.households != null ? '<p class="src">（' + esc_(a.households_date) + '　' + esc_(a.households_source) + '）</p>' : '') + '</div></section>');
  // 02 income
  h.push('<section class="sec' + alt() + '" id="income"><div class="wrap rv"><p class="sec-no">' + N() + '　年収</p><h2>' + esc_(inc.headline || (m.city + 'の平均世帯年収')) + '</h2>' +
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
  if (trendOn) h.push('<section class="sec' + alt() + '" id="trend"><div class="wrap rv"><p class="sec-no">' + N() + '　価格推移</p><h2>' +
    (c3 != null ? (Math.abs(c3) < 0.005 ? '直近3年間の価格は、ほぼ横ばいです' : '直近3年間で、価格は<span class="em">' + num_(Math.abs(c3), 2) + '%' + (c3 > 0 ? '上昇' : '下落') + '</span>しています') : '直近3年間の価格推移') + '</h2>' +
    (tr.body ? '<p class="lead">' + esc_(tr.body) + '</p>' : slot_('価格推移の説明文', ['市の3年上昇率(空欄可)', '県の3年上昇率', '年ごとの内訳(3年分)'])) +
    '<div class="grid g4" style="margin-bottom:24px">' + kpi_(tr.city_3y_pct, '%', m.city + ' 3年間', 'accent', 2) + kpi_(tr.prefecture_3y_pct, '%', m.prefecture + ' 3年間', 'flat', 2) +
    (tr.yearly_pct ? '<div class="kpi flat" style="grid-column:span 2"><div style="display:flex;gap:24px;flex-wrap:wrap">' + ['初年度', '2年目', '3年目'].map(function (lab, i) {
      return '<div><div class="kpi-num num" style="font-size:1.75rem">' + num_(tr.yearly_pct[i], 2) + '<span class="u">%</span></div><div class="kpi-label" style="display:block">' + lab + '</div></div>';
    }).join('') + '</div></div>' : '') + '</div><div class="card">' +
    (trendD ? '<div class="chart-d">' + trendD + '</div><div class="chart-c">' + trendC + '</div>' :
      tr.image ? '<figure class="fig" style="border:0;padding:0"><img class="uimg" src="' + esc_(tr.image) + '" alt="' + esc_(m.city) + 'の住宅価格推移グラフ"></figure>' :
        slot_('価格推移グラフ', ['価格推移グラフ(画像)'])) +
    '<ul class="notes note" style="margin-top:14px">' + tr.ai_note.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul></div>' + srcline_(tr) + '</div></section>');
  // 04 land
  h.push('<section class="sec' + alt() + '" id="land"><div class="wrap rv"><p class="sec-no">' + N() + '　土地</p><h2>' +
    (land.tsubo_price_man != null ? esc_(m.city) + 'の土地相場は<span class="em">坪' + num_(land.tsubo_price_man) + '万円</span>' + (land.listings != null ? '、物件数は<span class="em">' + num_(land.listings) + '件</span>' : '') : esc_(m.city) + 'の土地価格相場・物件数') +
    '</h2><div class="grid g4">' + kpi_(land.tsubo_price_man, '万円/坪', '坪単価', 'accent') + kpi_(land.tsubo_price_low_rise_residential_man, '万円/坪', '低層住居専用地域相場', 'flat') +
    kpi_(land.tsubo_price_other_residential_man, '万円/坪', 'それ以外の住居専用地域', 'flat') + kpi_(land.listings, '件', '物件数', 'flat') + '</div>' +
    (land.tsubo_note ? '<p class="note" style="margin-top:12px">※「坪単価」は用途地域を問わず全物件を対象とした中央値のため、用途地域別の相場より低くなる場合があります。</p>' : '') +
    ((land.tsubo_price_man == null || land.listings == null) ? '<div style="margin-top:14px">' + slot_('土地の坪単価・物件数', ['土地の坪単価・物件数']) + '</div>' : '') +
    '<div class="card" style="margin-top:24px"><p class="sub">' + esc_(m.city) + 'と近隣・県内主要市の比較（坪単価）</p>' +
    (landOk ? '<div class="chart-d">' + landBarsSvg_(items, false) + '</div><div class="chart-c">' + landBarsSvg_(items, true) + '</div>' :
      slot_('近隣・県内主要市の坪単価', ['比較市(市名,坪単価)'].concat(land.compare.suggested.length ? ['候補(隣接市): ' + land.compare.suggested.join('、')] : []))) + '</div>' + srcline_(land) + '</div></section>');
  h.push(houseSection_('used_house', N(), uh, '中古戸建て'), houseSection_('used_mansion', N(), um, '中古マンション'), houseSection_('new_house', N(), nh, '新築戸建て'));
  // 08 search
  var top0 = kw.rows[0];
  h.push('<section class="sec' + alt() + '" id="search"><div class="wrap rv"><p class="sec-no">' + N() + '　検索ボリューム</p><h2>' +
    (top0 && top0.monthly_volume != null ? '「' + esc_(top0.keyword) + '」は<span class="em">月に約' + num_(top0.monthly_volume) + '回</span>検索されています' : esc_(m.city) + 'の不動産関連キーワードの検索ボリューム') +
    '</h2><div class="card"><table class="kw"><thead><tr><th scope="col">検索キーワード</th><th scope="col">月間平均検索ボリューム</th><th scope="col">予想クリック単価</th></tr></thead><tbody>' +
    kw.rows.map(function (r) {
      return '<tr><td>' + esc_(r.keyword) + '</td><td class="v num">' + (r.monthly_volume != null ? num_(r.monthly_volume) + '<span class="bar" style="width:' + roundHalfUp_(100 * r.monthly_volume / kwMax, 1) + '%" aria-hidden="true"></span>' : '<span class="note">未入力</span>') +
        '</td><td class="num">' + (r.cpc_low_yen != null && r.cpc_high_yen != null ? '￥' + num_(r.cpc_low_yen) + '～￥' + num_(r.cpc_high_yen) : '<span class="note">未入力</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    (kwMissing ? '<div style="margin-top:14px">' + slot_('検索ボリューム・クリック単価', ['月間ボリューム・CPC下限・CPC上限']) + '</div>' : '') +
    '<p class="src">（' + esc_(kw.date) + '　' + esc_(kw.source) + '）</p></div></section>');
  // 09 summary
  h.push('<section class="sec' + alt() + '" id="summary"><div class="wrap rv"><p class="sec-no">' + N() + '　物件総数・売却相場まとめ</p><h2>' +
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
    (t.point_listings_rounded != null ? '<p class="t">商圏で<b class="num">約' + num_(t.point_listings_rounded) + '件</b>の物件情報数を担保できれば、商圏No.1の情報量を担保するHPを作り上げることが実証される</p>' :
      '<div class="slot"><b>未入力: 物件総数</b>4種別の物件数が揃うと自動で表示されます。</div>') + '</div></div></section>');
  // competitors
  h.push('<section class="sec' + alt() + '" id="competitors"><div class="wrap rv comp"><p class="sec-no">' + N() + '　近隣不動産会社のHP</p><h2>近隣不動産会社のHPだと・・・</h2>' +
    (comp.items.length ? '<div class="grid g3">' + comp.items.map(function (c) {
      return '<div class="card"><p class="name">▼' + esc_(c.name) + '（' + esc_(c.area) + '）</p>' + (c.url ? '<p><a href="' + esc_(c.url) + '" rel="noopener noreferrer" target="_blank" style="word-break:break-all;font-size:.875rem">' + esc_(c.url) + '</a></p>' : '') +
        '<p class="cnt">掲載物件数：' + (c.listing_count != null ? '<b class="num">' + num_(c.listing_count) + '</b>件' : '<span class="note">未入力</span>') + '</p></div>';
    }).join('') + '</div>' + (comp.items.length < 3 ? '<div style="margin-top:14px">' + slot_('近隣不動産会社(3社)・掲載物件数', ['近隣不動産会社(名称,所在市,URL,掲載物件数)', '検索語: ' + comp.queries.join(' / ')]) + '</div>' : '') :
      slot_('近隣不動産会社3社', ['近隣不動産会社(名称,所在市,URL,掲載物件数)', '検索語: ' + comp.queries.join(' / ')])) +
    '<p class="note" style="margin-top:20px">※「' + esc_(m.city) + '　不動産・土地・中古」とそれぞれ検索し、その中から、SEO上位のものを選んでおります</p></div></section>');
  h.push('<section class="sec' + alt() + '" id="listings"><div class="wrap rv"><p class="sec-no">' + N() + '　弊社加盟店様の物件情報量</p><h2>弊社加盟店様の物件情報量</h2><figure class="fig"><img src="' + assets.listings + '" alt="加盟店様のホームページの物件掲載例" loading="lazy"></figure></div></section>');
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

var SHEET_COMPANY_ = '会社', SHEET_AREA_ = 'エリア', SHEET_FR_ = '加盟店一覧', SHEET_SETTINGS_ = '設定';
var BRACKET_LABELS_ = ['300万未満', '300万〜500万未満', '500万〜700万未満', '700万〜1000万未満', '1000万以上'];

/**
 * 入力項目の定義。t: text|num|date|list|image。req: 必須(未入力なら状態に出る)。hidden: 自動記録(画面に出さない)
 * 出典は固定、取得日は「その区分を最後に入力した日」が自動で入る(auto.date.*)。
 */
var FIXED_SOURCES_ = {
  area: '総務省統計局 令和2年国勢調査', income: 'LIFULL HOME\'S調べ', price_trend: 'LIFULL HOME\'S調べ',
  listings: 'REINS・SUUMO調べ', keywords: 'Google広告調べ'
};
var FIELDS_ = [
  { h: 'エリア' },
  { k: 'prefecture', l: '都道府県', req: 1, d: '例: 長野県' },
  { k: 'city', l: '市区町村', req: 1, d: '例: 上田市(2021年1月時点の名称)' },
  { k: 'created', l: '作成日', t: 'date', d: '空欄なら、この商談先を追加した日' },
  { k: 'show.pins', l: 'LPの地図にピンを表示する', t: 'bool', d: 'チェックを外すと、地図に御社・周辺加盟店のピンを立てません' },
  { k: 'inputs.client.address', grp: 'pins', l: '商談先の住所', d: '地図にピンを立てます。例: 長野県上田市中央1-1-1(空欄ならピンなし)' },
  { h: '対象エリア(出典: 総務省統計局 令和2年国勢調査)' },
  { k: 'inputs.area.households', l: '世帯数', t: 'num', d: '空欄なら、国勢調査(e-Stat)から自動で取得します(設定にe-StatのアプリケーションIDが必要)。入力した場合はその値を使います' },
  { h: '年収(出典: LIFULL HOME\'S調べ)' },
  { k: 'inputs.income.city_avg_man', l: '市の平均世帯年収(万円)', t: 'num', req: 1 },
  { k: 'inputs.income.prefecture_avg_man', l: '県の平均世帯年収(万円)', t: 'num', req: 1 },
  { k: 'inputs.income.national_avg_man', l: '全国の平均世帯年収(万円)', t: 'num', req: 1 },
  { k: 'inputs.income.rank_in_prefecture', l: '県内順位(位)', t: 'num', req: 1 },
  { k: 'bracket_sh.0', l: '世帯数の構成比(%): 300万未満', t: 'pct1', req: 1, d: '小数点第1位まで(例: 38.9)。5区分の合計が100%になるように' },
  { k: 'bracket_sh.1', l: '世帯数の構成比(%): 300万〜500万未満', t: 'pct1', req: 1 },
  { k: 'bracket_sh.2', l: '世帯数の構成比(%): 500万〜700万未満', t: 'pct1', req: 1 },
  { k: 'bracket_sh.3', l: '世帯数の構成比(%): 700万〜1000万未満', t: 'pct1', req: 1 },
  { k: 'bracket_sh.4', l: '世帯数の構成比(%): 1000万以上', t: 'pct1', req: 1 },
  { h: '価格推移(出典: LIFULL HOME\'S調べ)' },
  { k: 'show.price_trend', l: 'LPに価格推移を表示する', t: 'bool', d: 'チェックを外すと、LPの価格推移の部分を表示しません(下の項目は入力不要になります)' },
  { k: 'inputs.price_trend.city_3y_pct', grp: 'trend', l: '市の3年上昇率(%)', t: 'num', d: '空欄なら内訳の合計' },
  { k: 'inputs.price_trend.prefecture_3y_pct', grp: 'trend', l: '県の3年上昇率(%)', t: 'num', req: 1 },
  { k: 'yearly.0', grp: 'trend', l: '内訳: 初年度(%)', t: 'num', req: 1 },
  { k: 'yearly.1', grp: 'trend', l: '内訳: 2年目(%)', t: 'num', req: 1 },
  { k: 'yearly.2', grp: 'trend', l: '内訳: 3年目(%)', t: 'num', req: 1 },
  { k: 'inputs.price_trend.image', grp: 'trend', l: '価格推移グラフ(画像)', t: 'image', req: 1, d: 'グラフのスクリーンショットなどの画像' },
  { h: '土地(出典: REINS・SUUMO調べ)' },
  { k: 'inputs.land.tsubo_price_man', l: '坪単価(万円/坪)', t: 'num', req: 1 },
  { k: 'inputs.land.tsubo_price_low_rise_residential_man', l: '低層住居専用地域の相場(万円/坪)', t: 'num', req: 1 },
  { k: 'inputs.land.tsubo_price_other_residential_man', l: 'それ以外の住居専用地域(万円/坪)', t: 'num', req: 1 },
  { k: 'inputs.land.listings', l: '土地の物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.land.price_man', l: '土地の売却価格相場(万円)', t: 'num', req: 1, d: 'まとめ(P10)に表示' },
  { k: 'inputs.land.price_per_m2_man', l: '土地の平米単価(万円/㎡)', t: 'num', req: 1 },
  { k: 'inputs.land.land_area_median_m2', l: '土地面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'compare.0', l: '比較市1', t: 'list', d: '対象市と比べる市(最大5市まで。空欄の行は使いません)。対象市の値は上の坪単価が使われます。市名と坪単価を入力' },
  { k: 'compare.1', l: '比較市2', t: 'list' },
  { k: 'compare.2', l: '比較市3', t: 'list' },
  { k: 'compare.3', l: '比較市4', t: 'list' },
  { k: 'compare.4', l: '比較市5', t: 'list' },
  { h: '中古戸建て(出典: REINS・SUUMO調べ)' },
  { k: 'inputs.used_house.price_man', l: '売却価格相場(万円)', t: 'num', req: 1 },
  { k: 'inputs.used_house.listings', l: '物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.used_house.building_area_median_m2', l: '建物面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.used_house.land_area_median_m2', l: '土地面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.used_house.age_median_years', l: '築年数の中央値(年)', t: 'num', req: 1 },
  { k: 'inputs.used_house.heatmap_image', l: '面積×価格の分布表(画像)', t: 'image', req: 1 },
  { h: '中古マンション(出典: REINS・SUUMO調べ)' },
  { k: 'inputs.used_mansion.price_man', l: '売却価格相場(万円)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.listings', l: '物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.exclusive_area_median_m2', l: '専有面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.age_median_years', l: '築年数の中央値(年)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.heatmap_image', l: '面積×価格の分布表(画像)', t: 'image', req: 1 },
  { h: '新築戸建て(出典: REINS・SUUMO調べ)' },
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
  { k: 'company', l: '(会社名)', hidden: 1 },
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
  var cfg = { inputs: {} }, sh = [], yearly = [], series = {}, compare = [], comp = [], kw = [];
  FIELDS_.forEach(function (f) {
    if (f.h) return;
    var raw = vals[f.k];
    if (raw === undefined || String(raw).trim() === '') return;
    var k = f.k, v;
    if (f.t === 'image') v = String(raw).trim(); else if (f.t === 'bool') v = String(raw).trim() !== '0'; else if (f.t === 'num' || f.t === 'pct1') v = parseNum_(raw); else if (f.t === 'date') v = parseDate_(raw); else if (f.t === 'list') v = splitList_(raw); else v = String(raw).trim();
    if (v === undefined) return;
    var m;
    if ((m = k.match(/^bracket_sh\.(\d)$/))) sh[+m[1]] = v;
    else if ((m = k.match(/^yearly\.(\d)$/))) yearly[+m[1]] = v;
    else if ((m = k.match(/^series\.(.+)$/))) series[m[1]] = m[1] === 'labels' ? v : v.map(parseNum_);
    else if ((m = k.match(/^compare\.(\d)$/))) { if (v[0]) compare.push({ city: v[0], tsubo_price_man: parseNum_(v[1]), listings: parseNum_(v[2]) }); }
    else if ((m = k.match(/^comp\.(\d)$/))) { if (v[0]) comp.push({ name: v[0], area: v[1] || undefined, url: v[2] || undefined, listing_count: parseNum_(v[3]) }); }
    else if ((m = k.match(/^kw\.(.+)$/))) kw.push({ term: m[1], monthly_volume: parseNum_(v[0]), cpc_low_yen: parseNum_(v[1]), cpc_high_yen: parseNum_(v[2]) });
    else if (k === 'show.price_trend') { cfg.sections = cfg.sections || {}; cfg.sections.price_trend = v; }
    else if (k === 'show.pins') { cfg.sections = cfg.sections || {}; cfg.sections.pins = v; }
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

/** 加盟店一覧シートの行 → 選定用のレコード(有効なものだけ) */
function franchiseRowsFrom_(values) {
  return values.filter(function (r) { return String(r[0]).trim() && !/^(×|停止|0|無効)$/.test(String(r[5]).trim()); })
    .map(function (r) { return { name: String(r[0]).trim(), prefecture: String(r[1]).trim(), city: String(r[2]).trim(), address: String(r[3]).trim(), url: String(r[4]).trim() }; });
}

/** 入力システム用: 複数項目をカンマで束ねる欄の列見出し */
function colsFor_(key) {
  if (/^compare\./.test(key)) return ['市名', '坪単価(万円/坪)'];
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
    out.push({ k: f.k, l: f.l.replace('{市}', '○○市'), t: f.t || 'text', req: f.req ? 1 : 0, d: f.d || '', cols: colsFor_(f.k), grp: f.grp || '' });
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
  if (f.t === 'bool') return (value === '0' || value === '1') ? '' : '不正な値です';
  if (f.t === 'pct1') { var pv = parseNum_(value); return (pv === undefined || pv < 0 || pv > 100) ? '0〜100の数値(%)で入力してください' : ''; }
  if (f.t === 'num' && parseNum_(value) === undefined) return '数値で入力してください';
  if (f.t === 'date' && parseDate_(value) === undefined) return '日付は 2026-01-19 の形で入力してください';
  if (f.t === 'list' && colsFor_(key)) {
    var parts = splitList_(value);
    var numCols = /^compare\./.test(key) ? [1] : /^comp\./.test(key) ? [3] : [0, 1, 2];
    for (var i = 0; i < numCols.length; i++) {
      var v = parts[numCols[i]];
      if (v !== undefined && v !== '' && parseNum_(v) === undefined) return colsFor_(key)[numCols[i]] + 'は数値で入力してください';
    }
  }
  return '';
}


/**
 * 保存層: スプレッドシートを「データベース」として使う。商談ごとにタブは増やさない。
 *   会社シート   : 会社ID | 会社名 | 作成日
 *   エリアシート : エリアID(=LPのID) | 会社ID | 会社名 | 都道府県 | 市区町村 | 作成日 | 更新日時 | 未入力件数 | データ(JSON)
 * 1社に複数のエリアを持てる。エリアごとにLPのURLが1つ。
 */

function sheetOrThrow_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('「初期設定」が済んでいません。スプレッドシートのメニューから初期設定を実行してください。');
  return sh;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function nowIso_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss"); }

// ---------- 会社 ----------
function listCompanies_() {
  var sh = sheetOrThrow_(SHEET_COMPANY_), out = [];
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getDisplayValues().forEach(function (r, i) {
    if (String(r[0]).trim()) out.push({ row: i + 2, id: String(r[0]).trim(), name: r[1], created: r[2] });
  });
  return out;
}
function companyById_(id) {
  var found = null;
  listCompanies_().forEach(function (c) { if (c.id === id) found = c; });
  return found;
}
function createCompany_(name) {
  name = String(name || '').trim();
  if (!name) throw new Error('会社名を入力してください。');
  if (name.length > 100) throw new Error('会社名が長すぎます。');
  var sh = sheetOrThrow_(SHEET_COMPANY_), id = newId_();
  sh.getRange(Math.max(sh.getLastRow(), 1) + 1, 1, 1, 3).setValues([[id, name, todayIso_()]]);
  return id;
}
function renameCompany_(id, name) {
  name = String(name || '').trim();
  if (!name || name.length > 100) throw new Error('会社名を入力してください(100文字まで)。');
  var c = companyById_(id);
  if (!c) throw new Error('会社が見つかりません。');
  sheetOrThrow_(SHEET_COMPANY_).getRange(c.row, 2).setValue(name);
  var sh = sheetOrThrow_(SHEET_AREA_);
  listAreas_().forEach(function (a) { if (a.companyId === id) sh.getRange(a.row, 3).setValue(name); });
  syncIndex_(rebuildIndex_);
}

// ---------- エリア ----------
function listAreas_() {
  var sh = sheetOrThrow_(SHEET_AREA_), out = [];
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 10).getDisplayValues().forEach(function (r, i) {
    if (String(r[0]).trim()) out.push({ row: i + 2, id: String(r[0]).trim(), companyId: String(r[1]).trim(), company: r[2], pref: r[3], city: r[4], created: r[5], updated: r[6], missing: r[7] === '' ? null : Number(r[7]), createdBy: r[9] });
  });
  return out;
}
function areaById_(id) {
  id = String(id || '').trim();
  if (!/^[A-Za-z0-9]{8,40}$/.test(id)) return null;
  var found = null;
  listAreas_().forEach(function (a) { if (a.id === id) found = a; });
  if (!found) return null;
  var raw = sheetOrThrow_(SHEET_AREA_).getRange(found.row, 9).getValue();
  try { found.values = raw ? JSON.parse(raw) : {}; } catch (e) { found.values = {}; }
  return found;
}
function omitKey_(o, k) { var r = Object.assign({}, o); delete r[k]; return r; }

function createArea_(companyId, pref, city, initialValues) {
  var c = companyById_(companyId);
  if (!c) throw new Error('会社が見つかりません。');
  pref = normalizePrefecture_(pref); city = String(city || '').trim();
  if (!city) throw new Error('市区町村を入力してください。');
  var id = newId_(), values = Object.assign({}, initialValues ? omitKey_(initialValues, '_missing') : {}, { prefecture: pref, city: city, 'auto.created': todayIso_() }), sh = sheetOrThrow_(SHEET_AREA_);
  var json = JSON.stringify(values);
  if (json.length > 45000) throw new Error('入力データが大きすぎます。');
  sh.getRange(Math.max(sh.getLastRow(), 1) + 1, 1, 1, 10).setValues([[id, c.id, c.name, pref, city, todayIso_(), nowIso_(), initialValues && initialValues._missing != null ? initialValues._missing : '', json, currentEmail_()]]);
  syncIndex_(function () { upsertIndexRow_(id); });
  return id;
}
/** 値(JSON)を書き込む。都道府県・市区町村は一覧用の列にも写す。排他制御つき */
function writeAreaValues_(areaId, mutate) {
  return withLock_(function () {
    var a = areaById_(areaId);
    if (!a) throw new Error('エリアが見つかりません。');
    var res = mutate(a.values);
    var json = JSON.stringify(a.values);
    if (json.length > 45000) throw new Error('入力データが大きすぎます。');
    var sh = sheetOrThrow_(SHEET_AREA_);
    sh.getRange(a.row, 4, 1, 2).setValues([[a.values.prefecture || a.pref, a.values.city || a.city]]);
    sh.getRange(a.row, 7).setValue(nowIso_());
    sh.getRange(a.row, 9).setValue(json);
    syncIndex_(function () { upsertIndexRow_(areaId); });
    return res;
  });
}
function setAreaMissing_(areaId, n) {
  var a = areaById_(areaId);
  if (a) { sheetOrThrow_(SHEET_AREA_).getRange(a.row, 8).setValue(n); syncIndex_(function () { upsertIndexRow_(areaId); }); }
}
function trashImage_(ref) {
  var m = String(ref || '').match(/^drive:([A-Za-z0-9_-]+)$/);
  if (m) { try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) { /* 既に無ければ何もしない */ } }
}
function trashAreaImages_(values) {
  FIELDS_.forEach(function (f) { if (f.t === 'image' && values[f.k]) trashImage_(values[f.k]); });
}
function deleteArea_(areaId) {
  withLock_(function () {
    var a = areaById_(areaId);
    if (!a) throw new Error('エリアが見つかりません。');
    trashAreaImages_(a.values);
    sheetOrThrow_(SHEET_AREA_).deleteRow(a.row);
    syncIndex_(function () { removeIndexRow_(areaId); });
  });
}
function deleteCompany_(companyId) {
  withLock_(function () {
    var c = companyById_(companyId);
    if (!c) throw new Error('会社が見つかりません。');
    listAreas_().filter(function (a) { return a.companyId === companyId; }).map(function (a) { return a.id; }).forEach(function (id) {
      var a = areaById_(id);
      if (a) { trashAreaImages_(a.values); sheetOrThrow_(SHEET_AREA_).deleteRow(a.row); }
    });
    sheetOrThrow_(SHEET_COMPANY_).deleteRow(companyById_(companyId).row);
    syncIndex_(rebuildIndex_);
  });
}
function rotateAreaId_(areaId) {
  return withLock_(function () {
    var a = areaById_(areaId);
    if (!a) throw new Error('エリアが見つかりません。');
    var nid = newId_();
    sheetOrThrow_(SHEET_AREA_).getRange(a.row, 1).setValue(nid);
    syncIndex_(rebuildIndex_);
    return nid;
  });
}


// ---------- 商談先一覧シート(自動で記載・更新される見やすい一覧) ----------
var SHEET_INDEX_ = '商談先一覧';
var INDEX_HEAD_ = ['会社名', '都道府県', '市区町村', 'LPのURL', '状態', '作成日', '更新日時', '作成者', 'エリアID'];

/** 一覧の更新で失敗しても、本体の保存・作成は止めない */
function syncIndex_(fn) { try { fn(); } catch (e) { console.error('商談先一覧の更新に失敗: ' + (e && e.message || e)); } }

function indexSheet_() {
  var ss = ss_(), sh = ss.getSheetByName(SHEET_INDEX_);
  if (!sh) {
    sh = ss.insertSheet(SHEET_INDEX_);
    sh.getRange(1, 1, 1, INDEX_HEAD_.length).setValues([INDEX_HEAD_]).setFontWeight('bold').setBackground('#E0F2F4');
    sh.setFrozenRows(1);
    [220, 90, 120, 480, 100, 100, 160, 200, 150].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    sh.getRange('A1').setNote('入力システムで会社・エリアを作ると、自動でここに記載されます(状態・更新日時も自動で更新)。直接編集しても反映されません。');
    rebuildIndex_();
  }
  return sh;
}
function statusLabel_(a) { return a.missing === null ? '入力中' : a.missing === 0 ? '入力完了' : '未入力 ' + a.missing + '件'; }
function indexRowFor_(a, st) {
  var base = st.url || st.urlAuto;
  return [a.company, a.pref, a.city, base ? base + '?id=' + a.id : '', statusLabel_(a), a.created, a.updated.replace('T', ' '), a.createdBy || '', a.id];
}
function rebuildIndex_() {
  var sh = indexSheet_(), st = readSettings_(), areas = listAreas_().sort(function (x, y) { return x.company === y.company ? (x.created < y.created ? -1 : 1) : (x.company < y.company ? -1 : 1); });
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, INDEX_HEAD_.length).clearContent();
  if (areas.length) sh.getRange(2, 1, areas.length, INDEX_HEAD_.length).setValues(areas.map(function (a) { return indexRowFor_(a, st); }));
}
function indexRowOf_(sh, areaId) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, INDEX_HEAD_.length, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === areaId) return i + 2;
  return -1;
}
function upsertIndexRow_(areaId) {
  var sh = indexSheet_(), a = null;
  listAreas_().forEach(function (x) { if (x.id === areaId) a = x; });
  if (!a) return;
  var row = indexRowOf_(sh, areaId), vals = indexRowFor_(a, readSettings_());
  if (row < 0) row = Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(row, 1, 1, INDEX_HEAD_.length).setValues([vals]);
}
function removeIndexRow_(areaId) {
  var sh = indexSheet_(), row = indexRowOf_(sh, areaId);
  if (row > 0) sh.deleteRow(row);
}

// ---------- 会社の複製 ----------
function copyImage_(ref, name) {
  var m = String(ref || '').match(/^drive:([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try { return 'drive:' + DriveApp.getFileById(m[1]).makeCopy(name, imageFolder_()).getId(); } catch (e) { return null; }
}

/** 会社を、エリア(入力内容・画像つき)ごと複製する。複製後は別の会社として、独立に編集できる */
function duplicateCompany_(companyId, newName) {
  var src = companyById_(companyId);
  if (!src) throw new Error('複製元の会社が見つかりません。');
  newName = String(newName || '').trim() || (src.name + '（コピー）');
  var areas = listAreas_().filter(function (a) { return a.companyId === companyId; });
  var newId = createCompany_(newName), ids = [];
  areas.forEach(function (a) {
    var full = areaById_(a.id), values = JSON.parse(JSON.stringify(full.values));
    FIELDS_.forEach(function (f) {
      if (f.t === 'image' && values[f.k]) { var c = copyImage_(values[f.k], a.id + '_copy_' + f.k.replace(/[^A-Za-z0-9_]/g, '_')); if (c) values[f.k] = c; else delete values[f.k]; }
    });
    values._missing = a.missing;
    ids.push(createArea_(newId, full.values.prefecture || a.pref, full.values.city || a.city, values));
  });
  return { companyId: newId, areaIds: ids };
}


/** 分布表の画像 → AI(Claude API)で読み取り → 内容そのままの表に作り直す */

var AI_MODEL_ = 'claude-opus-5-5';
var TREND_KEY_ = 'inputs.price_trend.image';
var TABLE_KEYS_ = [TREND_KEY_, 'inputs.used_house.heatmap_image', 'inputs.used_mansion.heatmap_image', 'inputs.new_house.heatmap_image'];
function isTableKey_(key) { return TABLE_KEYS_.indexOf(key) >= 0; }
function tableValueKey_(key) { return 'tbl.' + key; }

function aiKey_() { return String(PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY') || '').trim(); }

/** 表データの検証と整形(純粋関数)。不正ならエラーを投げる */
function normalizeTable_(t, allowNeg) {
  if (!t || typeof t !== 'object') throw new Error('表のデータがありません。');
  var cols = (t.cols || []).map(function (x) { return String(x === null || x === undefined ? '' : x).trim().slice(0, 30); });
  var rows = (t.rows || []).map(function (x) { return String(x === null || x === undefined ? '' : x).trim().slice(0, 30); });
  if (!cols.length || !rows.length) throw new Error('表の列と行が空です。');
  if (cols.length > 60 || rows.length > 40) throw new Error('表が大きすぎます(60列・40行まで)。');
  var cells = rows.map(function (r, i) {
    var line = (t.cells && t.cells[i]) || [];
    return cols.map(function (c, j) {
      var v = line[j];
      if (v === null || v === undefined || String(v).trim() === '') return null;
      var n = parseNum_(v);
      if (n === undefined || (n < 0 && !allowNeg)) throw new Error('表の数値が正しくありません(' + (i + 1) + '行目・' + (j + 1) + '列目)。');
      return n;
    });
  });
  var out = { caption: String(t.caption || '').trim().slice(0, 60), cols: cols, rows: rows, cells: cells };
  if (allowNeg) { out.type = t.type === 'bar' ? 'bar' : 'line'; out.unit = String(t.unit || '').trim().slice(0, 10); }   // 価格推移グラフ: 折れ線/棒と単位
  return out;
}

/** 表 → 描画用(heat_html_ の入力) */
function tableToHeat_(t) {
  var max = 0;
  t.cells.forEach(function (r) { r.forEach(function (v) { if (v > max) max = v; }); });
  return { cols: t.cols, rows: t.rows, grid: t.cells.map(function (r) { return r.map(function (v) { return v || 0; }); }), max: max || 1 };
}
function tableTotal_(t) { var s = 0; t.cells.forEach(function (r) { r.forEach(function (v) { s += v || 0; }); }); return s; }

var TREND_PROMPT_ = [
  'この画像は、不動産の価格推移の折れ線グラフです。グラフの内容を読み取って表にしてください。',
  '- cols に横軸の時点ラベル(年月など)を左から順に、rows に線(系列)の名前(凡例や線の脇の表記。マンション・戸建て・土地など)を書きます。',
  '- cells は、各系列の各時点の値です。グラフに数値が書かれていればその値を、無ければ縦軸の目盛りから読み取った値にします。',
  '- 線が途切れていて値が読めない時点は null にします。読み取りが概算になる場合は、warnings に日本語で書いてください。',
  '- グラフが折れ線なら type は "line"、棒グラフなら "bar" にします。縦軸の単位(万円、%、指数など)が分かれば unit に書きます(不明なら空文字)。',
  '- 縦軸の指数の基準などの補足が画像にあれば caption に書き写します(無ければ空文字)。',
  '次のJSONだけを返してください(説明文やコードブロックは付けない)。',
  '{"type":"line","unit":"","caption":"","cols":["時点",...],"rows":["系列名",...],"cells":[[数値またはnull,...],...],"warnings":["..."]}',
  'cells は rows と同じ行数、cols と同じ列数にしてください。'
].join('\n');

var TABLE_PROMPT_ = [
  'この画像は、不動産の「面積×価格」の分布表(ヒートマップ)です。表の内容を、一切変えずに正確に読み取ってください。',
  '- 行見出し(面積の区分など)、列見出し(価格の区分など)、各セルの数値を、画像に書かれているとおり書き写します。',
  '- 色の濃さではなく、セルに書かれている数字を読み取ります。数字が書かれていない空欄のセルは null にします。',
  '- 読み取れない・自信がない数値は推測せず null にし、warnings にその位置を日本語で書きます。',
  '- caption には、表のタイトルや単位の説明が画像にあれば書き写します(無ければ空文字)。',
  '次のJSONだけを返してください(説明文やコードブロックは付けない)。',
  '{"caption":"","cols":["列見出し",...],"rows":["行見出し",...],"cells":[[数値またはnull,...],...],"warnings":["..."]}',
  'cells は rows と同じ行数、cols と同じ列数にしてください。'
].join('\n');

function extractJson_(text) {
  var a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('AIの返答から表を読み取れませんでした。');
  return JSON.parse(text.slice(a, b + 1));
}

/** Claude API で画像を読み取る。fetch は UrlFetchApp.fetch 互換(テスト用に差し替え可) */
function aiReadTable_(base64, mediaType, key, fetch, kind) {
  if (!key) throw new Error('AIのAPIキーが未設定です。「設定」で入力してください。');
  var body = {
    model: AI_MODEL_, max_tokens: 8000, output_config: { effort: 'low' },
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      { type: 'text', text: kind === 'trend' ? TREND_PROMPT_ : TABLE_PROMPT_ }] }]
  };
  var res = fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, payload: JSON.stringify(body)
  });
  var code = res.getResponseCode(), txt = res.getContentText();
  if (code === 401 || code === 403) throw new Error('AIのAPIキーが正しくないか、権限がありません(' + code + ')。');
  if (code === 429) throw new Error('AIの利用制限に達しました。少し待ってからやり直してください。');
  if (code !== 200) { var m = ''; try { m = JSON.parse(txt).error.message; } catch (e) { m = txt.slice(0, 200); } throw new Error('AIの呼び出しに失敗しました(' + code + '): ' + m); }
  var r = JSON.parse(txt);
  if (r.stop_reason === 'refusal') throw new Error('AIがこの画像の読み取りを行えませんでした。手入力してください。');
  if (r.stop_reason === 'max_tokens') throw new Error('表が大きすぎて読み取りきれませんでした。');
  var text = (r.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  var raw = extractJson_(text);
  var t = normalizeTable_(raw, kind === 'trend');
  t.warnings = (raw.warnings || []).map(String).slice(0, 10);
  return t;
}

function savedTable_(values, key) {
  var s = values[tableValueKey_(key)];
  if (!s) return null;
  try { return normalizeTable_(JSON.parse(s), key === TREND_KEY_); } catch (e) { return null; }
}

/** 保存済みの画像をAIで読み取る。save=true なら表として自動保存(貼り付け時)。false は候補を返すだけ */
function api_readTable(areaId, key, save) {
  requireUser_();
  if (!isTableKey_(key)) throw new Error('この項目は表に作り直せません。');
  var a = areaById_(areaId);
  if (!a) throw new Error('エリアが見つかりません。');
  var ref = String(a.values[key] || '').match(/^drive:([A-Za-z0-9_-]+)$/);
  if (!ref) throw new Error('先に画像を登録してください。');
  var blob = DriveApp.getFileById(ref[1]).getBlob();
  var t = aiReadTable_(Utilities.base64Encode(blob.getBytes()), blob.getContentType(), aiKey_(), function (u, o) { return UrlFetchApp.fetch(u, o); }, key === TREND_KEY_ ? 'trend' : 'table');
  t.total = tableTotal_(t);
  if (save) {   // 貼り付けたら自動で表にして保存する(あとから画面で直せる)
    writeAreaValues_(areaId, function (values) {
      if (values[key] !== a.values[key]) throw new Error('画像が差し替えられました。もう一度やり直してください。');
      values[tableValueKey_(key)] = JSON.stringify(t);
      var dk = dateKeyFor_(key); if (dk) values[dk] = todayStr_();
    });
  }
  return t;
}

function api_saveTable(areaId, key, table) {
  requireUser_();
  if (!isTableKey_(key)) throw new Error('この項目は表に作り直せません。');
  var t = normalizeTable_(table, key === TREND_KEY_);
  writeAreaValues_(areaId, function (values) {
    values[tableValueKey_(key)] = JSON.stringify(t);
    var dk = dateKeyFor_(key); if (dk) values[dk] = todayStr_();
  });
  return { ok: true, total: tableTotal_(t) };
}

function api_deleteTable(areaId, key) {
  requireUser_();
  if (!isTableKey_(key)) throw new Error('この項目は表に作り直せません。');
  writeAreaValues_(areaId, function (values) { delete values[tableValueKey_(key)]; });
  return { ok: true };
}

/** 設定画面: APIキーの保存(空なら削除)。キーはスクリプトのプロパティに保存し、画面や共有には出さない */
function api_ai_set(key) {
  requireUser_();
  key = String(key || '').trim();
  var p = PropertiesService.getScriptProperties();
  if (!key) { p.deleteProperty('ANTHROPIC_KEY'); return { set: false }; }
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) throw new Error('APIキーの形式が正しくありません(sk-ant- で始まる文字列)。');
  p.setProperty('ANTHROPIC_KEY', key);
  return { set: true };
}

/** 価格推移の表(行=系列、列=時点) → 描画用の系列データ */
function trendTableToSeries_(t) {
  var s = { labels: t.cols.slice(), type: t.type || 'line', unit: t.unit || '' };
  t.rows.forEach(function (name, i) { if (name) s[name] = t.cells[i].slice(); });
  return s;
}


/** 入力システム(ウェブアプリ上の入力画面)のサーバー側。すべての api_* は、ログイン中のGoogleアカウントのメールアドレスを検証する */

function appPage_() {
  return HtmlService.createHtmlOutput(APP_HTML_).setTitle('エリア調査シート 入力システム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 利用者の確認: Googleアカウントのメールアドレスに「@bukkenking.com」が付いている人だけ使える。
 * 「アクセスできるユーザー: 組織内」で公開した入力システム用デプロイでのみメールアドレスが取得できる
 * (誰でも見られるLP用デプロイでは取得できないため、そちらからは入力システムを操作できない)
 */
function currentEmail_() {
  try { return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) { return ''; }
}
function requireUser_() {
  var e = currentEmail_();
  if (!e) throw new Error('ログイン中のメールアドレスを確認できません。入力システム用のURL(組織内限定でデプロイしたもの)から開いてください。');
  if (e.slice(-('@' + ALLOWED_DOMAIN_).length) !== '@' + ALLOWED_DOMAIN_) throw new Error('このアカウント(' + e + ')では使えません。@' + ALLOWED_DOMAIN_ + ' のアカウントでログインしてください。');
  return e;
}

/** LPのURL。「設定」でLPの公開URLを入れていれば、それを使う。未設定のときは、いま開いているウェブアプリ自身のURLで仮に作る(社内でしか開けない場合がある) */
function lpBase_(settings) { return settings.url || settings.urlAuto || ''; }
function lpUrl_(settings, id) { var b = lpBase_(settings); return b ? b + '?id=' + id : ''; }
function todayStr_() { return todayIso_(); }

function api_whoami() { return { email: requireUser_(), url: readSettings_().url }; }

function statusText_(a) { return a.missing === null ? '入力中' : a.missing === 0 ? '入力完了' : '未入力 ' + a.missing + '件'; }

/** 会社ごとのエリア一覧 */
function api_list() {
  requireUser_();
  var st = readSettings_(), areas = listAreas_();
  var companies = listCompanies_().map(function (c) {
    return { id: c.id, name: c.name, areas: areas.filter(function (a) { return a.companyId === c.id; }).map(function (a) {
      return { id: a.id, pref: a.pref, city: a.city, status: statusText_(a), done: a.missing === 0, url: lpUrl_(st, a.id) };
    }) };
  });
  companies.reverse();
  return { companies: companies, hasUrl: !!lpBase_(st), provisional: !st.url };
}

function api_create_company(name, pref, city) {
  requireUser_();
  normalizePrefecture_(pref);
  if (!String(city || '').trim()) throw new Error('市区町村を入力してください。');
  var cid = createCompany_(name);
  return { companyId: cid, areaId: createArea_(cid, pref, city) };
}
function api_add_area(companyId, pref, city) { requireUser_(); return { areaId: createArea_(companyId, pref, city) }; }
function api_rename_company(id, name) { requireUser_(); renameCompany_(id, name); return { ok: true }; }
function api_delete_area(areaId) { requireUser_(); deleteArea_(areaId); return { ok: true }; }
function api_delete_company(id) { requireUser_(); deleteCompany_(id); return { ok: true }; }
function api_duplicate_company(companyId, newName) { requireUser_(); return duplicateCompany_(companyId, newName); }
function api_rotate(areaId) { requireUser_(); return { id: rotateAreaId_(areaId) }; }

function api_get(areaId) {
  requireUser_();
  var a = areaById_(areaId);
  if (!a) throw new Error('エリアが見つかりません。');
  var c = companyById_(a.companyId), st = readSettings_(), images = {};
  FIELDS_.forEach(function (f) { if (f.t === 'image') images[f.k] = /^drive:/.test(a.values[f.k] || ''); });
  var siblings = listAreas_().filter(function (x) { return x.companyId === a.companyId; }).map(function (x) { return { id: x.id, label: x.pref + ' ' + x.city }; });
  return { id: a.id, company: c ? { id: c.id, name: c.name } : { id: '', name: '' }, fields: fieldsMeta_(), values: a.values, images: images,
    tables: TABLE_KEYS_.reduce(function (o, k) { o[k] = savedTable_(a.values, k); return o; }, {}), aiReady: !!aiKey_(),
    autoHouseholds: a.values['auto.households'] ? Number(a.values['auto.households']) : null, hasEstat: !!st.estat,
    url: lpUrl_(st, a.id), provisional: !st.url, prefectures: PREFECTURES, siblings: siblings };
}

/** changes: { キー: 値 }。検証に通った項目だけ書き込み、エラーは項目ごとに返す。区分ごとの取得日(入力日)を自動で更新 */
function api_save(areaId, changes) {
  requireUser_();
  var errors = {}, saved = 0;
  writeAreaValues_(areaId, function (values) {
    var touched = {};
    Object.keys(changes || {}).forEach(function (k) {
      var v = changes[k] === null || changes[k] === undefined ? '' : String(changes[k]);
      var isImg = isImageKey_(k);
      var err = isImg ? (v.trim() === '' ? '' : '画像はアップロードで登録してください') : validateValue_(k, v);
      if (err) { errors[k] = err; return; }
      if (isImg && values[k]) { trashImage_(values[k]); delete values[tableValueKey_(k)]; }
      if (v.trim() === '') delete values[k]; else values[k] = v.trim();
      var dk = dateKeyFor_(k); if (dk) touched[dk] = 1;
      saved++;
    });
    Object.keys(touched).forEach(function (dk) { values[dk] = todayStr_(); });
  });
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
function api_uploadImage(areaId, key, dataUrl) {
  requireUser_();
  if (!isImageKey_(key)) throw new Error('画像を登録できない項目です。');
  var m = String(dataUrl || '').match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+\/=]+)$/);
  if (!m) throw new Error('JPEGまたはPNGの画像を選んでください。');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('画像が大きすぎます(5MBまで)。');
  var file = imageFolder_().createFile(Utilities.newBlob(bytes, 'image/' + m[1], areaId + '_' + key.replace(/[^A-Za-z0-9_]/g, '_') + (m[1] === 'png' ? '.png' : '.jpg')));
  writeAreaValues_(areaId, function (values) {
    if (values[key]) trashImage_(values[key]);
    delete values[tableValueKey_(key)];
    values[key] = 'drive:' + file.getId();
    var dk = dateKeyFor_(key); if (dk) values[dk] = todayStr_();
  });
  return { ok: true };
}

/** 未入力の項目と整合性チェック(LPを組み立てて判定)。未入力件数は一覧用に保存する */
function api_status(areaId) {
  requireUser_();
  try {
    var r = buildArea_(areaId), miss = r.report.missing();
    setAreaMissing_(areaId, miss.length);
    return {
      missing: miss.map(function (i) { return { key: i.key, label: i.label, reason: i.reason }; }),
      checksNg: r.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name + (c.detail ? '(' + c.detail + ')' : ''); }),
      city: r.model.meta.city, households: r.model.area.households, householdsAuto: r.model.area.households_source && /e-Stat/.test(r.model.area.households_source),
      pins: (r.model.area.pins || []).map(function (p) { return { kind: p.kind, n: p.n, name: p.name, address: p.address, lat: p.lat, lng: p.lng, source: p.source, precise: p.precise, on_map: p.on_map, why: p.why }; }),
      totals: { listings_total: r.model.totals.listings_total, brokerage: r.model.totals.brokerage_unit_display_man }
    };
  } catch (e) {
    return { error: String(e.message || e), missing: [], checksNg: [], totals: {} };
  }
}

// ---------- 加盟店の管理(保存先は 加盟店一覧 シート) ----------
function frSheet_() { return sheetOrThrow_(SHEET_FR_); }
function isActive_(v) { return !/^(×|停止|0|無効)$/.test(String(v).trim()); }

function api_fr_list() {
  requireUser_();
  var sh = frSheet_(), out = [];
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 9).getDisplayValues().forEach(function (r, i) {
    if (String(r[0]).trim()) out.push({ i: i, name: r[0], prefecture: r[1], city: r[2], url: r[4], active: isActive_(r[5]), shop: r[6], area: r[7] });
  });
  return { items: out, prefectures: PREFECTURES };
}

function api_fr_save(idx, rec) {
  requireUser_();
  rec = rec || {};
  var name = String(rec.name || '').trim(), city = String(rec.city || '').trim(), url = String(rec.url || '').trim();
  if (!name || !city) throw new Error('名称と市区町村を入力してください。');
  var pref = normalizePrefecture_(rec.prefecture);
  if (url && !/^https?:\/\//.test(url)) throw new Error('URLは https:// から始めてください。');
  var sh = frSheet_(), isNew = !(Number(idx) >= 0), row = isNew ? Math.max(sh.getLastRow(), 1) + 1 : Number(idx) + 2;
  var address = pref + ' ' + city;
  if (!isNew) { var old = sh.getRange(row, 1, 1, 4).getDisplayValues()[0]; if (old[1] === pref && old[2] === city && old[3]) address = old[3]; }   // 住所は、都道府県・市区町村を変えない限り元のまま
  sh.getRange(row, 1, 1, 6).setValues([[name, pref, city, address, url, rec.active === false ? '×' : '']]);
  return { ok: true };
}

function api_fr_delete(idx) {
  requireUser_();
  var sh = frSheet_(), row = Number(idx) + 2;
  if (!(Number(idx) >= 0) || row > sh.getLastRow()) throw new Error('対象が見つかりません。');
  sh.deleteRow(row);
  return { ok: true };
}

/** 加盟店CSV(会社名,住所 / 顧客番号,会社名,住所)の取り込み。名称+住所が同じものは更新、無ければ追加 */
function api_fr_import(text) {
  requireUser_();
  if (!text || String(text).length > 2000000) throw new Error('CSVが空、または大きすぎます。');
  var p = parseFranchiseAny_(text);
  var res = importFranchiseRows_(frSheet_(), p.rows);
  return { added: res.added, updated: res.updated, unresolved: res.unresolved, total: p.rows.length };
}

// ---------- 設定(保存先は 設定 シート) ----------
function api_settings_get() {
  requireUser_();
  var s = readSettings_();
  return { aiKeySet: !!aiKey_(), estat: s.estat, max: s.max, threshold: s.threshold, url: s.url, email: currentEmail_() };
}

function api_settings_set(v) {
  requireUser_();
  v = v || {};
  var max = parseNum_(v.max), th = parseNum_(v.threshold), url = String(v.url || '').trim();
  if (!(max >= 1 && max <= 10)) throw new Error('周辺加盟店の最大社数は1〜10で入力してください。');
  if (th === undefined || th < 0) throw new Error('「同程度」の範囲は0以上の数で入力してください。');
  if (url && !/^https:\/\/script\.google\.com\/(macros\/s\/[A-Za-z0-9_-]+\/exec|a\/macros\/[^\/]+\/s\/[A-Za-z0-9_-]+\/exec)$/.test(url.replace(/\/+$/, '')))
    throw new Error('LPの公開URLは https://script.google.com/macros/s/…/exec の形で入力してください。');
  var sh = sheetOrThrow_(SHEET_SETTINGS_);
  sh.getRange('B1').setValue(url.replace(/\/+$/, '')); sh.getRange('B2').setValue(String(v.estat || '').trim());
  syncIndex_(rebuildIndex_);   // 商談先一覧のURLも新しい公開URLに更新
  sh.getRange('B3').setValue(String(max)); sh.getRange('B4').setValue(String(th));
  return { ok: true };
}

/** e-Statの接続テスト(設定画面のボタン用)。長野県上田市の世帯数を取得してみて、結果または失敗の理由を返す */
function api_estat_test(appId) {
  requireUser_();
  var id = String(appId || readSettings_().estat || '').trim();
  if (!id) throw new Error('アプリケーションIDを入力してください。');
  try {
    var r = estatHouseholds_(id, '20203');
    return { ok: true, message: '接続できました。上田市の世帯数: ' + num_(r.value) + '(表: ' + r.table + ' / 項目: ' + r.label + ')' };
  } catch (e) { return { ok: false, message: String(e.message || e) }; }
}

/** 市区町村の入力候補(都道府県を選んだとき)。政令指定都市は「横浜市」と「横浜市中区」の両方。名前の一覧だけをキャッシュする */
function api_cities(pref) {
  requireUser_();
  var p = normalizePrefecture_(pref), key = 'cities:' + p, hit = cacheGet_(key);
  if (hit) return JSON.parse(hit);
  var P = buildPrefecture_(p, fetchJson_(GEO_URL_.replace('{code}', ('0' + prefCode_(p)).slice(-2))));
  cachePut_(key, JSON.stringify(P.names));
  return P.names;
}


/**
 * エリア調査シート LP(Google スプレッドシート連携版)
 *  - シートが正本。商談先ごとのタブに入力すると、LPのURLを開き直すだけで最新内容が表示される。
 *  - 公開は「ウェブアプリ」。URL は  <ウェブアプリURL>?id=<商談先ID>
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('エリア調査シート')
    .addItem('初期設定(最初に1回)', 'menuSetup')
    .addItem('使い方を表示', 'menuShowHelp')
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

/** e-Stat API(政府統計の総合窓口)から令和2年国勢調査の市区町村別の世帯数を取得する。失敗時は、試した表と理由をメッセージにして投げる */
function estatHouseholds_(appId, areaCode) {
  var base = 'https://api.e-stat.go.jp/rest/3.0/app/json/', log = [];
  function get(path, params) {
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    var r = UrlFetchApp.fetch(base + path + '?' + q, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode());
    var j = JSON.parse(r.getContentText()), root = j[Object.keys(j)[0]] || {}, res = root.RESULT || {};
    if (res.STATUS !== undefined && Number(res.STATUS) !== 0 && Number(res.STATUS) !== 1) throw new Error('e-Stat: ' + (res.ERROR_MSG || ('STATUS ' + res.STATUS)));
    return root;
  }
  function arr(x) { return x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]; }
  function txt(x) { return x && typeof x === 'object' ? String(x.$ || '') : String(x || ''); }
  var tabs;
  try {
    var lst = get('getStatsList', { appId: appId, lang: 'J', statsCode: '00200521', surveyYears: '2020', searchWord: '世帯', limit: 100 });
    tabs = arr((lst.DATALIST_INF || {}).TABLE_INF);
  } catch (e) { throw new Error('表の一覧を取得できません(' + e.message + ')。アプリケーションIDとネットワークを確認してください。'); }
  if (!tabs.length) throw new Error('国勢調査(令和2年)の表が見つかりませんでした。');
  var scored = tabs.map(function (t) {
    var title = txt(t.TITLE) + ' ' + txt(t.STATISTICS_NAME);
    var sc = (/市区町村/.test(title) ? 4 : 0) + (/世帯/.test(title) ? 3 : 0) + (/基本集計|人口等基本集計/.test(title) ? 2 : 0) - (/男女|年齢|配偶|産業|職業|就業|従業|外国|移動|住居|教育|在学/.test(title) ? 3 : 0);
    return { id: t['@id'], title: txt(t.TITLE), sc: sc };
  }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 8);
  for (var i = 0; i < scored.length; i++) {
    var t = scored[i];
    try {
      var d = get('getStatsData', { appId: appId, lang: 'J', statsDataId: t.id, cdArea: areaCode, metaGetFlg: 'Y', limit: 300 });
      var inf = d.STATISTICAL_DATA || {}, names = {};
      arr((inf.CLASS_INF || {}).CLASS_OBJ).forEach(function (o) { arr(o.CLASS).forEach(function (c) { names[o['@id'] + ':' + c['@code']] = String(c['@name'] || ''); }); });
      var best = null;
      arr((inf.DATA_INF || {}).VALUE).forEach(function (v) {
        var cats = Object.keys(v).filter(function (k) { return /^@(cat\d+|tab)$/.test(k); }).map(function (k) { return names[k.slice(1) + ':' + v[k]] || ''; });
        var joined = cats.join(' / ');
        if (!/世帯/.test(joined) || /当たり|人員|割合|率|増減|比/.test(joined)) return;
        if (v['@area'] && v['@area'] !== areaCode) return;
        var n = parseInt(String(v.$).replace(/,/g, ''), 10);
        if (!n) return;
        var score = (/^(一般)?世帯数$|総世帯|世帯総数|^一般世帯$/.test(cats.join(''))) ? 2 : 1;
        if (!best || score > best.score) best = { value: n, score: score, label: joined };
      });
      if (best) return { value: best.value, source: '総務省統計局 令和2年国勢調査(e-Stat)', table: t.id + ' ' + t.title, label: best.label };
      log.push(t.id + '「' + t.title.slice(0, 30) + '」: 世帯数の値なし');
    } catch (e) { log.push(t.id + ': ' + e.message); }
  }
  throw new Error('世帯数を取得できませんでした。試した表: ' + log.join(' / '));
}

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SSID');
  if (id) return SpreadsheetApp.openById(id);
  var a = SpreadsheetApp.getActiveSpreadsheet();
  if (a) PropertiesService.getScriptProperties().setProperty('SSID', a.getId());
  return a;
}

/** 設定シート(保存先)の読み取り。LPの公開URLは設定に入力(入力システムの「設定」で変更)。未設定でもURLが出るよう、動いているウェブアプリ自身のURLを仮に使う */
function readSettings_() {
  var sh = ss_().getSheetByName(SHEET_SETTINGS_), o = { url: '', urlAuto: '', estat: '', max: 3, threshold: 1, opts: {} };
  if (sh) {
    var v = sh.getRange(1, 2, 5, 1).getDisplayValues().map(function (r) { return r[0]; });
    o.url = v[0].trim().replace(/\/+$/, ''); o.estat = v[1].trim();
    var mx = parseNum_(v[2]), th = parseNum_(v[3]);
    if (mx) o.max = mx; if (th !== undefined) o.threshold = th;
  }
  try { o.urlAuto = String(ScriptApp.getService().getUrl() || '').replace(/\/+$/, ''); } catch (e) { o.urlAuto = ''; }   // いま動いているウェブアプリ自身のURL(仮のURL用)
  o.opts.franchise = { max: o.max }; o.opts.trend_same_threshold_pt = o.threshold;
  return o;
}

/** 世帯数の自動取得。取得できたらエリアのデータに保存し、以後はAPIを呼ばない(市区町村が変わったら取り直す)。失敗は10分間だけ覚えて連打を避ける */
function householdsFor_(settings, areaId, code) {
  var a = areaId ? areaById_(areaId) : null;
  if (a && a.values['auto.households'] && a.values['auto.households_code'] === code)
    return { value: Number(a.values['auto.households']), source: '総務省統計局 令和2年国勢調査(e-Stat)', date: a.values['auto.date.households'] };
  var failKey = 'estatfail:' + code, hit = cacheGet_(failKey);
  if (hit) throw new Error(hit);
  try {
    var got = estatHouseholds_(settings.estat, code);
    if (a) writeAreaValues_(areaId, function (v) { v['auto.households'] = String(got.value); v['auto.households_code'] = code; v['auto.date.households'] = todayIso_(); });
    got.date = todayIso_();
    return got;
  } catch (e) { cachePut_(failKey, e.message, 600); throw e; }
}

var ALLOWED_DOMAIN_ = 'bukkenking.com';

/** 住所の表記ゆれをそろえる(郵便番号・空白・ハイフン類)。位置の検索に使う */
function normalizeAddr_(a) {
  a = String(a || '').normalize('NFKC').replace(/〒?\s*\d{3}-?\d{4}/, '').replace(/[‐‑–—−ー－]/g, '-').replace(/\s+/g, '');
  return a;
}
/** 期待する市区町村が text に含まれるか。政令市の区(名古屋市中区)は、市(名古屋市)と区(中区)を別々に確認する */
function addrHasCity_(text, expect) {
  if (!expect || !expect.city) return true;
  var t = String(text), wm = String(expect.city).match(/^(.+市)(.+区)$/);
  return wm ? (t.indexOf(wm[1]) >= 0 && t.indexOf(wm[2]) >= 0) : t.indexOf(expect.city) >= 0;
}

/** 住所 → 位置。まず Googleマップのジオコーダ、だめなら国土地理院の住所検索。
 *  結果の市区町村・都道府県が、期待する市区町村と違うときは採用しない(別の場所にピンが立つのを防ぐ)。
 *  戻り値: { lat, lng, source, precise } または { lat: null, why } */
function geocode_(addr, expect) {
  expect = expect || {};
  var q = normalizeAddr_(addr);
  if (!q) return { lat: null, why: '住所が空です' };
  var key = 'gc2:' + (expect.city || '') + ':' + q.slice(0, 120), hit = cacheGet_(key);
  if (hit) return JSON.parse(hit);
  var why = '', res = null, transient = false;
  try {
    var r = Maps.newGeocoder().setLanguage('ja').setRegion('jp').geocode(q);
    if (r && r.status === 'OK' && r.results && r.results.length) {
      var x = r.results[0], comps = JSON.stringify(x.address_components || []), l = x.geometry.location;
      if (expect.pref && comps.indexOf(expect.pref) < 0) why = '住所の都道府県が一致しません';
      else if (!addrHasCity_(comps, expect)) why = '住所の市区町村が「' + expect.city + '」と一致しません(Googleマップは「' + String(x.formatted_address || '').slice(0, 40) + '」と判断)';
      else res = { lat: l.lat, lng: l.lng, source: 'Googleマップ', precise: x.geometry.location_type !== 'APPROXIMATE' };
    } else if (r && r.status && r.status !== 'ZERO_RESULTS') { transient = true; why = 'Googleマップの位置検索を使えませんでした(' + r.status + ')'; }
    else why = '住所から位置を特定できませんでした';
  } catch (e) { transient = true; why = 'Googleマップの位置検索を使えませんでした'; }
  if (!res) {   // 国土地理院の住所検索(日本の住所に強い)で再確認
    try {
      var g = UrlFetchApp.fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q), { muteHttpExceptions: true });
      var arr = g.getResponseCode() === 200 ? JSON.parse(g.getContentText()) : [];
      for (var i = 0; i < arr.length && !res; i++) {
        var t = String((arr[i].properties || {}).title || ''), c = (arr[i].geometry || {}).coordinates;
        if (c && addrHasCity_(t, expect) && (!expect.pref || t.indexOf(expect.pref) >= 0 || true)) res = { lat: c[1], lng: c[0], source: '国土地理院', precise: true };
      }
      if (res) why = '';
    } catch (e) { /* 次回やり直す */ }
  }
  if (res) { cachePut_(key, JSON.stringify(res)); return res; }
  var fail = { lat: null, why: why || '住所から位置を特定できませんでした' };
  if (!transient) cachePut_(key, JSON.stringify(fail));   // 一時的な失敗(上限超過など)は覚えない
  return fail;
}

function realServices_(settings, areaId) {
  var s = { cacheGet: cacheGet_, cachePut: cachePut_, fetchJson: fetchJson_, now: function () { return new Date().toISOString(); } };
  s.geocode = geocode_;
  if (settings.estat) s.estatHouseholds = function (code) { return householdsFor_(settings, areaId, code); };
  return s;
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

/** エリア(保存データ) → { model, report, html, checks } */
function buildArea_(areaId) {
  var a = areaById_(areaId);
  if (!a) throw new Error('エリアが見つかりません。');
  var c = companyById_(a.companyId), settings = readSettings_(), ss = ss_();
  var vals = Object.assign({}, a.values, { company: c ? c.name : '', prefecture: a.values.prefecture || a.pref, city: a.values.city || a.city });
  var cfg = valuesToConfig_(vals, todayIso_());
  cfg.options = settings.opts;
  TABLE_KEYS_.forEach(function (k) {
    var t = savedTable_(vals, k);
    if (!t) return;
    if (k === TREND_KEY_) { cfg.inputs.price_trend = cfg.inputs.price_trend || {}; if (!cfg.inputs.price_trend.series) cfg.inputs.price_trend.series = trendTableToSeries_(t); }
    else setPath_(cfg, k.replace(/heatmap_image$/, 'table'), t);
  });
  resolveImages_(cfg);
  var frSh = ss.getSheetByName(SHEET_FR_);
  var data = { franchiseRows: frSh && frSh.getLastRow() > 1 ? franchiseRowsFrom_(frSh.getRange(2, 1, frSh.getLastRow() - 1, 6).getDisplayValues()) : [], listingRows: [] };
  var built = buildModel_(cfg, realServices_(settings, a.id), data);
  var html = renderPage_(built.model, built.report, ASSETS, STYLE_CSS_);
  return { model: built.model, report: built.report, html: html, checks: runChecks_(built.model, html) };
}

// ---------- ウェブアプリ ----------
function doGet(e) {
  var page = String((e && e.parameter && e.parameter.page) || '').trim();
  var id = String((e && e.parameter && e.parameter.id) || '').trim();
  if (page === 'app' || (!id && !page)) return appPage_();
  var a = areaById_(id);
  if (!a) return errorPage_('ページが見つかりません。URLをご確認ください。');
  try {
    var r = buildArea_(a.id);
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

var HELP_TEXT_ = '【使い方】\n\n入力・加盟店の管理・設定は、すべて「入力システム」で行います。このシートはデータの保存先です(直接編集しないでください)。\n\n■ デプロイは2つ作ります(拡張機能 → Apps Script → デプロイ → 新しいデプロイ → ウェブアプリ)\n① LP用(お客様に見せる)\n   実行ユーザー: 自分 / アクセスできるユーザー: 全員\n   → 発行されたURL(…/exec)を、入力システムの「設定」の「LPの公開URL」に入れる\n② 入力システム用(社内)\n   実行ユーザー: 自分 / アクセスできるユーザー: ' + ALLOWED_DOMAIN_ + ' 内の全員(組織内)\n   → このURL(…/exec)を開くと入力システムが使える\n   (ログインは、Googleアカウントのメールアドレスが @' + ALLOWED_DOMAIN_ + ' かどうかで判定)';

function menuSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SSID', ss.getId());
  setupSheets_(ss);
  SpreadsheetApp.getUi().alert('初期設定が完了しました。\n\n' + HELP_TEXT_);
}

function menuShowHelp() { SpreadsheetApp.getUi().alert(HELP_TEXT_); }

/** 保存先のシートを用意する(再実行しても入力済みのデータは消さない)。加盟店は初回のみ同梱の一覧を取り込む */
function setupSheets_(ss) {
  var st = ss.getSheetByName(SHEET_SETTINGS_) || ss.insertSheet(SHEET_SETTINGS_);
  var defs = [
    ['LPの公開URL', '', 'お客様に見せるLP用デプロイのURL(…/exec)。入力システムの「設定」で入力'],
    ['e-Stat アプリケーションID', '', '任意。入れると世帯数の自動取得を試みる'],
    ['周辺加盟店の最大社数', 3, ''],
    ['県との差が「同程度」とみなす範囲(ポイント)', 1, ''],
    ['(未使用)', '', 'POINTの件数は上位2桁で自動的に切り上げます(414件→420件、1,898件→1,900件)']];
  defs.forEach(function (d, i) {
    st.getRange(i + 1, 1).setValue(d[0]); st.getRange(i + 1, 3).setValue(d[2]);
    var b = st.getRange(i + 1, 2);
    if (String(b.getValue()).trim() === '') b.setValue(d[1]);   // 既存の入力は消さない
  });
  st.getRange('B1:B5').setNumberFormat('@');
  st.getRange('A7').setValue('※この設定は入力システムの「設定」から変更します。');
  st.setColumnWidth(1, 300); st.setColumnWidth(2, 360); st.setColumnWidth(3, 460);
  var co = ss.getSheetByName(SHEET_COMPANY_) || ss.insertSheet(SHEET_COMPANY_);
  if (co.getLastRow() < 1) { co.getRange(1, 1, 1, 3).setValues([['会社ID', '会社名', '作成日']]).setFontWeight('bold'); co.setFrozenRows(1); co.setColumnWidth(1, 150); co.setColumnWidth(2, 260); }
  var ar = ss.getSheetByName(SHEET_AREA_) || ss.insertSheet(SHEET_AREA_);
  if (ar.getLastRow() < 1) {
    ar.getRange(1, 1, 1, 10).setValues([['エリアID(LPのID)', '会社ID', '会社名', '都道府県', '市区町村', '作成日', '更新日時', '未入力件数', 'データ(入力システムが管理)', '作成者']]).setFontWeight('bold');
    ar.setFrozenRows(1); ar.setColumnWidth(1, 150); ar.setColumnWidth(3, 240); ar.setColumnWidth(9, 300);
    ar.getRange('A1').setNote('このシートは入力システムが管理するデータの保存先です。直接編集しないでください。');
  }
  if (ar.getRange(1, 10).getValue() === '') ar.getRange(1, 10).setValue('作成者').setFontWeight('bold');   // 旧版のシートにも作成者の列を足す
  indexSheet_();   // 商談先一覧(自動で記載・更新される一覧)
  var fr = ss.getSheetByName(SHEET_FR_) || ss.insertSheet(SHEET_FR_);
  if (fr.getLastRow() < 1) {
    fr.getRange(1, 1, 1, 9).setValues([['名称', '都道府県', '市区町村', '住所', 'URL', '有効(×で停止)', '屋号', '対応エリア', '顧客番号']]).setFontWeight('bold');
    fr.setFrozenRows(1); fr.setColumnWidth(1, 260); fr.setColumnWidth(4, 300); fr.setColumnWidth(5, 280);
  }
  if (fr.getLastRow() < 2 && typeof SEED_FRANCHISES_CSV_ !== 'undefined') importFranchiseRows_(fr, parseFranchiseAny_(SEED_FRANCHISES_CSV_).rows);
}


/** 生成物(gas/build.py)。CSS/JS/入力画面のHTML/同梱の加盟店一覧 を文字列定数として保持する */
var SEED_FRANCHISES_CSV_ = "name,prefecture,city,address,url,active,shop,service_area,customer_no\nアイニコグループ株式会社,奈良県,奈良市,奈良県奈良市右京1丁目3-4サンタウンプラザすずらん館 2F,,1,トチナラ,奈良市・生駒市・木津川市（精華町）,\n株式会社 すむくる不動産,石川県,金沢市,石川県金沢市諸江町上丁459−1,,1,すむくる不動産,石川県金沢市,\nwith Be株式会社,兵庫県,三田市,兵庫県三田市西山2丁目28-3ロイヤルスクエアA203,,1,with be,兵庫県三田市,\n株式会社リ・スタイル,山梨県,甲府市,山梨県甲府市向町290番地3,,1,リ・スタイル,山梨県甲府市・甲斐市・中巨摩郡昭和町,\nスヴァーリエヒュース株式会社,山梨県,昭和町,山梨県中巨摩郡昭和町飯喰1558-3,,1,住まいと土地の不動産屋さん,山梨県中央市・南アルプス市・昭和町・甲斐市（旧竜王町）,\nヤマイチ株式会社,富山県,富山市,富山県富山市野口812,,1,ハイズ不動産,富山県富山市・射水市,\nBK不動産株式会社,千葉県,佐倉市,千葉県佐倉市寺崎北2丁目1番5プライムシティ寺崎1F,,1,ここすも佐倉店,千葉県佐倉市・四街道市,\n株式会社ライフ,静岡県,静岡市,静岡県静岡市葵区千代田2-2-40,,1,ライフ不動産,静岡市葵区周辺,\n株式会社いつき家,三重県,松阪市,三重県松阪市大黒田町1799-3,,1,いつき家不動産,三重県松阪市,\n有限会社カントリーガーデン,秋田県,秋田市,秋田県秋田市手形山中町1-38,,1,カントリーガーデン不動産,秋田県秋田市,\n有限会社桃栗柿屋,滋賀県,東近江市,滋賀県東近江市外町1381-3,,1,桃栗柿屋不動産事業部,滋賀県東近江市,\n株式会社大建建設,新潟県,新潟市,新潟県新潟市東区浜谷町1-2-6,,1,ダイケン不動産,新潟市東区・江南区,\nグッドハート株式会社,熊本県,熊本市,熊本市東区江津1丁目16-17,,1,グッドホーム熊本,熊本市南区・東区,\n株式会社宏栄建材店,愛媛県,今治市,愛媛県今治市片山1-2-14,,1,ユイムニ,愛媛県今治市,\n株式会社ベストホーム,岡山県,岡山市,岡山市中区清水1丁目10-12,,1,ベスト不動産,岡山市、瀬戸内市、赤磐市、備前市,\n株式会社ゆい工房,新潟県,新潟市,新潟県新潟市北区白新町2-2-15,,1,ゆい工房,新潟市北区,\n株式会社オリバー,富山県,富山市,富山県富山市二口町4丁目4-4,,1,オリバー不動産,富山県富山市,\n株式会社ハウスマーケット,福岡県,大野城市,福岡県大野城市筒井4-1-12,,1,ハウスマーケット大野城×ORIGIMOND筑紫野,福岡県大野城市・春日市・太宰府市・筑紫野市・鳥栖市・小郡市,\nフォレスト株式会社,兵庫県,姫路市,兵庫県姫路市飾西735-1,,1,フォレスト不動産,兵庫県姫路市,\n株式会社安江工務店,愛知県,名古屋市,名古屋市天白区島田1-1509,,1,r-cove不動産,愛知県名古屋市天白区・緑区・日進市（東郷町）,\n株式会社めぐみ不動産,静岡県,沼津市,静岡県沼津市下香貫樋ノ口1705,,1,めぐみ不動産,静岡県駿東郡長泉町・清水町・裾野市・三島市,\n株式会社リブウェルヤマザキ,大阪府,松原市,大阪府松原市三宅西1-320-1,,1,リブウェル不動産,大阪府松原市・羽曳野市・藤井寺市,\nサンプロ不動産株式会社,長野県,松本市,長野県松本市村井町南4-1-4,,1,サンプロ不動産,長野県松本市,\n株式会社しげのぶ不動産,滋賀県,湖南市,滋賀県湖南市平松北1丁目4番地,,1,しげのぶ不動産,滋賀県湖南市・甲賀市(水口町・甲南町)、（栗東市・草津市）,\nガーデン株式会社,京都府,京都市,京都府京都市北区紫野雲林院町35番地4,,1,garDEN不動産,京都市北区（左京区・上京区）,\n株式会社シンエイ,長野県,下諏訪町,長野県諏訪郡下諏訪町高浜6191-1,,1,シンエイ 不動産部,長野県諏訪郡,\n株式会社鷲見製材,岐阜県,岐阜市,岐阜県岐阜市中鶉3-33-5,,1,ウッディライフ不動産,岐阜県岐阜市南部,\n株式会社東洋ハウジング,千葉県,鎌ケ谷市,千葉県鎌ケ谷市新鎌ヶ谷3-2-9,,1,鎌すま・流すま,千葉県鎌ケ谷市（流山市）,\n株式会社ピースホーム,宮崎県,宮崎市,宮崎県宮崎市江平西1丁目1-21,,1,ぴーす不動産,宮崎県宮崎市,\n株式会社グリーンプランテック,神奈川県,厚木市,神奈川県厚木市旭町1-38-7,,1,スマイエスト,神奈川県厚木市・伊勢原市・秦野市・平塚市,\n株式会社Robin,岐阜県,岐阜市,岐阜県岐阜市金町8-1フロンティア丸杉ビル5階,,1,ロビン不動産_高山店,岐阜県高山市,\n株式会社シーキューブ夢ハウス,大阪府,八尾市,大阪府八尾市旭ケ丘2丁目59-3,,1,すまいの窓口 あべの,大阪市阿倍野区阿倍野元町1-9,\n株式会社ここいえ,兵庫県,たつの市,兵庫県たつの市龍野町富永519-1,,1,たつの本店,兵庫県たつの市、揖保郡太子町、相生市（姫路市）,\n西日本産業株式会社,福岡県,久留米市,福岡県久留米市花畑三丁目3-3,,1,西日本産業,福岡県久留米市,\n株式会社サンクリエーション,和歌山県,和歌山市,和歌山県和歌山市和歌町33,,1,けやき通り不動産,和歌山市、岩出市、海南市,\n有限会社北山建築,三重県,松阪市,三重県松阪市新町940,,1,とちみえ,三重県松阪市・津市,\n株式会社すみたい地所,神奈川県,相模原市,神奈川県相模原市中央区淵野辺3-18-17,,1,すみたい地所,神奈川県相模原市中央区・南区,\nWITHDOM Group株式会社,福岡県,古賀市,福岡県古賀市千鳥1丁目2-7,,1,ウィズ不動産,福岡県古賀市・福津市（宗像市）,\n株式会社すむべ,岩手県,北上市,岩手県北上市新穀町2丁目4-8,,1,すむべ,岩手県北上市,\nタマイM&S株式会社,大分県,大分市,大分県大分市高城西町8-15,,1,玉井不動産,大分県大分市,\nクローバーハウス株式会社,福岡県,福岡市,福岡県福岡市東区和白1-1-25,,1,クローバーハウス,福岡県福岡市東区・糟屋郡新宮町・古賀市東区は一部に絞る,\n株式会社サードコネクト,大分県,中津市,大分県中津市大字加来1661番地1,,1,コネクト不動産,大分県中津市・福岡県築上郡吉富町・築上郡上毛町・豊前市,\n株式会社 建築工房坂本,石川県,金沢市,石川県金沢市下安原町西258-5,,1,じもとち,石川県金沢市一部・白山市,\n株式会社山崎工業,福島県,いわき市,福島県いわき市平上荒川字桜町60,,1,桜まち不動産,福島県いわき市（平・常盤・内郷）,\nリフォームワン株式会社,長野県,上田市,長野県上田市住吉40-13,https://www.one-estate.jp/,1,Oneエステイト,長野県上田市・東御市,\n株式会社ハラケン工舎,広島県,呉市,広島県呉市阿賀南2丁目6番20号,,1,ハラケン不動産,広島県呉市・江田島市・東広島市・安芸郡海田町・熊野町・坂町・府中町,\n株式会社LIFEFUND,静岡県,浜松市,静岡県浜松市中区鴨江3丁目70-23,,1,物件王国,浜松市中央区（旧中区）,\n有限会社ファーストプランテクノ,大阪府,八尾市,大阪府八尾市神宮寺1-64,,1,ファーストウィズ 八尾市 不動産,大阪府八尾市・柏原市,\nキタザワ産業株式会社,京都府,城陽市,京都府城陽市平川東垣外40-1,,1,不動産事業部,京都府城陽市・宇治市西部・久御山町（京田辺市）,\n東陽ハウジング株式会社,広島県,広島市,広島県広島市佐伯区五日市中央2丁目1-11,,1,東陽ハウジング,広島県広島市佐伯区,\nGクレイン株式会社,広島県,広島市,広島県広島市東区光町2丁目8-35-102号,,1,すみはる商店,広島県東区・南区・安芸区・安芸郡,\n株式会社いえここ不動産（光電気）,神奈川県,秦野市,神奈川県秦野市桜町2丁目1−45,,1,いえここ不動産,神奈川県秦野市,\n株式会社イズホーム不動産,大阪府,堺市,大阪府堺市堺区三国ヶ丘御幸通59南海堺東ビル(堺タカシマヤ上) 7F,,1,イズホーム不動産,堺市北区・大阪市西区,\nSuidobi 株式会社,静岡県,浜松市,静岡県浜松市東区小池町2736-3,,1,suidobi不動産,浜松市中央区（旧東区）,\n株式会社ヒノキヤグループ まいすまいカンパニー,埼玉県,久喜市,埼玉県久喜市上町3番4号,,1,まいすまい久喜店,埼玉県久喜市,\n株式会社エヌ・アイ・エス,神奈川県,海老名市,神奈川県海老名市河原口2丁目2-38,,1,シャインスター,海老名市・綾瀬市,\n株式会社デザインライフ,岡山県,岡山市,岡山県岡山市北区今3丁目9-12ピュアライフ今1F101号室,,1,DeLiE デリエ,岡山県岡山市北区,\n原建販,岐阜県,上市白鳥町,岐阜県郡上市白鳥町為真201-78,,1,ここくらし,岐阜県郡上市,\n平林建築工房株式会社,兵庫県,赤穂市,兵庫県赤穂市加里屋26-4,,1,ラフォーレエステート,兵庫県赤穂市・上郡町,\n株式会社モットハウス,愛知県,刈谷市,愛知県刈谷市一ツ木町4-9-12,,1,モットハウス不動産,愛知県刈谷市・知立市（安城市）,\n丸什本間建設株式会社,北海道,釧路町,北海道釧路郡釧路町桂木5丁目16番地,,1,昴不動産,北海道釧路市・北海道釧路郡釧路町,\n有限会社 河村総合建築,徳島県,勝浦町,徳島県勝浦郡勝浦町棚野鍛冶地9-4,,1,やまもも不動産,徳島県徳島市,\n有限会社アルヴィス,茨城県,つくば市,茨城県つくば市さくらの森10-5 AK-styleII 2B,,1,エリアサーチつくば,茨城県つくば市,\n株式会社Hearts建築工房,埼玉県,北本市,埼玉県北本市中丸7-365,,1,Hearts不動産,埼玉県北本市・桶川市,\nEC南部コーポレーション株式会社,岩手県,奥州市,岩手県奥州市水沢佐倉河字慶徳71番地 EC慶徳ビル2階,,1,とちふる,岩手県奥州市・胆沢郡金ケ崎町,\n株式会社cosha,愛媛県,松山市,愛媛県松山市朝生田町七丁目2番24号,,1,コーシャ不動産,愛媛県松山市,\n株式会社 小林新建,大阪府,和泉市,大阪府和泉市和気町3-6-4,,1,スマイルワンホーム,大阪府和泉市・泉北郡忠岡町（泉大津市・岸和田市・堺市南区）,\n株式会社ルク・ルクホーム,広島県,広島市,広島県広島市東区若草町2-16,,1,株式会社ルク・ルクホーム,広島市東区,\nリベルタ企画,福岡県,久留米市,福岡県久留米市小森野六丁目18-21,,1,リベルタ不動産,福岡県久留米市,\nSS建築デザイン室有限会社,岩手県,花巻市,岩手県花巻市湯本2-54-8,,1,はなとちと,岩手県花巻市,\n株式会社村上組,青森県,弘前市,青森県弘前市大字藤代一丁目2番地1,,1,マルマン不動産,青森県弘前市,\n株式会社アフィット不動産,宮崎県,宮崎市,宮崎県宮崎市大塚町権現昔769 タクミヤモール2F C店舗,,1,アフィット不動産,宮崎県宮崎市,\n株式会社リアルターソリューションズ,滋賀県,草津市,滋賀県草津市南草津2-1-7 ラクーンビル1F,,1,リライト不動産,草津市・栗東市・守山市,\n株式会社ハイランド,兵庫県,神戸市,兵庫県神戸市北区山田町小部字西ノ岡谷16−1,,1,ココサト,兵庫県神戸市北区,\n株式会社藤本工務店,兵庫県,小野市,兵庫県小野市敷地町1603-1,,1,いえとち工房 不動産事業部,兵庫県小野市・加東市・三木市・西脇市・加西市,\n有限会社サンブルーサン,広島県,東広島市,広島県東広島市西条町大沢1140,,1,サンブルー不動産,広島県東広島市,\nしんせつハウス株式会社,静岡県,磐田市,静岡県磐田市中泉2443-1,,1,しんせつハウス不動産,静岡県磐田市,\nサンキホーム有限会社,岐阜県,可児市,岐阜県可児市広見2363-6,,1,みつかるホーム,可児市、美濃加茂市、加茂郡富加町、 加茂郡八百津町、可児郡御嵩町,\n有限会社タクミ,広島県,福山市,広島県福山市駅家町万能倉1246番地5,,1,takumi不動産,広島県福山市北部（府中市主要部）,\n株式会社an cube,大阪府,和泉市,大阪府和泉市いぶき野2丁目9番6号,,1,アンキューブ不動産,大阪府和泉市,\n株式会社佐元工務店,宮城県,仙台市,宮城県仙台市若林区古城三丁目14番15号,,1,佐元不動産,宮城県仙台市若林区,\n株式会社machinami,島根県,出雲市,島根県出雲市渡橋町824番地1,,1,マチナミ不動産,島根県出雲市,\n株式会社サンヨークリエイト,大阪府,大阪市,大阪府大阪市鶴見区安田4丁目3-19,,1,つるみベース,大阪市鶴見区,\nM図建築工房株式会社,宮崎県,宮崎市,宮崎県宮崎市本郷北方3643-1,,1,mokmok不動産,宮崎県宮崎市,\n株式会社しずまち不動産,静岡県,静岡市,静岡市駿河区大谷2丁目25‐24,,1,物件牧場,静岡市駿河区,\n有限会社獅子倉工務店,埼玉県,朝霞市,埼玉県朝霞市溝沼7-4-53,,1,ししくら不動産,埼玉県朝霞市,\nトモノ不動産株式会社,長野県,佐久穂町,長野県南佐久郡佐久穂町海瀬355,,1,トモノ不動産,長野県佐久市・北佐久郡・南佐久郡佐久穂町・小諸市,\n株式会社リマド不動産,愛知県,一宮市,愛知県一宮市大和町宮地花池字高見12番地1,,1,株式会社 リマド不動産,愛知県一宮市,\n株式会社中澤,鹿児島県,鹿児島市,鹿児島県鹿児島市西別府町2995-5,,1,なかざわ不動産,鹿児島県鹿児島市一部,\n杢る株式会社,東京都,練馬区,東京都練馬区貫井3-20-11,,1,る不動産,東京都練馬区一部,\n株式会社エルハウス,長野県,茅野市,長野県茅野市宮川1387−9AIビル2F,,1,エル不動産,長野県茅野市・諏訪市・下諏訪町・原村・富士見町・千曲市・坂城町,\n日本住建株式会社,愛知県,安城市,愛知県安城市城南町1-1-1,,1,安城すみたつ不動産,愛知県安城市,\n田中建設株式会社,福井県,越前市,福井県越前市本保町21号10番地,,1,福来不動産,福井県越前市・鯖江市,\n株式会社大之木ダイモ,広島県,呉市,広島県呉市中央3丁目8-21,,1,大之木ダイモ 不動産課,広島県呉市,\n株式会社トータルホーム,岡山県,岡山市,岡山県岡山市北区西辛川323-16,,1,MOMO不動産販売,岡山市北区,\n株式会社シアーズホームバース,福岡県,大野城市,福岡県大野城市乙金3丁目24番1号 イオン乙金店南街区内,,1,,福岡県大野城市・春日市・太宰府市,\n株式会社アラカワ,大阪府,堺市,大阪府堺市堺区松屋町2-46-3,,1,アラカワ不動産,大阪府堺市堺区,\n株式会社サンモルト,広島県,福山市,広島県福山市鞆町後地26-125,,1,サンモルト不動産,広島県福山市南部,\n株式会社市兵衛,大阪府,和泉市,大阪府和泉市はつが野一丁目44番5,,1,いちや,大阪府泉州・堺市・南河内,\n株式会社福さん,大阪府,大阪市,大阪府大阪市城東区今福西1丁目9-7,,1,福さん不動産,大阪府大阪市城東区,\n株式会社マチリブ不動産,鳥取県,米子市,鳥取県米子市両三柳255-8,,1,マチリブ不動産,鳥取県米子市・鳥取市・島根県出雲市・松江市,\n株式会社HORI建築,京都府,福知山市,京都府福知山市字土1117番地の122,,1,ジブン不動産,京都府福知山市・綾部市・舞鶴市,\n有限会社堀内建材,長野県,須坂市,長野県須坂市墨坂南1-14-17,,1,SUMAITE不動産,長野県須坂市・高山村・長野市（一部）・小布施町,\n有限会社西川技建工業,滋賀県,長浜市,滋賀県長浜市高月町西阿閉1414,,1,あおい不動産,滋賀県長浜市,\n株式会社リキュー,愛知県,西尾市,愛知県西尾市永吉3丁目109,,1,RIKYU不動産,愛知県西尾市,\n株式会社三建,兵庫県,加古川市,兵庫県加古川市加古川町溝之口584,,1,SANKEN不動産,兵庫県加古川市一部,\n宮原建工株式会社,千葉県,船橋市,千葉県船橋市南本町1-12,,1,ひまわりエステート,千葉県船橋市南部,\n株式会社豊田,埼玉県,吉川市,埼玉県吉川市三輪野江1375,,1,ゆたかた不動産,吉川市･三郷市,\n株式会社エッジウェア,東京都,渋谷区,東京都渋谷区南平台町2-6 南平台町ヒルス101,,1,エッジウェアエステート,東京都渋谷区一部・目黒区一部,\n翔ハウジング関東開発株式会社,神奈川県,相模原市,神奈川県相模原市南区相模大野3-19-11,,1,翔不動産,神奈川県相模原市南区,\nアンデハウス株式会社,大阪府,泉南市,大阪府泉南市樽井2丁目23-20,,1,あんで不動産,大阪府泉南市、阪南市、岬町,\n株式会社ファイブセンス,岐阜県,高山市,岐阜県高山市山田町295-1,,1,マッチングエステート,高山市（荘川町除く）・飛騨市古川町のみ,\n株式会社ビリーブ,兵庫県,神戸市,兵庫県神戸市中央区磯辺通2丁目2-10-1003 (one knot tradesビル10F),,1,REC+（レクタス）神戸,兵庫県神戸市,\n株式会社TRUNK 不動産,愛知県,豊田市,愛知県豊田市勘八町長根46-15,,1,TRUNK不動産｜トランク不動産,愛知県豊田市,\n平林建設株式会社,千葉県,大多喜町,千葉県夷隅郡大多喜町森宮109-1,,1,ふらっと不動産,夷隅郡大多喜町・御宿町・いすみ市・勝浦市・睦沢町・長南町,\n株式会社M.Peaceful建築,大阪府,貝塚市,大阪府貝塚市麻生中735,,1,ぴーすふる不動産,大阪府貝塚市・泉佐野市・熊取町,\n株式会社SAFE,島根県,松江市,島根県松江市西津田6丁目1-45,,1,いいぷらん不動産,島根県松江市,\nグリーンエコ建設株式会社,大阪府,岸和田市,大阪府岸和田市岡山町56-2,,1,GREEN ECO 不動産 岸和田店,大阪府岸和田市、和泉市,\n株式会社rosetta,大阪府,池田市,大阪府池田市満寿美町1-24 1F,,1,North Label,大阪府池田市,\n株式会社グリーンハウザー,宮城県,仙台市,宮城県仙台市宮城野区中野字上小袋田18番1,,1,住むっちゃ,宮城県仙台市宮城野区・多賀城市,\n株式会社ヒノキヤグループ まいすまいカンパニー,静岡県,静岡市,静岡県静岡市葵区新伝馬2丁目3-8,,1,まいすまい静岡店,静岡県静岡市葵区,\n有限会社田中住プランニング,千葉県,八千代市,千葉県八千代市吉橋1833-1,,1,タナジュウハウジング,千葉県八千代市,\n株式会社ファーストステージ,茨城県,水戸市,茨城県水戸市常磐町1丁目1番地9号 FSビル2F,,1,,茨城県水戸市・ひたちなか市,\n株式会社秋田宅建不動産,大阪府,東大阪市,大阪府東大阪市中石切町2-9-2,,1,秋田宅建不動産,大阪府東大阪市一部,\n株式会社エース不動産,兵庫県,川西市,兵庫県川西市久代5丁目2-4,,1,エース不動産,兵庫県川西市,\n株式会社ベルウッドデザイン,東京都,八王子市,東京都八王子市追分町21-14メゾンゆうしん1F,,1,はちくる不動産,八王子市の一部,\n株式会社みずほ不動産,京都府,京都市,京都府京都市上京区浄福寺通丸太町上る中務町486−129コスモ ガーデン 二條104,,1,みずほ不動産,京都府上京区,\n株式会社森組,富山県,南砺市,富山県南砺市荒木505番地の1,,1,森の不動産,富山県南砺市・砺波市・小矢部市,\n株式会社プロテクトワン,兵庫県,神戸市,兵庫県神戸市西区北別府4丁目14-2,,1,ぷろわん,兵庫県神戸市垂水区,\nファーストステップ株式会社,宮崎県,宮崎市,宮崎県宮崎市千草町5-18エ・パングルビル1階,,1,ファーストステップ,宮崎県宮崎市,\n株式会社田中建設,香川県,三豊市,香川県三豊市高瀬町比地1389-1,,1,たなけん不動産,香川県三豊市・観音寺市,\nヤマトカンキョウ株式会社,佐賀県,佐賀市,佐賀県佐賀市大和町大字尼寺926番地,,1,すずる不動産,佐賀県佐賀市北部,\n株式会社ササキハウジングカンパニー,青森県,八戸市,青森県八戸市南類家3-7-25,,1,不動産のササキ,青森県八戸市、三戸郡南部町,\n塚本産業株式会社,栃木県,真岡市,栃木県真岡市荒町57-18,,1,いちごの不動産,栃木県真岡市・芳賀郡益子町・芳賀町・市貝町,\n株式会社丸山工務店,東京都,江東区,東京都江東区東砂3-15-7,,1,エルスリー,東京都江東区,\n株式会社イワベニ（ジオリーブグループ）,岩手県,盛岡市,〒020-0133 岩手県盛岡市青山一丁目18-8,,1,くらすべ事業部,岩手県盛岡市,\n株式会社アサダホーム設備,大阪府,東大阪市,大阪府東大阪市四条町6-3,,1,,東大阪市（西部エリア）,\n株式会社樹工房,山口県,宇部市,山口県宇部市際波337番地3,,1,樹工房不動産,山口県宇部市、山陽小野田市、山口市の一部（山口市阿知須（あじす）のみ）,\n株式会社Rain.Builder,大阪府,大阪市,大阪府大阪市中央区久太郎町1-5-31-308,,1,テンポアール,大阪府大阪市中央区,\n仲小路不動産株式会社,秋田県,秋田市,秋田県秋田市中通二丁目1番22号,,1,仲小路不動産,秋田県秋田市,\n大誠ホーム株式会社,大阪府,東大阪市,大阪府東大阪市大蓮北1-4−11,,1,,大阪府東大阪市西部,\n株式会社リフト,福岡県,北九州市,福岡県北九州市門司区松原2丁目2番22号,,1,リフトフドウサン,福岡県北九州市門司区,\n株式会社奈良技建,東京都,練馬区,東京都練馬区大泉町2-56-5,,1,NARASITE,東京都練馬区（2026/8/10～板橋区・北区・豊島区・新宿区・中野区は収集なし,\n株式会社SOULMATE,神奈川県,藤沢市,神奈川県藤沢市藤沢1061-3望月ビル4F,,1,ソウルメイト不動産,神奈川県藤沢市,\n有限会社エムジーシステム,香川県,善通寺市,香川県善通寺市中村町1393番地2,,1,,香川県仲多度郡琴平町、善通寺市、丸亀市,\n三和ペイント株式会社,大阪府,大阪市,大阪府大阪市淀川区西宮原1丁目8番10号,,1,住まい探しのミカタ,大阪府高槻市,\n株式会社オオサワホーム,長野県,松本市,長野県松本市野溝西2丁目9-58,,1,Renokura（リノクラ）不動産,長野県松本市、塩尻市、安曇野市,\n株式会社齊藤建設,埼玉県,鶴ヶ島市,埼玉県鶴ヶ島市五味ヶ谷152-10,,1,,埼玉県鶴ヶ島市,\n株式会社HARMONY,三重県,津市,三重県津市藤方1036番1,,1,HARMONY不動産,三重県津市,\n株式会社明治住設,埼玉県,春日部市,埼玉県春日部市新川235-1,,1,住まいのみかた.com,埼玉県春日部市,\n株式会社ジツダヤ,愛知県,名古屋市,愛知県名古屋市中区大須4-14-26ジツダビル7F,,1,とんぼ不動産,愛知県名古屋市昭和区,\n株式会社喜助,茨城県,土浦市,茨城県土浦市城北町18-7,,1,,茨城県土浦市,\n株式会社ノザワ,青森県,八戸市,青森県八戸市西白山台6-9-45,,1,青森の家さがし,青森県八戸市,\n三祐木材株式会社,兵庫県,神戸市,兵庫県神戸市須磨区多井畑池の奥上11-1,,1,三祐不動産,兵庫県神戸市須磨区,\nジューテックホーム株式会社,神奈川県,横浜市,神奈川県横浜市都筑区新栄町4-1,,1,,神奈川県横浜市都筑区or横浜市港北区,\n株式会社横浜ホームビルド,神奈川県,横浜市,神奈川県横浜市都筑区茅ヶ崎南3-1-42,,1,つづき不動産,神奈川県横浜市都筑区,\n株式会社リフォームアップ,東京都,板橋区,東京都板橋区徳丸1-24-19,,1,Sumusubi不動産,東京都板橋区,\n有限会社森田建設,大阪府,枚方市,大阪府枚方市藤阪東町二丁目15-1,,1,アルクハウス不動産,大阪府枚方市一部、京都府京田辺市一部,\n株式会社アーバンインテリア,福岡県,福岡市,福岡県福岡市中央区白金1-3-8アバンス薬院2階,,1,住まい再生ラボ,福岡県福岡市中央区,\nスクールバス不動産株式会社,大阪府,大阪市,大阪市中央区道修町1丁目3−1 ディライト北浜ビル6F,,1,SB-Realty,大阪府大阪市中央区,\n株式会社なかむら総建,千葉県,白子町,千葉県長生郡白子町浜宿378,,1,なかむら不動産,千葉県茂原市・大網白里市,\n株式会社サンホームズ,愛知県,幸田町,愛知県額田郡幸田町大字久保田字釜谷7-26,,1,共感住宅ray-out 不動産事業部,愛知県岡崎市・幸田町,\n株式会社リノベース,山形県,山形市,山形県山形市清住町2-4-16,,1,山形 不動産＆住宅の情報館,山形県山形市、天童市、東根市、寒河江市、上山市、南陽市、山辺町、中山町,\n株式会社池田商店,北海道,帯広市,北海道帯広市西18条北1丁目17,,1,とかちつなぐ不動産,北海道帯広市、河西郡芽室町、幕別町札内、河東郡音更町,\n株式会社KENSHOW,埼玉県,熊谷市,埼玉県熊谷市原島1149-1,,1,On Fleek Estate,埼玉県熊谷市、（深谷市）,\n天建株式会社,愛知県,名古屋市,愛知県名古屋市中区錦二丁目9番14号 伏見スクエアビル3F,,1,,愛知県名古屋市千種区,\n株式会社木の彩,石川県,かほく市,石川県かほく市高松ノ63-2,,1,きのいろ不動産,石川県かほく市、河北郡津幡町、羽咋郡宝達志水町、羽咋市,\nシーダーホームズ株式会社,石川県,金沢市,石川県金沢市窪6丁目112番2,,1,こっとり不動産,石川県金沢市,\n株式会社コンクスハウジング,群馬県,高崎市,群馬県高崎市問屋町3丁目9-5,,1,コンクス不動産,群馬県高崎市,\n株式会社GRANDILL,神奈川県,相模原市,神奈川県相模原市緑区二本松3−19−2,,1,GRANDILL,神奈川県相模原市緑区,\n株式会社サンワーク,宮城県,仙台市,宮城県仙台市泉区野村字天王前2番地1,,1,ハレイエ,仙台市泉区一部、富谷市,\n有限会社太陽商事,愛知県,豊橋市,愛知県豊橋市新栄町字新田中64-1,,1,街の不動産 みっけ！,愛知県豊橋市,\n藤絹商事株式会社,鹿児島県,鹿児島市,鹿児島県鹿児島市下荒田1丁目2-8,,1,ストックランド不動産,鹿児島県鹿児島市一部,\n夢のなかまたち株式会社,神奈川県,相模原市,神奈川県相模原市中央区横山台2-13-1-1F,,1,ハウスドゥ 相模原横山台店,相模原市中央区,\nエイチエスシー株式会社,神奈川県,横須賀市,神奈川県横須賀市吉井4-6-10,,1,cou cou house,横須賀市一部,\n株式会社CloverHome,東京都,小平市,東京都小平市花小金井6-16-8,,1,,東京都武蔵野市,\n株式会社おかけんホーム,滋賀県,彦根市,滋賀県彦根市戸賀町141-2,,1,おかけんホーム,滋賀県彦根市,\n株式会社インデュアホームいわき南,福島県,いわき市,福島県いわき市東田町2丁目14-4,,1,インデュアホームいわき南,福島県いわき市南部・北茨城市・高萩市,\n株式会社アート・宙,三重県,四日市,三重県四日市市北町3番4号,,1,ソラトチ,三重県四日市市,\nサクラホームアシスト株式会社,長野県,長野市,長野県長野市篠ノ井岡田1065番地,,1,サクラ暮らし相談室,長野県長野市,\n株式会社粹家創房,鹿児島県,鹿児島市,鹿児島県鹿児島市春山町1636-9,,1,かごんま不動産,鹿児島県鹿児島市,\n株式会社MORIMOTO,広島県,広島市,広島県広島市中区江波南2丁目9-37,,1,,広島県広島市中区,\n株式会社アート建工 マチリブ不動産,鳥取県,米子市,鳥取県米子市両三柳255-8,,1,,,\n三ツ星ハウジング株式会社,埼玉県,上里町,埼玉県児玉郡上里町七本木3652-2,,1,,埼玉県児玉郡・本庄市,\n株式会社小林創建,長野県,松本市,長野県松本市高宮北5番8号,,1,,長野県松本市,\n石川住建株式会社,茨城県,石岡市,茨城県石岡市北府中2-8-7,,1,,茨城県石岡市・土浦市・かすみがうら市,\n有限会社ツカサ,佐賀県,佐賀市,佐賀県佐賀市末広2丁目13番44号,,1,,佐賀県佐賀市,\n株式会社イサカホーム,茨城県,笠間市,茨城県笠間市赤坂23-16,,1,,,S0064\n株式会社プランニングエステート,東京都,目黒区,東京都目黒区目黒1丁目6番17号-13F,,1,,,S0149\n木楽ホーム株式会社,長野県,東御市,長野県東御市県136-3 クレイン東御ビル,,1,,,S0341\nミライズ不動産株式会社,長野県,上田市,長野県上田市天神三丁目3-6,https://www.me-rise-fudosan.jp/,1,,,S0392\nD-works株式会社,滋賀県,大津市,滋賀県大津市玉野浦4番69号,,1,,,S0414\n株式会社平屋くん,三重県,亀山市,三重県亀山市東丸町524,,1,,,S0415\nNOKKI株式会社,福井県,福井市,福井県福井市定正町102,,1,,,S0417\n株式会社松下建設佐世保支店,長崎県,佐世保市,長崎県佐世保市大和町939番15,,1,トチスマショップ佐世保店,長崎県佐世保市一部、東彼杵郡（波佐見町、川棚町、東彼杵町）,\nファミリーステージ株式会社,熊本県,熊本市,熊本県熊本市中央区水前寺六丁目50-20,,1,,,S0419\n株式会社夢のおてつだい,愛知県,豊田市,愛知県豊田市元宮町5丁目57-3,,1,,,S0421\nホライズン株式会社,広島県,広島市,広島県広島市南区段原南1-10-8,,1,ホライズン,広島県広島市・呉市（音戸・倉橋は除く）,S0423\n株式会社パートナーズホーム,愛知県,豊橋市,愛知県豊橋市東郷町59-2,,1,,愛知県豊橋市東部,S0424\nシェマコンサルタント株式会社,熊本県,熊本市,熊本県熊本市東区東野四丁目8番3号105,,1,,,S0416\n株式会社Linkrop,東京都,中野区,東京都中野区中野2-19-2 リードシー中野ビル3F,,1,Linkrop不動産,,S0361\n";
var APP_HTML_ = "<!doctype html>\n<html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<meta name=\"robots\" content=\"noindex,nofollow\"><title>エリア調査シート 入力システム</title>\n<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap\">\n<style>\n:root{--teal:#007482;--teal-l:#E0F2F4;--accent:#FFAB40;--text:#212121;--sub:#595959;--line:#d5dde0;--bg:#F4F7F8;--warn:#b26a00;--warn-bg:#fff8ec;--err:#B00020;\n --f:\"Noto Sans JP\",\"Hiragino Kaku Gothic ProN\",Meiryo,sans-serif}\n*{box-sizing:border-box}\n[hidden]{display:none!important}\nbody{margin:0;font-family:var(--f);color:var(--text);background:var(--bg);line-height:1.7;font-size:16px}\nheader.top{background:var(--teal);color:#fff;padding:12px 16px;position:sticky;top:0;z-index:10;display:flex;gap:12px;align-items:center;flex-wrap:wrap}\nheader.top h1{font-size:1.05rem;margin:0;flex:1;min-width:200px}\nmain{max-width:980px;margin:0 auto;padding:20px 16px 80px}\nbutton,.btn{font:inherit;cursor:pointer;border:0;border-radius:999px;padding:10px 20px;background:var(--accent);color:var(--text);font-weight:700;text-decoration:none;display:inline-block;min-height:44px}\nbutton.ghost,.btn.ghost{background:#fff;color:var(--teal);border:2px solid var(--teal)}\nheader button.ghost{background:transparent;color:#fff;border-color:#fff}\nbutton:disabled{opacity:.5;cursor:default}\ninput,select{font:inherit;width:100%;padding:10px 12px;border:1px solid #aab7bb;border-radius:8px;background:#fff;min-height:44px}\ninput:focus,select:focus,button:focus-visible{outline:3px solid var(--teal);outline-offset:1px}\n.card{background:#fff;border-radius:14px;padding:20px;margin-bottom:16px;box-shadow:0 1px 0 rgba(0,0,0,.04)}\n.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}\n.grow{flex:1;min-width:160px}\n.chip{display:inline-block;border-radius:999px;padding:2px 12px;font-size:.8125rem;font-weight:700;background:var(--teal-l);color:var(--teal)}\n.chip.need{background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn)}\n.msg{color:var(--err);font-size:.9375rem;margin-top:8px}\n.note{font-size:.8125rem;color:var(--sub)}\n.item{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:14px 0;border-bottom:1px solid var(--line)}\n.item:last-child{border:0}.item b{font-size:1.05rem}\ndetails.sec{background:#fff;border-radius:14px;margin-bottom:12px;overflow:hidden}\ndetails.sec>summary{cursor:pointer;padding:14px 18px;font-weight:700;background:var(--teal);color:#fff;list-style:none;display:flex;justify-content:space-between;gap:8px}\ndetails.sec>summary::-webkit-details-marker{display:none}\ndetails.sec .body{padding:8px 18px 18px}\n.field{padding:12px 0;border-bottom:1px solid #eef2f3}.field:last-child{border:0}\n.field label{font-weight:500;display:block;margin-bottom:4px}\n.req{font-size:.75rem;background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn);border-radius:4px;padding:0 6px;margin-left:6px;font-weight:700}\n.field.need input{border-color:var(--warn);background:var(--warn-bg)}\n.field.bad input{border-color:var(--err)}\n.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}\n.cols span{font-size:.75rem;color:var(--sub);display:block}\n.hint{font-size:.8125rem;color:var(--sub);margin-top:4px}\n.err{font-size:.8125rem;color:var(--err);margin-top:4px}\n.imgbox{display:flex;gap:12px;align-items:center;flex-wrap:wrap}\n.imgbox img{max-height:90px;max-width:160px;border:1px solid var(--line);border-radius:6px;background:#fff}\n.imgbox input[type=file]{display:none}\n.tbl{margin-top:10px;border:1px solid var(--line);border-radius:10px;padding:10px;background:#fff;overflow-x:auto}\n.tbl table{border-collapse:collapse;font-size:.8125rem}\n.tbl td,.tbl th{border:1px solid var(--line);padding:0}\n.tbl input{width:4.5em;border:0;padding:6px 4px;text-align:right;min-height:32px}\n.tbl th input{font-weight:700;background:var(--teal-l);text-align:center;width:5.5em}\n.tbl .warn{color:#B00020;font-size:.8125rem;margin:6px 0}\n.field.off{opacity:.45}\n.imgbox .paste{border:2px dashed var(--teal);border-radius:10px;padding:10px 14px;font-size:.875rem;color:var(--teal);background:var(--teal-l);cursor:pointer;min-height:44px;display:flex;align-items:center}\n.imgbox .paste:focus{outline:3px solid var(--teal)}\n.tbl{width:100%;border-collapse:collapse}.tbl td{padding:10px 6px;border-bottom:1px solid var(--line);vertical-align:middle}\nlabel.chk{display:flex;gap:8px;align-items:center;min-height:44px}label.chk input{width:auto;min-height:0}\n#miss{margin:0;padding-left:1.2em;font-size:.875rem}\n#miss li{margin:2px 0}\n#saved{font-size:.875rem}\n@media (max-width:640px){main{padding:12px 12px 80px}.card{padding:14px}}\n</style></head><body>\n<header class=\"top\"><h1 id=\"title\">エリア調査シート 入力システム</h1><span id=\"hstat\" class=\"chip\" hidden></span><span id=\"saved\"></span>\n<span id=\"who\" class=\"note\" style=\"color:#cfeaee\"></span>\n<button class=\"ghost\" id=\"navlist\" hidden>一覧</button><button class=\"ghost\" id=\"navfr\" hidden>加盟店</button><button class=\"ghost\" id=\"navset\" hidden>設定</button></header>\n<main id=\"main\"><div class=\"card\"><p class=\"note\">読み込み中…</p></div></main>\n<script>\nvar imgs = {}, autoHouseholds = null, lastImg = null, cur = null, dirty = {}, timer = null, saving = false, meta = [], vals = {}, PREFS = [];\nvar $ = function (id) { return document.getElementById(id); };\nfunction el(tag, attrs, kids) {\n  var e = document.createElement(tag);\n  Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); });\n  (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });\n  return e;\n}\nfunction call(name, args, ok, fail) {\n  busy(true);\n  var r = google.script.run.withSuccessHandler(function (res) { busy(false); ok(res); })\n    .withFailureHandler(function (e) { busy(false); var m = String(e && e.message || e).replace(/^Error:\\s*/, ''); if (fail) fail(m); else show(m, true); });\n  r[name].apply(r, args);\n}\nfunction busy(b) { document.body.style.cursor = b ? 'progress' : ''; }\nfunction show(msg, bad) { var m = $('msg'); if (m) { m.textContent = msg; m.className = bad ? 'msg' : 'note'; } else if (bad) { $('main').insertBefore(el('div', { class: 'card' }, [el('p', { class: 'msg', text: msg })]), $('main').firstChild); } }\nfunction setSaved(t, bad) { var s = $('saved'); s.textContent = t; s.style.color = bad ? '#ffd0d0' : '#fff'; }\nfunction chrome(title, inEdit) { $('title').textContent = title; $('hstat').hidden = !inEdit; setSaved(''); ['navlist', 'navfr', 'navset'].forEach(function (i) { $(i).hidden = false; }); }\nfunction armed(btn, label, doIt) {\n  var a = false, orig = btn.textContent;\n  btn.onclick = function () { if (!a) { a = true; btn.textContent = label; setTimeout(function () { a = false; btn.textContent = orig; }, 4000); return; } doIt(); };\n}\nfunction copyText(t, btn) {\n  var done = function () { var o = btn.textContent; btn.textContent = 'コピーしました'; setTimeout(function () { btn.textContent = o; }, 1500); };\n  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { prompt('コピーしてください', t); });\n  else prompt('コピーしてください', t);\n}\n/* 市区町村の入力候補(政令指定都市は「横浜市」と「横浜市中区」の両方)。都道府県を選ぶたびに取得 */\nvar cityCache = {};\nfunction cityList() { var d = document.getElementById('citylist'); if (!d) { d = el('datalist', { id: 'citylist' }); document.body.appendChild(d); } return d; }\nfunction loadCities(pref) {\n  var d = cityList(); d.replaceChildren();\n  if (!pref) return;\n  var fill = function (a) { if (cityList() === d) a.forEach(function (n) { d.appendChild(el('option', { value: n })); }); };\n  if (cityCache[pref]) { fill(cityCache[pref]); return; }\n  google.script.run.withSuccessHandler(function (a) { cityCache[pref] = a; fill(a); }).withFailureHandler(function () {}).api_cities(pref);\n}\nfunction withCities(sel, inp) { inp.setAttribute('list', 'citylist'); var h = sel.onchange; sel.addEventListener('change', function () { loadCities(sel.value); }); if (sel.value) loadCities(sel.value); }\nfunction prefSelect(sel) { var s = el('select', {}); [''].concat(PREFS).forEach(function (p) { var o = el('option', { value: p, text: p || '都道府県' }); if (p === sel) o.selected = true; s.appendChild(o); }); return s; }\n\n/* ---- 一覧(会社 > エリア) ---- */\nfunction viewList() {\n  cur = null; chrome('会社とエリアの一覧', false);\n  call('api_list', [], function (r) {\n    var wrap = el('div', {});\n    var add = el('div', { class: 'card' }, [el('h2', { text: '新しい会社を追加', style: 'margin-top:0;font-size:1.1rem' })]);\n    var c1 = el('input', { id: 'nc', placeholder: '先方の会社名(例: 株式会社○○)' }), sel = prefSelect(''), c3 = el('input', { id: 'ncity', placeholder: '最初のエリアの市区町村(例: 上田市 / 横浜市中区)' });\n    sel.id = 'np'; withCities(sel, c3);\n    var ab = el('button', { text: '追加して入力を始める' });\n    ab.onclick = function () {\n      if (!c1.value.trim() || !sel.value || !c3.value.trim()) { $('msg').textContent = '会社名・都道府県・市区町村を入力してください。'; return; }\n      call('api_create_company', [c1.value, sel.value, c3.value], function (x) { openArea(x.areaId); });\n    };\n    add.appendChild(el('div', { class: 'row' }, [el('div', { class: 'grow' }, [c1]), el('div', { style: 'width:150px;flex:none' }, [sel]), el('div', { class: 'grow' }, [c3]), ab]));\n    add.appendChild(el('p', { id: 'msg', class: 'msg' }));\n    wrap.appendChild(add);\n    if (!r.hasUrl) wrap.appendChild(el('div', { class: 'card' }, [el('p', { class: 'msg', text: 'LPのURLを作れません。ウェブアプリとしてデプロイしたあと、「設定」の「LPの公開URL」を入力してください。' })]));\n    else if (r.provisional) wrap.appendChild(el('div', { class: 'card', style: 'border:2px solid #b26a00;background:#fff8ec' }, [el('p', { class: 'note', style: 'color:#5a3600', text: '※いま表示しているLPのURLは「仮」です(この入力システム自身のURLで作っています)。社内の人しか開けない場合があります。お客様に見せるURLにするには、「設定」で「LPの公開URL」(LP用に「全員」でデプロイしたウェブアプリのURL)を入力してください。' })]));\n    if (!r.companies.length) wrap.appendChild(el('div', { class: 'card' }, [el('p', { class: 'note', text: 'まだありません。上のフォームから追加してください。' })]));\n    r.companies.forEach(function (c) { wrap.appendChild(companyCard(c, r)); });\n    $('main').replaceChildren(wrap);\n  });\n}\nfunction companyCard(c, r) {\n  var card = el('div', { class: 'card' }), head = el('div', { class: 'row', style: 'margin-bottom:6px' });\n  var nameEl = el('h2', { text: c.name, style: 'margin:0;font-size:1.15rem;flex:1;min-width:200px' });\n  var ren = el('button', { class: 'ghost', text: '会社名を変更' });\n  ren.onclick = function () {\n    var inp = el('input', { value: c.name, style: 'flex:1;min-width:200px' }), ok = el('button', { text: '保存' });\n    ok.onclick = function () { call('api_rename_company', [c.id, inp.value], function () { viewList(); }); };\n    head.replaceChildren(inp, ok); inp.focus();\n  };\n  var del = el('button', { class: 'ghost', text: '会社を削除' }); armed(del, 'エリアも全部消えます。もう一度押すと削除', function () { call('api_delete_company', [c.id], function () { viewList(); }); });\n  var dup = el('button', { class: 'ghost', text: '複製' });\n  dup.onclick = function () {\n    var inp = el('input', { value: c.name + '（コピー）', style: 'flex:1;min-width:200px', 'aria-label': '複製後の会社名' }), ok = el('button', { text: 'この名前で複製する' }), cancel = el('button', { class: 'ghost', text: 'やめる' });\n    ok.onclick = function () { call('api_duplicate_company', [c.id, inp.value], function (x) { viewList(); }); };\n    cancel.onclick = function () { viewList(); };\n    head.replaceChildren(inp, ok, cancel); inp.focus(); inp.select();\n  };\n  head.appendChild(nameEl); head.appendChild(dup); head.appendChild(ren); head.appendChild(del); card.appendChild(head);\n  if (c.areas.length) card.appendChild(el('p', { class: 'note', style: 'margin:0 0 4px', text: '「複製」で、この会社のエリアと入力内容・画像をそのまま別の会社としてコピーできます(同じエリアで別の会社に提案するときに便利です)。' }));\n  c.areas.forEach(function (a) {\n    var row = el('div', { class: 'item' }, [el('div', { class: 'grow' }, [el('b', { text: a.city }), el('span', { class: 'note', text: '　' + a.pref + '　' }), el('span', { class: 'chip' + (a.done ? '' : ' need'), text: a.status })])]);\n    var ed = el('button', { text: '入力する' }); ed.onclick = function () { openArea(a.id); }; row.appendChild(ed);\n    if (a.url) { row.appendChild(el('a', { class: 'btn ghost', href: a.url, target: '_blank', rel: 'noopener', text: 'LPを開く' }));\n      var cp = el('button', { class: 'ghost', text: 'URLをコピー' }); cp.onclick = function () { copyText(a.url, cp); }; row.appendChild(cp);\n      row.appendChild(el('div', { style: 'flex-basis:100%;word-break:break-all;order:5' }, [el('span', { class: 'note', text: 'LPのURL' + (r.provisional ? '(仮)' : '') + '：' }), el('a', { href: a.url, target: '_blank', rel: 'noopener', style: 'font-size:.875rem', text: a.url })])); }\n    var dl = el('button', { class: 'ghost', text: '削除' }); armed(dl, 'もう一度押すと削除', function () { call('api_delete_area', [a.id], function () { viewList(); }); }); row.appendChild(dl);\n    card.appendChild(row);\n  });\n  var f = el('div', { class: 'row', style: 'margin-top:12px' }), sel = prefSelect(''), ci = el('input', { placeholder: 'エリアを追加(市区町村 例: 東御市 / 横浜市中区)' }), ab = el('button', { class: 'ghost', text: 'エリアを追加' });\n  ab.onclick = function () { if (!sel.value || !ci.value.trim()) { show('都道府県と市区町村を入力してください。', true); return; } call('api_add_area', [c.id, sel.value, ci.value], function (x) { openArea(x.areaId); }); };\n  withCities(sel, ci);\n  f.appendChild(el('div', { style: 'width:150px;flex:none' }, [sel])); f.appendChild(el('div', { class: 'grow' }, [ci])); f.appendChild(ab); card.appendChild(f);\n  return card;\n}\nfunction openArea(id) { location.hash = 'id=' + id; route(); }\n\n/* ---- 入力画面 ---- */\nfunction splitCols(v, n) { var a = String(v || '').split(/[,，]/).map(function (x) { return x.trim(); }); while (a.length < n) a.push(''); return a; }\nfunction joinCols(a) { return a.every(function (x) { return !x.trim(); }) ? '' : a.map(function (x) { return x.trim(); }).join(','); }\nfunction markDirty(k, v) { dirty[k] = v; vals[k] = v; refreshNeed(); setSaved('入力中…'); clearTimeout(timer); timer = setTimeout(flush, 700); }\nfunction flush() {\n  if (saving) { timer = setTimeout(flush, 400); return; }\n  var ch = dirty; dirty = {}; if (!Object.keys(ch).length) return;\n  saving = true; setSaved('保存中…');\n  google.script.run.withSuccessHandler(function (r) {\n    saving = false;\n    document.querySelectorAll('.field').forEach(function (f) { f.classList.remove('bad'); var e = f.querySelector('.err'); if (e) e.remove(); });\n    var bad = Object.keys(r.errors);\n    bad.forEach(function (k) { var f = document.querySelector('[data-k=\"' + k + '\"]'); if (f) { f.classList.add('bad'); f.appendChild(el('div', { class: 'err', text: r.errors[k] + '(この項目は保存されていません)' })); } });\n    setSaved(bad.length ? '保存できない項目があります' : '保存しました ' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }), bad.length > 0);\n    loadStatus();\n  }).withFailureHandler(function (e) { saving = false; setSaved('保存に失敗: ' + (e.message || e), true); Object.keys(ch).forEach(function (k) { dirty[k] = ch[k]; }); })\n    .api_save(cur, ch);\n}\nfunction refreshNeed() {\n  document.querySelectorAll('.field[data-req=\"1\"]').forEach(function (f) {\n    var v = vals[f.getAttribute('data-k')], off = f.getAttribute('data-grp') === 'trend' && !trendOn();\n    f.classList.toggle('need', !off && (!v || !String(v).replace(/[,，\\s]/g, '')));\n  });\n  document.querySelectorAll('details.sec').forEach(function (d) {\n    var n = d.querySelectorAll('.field.need').length, c = d.querySelector('.cnt');\n    c.textContent = n ? '未入力 ' + n : '入力済み'; c.style.opacity = n ? '1' : '.7';\n  });\n}\nfunction loadStatus() {\n  google.script.run.withSuccessHandler(function (s) {\n    var chip = $('stat'); if (!chip || !cur) return;\n    var n = s.error ? null : s.missing.length;\n    var hs = $('hstat'); hs.hidden = false; hs.textContent = s.error ? '確認できません' : n ? '未入力 ' + n + '件' : '入力完了'; hs.className = 'chip' + (n ? ' need' : '');\n    chip.textContent = s.error ? s.error : n ? '未入力・未取得 ' + n + '件' : '入力完了'; chip.className = 'chip' + (n ? ' need' : '');\n    var ul = $('miss'); ul.replaceChildren();\n    s.missing.slice(0, 40).forEach(function (m) { ul.appendChild(el('li', { text: m.label })); });\n    s.checksNg.forEach(function (c) { ul.appendChild(el('li', { text: '整合性チェックNG: ' + c, style: 'color:#B00020' })); });\n    var pc = $('pinchk'); if (!pc) { pc = el('div', { id: 'pinchk', class: 'note', style: 'margin-top:12px' }); ul.parentNode.appendChild(pc); }\n    pc.replaceChildren();\n    if (s.pins && s.pins.length) {\n      pc.appendChild(el('div', { text: '地図のピンの位置(違っていたら住所を直してください)', style: 'font-weight:700;margin-bottom:4px' }));\n      s.pins.forEach(function (p) {\n        var li = el('div', { style: 'margin:2px 0' });\n        li.appendChild(document.createTextNode((p.kind === 'client' ? '御社' : p.n + '. ' + p.name) + '：' + p.address + ' → '));\n        if (p.lat != null) {\n          li.appendChild(el('a', { href: 'https://www.google.com/maps?q=' + p.lat + ',' + p.lng, target: '_blank', rel: 'noopener', text: '地図で確認(' + (p.source || '') + (p.precise ? '' : '・概算') + ')' }));\n          if (!p.on_map) li.appendChild(el('span', { text: ' ※' + p.why, style: 'color:#B00020' }));\n        } else li.appendChild(el('span', { text: 'ピンなし: ' + p.why, style: 'color:#B00020' }));\n        pc.appendChild(li);\n      });\n    }\n    var t = $('totals'); if (t) t.textContent = s.totals && s.totals.listings_total != null ? '物件総数 ' + s.totals.listings_total + '件 / 仲介単価 約' + s.totals.brokerage + '万円' : '';\n  }).withFailureHandler(function () {}).api_status(cur);\n}\nfunction shrink(file, cb, fail) {\n  if (!/^image\\/(jpeg|png|webp|gif)$/.test(file.type)) { fail('JPEG・PNGなどの画像を選んでください。'); return; }\n  var rd = new FileReader();\n  rd.onerror = function () { fail('画像を読み込めませんでした。'); };\n  rd.onload = function () {\n    var im = new Image();\n    im.onerror = function () { fail('画像を開けませんでした。'); };\n    im.onload = function () {\n      var max = 1600, k = Math.min(1, max / Math.max(im.width, im.height)), cv = document.createElement('canvas');\n      cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);\n      var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);\n      cb(cv.toDataURL('image/jpeg', 0.82));\n    };\n    im.src = rd.result;\n  };\n  rd.readAsDataURL(file);\n}\nfunction uploadImageFile(f, fl, st, th, sync) {\n  st.textContent = '処理中…'; setSaved('画像をアップロード中…');\n  shrink(fl, function (uri) {\n    th.src = uri; th.hidden = false;\n    google.script.run.withSuccessHandler(function () { imgs[f.k] = true; tables[f.k] = null; sync(); setSaved('画像を保存しました'); loadStatus(); if (isTbl(f.k)) { if (aiReady) readTableAI(f); else if (f.tb) renderTable(f); } })\n      .withFailureHandler(function (e) { st.textContent = '失敗: ' + (e.message || e); setSaved('画像を保存できませんでした', true); }).api_uploadImage(cur, f.k, uri);\n  }, function (m) { st.textContent = m; setSaved(m, true); });\n}\nvar tables = {}, aiReady = false;\nfunction isTbl(k) { return /^inputs\\.(used_house|used_mansion|new_house)\\.heatmap_image$|^inputs\\.price_trend\\.image$/.test(k); }\nfunction readTableAI(f) {\n  f.tb.replaceChildren(el('p', { class: 'note', text: 'AIで画像から表を読み取っています…(10〜30秒ほどかかります)' }));\n  google.script.run.withSuccessHandler(function (t) { tables[f.k] = t; f.fresh = true; setSaved('AIが表を作りました'); renderTable(f); loadStatus(); })\n    .withFailureHandler(function (e) { renderTable(f, 'AIで読み取れませんでした: ' + (e.message || e) + '。画像のままLPに表示されます。'); }).api_readTable(cur, f.k, true);\n}\nfunction tableEditor(f, t) {\n  var tb = el('table'), head = el('tr', {}, [el('th')]), cin = [], rin = [], cin2 = [];\n  t.cols.forEach(function (c) { var i = el('input', { type: 'text', value: c, 'aria-label': '列見出し' }); cin.push(i); head.appendChild(el('th', {}, [i])); });\n  tb.appendChild(head);\n  t.rows.forEach(function (r, ri) {\n    var i = el('input', { type: 'text', value: r, 'aria-label': '行見出し' }); rin.push(i);\n    var tr = el('tr', {}, [el('th', {}, [i])]), line = [];\n    t.cols.forEach(function (c, ci) { var v = t.cells[ri][ci], x = el('input', { type: 'text', inputmode: 'numeric', value: v === null || v === undefined ? '' : String(v), 'aria-label': r + ' × ' + c }); line.push(x); tr.appendChild(el('td', {}, [x])); });\n    cin2.push(line); tb.appendChild(tr);\n  });\n  var get = function () { return { caption: t.caption || '', cols: cin.map(function (x) { return x.value; }), rows: rin.map(function (x) { return x.value; }), cells: cin2.map(function (l) { return l.map(function (x) { return x.value; }); }) }; };\n  return { node: tb, get: get };\n}\nfunction renderTable(f, errMsg) {\n  var box = f.tb; if (!box) return; box.replaceChildren();\n  if (errMsg) box.appendChild(el('p', { class: 'warn', text: errMsg }));\n  var t = tables[f.k], isTrend = /price_trend/.test(f.k);\n  if (!imgs[f.k]) return;\n  if (!t) {\n    if (aiReady) { var b = el('button', { class: 'ghost', type: 'button', text: 'AIで画像から作り直す' }); b.onclick = function () { readTableAI(f); }; box.appendChild(b); }\n    else box.appendChild(el('p', { class: 'note', text: '「設定」でAIのAPIキーを入れると、貼った画像から自動で表・グラフを作れます。' }));\n    return;\n  }\n  var ed = tableEditor(f, t), wrap = el('div', { class: 'tbl' }, [ed.node]);\n  if (f.fresh) {\n    box.appendChild(el('p', { class: 'note', text: 'AIが自動で作りました(LPに反映済み)。元の画像と見比べて、違う数字があれば直して「修正を保存」を押してください。' + (isTrend ? 'グラフの値は読み取りによる概算です。' : '') }));\n    (t.warnings || []).forEach(function (w) { box.appendChild(el('p', { class: 'warn', text: '要確認: ' + w })); });\n  } else box.appendChild(el('p', { class: 'note', text: 'AIで作り直し済みです(LPにはこの' + (isTrend ? 'グラフ' : '表') + 'が表示されます)。数字は直接直せます。' }));\n  box.appendChild(wrap);\n  var sv = el('button', { type: 'button', text: '修正を保存' }), rd = el('button', { class: 'ghost', type: 'button', text: 'AIで読み取り直す' }), rm = el('button', { class: 'ghost', type: 'button', text: 'AIの結果をやめて画像のまま使う' }), msg = el('span', { class: 'note' });\n  sv.onclick = function () {\n    google.script.run.withSuccessHandler(function (r) { var w = t.warnings; tables[f.k] = ed.get(); tables[f.k].warnings = w; tables[f.k].cells = tables[f.k].cells.map(function (l) { return l.map(function (x) { return x === '' ? null : Number(String(x).replace(/[,，]/g, '')); }); }); f.fresh = false; setSaved('保存しました'); renderTable(f); loadStatus(); })\n      .withFailureHandler(function (e) { msg.textContent = e.message || e; }).api_saveTable(cur, f.k, ed.get());\n  };\n  rd.onclick = function () { readTableAI(f); }; rd.hidden = !aiReady;\n  rm.onclick = function () { google.script.run.withSuccessHandler(function () { tables[f.k] = null; f.fresh = false; renderTable(f); loadStatus(); }).api_deleteTable(cur, f.k); };\n  box.appendChild(el('div', { class: 'imgbox', style: 'margin-top:8px' }, [sv, rd, rm, msg]));\n}\nfunction imageField(f, wrap) {\n  var st = el('span', { class: 'note' }), th = el('img', { alt: f.l + 'のプレビュー' }), file = el('input', { type: 'file', accept: 'image/*', id: 'f_' + f.k.replace(/\\W/g, '_') });\n  th.hidden = true;\n  var pick = el('label', { class: 'btn ghost', for: file.id, text: '画像を選ぶ' }), del = el('button', { class: 'ghost', text: '削除', type: 'button' });\n  var paste = el('div', { class: 'paste', tabindex: '0', role: 'button', text: 'ここをクリックして Ctrl+V(Macは ⌘V)で貼り付け' });\n  var sync = function () { var has = !!imgs[f.k]; st.textContent = has ? 'アップロード済み' : '未登録'; del.hidden = !has; pick.textContent = has ? '画像を差し替える' : '画像を選ぶ'; vals[f.k] = has ? 'drive:set' : ''; refreshNeed(); };\n  file.onchange = function () { var fl = file.files[0]; if (fl) uploadImageFile(f, fl, st, th, sync); file.value = ''; };\n  paste.onfocus = paste.onclick = function () { lastImg = { f: f, st: st, th: th, sync: sync, box: paste }; paste.style.background = '#fff'; };\n  paste.onblur = function () { paste.style.background = ''; };\n  wrap.addEventListener('click', function () { lastImg = { f: f, st: st, th: th, sync: sync, box: paste }; });\n  del.onclick = function () {\n    var o = {}; o[f.k] = '';\n    google.script.run.withSuccessHandler(function () { imgs[f.k] = false; tables[f.k] = null; th.hidden = true; sync(); if (f.tb) renderTable(f); setSaved('削除しました'); loadStatus(); })\n      .withFailureHandler(function (e) { setSaved('削除できませんでした: ' + (e.message || e), true); }).api_save(cur, o);\n  };\n  wrap.appendChild(el('div', { class: 'imgbox' }, [th, pick, file, paste, del, st])); sync();\n  if (isTbl(f.k)) { f.tb = el('div'); wrap.appendChild(f.tb); renderTable(f); }\n}\n// クリップボードの画像を、最後に選んだ(クリック/フォーカスした)画像欄へ貼り付ける\ndocument.addEventListener('paste', function (e) {\n  if (!lastImg || !cur) return;\n  var items = (e.clipboardData && e.clipboardData.items) || [], file = null;\n  for (var i = 0; i < items.length; i++) if (items[i].kind === 'file' && /^image\\//.test(items[i].type)) { file = items[i].getAsFile(); break; }\n  if (!file) return;\n  if (lastImg.f.grp === 'trend' && !trendOn()) return;\n  e.preventDefault(); uploadImageFile(lastImg.f, file, lastImg.st, lastImg.th, lastImg.sync);\n});\nfunction fmt1(v) { var n = parseFloat(String(v).replace(/[,，％%\\s]/g, '')); return isNaN(n) ? v : n.toFixed(1); }\nfunction trendOn() { return vals['show.price_trend'] !== '0'; }\nfunction applyGroups() {\n  [['trend', trendOn()], ['pins', vals['show.pins'] !== '0']].forEach(function (g) {\n    var on = g[1];\n    document.querySelectorAll('.field[data-grp=\"' + g[0] + '\"]').forEach(function (f) {\n      f.classList.toggle('off', !on); f.querySelectorAll('input,button,label.btn').forEach(function (x) { if (x.tagName === 'LABEL') x.style.pointerEvents = on ? '' : 'none'; else x.disabled = !on; });\n    });\n  });\n  refreshNeed();\n}\nfunction fieldView(f) {\n  var wrap = el('div', { class: 'field', 'data-k': f.k, 'data-req': f.req ? '1' : '0', 'data-grp': f.grp || '' });\n  var v = vals[f.k] || '';\n  if (f.t === 'bool') {\n    var ck = el('input', { type: 'checkbox', id: 'b_' + f.k.replace(/\\W/g, '_') }); ck.checked = v !== '0';\n    ck.onchange = function () { markDirty(f.k, ck.checked ? '1' : '0'); applyGroups(); };\n    wrap.appendChild(el('label', { class: 'chk', for: ck.id, style: 'font-weight:700' }, [ck, document.createTextNode(f.l)]));\n    if (f.d) wrap.appendChild(el('div', { class: 'hint', text: f.d }));\n    return wrap;\n  }\n  var lab = el('label', { text: f.l }); if (f.req) lab.appendChild(el('span', { class: 'req', text: '必須' })); wrap.appendChild(lab);\n  if (f.t === 'image') { imageField(f, wrap); if (f.d) wrap.appendChild(el('div', { class: 'hint', text: f.d })); return wrap; }\n  if (f.cols) {\n    var parts = splitCols(v, f.cols.length), inputs = [], grid = el('div', { class: 'cols' });\n    f.cols.forEach(function (c, i) {\n      var inp = el('input', { type: 'text', value: parts[i], inputmode: /数|円|件|坪|%/.test(c) && !/名|URL|市/.test(c) ? 'decimal' : 'text', 'aria-label': f.l + ' ' + c });\n      inp.oninput = function () { markDirty(f.k, joinCols(inputs.map(function (x) { return x.value; }))); };\n      inputs.push(inp); grid.appendChild(el('div', {}, [el('span', { text: c }), inp]));\n    });\n    wrap.appendChild(grid);\n  } else {\n    var inp;\n    if (f.k === 'prefecture') { inp = prefSelect(v); inp.onchange = function () { markDirty(f.k, inp.value); loadCities(inp.value); }; if (v) loadCities(v); }\n    else {\n      inp = el('input', { type: f.t === 'date' ? 'date' : 'text', value: f.t === 'pct1' ? (v ? fmt1(v) : '') : v, inputmode: (f.t === 'num' || f.t === 'pct1') ? 'decimal' : 'text' });\n      inp.oninput = function () { markDirty(f.k, inp.value); };\n      if (f.k === 'city') inp.setAttribute('list', 'citylist');\n      if (f.t === 'pct1') { inp.placeholder = '例: 38.9'; inp.onblur = function () { if (inp.value.trim()) { var t = fmt1(inp.value); if (t !== inp.value) { inp.value = t; markDirty(f.k, t); } } }; }\n      if (f.k === 'inputs.area.households' && autoHouseholds) inp.placeholder = '自動取得: ' + autoHouseholds.toLocaleString('ja-JP') + '(入力すると、その値を使います)';\n    }\n    inp.setAttribute('aria-label', f.l); wrap.appendChild(inp);\n  }\n  if (f.d) wrap.appendChild(el('div', { class: 'hint', text: f.d }));\n  return wrap;\n}\nfunction viewEdit(id) {\n  call('api_get', [id], function (r) {\n    cur = r.id; meta = r.fields; vals = r.values; dirty = {}; imgs = r.images || {}; autoHouseholds = r.autoHouseholds; lastImg = null; tables = r.tables || {}; aiReady = !!r.aiReady;\n    chrome(r.company.name + '　' + (vals.city || ''), true);\n    var top = el('div', { class: 'card' }, [\n      el('div', { class: 'row' }, [el('span', { id: 'stat', class: 'chip need', text: '確認中…' }), el('span', { id: 'totals', class: 'note' })]),\n      el('details', { style: 'margin-top:8px' }, [el('summary', { text: '未入力・未取得の項目を見る', style: 'cursor:pointer' }), el('ul', { id: 'miss' })])]);\n    if (r.siblings.length > 1) {\n      var sb = el('div', { class: 'row', style: 'margin-top:10px' }, [el('span', { class: 'note', text: 'この会社のエリア:' })]);\n      r.siblings.forEach(function (s) { var b = el('button', { class: s.id === cur ? '' : 'ghost', text: s.label, style: 'padding:4px 14px;min-height:36px' }); b.onclick = function () { flushNow(function () { openArea(s.id); }); }; sb.appendChild(b); });\n      top.appendChild(sb);\n    }\n    var acts = el('div', { class: 'row', style: 'margin-top:12px' }); top.appendChild(acts);\n    if (r.url) { acts.appendChild(el('a', { class: 'btn', href: r.url, target: '_blank', rel: 'noopener', text: 'LPを開いて確認' }));\n      var cp = el('button', { class: 'ghost', text: 'URLをコピー' }); cp.onclick = function () { copyText(r.url, cp); }; acts.appendChild(cp);\n      top.appendChild(el('p', { style: 'margin:10px 0 0;word-break:break-all' }, [el('span', { class: 'note', text: 'LPのURL' + (r.provisional ? '(仮。社内でしか開けない場合があります。「設定」でLPの公開URLを入力してください)' : '') + '：' }), el('a', { href: r.url, target: '_blank', rel: 'noopener', style: 'font-size:.875rem', text: r.url })])); }\n    else acts.appendChild(el('span', { class: 'msg', text: 'LPのURLを作れません。ウェブアプリとしてデプロイしてください。' }));\n    var rot = el('button', { class: 'ghost', text: 'URLを作り直す' }); armed(rot, '旧URLが無効になります。もう一度押すと実行', function () { call('api_rotate', [cur], function (x) { openArea(x.id); }); });\n    acts.appendChild(rot); acts.appendChild(el('span', { class: 'note', text: '入力は自動で保存されます。' }));\n    var wrap = el('div', {}), sec = null, body = null;\n    meta.forEach(function (f) {\n      if (f.h) { sec = el('details', { class: 'sec' }); sec.appendChild(el('summary', {}, [el('span', { text: f.h }), el('span', { class: 'cnt' })])); body = el('div', { class: 'body' }); sec.appendChild(body); wrap.appendChild(sec); }\n      else if (body) body.appendChild(fieldView(f));\n    });\n    $('main').replaceChildren(top, wrap); applyGroups(); loadStatus();\n    document.querySelectorAll('details.sec').forEach(function (d, i) { d.open = i < 2 || !!d.querySelector('.field.need'); });\n  });\n}\n\n/* ---- 加盟店 ---- */\nfunction readCsvFile(file, cb) {\n  var rd = new FileReader();\n  rd.onload = function () {\n    var txt; try { txt = new TextDecoder('utf-8', { fatal: true }).decode(rd.result); } catch (e) { txt = new TextDecoder('shift_jis').decode(rd.result); }\n    cb(txt);\n  };\n  rd.readAsArrayBuffer(file);\n}\nfunction viewFranchises() {\n  cur = null; chrome('加盟店の管理', false);\n  call('api_fr_list', [], function (r) {\n    var wrap = el('div', {}), shown = 50, list = el('div', { class: 'card' });\n    // 取り込み\n    var imp = el('div', { class: 'card' }, [el('h2', { text: 'CSVから取り込む', style: 'margin-top:0;font-size:1.1rem' })]);\n    var fi = el('input', { type: 'file', accept: '.csv,text/csv', id: 'frcsv' }), imsg = el('p', { class: 'note', id: 'msg', text: '列は「会社名,住所」または「顧客番号,会社名,住所」(末尾に「URL」列を足すと、不動産HPも一緒に登録されます)。会社名の【屋号】《対応エリア》は自動で分けます。名称+住所が同じものは更新、無ければ追加します。' });\n    fi.onchange = function () {\n      var fl = fi.files[0]; if (!fl) return; imsg.textContent = '取り込み中…';\n      readCsvFile(fl, function (txt) {\n        call('api_fr_import', [txt], function (x) {\n          var m = x.added + '件追加、' + x.updated + '件更新しました。' + (x.unresolved.length ? ' 住所から市区町村を判定できず除外: ' + x.unresolved.join('、') : '');\n          viewFranchises(); setTimeout(function () { if ($('msg')) $('msg').textContent = m; }, 600);\n        }, function (m) { imsg.textContent = m; imsg.className = 'msg'; });\n      });\n      fi.value = '';\n    };\n    imp.appendChild(fi); imp.appendChild(imsg); wrap.appendChild(imp);\n    // 追加\n    var form = el('div', { class: 'card' }, [el('h2', { text: '加盟店を追加', style: 'margin-top:0;font-size:1.1rem' })]);\n    form.appendChild(editRow({ active: true }, -1, true));\n    wrap.appendChild(form);\n    // 一覧(検索つき)\n    var q = el('input', { placeholder: '名称・市区町村で検索', id: 'frq' }), ps = prefSelect(''); ps.firstChild.textContent = 'すべての都道府県';\n    var nohp = el('input', { type: 'checkbox', id: 'nohp' }), nohpLab = el('label', { class: 'chk', for: 'nohp' }, [nohp, document.createTextNode('HP未登録のみ(' + r.items.filter(function (x) { return !x.url; }).length + '件)')]);\n    var head = el('div', { class: 'row', style: 'margin-bottom:8px' }, [el('div', { class: 'grow' }, [q]), el('div', { style: 'width:170px;flex:none' }, [ps]), nohpLab]);\n    var count = el('h2', { style: 'margin:0 0 8px;font-size:1.1rem' }), body = el('div', {});\n    function render() {\n      var kw = q.value.trim(), p = ps.value;\n      var rows = r.items.filter(function (it) { return (!p || it.prefecture === p) && (!nohp.checked || !it.url) && (!kw || (it.name + it.city + it.shop).indexOf(kw) >= 0); });\n      count.textContent = '登録済み(' + rows.length + '件' + (rows.length !== r.items.length ? ' / 全' + r.items.length + '件' : '') + ')';\n      body.replaceChildren();\n      rows.slice(0, shown).forEach(function (it) { body.appendChild(summaryRow(it)); });\n      if (rows.length > shown) { var more = el('button', { class: 'ghost', text: 'もっと見る(残り' + (rows.length - shown) + '件)' }); more.onclick = function () { shown += 100; render(); }; body.appendChild(more); }\n      if (!rows.length) body.appendChild(el('p', { class: 'note', text: '該当なし' }));\n    }\n    q.oninput = function () { shown = 50; render(); }; ps.onchange = function () { shown = 50; render(); }; nohp.onchange = function () { shown = 50; render(); };\n    list.appendChild(count); list.appendChild(head); list.appendChild(body); wrap.appendChild(list); render();\n    function summaryRow(it) {\n      var row = el('div', { class: 'item' }, [el('div', { class: 'grow' }, [el('b', { text: it.name }), el('br'), el('span', { class: 'note', text: it.prefecture + ' ' + it.city + (it.shop ? '　屋号: ' + it.shop : '') }), '　', el('span', { class: 'chip' + (it.active ? '' : ' need'), text: it.active ? '有効' : '停止' }), '　', it.url ? el('a', { href: it.url, target: '_blank', rel: 'noopener', text: '不動産HP', style: 'font-size:.875rem' }) : el('span', { class: 'chip need', text: 'HP未登録' })])]);\n      var eb = el('button', { class: 'ghost', text: '編集' });\n      eb.onclick = function () { row.replaceChildren(editRow(it, it.i, false)); };\n      row.appendChild(eb); return row;\n    }\n    function editRow(rec, idx, isNew) {\n      var nm = el('input', { placeholder: '名称(例: ○○工務店株式会社)', value: rec.name || '' }), sel = prefSelect(rec.prefecture || '');\n      var ct = el('input', { placeholder: '市区町村', value: rec.city || '' }), ur = el('input', { placeholder: 'URL(https://…)', value: rec.url || '' });\n      var ck = el('input', { type: 'checkbox' }); ck.checked = rec.active !== false;\n      var sv = el('button', { text: isNew ? '追加' : '保存' });\n      sv.onclick = function () { call('api_fr_save', [idx, { name: nm.value, prefecture: sel.value, city: ct.value, url: ur.value, active: ck.checked }], function () { viewFranchises(); }); };\n      var row = el('div', { class: 'row', style: 'margin:8px 0' }, [el('div', { class: 'grow' }, [nm]), el('div', { style: 'width:150px;flex:none' }, [sel]), el('div', { class: 'grow' }, [ct]), el('div', { class: 'grow' }, [ur]),\n        el('label', { class: 'chk' }, [ck, document.createTextNode('有効')]), sv]);\n      if (!isNew) { var dl = el('button', { class: 'ghost', text: '削除' }); armed(dl, 'もう一度押すと削除', function () { call('api_fr_delete', [idx], function () { viewFranchises(); }); }); row.appendChild(dl); }\n      return row;\n    }\n    $('main').replaceChildren(wrap);\n  });\n}\n\n/* ---- 設定 ---- */\nfunction viewSettings() {\n  cur = null; chrome('設定', false);\n  call('api_settings_get', [], function (r) {\n    var f = {};\n    function line(label, key, val, hint) {\n      f[key] = el('input', { type: 'text', value: val, id: 's_' + key, autocomplete: 'off' });\n      return el('div', { class: 'field' }, [el('label', { text: label, for: 's_' + key }), f[key], hint ? el('div', { class: 'hint', text: hint }) : '']);\n    }\n    var card = el('div', { class: 'card' }, [\n      line('LPの公開URL', 'url', r.url, 'お客様に見せる「LP用」にデプロイしたウェブアプリのURL(https://script.google.com/macros/s/…/exec)。各エリアのLPのURLは、これに ?id=… を付けたものになります'),\n      line('周辺加盟店の最大社数', 'max', r.max, '1〜10'), line('県との差が「同程度」とみなす範囲(ポイント)', 'threshold', r.threshold, '価格推移の文章で「同程度」と判定する範囲'),\n      line('e-Stat アプリケーションID', 'estat', r.estat, '入れると、世帯数が空欄のエリアで国勢調査から自動取得します'),\n      line('AI(Claude)のAPIキー' + (r.aiKeySet ? '(設定済み・変更するときだけ入力)' : '(未設定)'), 'ai', '', '画像の分布表を、内容そのままの表に作り直すために使います。画像はAnthropic社のAPIに送られます。キーはスプレッドシートには保存されません。空のまま保存すると今のキーを残し、「削除」と入力すると消えます')]);\n    var sv = el('button', { text: '保存する' });\n    sv.onclick = function () {\n      call('api_settings_set', [{ url: f.url.value, max: f.max.value, threshold: f.threshold.value, estat: f.estat.value }], function () {\n        var k = f.ai.value.trim();\n        if (!k) { $('msg').textContent = '保存しました'; $('msg').className = 'note'; return; }\n        call('api_ai_set', [k === '削除' ? '' : k], function () { f.ai.value = ''; $('msg').textContent = '保存しました(AIのAPIキーも更新)'; $('msg').className = 'note'; });\n      });\n    };\n    var tb = el('button', { class: 'ghost', text: 'e-Statの接続テスト', style: 'margin-left:8px' });\n    tb.onclick = function () {\n      $('msg').textContent = 'テスト中…'; $('msg').className = 'note';\n      call('api_estat_test', [f.estat.value], function (x) { $('msg').textContent = x.message; $('msg').className = x.ok ? 'note' : 'msg'; });\n    };\n    card.appendChild(sv); card.appendChild(tb); card.appendChild(el('p', { id: 'msg', class: 'note' }));\n    card.appendChild(el('p', { class: 'note', text: 'ログイン中: ' + r.email }));\n    $('main').replaceChildren(card);\n  });\n}\n\n/* ---- ルーティング・起動 ---- */\nfunction route() {\n  var h = location.hash || '', m = /id=([A-Za-z0-9]+)/.exec(h);\n  if (m) viewEdit(m[1]); else if (h === '#fr') viewFranchises(); else if (h === '#set') viewSettings(); else viewList();\n}\nfunction flushNow(next) { clearTimeout(timer); if (Object.keys(dirty).length || saving) { flush(); setTimeout(next, 900); } else next(); }\n$('navlist').onclick = function () { flushNow(function () { location.hash = ''; route(); }); };\n$('navfr').onclick = function () { flushNow(function () { location.hash = 'fr'; route(); }); };\n$('navset').onclick = function () { flushNow(function () { location.hash = 'set'; route(); }); };\nwindow.addEventListener('beforeunload', function (e) { if (Object.keys(dirty).length) { flush(); e.preventDefault(); e.returnValue = ''; } });\nwindow.addEventListener('hashchange', function () { if ($('who').textContent) route(); });\nPREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];\ngoogle.script.run.withSuccessHandler(function (r) { $('who').textContent = r.email; route(); })\n  .withFailureHandler(function (e) {\n    $('main').replaceChildren(el('div', { class: 'card', style: 'max-width:560px;margin:40px auto' }, [el('h2', { text: '入力システムを開けません', style: 'margin-top:0' }), el('p', { class: 'msg', text: String(e && e.message || e).replace(/^Error:\\s*/, '') })]));\n  }).api_whoami();\n</script></body></html>\n";
var STYLE_CSS_ = "/* エリア調査シート LP — ブランド: ティール 0097A7 / 強調: オレンジ FFAB40 */\n:root{\n  --c-teal:#0097A7; --c-deep:#007482; --c-ink:#00606B;\n  --c-teal-300:#9bd5dc; --c-teal-400:#6cc0ca; --c-teal-500:#3fa9b6; --c-teal-600:#0097A7; --c-teal-700:#00798A;\n  --c-accent:#FFAB40; --c-slate:#78909C;\n  --c-text:#212121; --c-sub:#595959; --c-bg:#fff; --c-alt:#F4F7F8; --c-line:#d5dde0;\n  --f: \"Noto Sans JP\",\"Hiragino Kaku Gothic ProN\",\"Hiragino Sans\",Meiryo,\"Yu Gothic\",sans-serif;\n  --wrap:70rem; --r:14px;\n}\n*{box-sizing:border-box}\nhtml{font-size:100%;scroll-behavior:smooth;-webkit-text-size-adjust:100%}\n@media (min-width:1700px){html{font-size:125%}}   /* 大画面・プロジェクター */\n@media (min-width:2400px){html{font-size:150%}}\n@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}\nbody{margin:0;font-family:var(--f);color:var(--c-text);background:var(--c-bg);font-size:1rem;line-height:1.85;\n  font-feature-settings:\"palt\" 1,\"pkna\" 1;line-break:strict;word-break:normal;overflow-wrap:anywhere;text-wrap:pretty;\n  -webkit-font-smoothing:antialiased}\nh1,h2,h3,p{margin:0}\nh2,h3,.kpi-num{line-break:strict;text-wrap:balance}\nimg,svg{max-width:100%;height:auto}\na{color:var(--c-ink)}\n.wrap{max-width:var(--wrap);margin:0 auto;padding:0 20px}\n.num{font-feature-settings:\"tnum\" 1;font-variant-numeric:tabular-nums}\n\n/* nav */\n.nav{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.97);border-bottom:1px solid var(--c-line)}\n.nav .wrap{display:flex;align-items:center;gap:20px;min-height:56px;overflow-x:auto;scrollbar-width:none}\n.nav .wrap::-webkit-scrollbar{display:none}\n.nav img{height:26px;width:auto;flex:none}\n.nav a.i{flex:none;font-size:.875rem;font-weight:500;text-decoration:none;color:var(--c-sub);padding:14px 4px;white-space:nowrap}\n.nav a.i:hover,.nav a.i:focus-visible{color:var(--c-ink);text-decoration:underline}\n\n/* hero */\n.hero{background:var(--c-deep);color:#fff;position:relative;overflow:hidden}\n.hero::after{content:\"\";position:absolute;right:-8%;top:-30%;width:46%;aspect-ratio:1;border-radius:50%;background:var(--c-teal);opacity:.55}\n.hero .wrap{position:relative;z-index:1;display:grid;grid-template-columns:1fr auto;gap:32px;align-items:end;padding-top:56px;padding-bottom:40px}\n.eyebrow{font-weight:700;letter-spacing:.12em;font-size:1rem}\n.hero h1{font-size:clamp(1.75rem,4.4vw,3rem);line-height:1.35;font-weight:700;margin:8px 0 16px}\n.hero h1 small{font-size:.5em;font-weight:500;margin-left:.4em}\n.pill{display:inline-block;background:#fff;color:var(--c-ink);font-weight:700;border-radius:999px;padding:4px 18px;font-size:1.125rem}\n.hero .date{margin-left:14px;font-size:.9375rem}\n.king{width:clamp(120px,18vw,220px);align-self:end;margin-bottom:-40px}\n.conclusions{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:20px}\n.kpi{background:#fff;color:var(--c-text);border-radius:var(--r);padding:16px 20px;display:flex;flex-direction:column;gap:2px}\n.kpi-label{font-size:.875rem;color:var(--c-sub);font-weight:500;line-height:1.5;order:2}\n.kpi-num{order:1;font-weight:700;font-size:clamp(1.75rem,4vw,2.75rem);line-height:1.2;color:var(--c-ink)}\n.kpi-num .u{font-size:.45em;font-weight:500;margin-left:.15em;color:var(--c-sub)}\n.kpi.accent .kpi-num{color:var(--c-text)}\n.kpi.accent{border-bottom:6px solid var(--c-accent)}\n.anchors{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px 10px;margin-top:6px}\n.anchors a{color:#fff;border:1px solid rgba(255,255,255,.7);border-radius:999px;padding:8px 16px;font-size:.875rem;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}\n.anchors a:hover,.anchors a:focus-visible{background:#fff;color:var(--c-ink)}\n\n/* sections */\n.sec{padding:72px 0 56px}\n.sec-no{font-size:.875rem;font-weight:700;letter-spacing:.12em;color:var(--c-ink);margin-bottom:6px}\n.sec h2{font-size:clamp(1.375rem,3vw,2rem);line-height:1.5;font-weight:700;margin-bottom:28px;max-width:34em}\n.sec h2 .em{color:var(--c-ink)}\n.lead{max-width:44em;margin-bottom:28px}\n.src{font-size:.8125rem;color:var(--c-sub);text-align:right;margin-top:24px;line-height:1.6}\n.note{font-size:.8125rem;color:var(--c-sub);line-height:1.7}\n.notes{list-style:none;margin:24px 0 0;padding:0}\n.card{background:#fff;border:1px solid var(--c-line);border-radius:var(--r);padding:24px}\n.grid{display:grid;gap:16px}\n.tgrid{grid-template-columns:repeat(4,1fr)}\n.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}\n.split{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start}\n.kpi.flat{background:#fff;border:1px solid var(--c-line)}\n.sub{font-size:1rem;font-weight:700;margin:0 0 10px}\n.chart{width:100%;display:block}\n.ch-lab{font:500 15px var(--f);fill:var(--c-text)}\n.ch-val{font:700 17px var(--f);fill:var(--c-text);font-feature-settings:\"tnum\" 1}\n.ch-val-lg{font:700 22px var(--f);fill:var(--c-text);font-feature-settings:\"tnum\" 1}\n.ch-unit{font:500 12px var(--f);fill:var(--c-sub)}\n.ch-sub{font:500 13px var(--f);fill:var(--c-sub)}\n\n.chart-c{display:none}\n.dlist{list-style:none;margin:0;padding:0;display:grid;gap:12px}\n.dlist li{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:baseline;font-size:.9375rem}\n.dlist b{font-size:1.25rem}\n.dlist i{grid-column:1/-1;height:10px;border-radius:5px;background:var(--c-teal-400)}\n.dlist li.top i{background:var(--c-accent)}.dlist li.top{font-weight:700}\n/* area */\n.area-map{width:auto;max-width:100%;max-height:560px;margin:0 auto;display:block}\n.area-map .map-other path{fill:#e3ebed;stroke:#fff;stroke-width:1}\n.area-map .map-target path{fill:var(--c-accent);stroke:#fff;stroke-width:1.5}\n.map-legend{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;font-size:.9375rem;color:var(--c-sub);margin:8px 0 0}\n.map-legend .lg{display:inline-block;width:12px;height:12px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);margin-right:6px;vertical-align:-1px}\n.lg-client{background:var(--c-accent)}.lg-fr{background:var(--c-teal-700)}\n.pin-no{font:700 17px var(--f);fill:#fff}\n.fr .pinno{display:inline-flex;align-items:center;justify-content:center;width:1.75rem;height:1.75rem;border-radius:50%;background:var(--c-teal-700);color:#fff;font:700 1rem/1 var(--f);margin-right:10px;vertical-align:middle}\n.map-sub{font:500 12px var(--f);fill:#5f7377;paint-order:stroke;stroke:#fff;stroke-width:3px}\n.map-label{font:700 16px var(--f);fill:var(--c-text);paint-order:stroke;stroke:#fff;stroke-width:4px}\n.fr{list-style:none;margin:0;padding:0;display:grid;gap:10px}\n.fr li{background:#fff;border:1px solid var(--c-line);border-radius:10px;padding:12px 16px;line-height:1.6}\n.fr b{display:block}.fr span{font-size:.875rem;color:var(--c-sub)}\n.fr a{font-size:.875rem;word-break:break-all}\n.empty{color:var(--c-sub);padding:14px 0}\n\n/* heatmap */\n.heat-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}\n.heat{border-collapse:collapse;font-size:.8125rem;min-width:520px;width:100%}\n.heat th,.heat td{border:1px solid var(--c-line);padding:6px 8px;text-align:center;line-height:1.4}\n.heat th{background:var(--c-alt);font-weight:500;color:var(--c-sub);white-space:nowrap}\n.heat td{font-weight:700;font-feature-settings:\"tnum\" 1}\n.heat caption{caption-side:top;text-align:left;font-weight:700;font-size:.9375rem;padding-bottom:8px}\n\n/* summary */\n.big2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}\n.big2 .kpi-num{font-size:clamp(2.25rem,6vw,4rem)}\n.tcard h3{font-size:1.0625rem;border-left:6px solid var(--c-teal);padding-left:10px;margin-bottom:12px}\n.tcard dl{margin:0;display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:.9375rem;line-height:1.5}\n.tcard dt{color:var(--c-sub)}.tcard dd{margin:0;font-weight:700;text-align:right;font-feature-settings:\"tnum\" 1}\n.tcard dd.big{font-size:1.75rem;color:var(--c-ink);line-height:1.2}\n.tcard hr{border:0;border-top:1px solid var(--c-line);grid-column:1/-1;margin:6px 0;width:100%}\n\n/* keywords */\n.kw{width:100%;border-collapse:collapse}\n.kw th{font-size:.875rem;color:var(--c-sub);font-weight:500;text-align:left;padding:8px 12px;border-bottom:2px solid var(--c-line)}\n.kw td{padding:14px 12px;border-bottom:1px solid var(--c-line);vertical-align:middle}\n.kw td.v{font-size:1.5rem;font-weight:700;color:var(--c-ink)}\n.bar{display:block;height:8px;border-radius:4px;background:var(--c-teal-400);margin-top:6px}\n.kw tr:first-child .bar{background:var(--c-accent)}\n@media (max-width:640px){.kw thead{display:none}.kw,.kw tbody,.kw tr,.kw td{display:block}.kw tr{padding:10px 0;border-bottom:1px solid var(--c-line)}.kw td{border:0;padding:2px 0}}\n\n/* point */\n.point{background:var(--c-deep);color:#fff;padding:72px 0}\n.point .wrap{display:grid;grid-template-columns:auto 1fr;gap:40px;align-items:center}\n.point img{width:clamp(110px,16vw,190px)}\n.point .tag{display:inline-block;background:var(--c-accent);color:var(--c-text);font-weight:700;padding:2px 16px;border-radius:6px;letter-spacing:.1em;margin-bottom:12px}\n.point p.t{font-size:clamp(1.25rem,2.8vw,1.875rem);font-weight:700;line-height:1.65;max-width:30em}\n.point p.t b{color:var(--c-accent);font-size:1.25em}\n\n/* competitors */\n.comp .name{font-weight:700;font-size:1.0625rem}\n.comp .cnt{font-size:.9375rem;margin-top:10px}.comp .cnt b{font-size:1.75rem;color:var(--c-ink)}\n.fig{background:#fff;border:1px solid var(--c-line);border-radius:var(--r);padding:12px;margin:0}\n.fig img{width:100%;display:block;border-radius:6px}\n/* お客様が貼った画像(価格推移・分布表)は、少し小さめに中央寄せで表示 */\n.fig img.uimg{width:auto;max-width:min(100%,38rem);margin:0 auto}\n\n/* question */\n.q{text-align:center}\n.q .wrap{display:flex;flex-direction:column;align-items:center;gap:20px}\n.q img.th{width:clamp(180px,24vw,300px)}\n.q h2{margin:0 auto;max-width:22em;font-size:clamp(1.5rem,3.4vw,2.25rem)}\n.btn{display:inline-flex;align-items:center;justify-content:center;min-height:56px;padding:0 36px;border-radius:999px;background:var(--c-accent);color:var(--c-text);font-weight:700;font-size:1.125rem;text-decoration:none;box-shadow:0 2px 0 rgba(0,0,0,.18)}\n.btn:hover,.btn:focus-visible{filter:brightness(.95);outline:3px solid var(--c-text);outline-offset:3px}\n.hero .btn{margin-top:8px}\n\n/* 未入力スロット(管理者向け。取得レポートと対応) */\n.slot{border:2px dashed #b26a00;background:#fff8ec;color:#5a3600;border-radius:10px;padding:14px 18px;font-size:.875rem;line-height:1.7}\n.slot b{display:block;margin-bottom:2px}.slot code{font-size:.8125rem;background:#fff;padding:1px 6px;border-radius:4px;word-break:break-all}\n.draft{background:#5a3600;color:#fff;font-size:.875rem;padding:10px 0;line-height:1.6}\n.draft .wrap{display:flex;gap:12px;flex-wrap:wrap;align-items:center}\n.foot{padding:40px 0 56px;font-size:.8125rem;color:var(--c-sub);background:#fff;border-top:1px solid var(--c-line)}\n.foot p+p{margin-top:6px}\n\n/* motion: JS有効時のみ隠す。reduced-motion では無効 */\n.js .rv{opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease}\n.js .rv.in{opacity:1;transform:none}\n@media (prefers-reduced-motion:reduce){.js .rv{opacity:1;transform:none;transition:none}}\n\n@media (max-width:900px){\n  .g4{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(2,1fr)}.tgrid{grid-template-columns:repeat(2,1fr)}\n  .split{grid-template-columns:1fr}\n}\n@media (max-width:640px){\n  .hero .wrap{grid-template-columns:1fr;padding-top:36px}\n  .king{position:absolute;right:12px;top:-6px;width:96px;margin:0;opacity:1}\n  .hero h1{padding-right:90px}\n  .hero .date{display:block;margin:8px 0 0}\n  .conclusions,.big2,.g2,.g3{grid-template-columns:1fr}\n  .g4{grid-template-columns:repeat(2,1fr)}.g4 .kpi{padding:14px}.tgrid{grid-template-columns:1fr}\n  .heat{min-width:480px}\n  .chart-d{display:none}.chart-c{display:block}\n  .point .wrap{grid-template-columns:1fr;text-align:left}.point img{width:96px}\n  .sec{padding:48px 0 36px}\n  .card{padding:18px}\n  .src{text-align:left}\n}\n\n/* 印刷/PDF: A4横・セクションごとに改ページ */\n@page{size:A4 landscape;margin:9mm}\n@media print{\n  html{font-size:17px}\n  body{-webkit-print-color-adjust:exact;print-color-adjust:exact;line-height:1.6}\n  .nav,.btn,.anchors,.draft{display:none!important}\n  .js .rv{opacity:1!important;transform:none!important}\n  /* スライドのように、1ページに1セクション。背景色をページいっぱいに敷き、内容は上下中央に置いて下の余白を目立たなくする */\n  .hero,.sec,.point,.q{break-before:page;page-break-before:always}\n  .hero,.sec,.point,.q,.foot{break-inside:avoid;page-break-inside:avoid}\n  .hero{break-before:auto;page-break-before:auto}\n  .hero,.sec,.point{min-height:184mm;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center}\n  .q{min-height:150mm;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center}\n  .hero>.wrap,.sec>.wrap,.point>.wrap,.q>.wrap{width:100%}\n  .sec,.point{border-radius:0}\n  .hero .wrap{padding-top:28px;padding-bottom:30px}\n  .sec,.point{padding:6mm 0}\n  .sec h2{margin-bottom:12px}.lead{margin-bottom:12px}\n  .card,.kpi,.fr li{break-inside:avoid}\n  .src{margin-top:10px}\n  .area-map{max-width:none;max-height:128mm}\n  .chart{max-height:96mm;margin:0 auto}\n  #trend .chart{max-height:none}\n  /* 印刷ではグラフ内の文字を大きく */\n  .chart .ch-lab{font-size:17px}.chart .ch-val{font-size:19px}.chart .ch-val-lg{font-size:25px}.chart .ch-sub{font-size:15px}.chart .ch-unit{font-size:14px}\n  .heat{font-size:14px}.heat th,.heat td{padding:5px 8px}\n  .kw td,.kw th{font-size:1rem}\n  .fig img{max-height:100mm;width:auto;margin:0 auto}\n  .fig img.uimg{max-width:min(100%,40rem)}\n  /* 表紙: 文字とキングを大きく */\n  .hero h1{font-size:3rem}.hero h1 small{font-size:.5em}\n  .king{width:200px;margin-bottom:-30px}\n  .kpi-num{font-size:2.2rem}\n  .foot{padding:6mm 0;break-before:avoid;page-break-before:avoid}\n  /* 各ページの内容が小さく見えないよう、セクションごとに拡大率を決める(内容が1ページに収まる範囲で最大に。価格推移は文章とグラフを1ページに収めるため少し縮める) */\n  #top>.wrap{zoom:1.3}#area>.wrap{zoom:1.02}#income>.wrap{zoom:.96}#trend>.wrap{zoom:.8}#land>.wrap{zoom:.92}\n  #used_house>.wrap,#used_mansion>.wrap,#new_house>.wrap{zoom:1}\n  #search>.wrap{zoom:1.3}#summary>.wrap{zoom:1.05}.point>.wrap{zoom:1.3}#competitors>.wrap{zoom:1.4}#listings>.wrap{zoom:1.3}.q>.wrap{zoom:1.15}\n  a{text-decoration:none;color:inherit}\n  /* 印刷はつねにPC幅のレイアウト */\n  .wrap{max-width:none;padding:0 4mm}\n  .g4,.tgrid{grid-template-columns:repeat(4,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g2{grid-template-columns:repeat(2,1fr)}\n  .split{grid-template-columns:1fr 1fr;gap:16px}\n  .conclusions{grid-template-columns:repeat(3,1fr)}.big2{grid-template-columns:1fr 1fr}\n  .hero .wrap{grid-template-columns:1fr auto}.point .wrap{grid-template-columns:auto 1fr}\n  .hero h1{padding-right:0}.king{position:static;width:150px}\n  .chart-d{display:block!important}.chart-c{display:none!important}\n  .area-map{max-height:120mm}\n  .kw thead{display:table-header-group}.kw,.kw tbody{display:table-row-group}.kw tr{display:table-row}.kw td{display:table-cell;padding:6px 10px}\n  .kw{display:table}.kw tbody{display:table-row-group}\n  .sec{padding:4mm 0}.card{padding:12px}\n  .kpi{padding:10px 14px}\n}\n";
var APP_JS_ = "/* スクロールに合わせた控えめなフェードイン / 数字のカウントアップ(reduced-motionでは無効) */\n(function () {\n  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;\n  var els = document.querySelectorAll('.rv');\n  if (reduce || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }\n  function count(el) {\n    var end = parseFloat(el.getAttribute('data-count')); if (isNaN(end)) return;\n    var dec = (String(el.getAttribute('data-count')).split('.')[1] || '').length;\n    var t0 = null, dur = 700, orig = el.textContent;\n    function step(t) { if (!t0) t0 = t; var p = Math.min((t - t0) / dur, 1), v = end * (1 - Math.pow(1 - p, 3));\n      el.textContent = p < 1 ? v.toLocaleString('ja-JP', { maximumFractionDigits: dec, minimumFractionDigits: dec }) : orig;\n      if (p < 1) requestAnimationFrame(step); }\n    requestAnimationFrame(step);\n  }\n  var io = new IntersectionObserver(function (es) {\n    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in');\n      e.target.querySelectorAll('[data-count]').forEach(count); io.unobserve(e.target); } });\n  }, { threshold: 0.12 });\n  els.forEach(function (e) { io.observe(e); });\n  window.addEventListener('beforeprint', function () { els.forEach(function (e) { e.classList.add('in'); }); });\n})();\n";
