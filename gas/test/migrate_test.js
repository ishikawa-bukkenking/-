// 旧システム → 新システムのデータ移行(書き出し→取り込み)を、2つの模擬環境で確認する。出力: JSON
const vm = require('vm');
const { makeEnv } = require('./mockgas');
const A = makeEnv(null), B = makeEnv(null), r = {};
const run = (c, code) => vm.runInContext(code, c);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
run(A, "setupSheets_(ss_()); __setEmail('ishikawa@bukkenking.com')");
A.__png = PNG;
const ids = run(A, `(function () {
  var c = api_create_company('株式会社移行', '長野県', '上田市'); api_save(c.areaId, { 'inputs.area.households': '12000', 'inputs.client.address': '長野県上田市中央1-1-1' });
  api_uploadImage(c.areaId, 'inputs.used_house.heatmap_image', __png);
  api_fr_save(-1, { name: '移行テスト店', prefecture: '長野県', city: '上田市', address: '長野県上田市中央2-2-2', url: '' });
  var a2 = api_add_area(c.companyId, '長野県', '東御市').areaId;
  return { company: c.companyId, area: c.areaId, area2: a2, fr: api_fr_list().items.length };
})()`);
const data = JSON.parse(JSON.stringify(run(A, 'api_export_all()')));
r.export = [data.sheets['会社'].length, data.sheets['エリア'].length, data.sheets['加盟店一覧'].length, Object.keys(data.files).length, data.missingFiles.length];
run(B, "setupSheets_(ss_()); __setEmail('ishikawa@bukkenking.com')");
B.__d = data;
const out = run(B, `(function () {
  var seed = api_fr_list().items.length, o = {};
  o.res = api_import_all(__d);
  var l = api_list(); o.list = l.companies.map(function (c) { return [c.name, c.areas.map(function (a) { return a.city; })]; });
  var v = api_get(${JSON.stringify(ids.area)}).values;
  o.val = [v['inputs.area.households'], v['inputs.client.address']];
  o.img = /^drive:/.test(v['inputs.used_house.heatmap_image']) && v['inputs.used_house.heatmap_image'] !== __d.sheets['エリア'][0][8];
  o.imgReadable = !!imageDataUri_(v['inputs.used_house.heatmap_image']);
  o.fr = api_fr_list().items.length; o.frHas = api_fr_list().items.some(function (f) { return f.name === '移行テスト店'; });
  o.lp = doGet({ parameter: { id: ${JSON.stringify(ids.area)} } }).html.indexOf('株式会社移行') > 0;
  o.again = api_import_all(__d);   // もう一度取り込んでも重複しない
  o.companiesAfter = api_list().companies.length;
  var bad; try { api_import_all({ x: 1 }); bad = ''; } catch (e) { bad = String(e.message); } o.bad = bad.indexOf('書き出した') >= 0;
  __setEmail('x@gmail.com'); try { api_import_all(__d); o.denied = false; } catch (e) { o.denied = true; }
  return o;
})()`);
r.out = out;
console.log(JSON.stringify(r));
