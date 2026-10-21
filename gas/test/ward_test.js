// 政令指定都市の区・東京23区を選べること、比較の並び(選んだ市区町村が左・オレンジ)を、Googleのサービスを模擬して確認する。
// 入力(JSON, stdin): { geoDirAichi, geoDirTokyo, frRows }  出力: JSON
const fs = require('fs');
const vm = require('vm');
const { makeEnv } = require('./mockgas');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function run(geoDir, code) {
  const ctx = makeEnv(geoDir); ctx.__input = input;
  return vm.runInContext('(function () { var r = {}; setupSheets_(ss_());\n' + code + '\nreturn r; })()', ctx);
}
const aichi = run(input.geoDirAichi, `
  function tryCall(f) { try { return { ok: f() }; } catch (e) { return { err: String(e.message) }; } }
  var P = buildPrefecture_('愛知県', fetchJson_(GEO_URL_.replace('{code}', '23')));
  r.hasCity = !!P.munis['名古屋市'] && !!P.munis['名古屋市中区'] && P.munis['名古屋市'].agg === true && P.munis['名古屋市中区'].ward === true;
  r.count = P.count; r.namesN = P.names.length;
  r.wards = P.names.filter(function (n) { return P.munis[n].ward; }).length;
  r.resolve = [resolveCity_(P, '名古屋市中区'), resolveCity_(P, '名古屋市'), resolveCity_(P, '岡崎市'), resolveCity_(P, '名古屋市 中区')];
  r.resolveShort = tryCall(function () { return resolveCity_(P, '中区'); });      // 中区は名古屋・浜松など複数 → 候補つきエラー
  r.resolveBad = tryCall(function () { return resolveCity_(P, '名古屋市存在しない区'); }).err.indexOf('見つかりません') >= 0;
  var nb = neighborsOf_(P, '名古屋市中区'), nbCity = neighborsOf_(P, '名古屋市');
  r.wardNeighbors = nb.slice(0, 4); r.wardNbNoAgg = nb.indexOf('名古屋市') < 0 && nb.every(function (n) { return !P.munis[n].agg; });
  r.cityNbNoWard = nbCity.every(function (n) { return !P.munis[n].ward; }) && nbCity.length > 0;
  r.codes = [P.munis['名古屋市'].code, P.munis['名古屋市中区'].code];
  var g = loadGeo_({ cacheGet: function () { return null; }, cachePut: function () {}, fetchJson: fetchJson_ }, '愛知県', '名古屋市中区');
  r.geo = [g.city, g.code, g.count, g.neighborCities.indexOf('名古屋市') >= 0, g.svg.indexOf('area-map') > 0, g.zsvg.indexOf('map-target') > 0];
  var gc = loadGeo_({ cacheGet: function () { return null; }, cachePut: function () {}, fetchJson: fetchJson_ }, '愛知県', '名古屋市');
  r.geoCity = [gc.city, gc.code, gc.count === g.count];
  // 区を選んだ地域でLPが作れる。加盟店は、住所に区が入っているものが「同じ市区」
  var rows = __input.frRows.concat([
    { name: '中区の会社', prefecture: '愛知県', city: '名古屋市', address: '愛知県名古屋市中区栄1-1-1', url: '' },
    { name: '千種区の会社', prefecture: '愛知県', city: '名古屋市', address: '愛知県名古屋市千種区今池1-1-1', url: '' }]);
  var cfgW = valuesToConfig_({ company: 'テスト', prefecture: '愛知県', city: '名古屋市中区' }, '2026-01-19');
  var b = buildModel_(cfgW, { cacheGet: function () { return null; }, cachePut: function () {}, fetchJson: fetchJson_ }, { franchiseRows: rows, listingRows: [] });
  r.model = [b.model.meta.city, b.model.area.franchise.items.map(function (f) { return f.name; })[0], b.model.area.franchise.tiers_used.join(',')];
  var html = renderPage_(b.model, b.report, ASSETS, STYLE_CSS_);
  r.lpWard = html.indexOf('名古屋市中区を商圏') >= 0 && html.indexOf('.sec.alt{') < 0 && html.indexOf('--c-alt)}') < 0;   // 区の名前で作れる/グレーの区切りのCSSは無い
  // 区の住所でもピンが立つ(Googleマップは市と区を別の要素で返す)/区を選んだ地図は拡大図
  var cfgP = valuesToConfig_({ company: 'テスト', prefecture: '愛知県', city: '名古屋市中区', 'inputs.client.address': '愛知県名古屋市中区栄1-1-1' }, '2026-01-19');
  var svcP = { cacheGet: function () { return null; }, cachePut: function () {}, fetchJson: fetchJson_, geocode: geocode_ };
  var bp = buildModel_(cfgP, svcP, { franchiseRows: [], listingRows: [] });
  r.wardPin = bp.model.area.pins.length === 1 && bp.model.area.pins[0].on_map === true && bp.model._mapSvg.indexOf('pin-client') > 0;
  r.wardZoom = bp.model._mapSvg.indexOf('class="map-sub"') > 0;
  var bn = buildModel_(cfgW, svcP, { franchiseRows: [], listingRows: [] });
  r.wardZoomNoPin = bn.model._mapSvg.indexOf('class="map-sub"') > 0;
  r.addrCity = [addrHasCity_('名古屋市, 中区, 愛知県', { city: '名古屋市中区' }), addrHasCity_('名古屋市, 千種区', { city: '名古屋市中区' }), addrHasCity_('上田市', { city: '上田市' })];
  // 比較: 選んだ市区町村は一番左でオレンジ
  var cfgC = valuesToConfig_({ company: 'テスト', prefecture: '愛知県', city: '岡崎市', 'compare.0': '名古屋市,40', 'compare.1': '豊田市,30', 'compare.2': '岡崎市,25', 'compare.3': '一宮市,', 'inputs.land.tsubo_price_man': '25' }, '2026-01-19');
  var b2 = buildModel_(cfgC, { cacheGet: function () { return null; }, cachePut: function () {}, fetchJson: fetchJson_ }, { franchiseRows: [], listingRows: [] });
  var h2 = renderPage_(b2.model, b2.report, ASSETS, STYLE_CSS_), i = h2.indexOf('aria-label="坪単価(万円/坪)の比較"'), seg = h2.slice(i, h2.indexOf('</svg>', i));
  var labels = (seg.match(/class="ch-lab"[^>]*>([^<]+)</g) || []).map(function (x) { return x.replace(/.*>([^<]+)<$/, '$1'); });
  r.cmpOrder = labels; r.cmpOrange = seg.indexOf('var(--c-accent)') >= 0 && (seg.match(/var\\(--c-accent\\)/g) || []).length === 1;
  r.cmpFirstOrange = seg.indexOf('var(--c-accent)') < seg.indexOf('var(--c-teal-400)');   // 一番左の棒がオレンジ
  r.cmpBlankSkipped = labels.indexOf('一宮市') < 0;
`);
const tokyo = run(input.geoDirTokyo, `
  var P = buildPrefecture_('東京都', fetchJson_(GEO_URL_.replace('{code}', '13')));
  r.shinjuku = resolveCity_(P, '新宿区'); r.count = P.count; r.hasAgg = P.names.some(function (n) { return P.munis[n].agg; });
`);
console.log(JSON.stringify({ aichi, tokyo }));
