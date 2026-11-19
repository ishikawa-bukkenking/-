// 路線・駅版(パターン2)を、Googleのサービスを模擬して確認する。入力(JSON, stdin): { geoDir } 出力: JSON
const fs = require('fs');
const vm = require('vm');
const { makeEnv } = require('./mockgas');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = makeEnv(input.geoDir); ctx.__input = input;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
ctx.__png = PNG;
const r = vm.runInContext(`(function () {
  var r = {}; setupSheets_(ss_()); __setEmail('ishikawa@bukkenking.com');
  PropertiesService.getScriptProperties().setProperty('ANTHROPIC_KEY', 'sk-ant-testtesttesttesttesttest');
  var std = api_create_company('株式会社標準', '長野県', '上田市'), stn = api_create_company('株式会社駅', '長野県', '上田市', 'station');
  var gs = api_get(std.areaId), gt = api_get(stn.areaId);
  var keys = function (g) { return g.fields.filter(function (f) { return f.k; }).map(function (f) { return f.k; }); };
  r.pattern = [gs.pattern, gt.pattern];
  r.fields = [keys(gs).indexOf('inputs.used_house.listings') >= 0, keys(gs).some(function (k) { return /station_image/.test(k); }),
              keys(gt).indexOf('inputs.used_house.listings') >= 0, keys(gt).filter(function (k) { return /station_image/.test(k); }).length];
  var base = { 'inputs.area.households': '12000', 'inputs.used_house.price_man': '3550', 'inputs.land.tsubo_price_man': '25', 'inputs.land.price_man': '3310' };
  api_save(stn.areaId, base);
  // 手入力
  var sv = api_saveTable(stn.areaId, 'inputs.used_house.station_image', { lines: ['JR中央線', 'JR中央線', '', ''], rows: ['上田駅', '西上田駅', '', ''], cells: [['120'], ['35'], [''], ['']] });
  r.save = [sv.total, sv.table.rows, sv.table.lines];
  var bad; try { api_saveTable(stn.areaId, 'inputs.used_house.station_image', { lines: ['A'], rows: ['B'], cells: [['x']] }); bad = ''; } catch (e) { bad = e.message; } r.bad = bad.indexOf('整数') >= 0;
  var bad2; try { api_saveTable(stn.areaId, 'inputs.used_house.station_image', { lines: [''], rows: [''], cells: [['5']] }); bad2 = ''; } catch (e) { bad2 = e.message; } r.bad2 = bad2.indexOf('路線名か駅名') >= 0;
  var b = buildArea_(stn.areaId), m = b.model;
  r.listings = [m.used_house.listings, m.pattern, m.totals.listings_total];
  r.html = [b.html.indexOf('class="stn-blk"') > 0, b.html.indexOf('JR中央線') > 0, b.html.indexOf('上田駅') > 0, b.html.indexOf('合計 <b>155件</b>') > 0, b.html.indexOf('中古戸建ての相場は<span class="em">3,550万円</span>、物件数は<span class="em">155件</span>') > 0];
  r.stdHtml = buildArea_(std.areaId).html.indexOf('stn-blk"') < 0 && buildArea_(std.areaId).html.indexOf('class="stn-blk"') < 0;
  r.missing = buildArea_(stn.areaId).report.missing().map(function (i) { return i.key; }).filter(function (k) { return /stations|listings/.test(k); }).sort();
  // 画像を貼る → AIが路線・駅の表にする
  api_uploadImage(stn.areaId, 'inputs.land.station_image', __png);
  var t = api_readTable(stn.areaId, 'inputs.land.station_image', true);
  r.ai = [t.rows, t.lines, t.cells, t.total, t.warnings.length];
  var m2 = buildArea_(stn.areaId).model;
  r.land = [m2.land.listings, !!m2.land.stations, JSON.stringify(m2).indexOf('station_image') < 0];
  // 路線・駅版の会社に追加したエリアも同じパターン/会社の複製も引き継ぐ
  var a2 = api_add_area(stn.companyId, '長野県', '東御市').areaId, dup = api_duplicate_company(stn.companyId, '複製');
  r.inherit = [api_get(a2).pattern, api_get(dup.areaIds[0]).pattern, !!api_get(dup.areaIds[0]).tables['inputs.used_house.station_image']];
  // 複数エリアのLPにも路線・駅の表が入る
  api_save(a2, base); api_saveTable(a2, 'inputs.used_house.station_image', { lines: ['しなの鉄道'], rows: ['大屋駅'], cells: [['40']] });
  var lp = doGet({ parameter: { id: stn.areaId } }).html;
  r.multi = [(lp.match(/class="stn-blk"/g) || []).length >= 2, lp.indexOf('大屋駅') > 0, lp.indexOf('上田駅') > 0];
  // 標準版の入力は、いままでどおり物件数
  api_save(std.areaId, Object.assign({}, base, { 'inputs.used_house.listings': '300' }));
  r.std = buildArea_(std.areaId).model.used_house.listings;
  // 権限
  __setEmail('x@gmail.com'); try { api_saveTable(stn.areaId, 'inputs.used_house.station_image', { lines: ['A'], rows: ['B'], cells: [['1']] }); r.denied = false; } catch (e) { r.denied = true; }
  return r;
})()`, ctx);
console.log(JSON.stringify(r));
