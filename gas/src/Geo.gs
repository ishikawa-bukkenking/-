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

function renderMapSvg_(P, target, focus) {   // focus: 市区町村名の配列を渡すと、それらだけを拡大して描く(ピン用)
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
  var cacheKey = 'geo4:' + pref + ':' + city;
  var hit = services.cacheGet(cacheKey);
  if (hit) return JSON.parse(hit);
  var geojson = services.fetchJson(GEO_URL_.replace('{code}', ('0' + prefCode_(pref)).slice(-2)));
  var P = buildPrefecture_(pref, geojson);
  var name = resolveCity_(P, city);
  var res = { city: name, code: P.munis[name].code, count: P.names.length, neighbors: neighborsOf_(P, name) };
  var m = renderMapSvg_(P, name); res.svg = m.svg; res.proj = m.proj;
  var z = renderMapSvg_(P, name, [name].concat(res.neighbors)); res.zsvg = z.svg; res.zproj = z.proj;
  services.cachePut(cacheKey, JSON.stringify(res));
  return res;
}
