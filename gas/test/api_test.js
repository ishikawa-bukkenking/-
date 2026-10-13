// 入力システム(Admin.gs / Store.gs / Code.gs)を、Googleのサービスを模擬して通しで実行するテスト。
// 入力(JSON, stdin): { values: {キー: 値}, geoDir, rawCsv1, rawCsv2 }  出力: JSON
const fs = require('fs');
const vm = require('vm');
const { makeEnv } = require('./mockgas');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = makeEnv(input.geoDir);
ctx.__input = input;
const res = vm.runInContext(`
(function () {
  var r = {}, ss = ss_();
  var PX = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  function tryCall(f) { try { return { ok: f() }; } catch (e) { return { err: String(e.message) }; } }
  function sheetNames() { return __sheetNames().sort().join(','); }
  setupSheets_(ss);
  r.sheets0 = sheetNames();
  r.seedCount = api_fr_list().items.length;
  var seedCount0 = r.seedCount;
  // --- ログイン(メールアドレスに @bukkenking.com が付いているか) ---
  var apis = [['api_list'], ['api_get', 'x'], ['api_save', 'x', {}], ['api_status', 'x'], ['api_create_company', 'a', '長野県', '上田市'], ['api_add_area', 'x', '長野県', '上田市'],
    ['api_rename_company', 'x', 'y'], ['api_delete_area', 'x'], ['api_delete_company', 'x'], ['api_rotate', 'x'], ['api_uploadImage', 'x', 'k', PX], ['api_fr_list'], ['api_fr_save', -1, {}],
    ['api_fr_delete', 0], ['api_fr_import', 'x'], ['api_settings_get'], ['api_settings_set', {}], ['api_whoami']];
  function denied(email) { __setEmail(email); return apis.map(function (a) { var e = tryCall(function () { return this[a[0]].apply(this, a.slice(1)); }.bind(this)).err; return !!e && (e.indexOf('メールアドレス') >= 0 || e.indexOf('使えません') >= 0); }, this); }
  r.deniedNoEmail = denied('').every(Boolean);
  r.deniedGmail = denied('someone@gmail.com').every(Boolean);
  r.deniedLookalike = denied('a@bukkenking.com.evil.example').every(Boolean) && denied('a@notbukkenking.com').every(Boolean);
  __setEmail('Ishikawa@BUKKENKING.com');
  r.whoami = api_whoami().email;
  // --- 会社とエリア(商談ごとにタブは増えない) ---
  var c = api_create_company('株式会社○○', '長野', '上田市'); var a1 = c.areaId;
  var a2 = api_add_area(c.companyId, '長野県', '東御市').areaId;
  var c2 = api_create_company('株式会社テスト', '愛知県', '岡崎市');
  r.sheetsAfter = sheetNames() === r.sheets0;
  var list = api_list(); r.companies = list.companies.length; r.areasOfFirst = list.companies.filter(function (x) { return x.name === '株式会社○○'; })[0].areas.length;
  r.badCreate = [tryCall(function () { return api_create_company('x', '存在しない県', '上田市'); }).err, tryCall(function () { return api_create_company('', '長野県', '上田市'); }).err, tryCall(function () { return api_add_area('nope', '長野県', '上田市'); }).err];
  var g = api_get(a1); var keys = g.fields.filter(function (f) { return f.k; }).map(function (f) { return f.k; });
  r.metaClean = ['cta_url', 'company'].every(function (k) { return keys.indexOf(k) < 0; }) && !keys.some(function (k) { return k.slice(-6) === 'source' || k.slice(-5) === '.date' || k.indexOf('auto.') === 0; });
  r.siblings = g.siblings.length;
  r.imageKeys = g.fields.filter(function (f) { return f.t === 'image'; }).map(function (f) { return f.k; });
  r.valErr = api_save(a1, { 'inputs.income.city_avg_man': 'abc', 'inputs.area.households': '70,809', 'bogus': '1', 'auto.date.income': '2020-01-01', 'compare.0': '長野市,25.1,x', 'inputs.price_trend.image': 'drive:abc', 'company': 'ハッキング' });
  var vals = {}; Object.keys(__input.values).forEach(function (k) { if (keys.indexOf(k) >= 0) vals[k] = __input.values[k]; });
  r.save = api_save(a1, vals);
  var v1 = areaById_(a1).values;
  r.dateAuto = ['area', 'income', 'listings', 'keywords', 'price_trend'].every(function (k) { return v1['auto.date.' + k] === '2026-01-19'; }) && v1['auto.created'] === '2026-01-19';
  // 画像
  r.upBad = [tryCall(function () { return api_uploadImage(a1, 'inputs.income.city_avg_man', PX); }).err, tryCall(function () { return api_uploadImage(a1, 'inputs.price_trend.image', 'data:text/html;base64,AAAA'); }).err];
  api_uploadImage(a1, 'inputs.price_trend.image', PX); api_uploadImage(a1, 'inputs.used_house.heatmap_image', PX);
  var first = areaById_(a1).values['inputs.price_trend.image']; r.imgRef = first.indexOf('drive:file') === 0;
  api_uploadImage(a1, 'inputs.price_trend.image', PX); r.oldTrashed = DriveApp.getFileById(first.slice(6)).trashed;
  var lp = doGet({ parameter: { id: a1 } }).html;
  r.lpImgCount = lp.split('data:image/jpeg;base64,/9j/').length - 1;
  r.lpFixedSources = ["LIFULL HOME'S調べ", 'REINS調べ', 'Google広告調べ', '総務省統計局 令和2年国勢調査'].every(function (s) { return lp.indexOf(s) >= 0; });
  r.lpHas414 = lp.indexOf('414') >= 0 && lp.indexOf('上田市') >= 0 && lp.indexOf('株式会社○○') >= 0;
  r.lpNoCta = lp.indexOf('お問い合わせ') < 0; r.lpAnon = true;
  // LPはログインしていなくても見られる(メールが取れない匿名アクセス)
  __setEmail(''); r.lpAnonOk = doGet({ parameter: { id: a1 } }).html.indexOf('414') >= 0; __setEmail('ishikawa@bukkenking.com');
  api_save(a1, { 'inputs.used_house.heatmap_image': '' });
  var files0 = DriveApp.__files.size;
  var st = api_status(a1); r.missing = st.missing.map(function (m) { return m.key; }); r.checksNg = st.checksNg; r.totals = st.totals;
  r.missingStored = listAreas_().filter(function (x) { return x.id === a1; })[0].missing;
  // 同じ会社の2つ目のエリアは別データ(LPも別)
  api_save(a2, { 'inputs.area.households': '12000' });
  var lp2 = doGet({ parameter: { id: a2 } }).html;
  r.area2 = lp2.indexOf('東御市') >= 0 && lp2.indexOf('12,000世帯') >= 0 && lp2.indexOf('414件') < 0 && lp2.indexOf('株式会社○○') >= 0;
  r.status2 = api_status(a2).missing.length > 10;
  // 周辺加盟店は同梱の一覧から選ばれる(上田市=同一市、東御市=木楽ホーム)
  r.fr1 = lp.indexOf('リフォームワン株式会社様') >= 0 && lp.indexOf('ミライズ不動産株式会社様') >= 0 && lp.indexOf('https://www.one-estate.jp/') >= 0;
  r.fr2 = lp2.indexOf('木楽ホーム株式会社様') >= 0;
  // 加盟店の管理
  r.frAdd = (function () { api_fr_save(-1, { name: '岡崎工務店', prefecture: '愛知県', city: '岡崎市', url: 'https://example.com/', active: true }); return api_fr_list().items.length === seedCount0 + 1; })();
  r.frBad = tryCall(function () { return api_fr_save(-1, { name: '', prefecture: '愛知県', city: '岡崎市' }); }).err;
  var li = api_fr_list().items, idx = li.filter(function (x) { return x.name === 'リフォームワン株式会社'; })[0].i;
  api_fr_save(idx, { name: 'リフォームワン株式会社', prefecture: '長野県', city: '上田市', url: 'https://www.one-estate.jp/', active: false });
  var lp3 = doGet({ parameter: { id: a1 } }).html; r.frStopped = lp3.indexOf('リフォームワン') < 0 && lp3.indexOf('ミライズ') >= 0;
  api_fr_delete(api_fr_list().items.length - 1); r.frDel = api_fr_list().items.length === seedCount0;
  var imp1 = api_fr_import(__input.rawCsv1); r.imp1 = [imp1.added, imp1.updated, imp1.unresolved.length];
  var imp2 = api_fr_import(__input.rawCsv2); r.imp2 = [imp2.added, imp2.updated, imp2.unresolved.length];
  var imp3 = api_fr_import('会社名,住所\\n新規工務店株式会社【新規】《愛知県岡崎市》,愛知県岡崎市康生町1-1\\n住所不明株式会社,どこか'); r.imp3 = [imp3.added, imp3.updated, imp3.unresolved];
  r.impBad = tryCall(function () { return api_fr_import('a,b\\n1,2'); }).err;
  r.frStoppedKept = (function () { var x = api_fr_list().items.filter(function (y) { return y.name === 'リフォームワン株式会社'; })[0]; return x.active === false && x.url === 'https://www.one-estate.jp/'; })();
  // 設定
  r.setBad = [tryCall(function () { return api_settings_set({ max: 99, threshold: 1 }); }).err, tryCall(function () { return api_settings_set({ max: 3, threshold: 1, url: 'http://evil.example/' }); }).err];
  api_settings_set({ max: 1, threshold: 2, estat: 'APPID', url: 'https://script.google.com/macros/s/AKfycbxTEST/exec' });
  var s2 = api_settings_get(); r.settings = [s2.max, s2.threshold, s2.estat, s2.url, s2.unit];
  r.listUrl = api_list().companies.filter(function (x) { return x.name === '株式会社○○'; })[0].areas[0].url === 'https://script.google.com/macros/s/AKfycbxTEST/exec?id=' + a1;
  r.point420 = doGet({ parameter: { id: a1 } }).html.indexOf('約420件') >= 0;
  // --- 今回の変更 ---
  var lpx = doGet({ parameter: { id: a1 } }).html;
  var heroPart = lpx.slice(lpx.indexOf('id="top"'), lpx.indexOf('<main>'));
  r.heroNoTotals = heroPart.indexOf('物件総数') < 0 && heroPart.indexOf('仲介単価') < 0 && lpx.indexOf('物件総数・売却相場まとめ') >= 0;   // トップには出さず、まとめには残る
  r.heroNoKpi = heroPart.indexOf('conclusions') < 0;
  r.hpShown = lpx.indexOf('不動産HP：') >= 0 && lpx.indexOf('https://www.me-rise-fudosan.jp/') >= 0;                         // 周辺加盟店の不動産HP
  r.hpMissingReported = api_status(a1).missing.length >= 0 && buildArea_(a1).report.items.filter(function (i) { return i.key === 'area.franchise_hp'; })[0].status;
  r.trendText = lpx.indexOf('直近3年間で7.22%の上昇となりました。長野県全体の変動（+7.28%）と比べると、おおむね同程度の水準です。') >= 0 && lpx.indexOf('直近3年間で、価格は<span class="em">7.22%上昇</span>しています') >= 0;
  r.pctErr = [api_save(a1, { 'bracket_sh.0': '101' }).errors['bracket_sh.0'], api_save(a1, { 'bracket_sh.0': 'x' }).errors['bracket_sh.0']];
  r.pctOk = api_save(a1, { 'bracket_sh.0': '38.9' }).saved === 1;
  r.noHhFields = !keys.some(function (k) { return k.indexOf('bracket_hh') === 0 || k === 'inputs.income.municipalities_in_prefecture'; }) && keys.filter(function (k) { return k.indexOf('bracket_sh') === 0; }).length === 5;
  r.incomeBody = lpx.indexOf('全体の38.9%を占めています') >= 0 && lpx.indexOf('世帯（') < 0;
  r.munis = lpx.indexOf('77市町村中') >= 0;
  // 価格推移の表示/非表示(既定は表示)
  r.trendDefault = lpx.indexOf('id="trend"') >= 0 && lpx.indexOf('<a class="i" href="#trend">') >= 0;
  var missBefore = api_status(a1).missing.map(function (m) { return m.key; });
  api_save(a1, { 'show.price_trend': '0' });
  var lph = doGet({ parameter: { id: a1 } }).html;
  r.trendHidden = lph.indexOf('id="trend"') < 0 && lph.indexOf('href="#trend"') < 0 && lph.indexOf('AI査定した参考価格') < 0;
  var nums = lph.split('sec-no">').slice(1).map(function (x) { return x.slice(0, 2); });
  r.numbering = nums.join(',');
  r.trendMissingGone = api_status(a1).missing.every(function (m) { return m.key.indexOf('price_trend') !== 0; });
  r.showBad = api_save(a1, { 'show.price_trend': 'maybe' }).errors['show.price_trend'];
  api_save(a1, { 'show.price_trend': '1' }); r.trendBack = doGet({ parameter: { id: a1 } }).html.indexOf('id="trend"') >= 0;
  // 世帯数の自動取得(e-Stat。応答の形は想定。取得できたら保存して以後は呼ばない)
  api_settings_set({ max: 3, threshold: 1, estat: 'APPID', url: 'https://script.google.com/macros/s/AKfycbxTEST/exec' });
  var auto = api_create_company('自動取得テスト', '長野県', '上田市').areaId;
  var calls0 = __estatCalls();
  var stA = api_status(auto); var vA = areaById_(auto).values;
  r.estat = { hh: stA.households, auto: stA.householdsAuto, stored: vA['auto.households'], code: vA['auto.households_code'], date: vA['auto.date.households'] };
  var calls1 = __estatCalls(); api_status(auto); api_get(auto); doGet({ parameter: { id: auto } });
  r.estatNoRefetch = __estatCalls() === calls1 && calls1 > calls0;
  r.estatLp = doGet({ parameter: { id: auto } }).html.indexOf('70,809世帯') >= 0 && doGet({ parameter: { id: auto } }).html.indexOf('国勢調査(e-Stat)') >= 0;
  r.estatField = api_get(auto).autoHouseholds;
  api_save(auto, { 'inputs.area.households': '12345' }); r.estatManualWins = doGet({ parameter: { id: auto } }).html.indexOf('12,345世帯') >= 0;
  api_save(auto, { 'inputs.area.households': '' }); r.estatBackToAuto = api_status(auto).households === 70809;
  r.estatTest = api_estat_test('APPID');
  r.estatBadId = api_estat_test('BADID');
  __estatMode('empty'); var autoB = api_create_company('失敗テスト', '長野県', '松本市').areaId;
  var stB = api_status(autoB); r.estatFail = stB.missing.filter(function (m) { return m.key === 'area.households'; })[0].reason;
  var callsB = __estatCalls(); api_status(autoB); r.estatFailCached = __estatCalls() === callsB;   // 失敗は10分間だけ覚えて連打しない
  __estatMode('');
  // URL作り直し・削除
  var nid = api_rotate(a1).id; r.rotated = nid !== a1 && doGet({ parameter: { id: a1 } }).html.indexOf('見つかりません') >= 0 && doGet({ parameter: { id: nid } }).html.indexOf('414') >= 0;
  r.lpBadId = ['nope', '../../x', ''].map(function (id) { return id ? doGet({ parameter: { id: id } }).html.indexOf('見つかりません') >= 0 : true; });
  var imgBefore = nid && DriveApp.__files.size;
  api_delete_area(nid); r.areaDeleted = api_list().companies.filter(function (x) { return x.name === '株式会社○○'; })[0].areas.length === 1 && doGet({ parameter: { id: nid } }).html.indexOf('見つかりません') >= 0;
  r.imagesTrashed = Array.from(DriveApp.__files.values()).every(function (f) { return f.trashed; });
  api_rename_company(c.companyId, '株式会社□□'); r.renamed = api_list().companies.filter(function (x) { return x.name === '株式会社□□'; }).length === 1 && doGet({ parameter: { id: a2 } }).html.indexOf('株式会社□□') >= 0;
  api_delete_company(c.companyId); r.companyDeleted = api_list().companies.every(function (x) { return x.name !== '株式会社□□'; }) && listAreas_().every(function (x) { return x.company !== '株式会社□□'; });
  r.sheetsEnd = sheetNames() === r.sheets0;
  var app = doGet({ parameter: {} }).html; r.appPage = app.indexOf('入力システム') >= 0 && doGet({ parameter: { page: 'app' } }).html === app;
  r.noOldFns = ['menuAddProspect', 'menuShowUrl', 'menuReport', 'menuRotateId', 'api_login', 'api_create'].map(function (n) { return typeof this[n]; }, this);
  return JSON.stringify(r);
}).call(this)`, ctx);
process.stdout.write(res);
