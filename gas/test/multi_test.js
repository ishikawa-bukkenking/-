// 会社の複数エリアを1つのLPにまとめる(同じ都道府県/違う都道府県)を、Googleのサービスを模擬して確認する。
// 入力(JSON, stdin): { values, geoDir(長野と愛知の境界を両方置いたフォルダ) }  出力: JSON
const fs = require('fs');
const vm = require('vm');
const { makeEnv } = require('./mockgas');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = makeEnv(input.geoDir); ctx.__input = input;
const r = vm.runInContext(`(function () {
  var r = {}; setupSheets_(ss_()); __setEmail('ishikawa@bukkenking.com');
  var vals = JSON.parse(JSON.stringify(__input.values)); delete vals.company; delete vals.prefecture; delete vals.city;
  var c = api_create_company('株式会社複数', '長野県', '上田市'), a1 = c.areaId;
  api_save(a1, Object.assign({}, vals, { 'inputs.client.address': '長野県上田市中央1-1-1' }));
  var a2 = api_add_area(c.companyId, '長野県', '東御市').areaId;
  api_save(a2, Object.assign({}, vals, { 'inputs.client.address': '長野県東御市本海野1-1', 'inputs.area.households': '12000' }));
  var lp = doGet({ parameter: { id: a1 } }).html, lp2 = doGet({ parameter: { id: a2 } }).html;
  var idx = function (s) { return lp.indexOf(s); };
  r.same = lp === lp2;
  r.order = ['area', 'income', 'trend', 'land', 'used_house', 'used_mansion', 'new_house', 'search', 'summary', 'point'].map(function (k) { return idx('id="' + k + '"'); }).every(function (v, n, a) { return v > 0 && (n === 0 || v > a[n - 1]); });
  r.ids = ['income', 'trend', 'land', 'used_house', 'used_mansion', 'new_house', 'search', 'summary'].every(function (k) { var sec = lp.slice(idx('id="' + k + '"')); sec = sec.slice(0, sec.indexOf('</section>')); return (lp.match(new RegExp('id="' + k + '(-2)?"', 'g')) || []).length === 1 && (sec.match(/class="areablk"/g) || []).length === 2 && sec.indexOf('class="areatag">上田市<') > 0 && sec.indexOf('class="areatag">上田市<') < sec.indexOf('class="areatag">東御市<'); });
  r.once = ['point', 'competitors', 'listings', 'question', 'area'].every(function (k) { return (lp.match(new RegExp('id="' + k + '"', 'g')) || []).length === 1; });
  r.labels = lp.indexOf('class="sec-no">04　土地<') >= 0 && lp.indexOf('class="sec-no">08　検索ボリューム<') >= 0 && lp.indexOf('class="sec-no">09　物件総数・売却相場まとめ<') >= 0 && lp.indexOf('（東御市）') < 0;   // 連番は項目ごとに1回
  r.heading = lp.indexOf('上田市・東御市を商圏に、合計<span class="em">82,809世帯</span>') >= 0;
  r.hero = lp.indexOf('長野県　上田市・東御市') >= 0 && lp.indexOf('<title>エリア調査シート｜株式会社複数 御中｜上田市・東御市</title>') >= 0;
  var areaSvg = lp.slice(lp.indexOf('<svg class="area-map"'), lp.indexOf('</svg>', lp.indexOf('<svg class="area-map"')));
  r.oneMap = (lp.match(/<svg class="area-map"/g) || []).length === 1 && (areaSvg.match(/class="map-label"[^>]*>(上田市|東御市)</g) || []).length === 2 && areaSvg.indexOf('上田市') > 0 && areaSvg.indexOf('東御市') > 0;
  r.pinsBoth = (areaSvg.match(/class="pin pin-client"/g) || []).length === 2 && lp.indexOf('<p class="map-legend">') > 0;
  r.pointSum = lp.indexOf('約830件') >= 0;   // 414件×2エリア=828件 → 切り上げ
  r.nav = lp.indexOf('href="#income"') >= 0 && lp.indexOf('href="#trend"') >= 0 && lp.indexOf('href="#summary"') >= 0 && lp.indexOf('href="#income-2"') < 0 && lp.indexOf('調査<') < 0;
  var frItems = lp.split('class="fr fr-all"')[1].split('</ul>')[0].split('<li>').length - 1;
  r.frUnion = frItems >= 10 && lp.indexOf('長野県の物件王加盟店（' + frItems + '社）') >= 0;
  // 単一エリアの会社は、これまでどおり1エリアのページ
  var s1 = api_create_company('株式会社単独', '長野県', '上田市').areaId; api_save(s1, vals);
  var ls = doGet({ parameter: { id: s1 } }).html;
  r.single = ls.indexOf('id="income-2"') < 0 && ls.indexOf('href="#trend"') > 0 && ls.indexOf('合計') < 0 && ls.indexOf('を商圏に') > 0;
  // 2エリア目を消すと1エリアに戻る
  api_delete_area(a2); r.back = doGet({ parameter: { id: a1 } }).html.indexOf('id="income-2"') < 0;
  // 違う都道府県(長野県+愛知県)は、都道府県ごとに地図が並ぶ
  var a3 = api_add_area(c.companyId, '愛知県', '岡崎市').areaId;
  api_save(a3, Object.assign({}, vals, { 'inputs.area.households': '150000', 'inputs.client.address': '愛知県岡崎市十王町2-9' }));
  var l3 = doGet({ parameter: { id: a1 } }).html;
  r.twoPref = (l3.match(/<svg class="area-map"/g) || []).length === 2 && l3.indexOf('長野県　上田市') >= 0 && l3.indexOf('愛知県　岡崎市') >= 0 && l3.indexOf('長野県・愛知県の物件王加盟店') >= 0;
  var maps3 = l3.split('<svg class="area-map"').slice(1).map(function (x) { return x.slice(0, x.indexOf('</svg>')); });
  r.twoPinsEach = maps3.every(function (m) { return (m.match(/class="pin pin-client"/g) || []).length === 1; });
  // 地図の取得に失敗しても落ちない
  r.noCrash = true;
  r.urlIndex = (function () { var sh = ss_().getSheetByName('商談先一覧'); var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues().filter(function (x) { return x[0] === '株式会社複数'; }); return rows.length === 2 && rows.every(function (x) { return String(x[3]).indexOf('?id=' + a1) > 0; }); })();
  return r;
})()`, ctx);
console.log(JSON.stringify(r));
