// 入力システム(Admin.gs / Code.gs / Sheet.gs)を、Googleのサービスを模擬して通しで実行するテスト。
// 入力(JSON, stdin): { values: {キー: 値}, geoDir }  出力: JSON
const fs = require('fs'), vm = require('vm');
const { makeEnv } = require('./mockgas');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = makeEnv(input.geoDir);
ctx.__input = input;
const res = vm.runInContext(`
(function () {
  var r = {}, ss = ss_();
  setupSheets_(ss);
  var pw = readSettings_().pw; r.pwLen = pw.length;
  // 再実行しても入力済みの設定とパスワードを壊さない
  ss.getSheetByName('設定').getRange('B1').setValue('https://example.test/exec');
  setupSheets_(ss); r.pwKept = readSettings_().pw === pw; r.urlKept = readSettings_().url === 'https://example.test/exec';
  // 認証
  function tryCall(f) { try { return { ok: f() }; } catch (e) { return { err: String(e.message) }; } }
  r.badPw = tryCall(function () { return api_list('wrong'); });
  r.noPwApi = ['api_get', 'api_save', 'api_status', 'api_create'].map(function (n) { return tryCall(function () { return this[n]('x', 'y', {}); }.bind(this)).err; }, this);
  r.login = api_login(pw).ok;
  // 作成
  var c = api_create(pw, '株式会社○○', '長野', '上田市'); r.createdId = c.id.length;
  r.badCreate = tryCall(function () { return api_create(pw, 'x', '存在しない県', '上田市'); }).err;
  var list = api_list(pw); r.listLen = list.items.length; r.listUrl = list.items[0].url;
  // 取得
  var g = api_get(pw, c.id); r.fields = g.fields.length; r.company = g.values.company; r.pref = g.values.prefecture;
  // 検証エラー
  r.valErr = api_save(pw, c.id, { 'inputs.income.city_avg_man': 'abc', 'inputs.area.households': '70,809', 'bogus': '1', 'cta_url': 'javascript:alert(1)', 'compare.0': '長野市,25.1,x' });
  // 保存(Ueda相当を全部)
  r.save = api_save(pw, c.id, __input.values); 
  r.afterSave = api_get(pw, c.id).values['inputs.income.city_avg_man'];
  var st = api_status(pw, c.id); r.missing = st.missing.map(function (m) { return m.key; }); r.checksNg = st.checksNg; r.totals = st.totals;
  // LP と 入力画面の表示
  var lp = doGet({ parameter: { id: c.id } }).html; r.lpHas414 = lp.indexOf('414') >= 0 && lp.indexOf('上田市') >= 0;
  r.lpBadId = doGet({ parameter: { id: 'nope' } }).html.indexOf('見つかりません') >= 0;
  r.lpBadId2 = doGet({ parameter: { id: '../../x' } }).html.indexOf('見つかりません') >= 0;
  var app = doGet({ parameter: {} }).html; r.appPage = app.indexOf('入力システム') >= 0 && app.indexOf(pw) < 0;
  r.appPage2 = doGet({ parameter: { page: 'app' } }).html === app;
  // 総当たりロック
  for (var i = 0; i < 10; i++) tryCall(function () { return api_login('bad' + i); });
  r.locked = tryCall(function () { return api_login(pw); }).err;
  return JSON.stringify(r);
}).call(this)`, ctx);
process.stdout.write(res);
