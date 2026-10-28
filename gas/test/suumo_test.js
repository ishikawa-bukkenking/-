// SUUMOの売却相場の取り込みを、保存したページの抜粋と模擬のネット接続で確認する。出力: JSON
const fs = require('fs');
const vm = require('vm');
const { makeEnv } = require('./mockgas');
const ctx = makeEnv(null);
const r = vm.runInContext(`(function () {
  var r = {}; setupSheets_(ss_()); __setEmail('ishikawa@bukkenking.com'); __suumoMode('on');
  var fx = ${JSON.stringify(fs.readFileSync(require('path').join(__dirname, '..', '..', 'tests', 'fixtures', 'suumo_baikyaku_aichi_nagoya_excerpt.html'), 'utf8'))};
  var m = parseSuumoMarket_(fx);
  r.parse = [m.mansion['マンション売却価格相場'], m.land['土地売却価格相場']];
  var links = parseSuumoLinks_(fx, 'aichi');
  r.links = links.length > 5;
  r.find = [suumoFind_(links, '名古屋市').url, suumoFind_(links, '存在しない市')];
  r.num = [suumoNum_('-'), suumoNum_('1,234'), suumoNum_('21.6')];
  var c = api_create_company('株式会社名古屋', '愛知県', '名古屋市'), id = c.areaId;
  var res = api_suumo_fetch(id), v = api_get(id).values;
  r.res = [res.ok, res.filled, res.missing.length];
  r.vals = ['inputs.used_mansion.price_man', 'inputs.used_mansion.exclusive_area_median_m2', 'inputs.used_mansion.age_median_years',
    'inputs.land.price_man', 'inputs.land.price_per_m2_man', 'inputs.land.land_area_median_m2',
    'inputs.used_house.price_man', 'inputs.used_house.building_area_median_m2', 'inputs.used_house.land_area_median_m2', 'inputs.used_house.age_median_years'].map(function (k) { return v[k]; });
  r.rec = JSON.parse(v['auto.suumo']).url.indexOf('suumo.jp/baikyaku/aichi/') > 0 && !!v['auto.date.listings'];
  // 手で直した値は上書きしない/自動入力のままの値は更新される
  api_save(id, { 'inputs.used_house.price_man': '9999' });
  var res2 = api_suumo_fetch(id), v2 = api_get(id).values;
  r.kept = [v2['inputs.used_house.price_man'], res2.kept, v2['inputs.used_mansion.price_man']];
  // 市を変えると自動入力した値は消える(手で直した値は残る)
  api_save(id, { city: '岡崎市' });
  var v3 = api_get(id).values;
  r.reset = [v3['inputs.used_mansion.price_man'] === undefined || v3['inputs.used_mansion.price_man'] === '', v3['inputs.used_house.price_man'], v3['auto.suumo'] === undefined || v3['auto.suumo'] === ''];
  // 取得できないとき: エラーを記録し、値は入れない
  __suumoMode('off');
  var c2 = api_create_company('株式会社失敗', '愛知県', '岡崎市'), res3 = api_suumo_fetch(c2.areaId), v4 = api_get(c2.areaId).values;
  r.err = [res3.ok, res3.message.indexOf('取得できませんでした') >= 0, !!JSON.parse(v4['auto.suumo']).error, v4['inputs.land.price_man'] === undefined || v4['inputs.land.price_man'] === ''];
  __suumoMode('changed');
  r.changed = api_suumo_fetch(c2.areaId).message.indexOf('読み取れませんでした') >= 0;
  // 利用者確認
  __suumoMode('on'); __setEmail('x@gmail.com');
  try { api_suumo_fetch(id); r.denied = false; } catch (e) { r.denied = true; }
  return r;
})()`, ctx);
console.log(JSON.stringify(r));
