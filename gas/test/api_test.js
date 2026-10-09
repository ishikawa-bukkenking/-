// 入力システム(Admin.gs / Code.gs / Sheet.gs)を、Googleのサービスを模擬して通しで実行するテスト。
// 入力(JSON, stdin): { values: {キー: 値}, geoDir }  出力: JSON
const fs = require('fs'), vm = require('vm');
const { makeEnv } = require('./mockgas');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = makeEnv(input.geoDir);
ctx.__input = input;
const res = vm.runInContext(`
(function () {
  var r = {}, ss = ss_(), PX = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  function tryCall(f) { try { return { ok: f() }; } catch (e) { return { err: String(e.message) }; } }
  setupSheets_(ss);
  var pw = readSettings_().pw; r.pwLen = pw.length;
  r.autoUrl = readSettings_().url;                                            // B1が空でもデプロイ済みURLを自動で使う
  ss.getSheetByName('設定').getRange('B1').setValue('https://example.test/exec');
  setupSheets_(ss); r.pwKept = readSettings_().pw === pw; r.urlKept = readSettings_().url === 'https://example.test/exec';
  ss.getSheetByName('設定').getRange('B1').setValue('');
  r.noPwApi = ['api_list', 'api_get', 'api_save', 'api_status', 'api_create', 'api_uploadImage', 'api_rotate', 'api_fr_list', 'api_fr_save']
    .map(function (n) { return tryCall(function () { return this[n]('wrong', 'x', {}); }.bind(this)).err; }, this);
  r.login = api_login(pw).ok;
  r.noPwApi2 = ['api_fr_delete', 'api_settings_get', 'api_settings_set'].map(function (n) { return tryCall(function () { return this[n]('wrong', 0, {}); }.bind(this)).err; }, this);
  var c = api_create(pw, '株式会社○○', '長野', '上田市'), id = c.id; r.createdId = id.length;
  r.badCreate = tryCall(function () { return api_create(pw, 'x', '存在しない県', '上田市'); }).err;
  var g = api_get(pw, id);
  var keys = g.fields.filter(function (f) { return f.k; }).map(function (f) { return f.k; });
  r.metaHasCta = keys.indexOf('cta_url') >= 0; r.metaHasSource = keys.some(function (k) { return k.slice(-6) === 'source' || k.slice(-5) === '.date'; });
  r.metaHidden = keys.some(function (k) { return k.indexOf('auto.') === 0; });
  r.imageKeys = g.fields.filter(function (f) { return f.t === 'image'; }).map(function (f) { return f.k; });
  r.valErr = api_save(pw, id, { 'inputs.income.city_avg_man': 'abc', 'inputs.area.households': '70,809', 'bogus': '1', 'auto.date.income': '2020-01-01', 'compare.0': '長野市,25.1,x', 'inputs.price_trend.image': 'drive:abc' });
  var vals = {}; Object.keys(__input.values).forEach(function (k) { if (keys.indexOf(k) >= 0) vals[k] = __input.values[k]; });
  r.dropped = Object.keys(__input.values).filter(function (k) { return keys.indexOf(k) < 0 && k !== 'company' && k !== 'prefecture' && k !== 'city'; }).sort();
  r.save = api_save(pw, id, vals);
  var tabVals = readTabValues_(api_get(pw, id).tab);
  r.dateAuto = tabVals['auto.date.income'] === '2026-01-19' && tabVals['auto.date.listings'] === '2026-01-19' && tabVals['auto.date.keywords'] === '2026-01-19' && tabVals['auto.date.area'] === '2026-01-19';
  r.createdAuto = tabVals['auto.created'];
  // 画像
  r.upBad = [tryCall(function () { return api_uploadImage(pw, id, 'inputs.income.city_avg_man', PX); }).err, tryCall(function () { return api_uploadImage(pw, id, 'inputs.price_trend.image', 'data:text/html;base64,AAAA'); }).err];
  api_uploadImage(pw, id, 'inputs.price_trend.image', PX);
  api_uploadImage(pw, id, 'inputs.used_house.heatmap_image', PX);
  r.imgFlags = api_get(pw, id).images;
  var first = readTabValues_(api_get(pw, id).tab)['inputs.price_trend.image']; r.imgRef = first.indexOf('drive:file') === 0;
  api_uploadImage(pw, id, 'inputs.price_trend.image', PX);   // 差し替え → 旧ファイルはゴミ箱へ
  r.oldTrashed = DriveApp.getFileById(first.slice(6)).trashed;
  var lp = doGet({ parameter: { id: id } }).html;
  r.lpImgCount = lp.split('data:image/jpeg;base64,/9j/').length - 1;           // 価格推移 + 中古戸建ての分布表
  r.lpFixedSources = lp.indexOf("LIFULL HOME'S調べ") >= 0 && lp.indexOf('REINS調べ') >= 0 && lp.indexOf('Google広告調べ') >= 0 && lp.indexOf('総務省統計局 令和2年国勢調査') >= 0;
  r.lpDate = lp.indexOf('2026/1/19') >= 0; r.lpNoCta = lp.indexOf('お問い合わせ') < 0;
  api_save(pw, id, { 'inputs.used_house.heatmap_image': '' });
  r.clearedImg = api_get(pw, id).images['inputs.used_house.heatmap_image'] === false && DriveApp.__files.size >= 3;
  var st = api_status(pw, id); r.missing = st.missing.map(function (m) { return m.key; }); r.checksNg = st.checksNg; r.totals = st.totals;
  // 加盟店の管理
  r.fr0 = api_fr_list(pw).items.length;
  api_fr_save(pw, -1, { name: '岡崎工務店', prefecture: '愛知県', city: '岡崎市', url: 'https://example.com/', active: true });
  r.fr1 = api_fr_list(pw).items.length;
  r.frBad = tryCall(function () { return api_fr_save(pw, -1, { name: '', prefecture: '愛知県', city: '岡崎市' }); }).err;
  api_fr_save(pw, 0, { name: 'リフォームワン株式会社', prefecture: '長野県', city: '上田市', url: 'https://www.one-estate.jp/', active: false });   // 停止
  var lp2 = doGet({ parameter: { id: id } }).html; r.frStopped = lp2.indexOf('リフォームワン') < 0 && lp2.indexOf('ミライズ') >= 0;
  api_fr_delete(pw, r.fr1 - 1); r.fr2 = api_fr_list(pw).items.length;
  // 設定
  r.setBad = tryCall(function () { return api_settings_set(pw, { max: 99, threshold: 1, unit: 10 }); }).err;
  r.pwShort = tryCall(function () { return api_settings_set(pw, { max: 3, threshold: 1, unit: 10, newPw: 'abc' }); }).err;
  api_settings_set(pw, { max: 1, threshold: 2, unit: 50, estat: 'APPID', newPw: 'new-password-123' });
  var s2 = api_settings_get('new-password-123'); r.settings = [s2.max, s2.threshold, s2.unit, s2.estat];
  r.oldPwDead = tryCall(function () { return api_login(pw); }).err; pw = 'new-password-123';
  r.point50 = api_status(pw, id).totals.listings_total === 414 && doGet({ parameter: { id: id } }).html.indexOf('450件') >= 0;
  // URL作り直し
  var nid = api_rotate(pw, id).id; r.rotated = nid !== id && doGet({ parameter: { id: id } }).html.indexOf('見つかりません') >= 0 && doGet({ parameter: { id: nid } }).html.indexOf('414') >= 0;
  r.lpBadId2 = doGet({ parameter: { id: '../../x' } }).html.indexOf('見つかりません') >= 0;
  var app = doGet({ parameter: {} }).html; r.appPage = app.indexOf('入力システム') >= 0 && app.indexOf(pw) < 0;
  r.noOldMenus = ['menuAddProspect', 'menuShowUrl', 'menuReport', 'menuRotateId'].map(function (n) { return typeof this[n]; }, this);
  for (var i = 0; i < 10; i++) tryCall(function () { return api_login('bad' + i); });
  r.locked = tryCall(function () { return api_login(pw); }).err;
  return JSON.stringify(r);
}).call(this)`, ctx);
process.stdout.write(res);
