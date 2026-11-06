// 商談先の住所のピン(対象エリアの外の住所・郡の町・表記ゆれ)と、相場だけ入力した物件の見出し、SUUMOの区の取得を確認する。出力: JSON
const fs = require('fs');
const vm = require('vm');
const { makeEnv } = require('./mockgas');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = makeEnv(input.geoDir); ctx.__input = input;
const r = vm.runInContext(`(function () {
  var r = {}; setupSheets_(ss_());
  r.has = [addrHasCity_('東郷町, 愛知県', { city: '愛知郡東郷町' }), addrHasCity_('茅ヶ崎市', { city: '茅ケ崎市' }), addrHasCity_('名古屋市, 中区', { city: '名古屋市中区' }), addrHasCity_('岡崎市', { city: '上田市' })];
  r.place = [parseAddrPlace_('長野県東御市本海野1-1'), parseAddrPlace_('愛知県名古屋市中区栄1-1'), parseAddrPlace_('愛知県愛知郡東郷町春木1-1'), parseAddrPlace_('上田市中央1-1'), parseAddrPlace_('中央1-1-1')].map(function (p) { return [p.pref, p.city]; });
  var svc = { cacheGet: function () { return null; }, cachePut: function () {}, fetchJson: fetchJson_, geocode: geocode_ };
  function pin(addr) {
    var cfg = valuesToConfig_({ company: 'テスト', prefecture: '長野県', city: '上田市', 'inputs.client.address': addr }, '2026-01-19');
    var b = buildModel_(cfg, svc, { franchiseRows: [], listingRows: [] });
    return b.model.area.pins.map(function (x) { return [x.kind, x.lat !== null, x.on_map, x.why]; })[0];
  }
  r.inArea = pin('長野県上田市中央1-1-1');
  r.outsideCity = pin('長野県東御市本海野1-1');           // 対象の上田市の外(隣の市)でもピンが立つ
  r.noCityNoPref = pin('中央1-1-1');                        // 市区町村が書かれていなければ対象エリアとみなす
  r.street = pin('栄町1-2-3');                              // 「栄町」は町名。対象エリアの住所とみなす
  // 相場だけ入っていて物件数が空でも、見出しに相場が出る
  var cfg = valuesToConfig_({ company: 'テスト', prefecture: '長野県', city: '上田市', 'inputs.used_house.price_man': '3550' }, '2026-01-19');
  var b = buildModel_(cfg, svc, { franchiseRows: [], listingRows: [] });
  var html = renderPage_(b.model, b.report, ASSETS, STYLE_CSS_);
  r.heading = html.indexOf('中古戸建ての相場は<span class="em">3,550万円</span></h2>') >= 0 && html.indexOf('中古戸建ての価格相場・物件数</h2>') < 0;
  // SUUMO: 区は、県のページに無くても市のページから見つける
  var pageP = '<a href="/baikyaku/aichi/sa_nagoya/top/">名古屋市</a><a href="/baikyaku/aichi/sc_okazaki/top/">岡崎市</a>';
  var pageC = '<a href="https://suumo.jp/baikyaku/aichi/sc_nagoyashinaka/top/">名古屋市中区</a>';
  var fx = ${JSON.stringify(fs.readFileSync(require('path').join(__dirname, '..', '..', 'tests', 'fixtures', 'suumo_baikyaku_aichi_nagoya_excerpt.html'), 'utf8'))};
  var urls = [];
  var f = function (u) { urls.push(u); var body = u === 'https://suumo.jp/baikyaku/aichi/' ? pageP : /sa_nagoya/.test(u) ? pageC : fx; return { getResponseCode: function () { return 200; }, getContentText: function () { return body; } }; };
  var lk = suumoLookup_('愛知県', '名古屋市中区', f, null);
  r.ward = [lk.url, urls.length, lk.values['inputs.land.tsubo_price_man']];
  return r;
})()`, ctx);
console.log(JSON.stringify(r));
