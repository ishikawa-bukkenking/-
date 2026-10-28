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

function renderMapSvg_(P, target, focus) {   // target: 強調する市区町村名(複数なら配列)。focus: 名前の配列を渡すと、それらだけを拡大して描く(ピン用)
  var T = [].concat(target), width = 640, rings = [];
  viewNames_(P, T[0]).forEach(function (name) {
    P.munis[name].polys.forEach(function (poly) {
      var ac = ringAreaCentroid_(poly[0]);
      rings.push({ name: name, poly: poly, area: ac[0], cx: ac[1], cy: ac[2] });
    });
  });
  var tot = rings.reduce(function (s, r) { return s + r.area; }, 0) || 1;
  var mx = rings.reduce(function (s, r) { return s + r.cx * r.area; }, 0) / tot;
  var my = rings.reduce(function (s, r) { return s + r.cy * r.area; }, 0) / tot;
  var keep = focus ? rings.filter(function (r) { return focus.indexOf(r.name) >= 0; }) : rings.filter(function (r) { return Math.hypot(r.cx - mx, r.cy - my) < 5.0 || T.indexOf(r.name) >= 0; });
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
    (T.indexOf(r.name) >= 0 ? tgt : other).push('<path d="' + d + '"/>');
  });
  var lab = '', tlabels = [];   // 選んだ市区町村の名前は、ピンに隠れないよう、ピンを描いたあとに置く(addPinsToSvg_)
  T.forEach(function (name) {
    var best = 0, cxT = null, cyT = null;
    keep.forEach(function (r) { if (r.name === name && r.area > best) { best = r.area; cxT = r.cx; cyT = r.cy; } });
    var t = cxT !== null ? pt(cxT, cyT).split(',') : ['0', '0'];
    tlabels.push({ name: name, x: parseFloat(t[0]), y: parseFloat(t[1]) });
  });
  if (focus) {   // 拡大図では、周りの市町村名も小さく添える
    var big = {};
    keep.forEach(function (r) { if (T.indexOf(r.name) < 0 && (!big[r.name] || r.area > big[r.name].area)) big[r.name] = r; });
    Object.keys(big).forEach(function (n) { var q = pt(big[n].cx, big[n].cy).split(','); lab += '<text class="map-sub" x="' + q[0] + '" y="' + q[1] + '" text-anchor="middle">' + esc_(n) + '</text>'; });
  }
  var svg = '<svg class="area-map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' +
    esc_(P.pref) + 'の地図。' + esc_(T.join('・')) + 'を強調表示"><g class="map-other">' + other.join('') + '</g><g class="map-target">' + tgt.join('') + '</g>' + lab + '</svg>';
  return { svg: svg, labels: tlabels, proj: { lon0: lon0, lat1: lat1, k: k, scale: scale, pad: pad, width: width, height: height } };
}

/** 緯度経度 → 地図上の座標。地図の範囲外ならnull */
function projectPoint_(proj, lat, lon) {
  var x = (lon - proj.lon0) * proj.k * proj.scale + proj.pad, y = (proj.lat1 - lat) * proj.scale + proj.pad;
  if (!(x >= 0 && x <= proj.width && y >= 0 && y <= proj.height)) return null;
  return [x, y];
}

/**
 * 地図SVGにピンと、選んだ市区町村の名前を描く。
 * - ピン同士が重ならないよう、近いものは少しずらす(元の位置には小さな点と細い線を残す)
 * - 市区町村の名前は、ピンに隠れない位置(上・下・左右)を選んで、ピンより手前に描く
 * pins: [{kind:'client'|'fr', n, name, x, y}] / labels: [{name, x, y}]
 */
function addPinsToSvg_(svg, pins, labels) {
  labels = labels || [];
  if (!pins.length && !labels.length) return svg;
  var vb = String(svg).match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), W = vb ? parseFloat(vb[1]) : 640, H = vb ? parseFloat(vb[2]) : 480;
  var P = pins.map(function (p) {
    var client = p.kind === 'client', r = client ? 18 : 17;
    return { p: p, r: r, ox: p.x, oy: p.y, x: p.x, y: p.y, client: client };
  });
  // ピンの頭(丸い部分)の中心は、先端の真上 2.1r の位置。頭同士が重ならなくなるまで、少しずつ離す
  function head(q) { return [q.x, q.y - q.r * 2.1]; }
  for (var it = 0; it < 80; it++) {
    var moved = false;
    for (var i = 0; i < P.length; i++) for (var j = i + 1; j < P.length; j++) {
      var a = P[i], b = P[j], ha = head(a), hb = head(b), dx = hb[0] - ha[0], dy = hb[1] - ha[1], d = Math.sqrt(dx * dx + dy * dy), need = a.r + b.r + 4;
      if (d < need) {
        if (d < 0.01) { dx = (j % 2 ? 1 : -1); dy = 0.3; d = 1; }
        var push = (need - d) / 2 + 0.5, ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push; moved = true;
      }
    }
    P.forEach(function (q) { q.x = Math.min(Math.max(q.x, q.r + 2), W - q.r - 2); q.y = Math.min(Math.max(q.y, q.r * 2.1 + 2), H - 2); });
    if (!moved) break;
  }
  var under = [], out = [];
  P.forEach(function (q) {
    var dist = Math.hypot(q.x - q.ox, q.y - q.oy);
    if (dist > 6) under.push('<line x1="' + q.ox.toFixed(1) + '" y1="' + q.oy.toFixed(1) + '" x2="' + q.x.toFixed(1) + '" y2="' + q.y.toFixed(1) + '" stroke="#37474f" stroke-width="1.5"/>' +
      '<circle cx="' + q.ox.toFixed(1) + '" cy="' + q.oy.toFixed(1) + '" r="3.5" fill="#fff" stroke="#37474f" stroke-width="1.5"/>');
  });
  P.forEach(function (q) {
    var p = q.p, r = q.r, fill = q.client ? 'var(--c-accent)' : 'var(--c-teal-700)', x = q.x.toFixed(1), y = q.y.toFixed(1);
    // 先端が(x,y)に来るしずく型のピン
    var d = 'M' + x + ',' + y + 'c' + (-r * 0.2) + ',' + (-r * 0.9) + ' ' + (-r) + ',' + (-r * 1.2) + ' ' + (-r) + ',' + (-r * 2.1) + 'a' + r + ',' + r + ' 0 1,1 ' + (2 * r) + ',0c0,' + (r * 0.9) + ' ' + (-r * 0.8) + ',' + (r * 1.2) + ' ' + (-r) + ',' + (r * 2.1) + 'z';
    var cy = (q.y - r * 2.1 + r * 0.05).toFixed(1);
    var g = '<g class="pin ' + (q.client ? 'pin-client' : 'pin-fr') + '"><title>' + esc_(p.name) + '</title><path d="' + d + '" fill="' + fill + '" stroke="#fff" stroke-width="2"/>' +
      (q.client ? '<circle cx="' + x + '" cy="' + cy + '" r="5" fill="#fff"/>' : '<text x="' + x + '" y="' + (parseFloat(cy) + 6) + '" text-anchor="middle" class="pin-no">' + p.n + '</text>');
    if (q.client && p.label !== '') g += '<text x="' + (q.x + r + 4).toFixed(1) + '" y="' + (parseFloat(cy) + 5) + '" class="map-label">御社</text>';
    out.push({ client: q.client, html: g + '</g>' });
  });
  // 後ろ(下)のピンから描いて、手前のピンが隠れないようにする。御社は最前面
  out.sort(function (a, b) { return (a.client ? 1 : 0) - (b.client ? 1 : 0); });
  // 市区町村名: ピンの頭・先に置いた名前と重ならない位置を、上→下→右→左の順に探す
  var boxes = P.map(function (q) { var h = head(q); return [h[0] - q.r - 2, h[1] - q.r - 2, h[0] + q.r + 2, h[1] + q.r + q.r * 1.1 + 2]; });
  function hit(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
  var lab = [];
  labels.forEach(function (l) {
    var w = l.name.length * 16 + 8, h = 20, best = null, bestScore = 1e9;
    [[0, -12], [0, 28], [w / 2 + 6, 6], [-w / 2 - 6, 6], [0, -34], [0, 50]].forEach(function (c) {
      var cx = Math.min(Math.max(l.x + c[0], w / 2 + 2), W - w / 2 - 2), by = Math.min(Math.max(l.y + c[1], h + 2), H - 2), box = [cx - w / 2, by - h, cx + w / 2, by + 4], sc = 0;
      boxes.forEach(function (b) { if (hit(box, b)) sc += 100; });
      if (sc === 0 && best === null) { best = { x: cx, y: by, box: box }; bestScore = 0; }
      else if (best === null || (bestScore > 0 && sc < bestScore)) { best = { x: cx, y: by, box: box }; bestScore = sc; }
    });
    boxes.push(best.box);
    lab.push('<text class="map-label" x="' + best.x.toFixed(1) + '" y="' + best.y.toFixed(1) + '" text-anchor="middle">' + esc_(l.name) + '</text>');
  });
  return svg.replace('</svg>', under.join('') + out.map(function (o) { return o.html; }).join('') + lab.join('') + '</svg>');
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
  var m = renderMapSvg_(P, name); res.svg = m.svg; res.proj = m.proj; res.labels = m.labels;
  var z = renderMapSvg_(P, name, [name].concat(res.neighbors)); res.zsvg = z.svg; res.zproj = z.proj; res.zlabels = z.labels;
  services.cachePut(cacheKey, JSON.stringify(res));
  return res;
}

/** 同じ都道府県の複数エリアを、1枚の地図に強調表示する(会社の2エリア目以降を追加したとき)。結果はキャッシュ */
function loadGeoMulti_(services, pref, cities) {
  var key = 'geom:' + pref + ':' + cities.slice().sort().join(',');
  var hit = services.cacheGet(key);
  if (hit) return JSON.parse(hit);
  var P = buildPrefecture_(pref, services.fetchJson(GEO_URL_.replace('{code}', ('0' + prefCode_(pref)).slice(-2))));
  var names = cities.map(function (c) { return resolveCity_(P, c); }).filter(function (n, i, a) { return a.indexOf(n) === i; });
  var focus = names.slice();
  names.forEach(function (n) { neighborsOf_(P, n).forEach(function (x) { if (focus.indexOf(x) < 0) focus.push(x); }); });
  var f = renderMapSvg_(P, names), z = renderMapSvg_(P, names, focus);
  var res = { cities: names, svg: f.svg, proj: f.proj, labels: f.labels, zsvg: z.svg, zproj: z.proj, zlabels: z.labels };
  services.cachePut(key, JSON.stringify(res));
  return res;
}
