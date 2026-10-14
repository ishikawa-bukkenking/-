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
  var l0 = api_list(); r.urlProvisional = l0.provisional === true && l0.hasUrl === true && l0.companies.filter(function (x) { return x.name === '株式会社○○'; })[0].areas[0].url === 'https://script.test/exec?id=' + a1 && api_get(a1).provisional === true;   // 設定が未入力でもLPのURLは出る(仮)
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
  r.uimg = lp.split('class="uimg"').length - 1;
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
  r.provisionalGone = api_list().provisional === false && api_get(a1).provisional === false;
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
  // --- 分布表の画像をAIで表に作り直す ---
  var HK = 'inputs.used_house.heatmap_image';
  api_uploadImage(a1, HK, PX);
  r.aiNoKey = tryCall(function () { return api_readTable(a1, HK); }).err;
  r.aiKeyBad = tryCall(function () { return api_ai_set('hello'); }).err;
  r.aiKeySet = api_ai_set('sk-ant-testtesttesttesttesttest').set && api_settings_get().aiKeySet === true && !JSON.stringify(api_settings_get()).match(/sk-ant/) && !JSON.stringify(api_get(a1)).match(/sk-ant/);
  r.aiKeyNotInSheet = !JSON.stringify(__sheetNames().map(function (n) { var sh = ss.getSheetByName(n); return sh.getLastRow() ? sh.getRange(1, 1, sh.getLastRow(), 12).getValues() : []; })).match(/sk-ant/);
  r.aiBadKind = [tryCall(function () { return api_readTable(a1, 'inputs.income.city_avg_man'); }).err, tryCall(function () { return api_saveTable(a1, 'inputs.income.city_avg_man', {}); }).err];
  var t1 = api_readTable(a1, HK);
  var call0 = __aiCalls()[__aiCalls().length - 1];
  r.aiCall = call0.url === 'https://api.anthropic.com/v1/messages' && call0.body.model === 'claude-opus-5-5' && call0.body.messages[0].content[0].type === 'image' && call0.body.messages[0].content[0].source.type === 'base64' && !('temperature' in call0.body) && !('thinking' in call0.body);
  r.aiTable = [t1.rows.length, t1.cols.length, t1.cells[1][1], t1.cells[0][2], t1.total, t1.warnings.length];
  r.aiNotSaved = !areaById_(a1).values['tbl.' + HK];
  var lp0 = doGet({ parameter: { id: a1 } }).html;
  r.aiLpBefore = lp0.indexOf('土地面積×価格') < 0 && lp0.indexOf('class="uimg"') >= 0;
  r.aiSaveBad = [tryCall(function () { return api_saveTable(a1, HK, { cols: ['a'], rows: ['b'], cells: [['x']] }); }).err, tryCall(function () { return api_saveTable(a1, HK, { cols: [], rows: [], cells: [] }); }).err, tryCall(function () { return api_saveTable(a1, HK, { cols: ['a'], rows: ['b'], cells: [[-3]] }); }).err];
  var edited = { caption: t1.caption, cols: t1.cols, rows: t1.rows, cells: [[3, 12, ''], [5, '9', 1]] };
  r.aiSaved = api_saveTable(a1, HK, edited).total === 30 && api_get(a1).tables[HK].cells[1][1] === 9;
  var lp1 = doGet({ parameter: { id: a1 } }).html;
  r.aiLpTable = lp1.indexOf('<table class="heat">') >= 0 && lp1.indexOf('土地面積×価格') >= 0 && lp1.indexOf('100〜150㎡') >= 0 && lp1.split('class="uimg"').length - 1 === 1;
  r.aiStatusOk = api_status(a1).missing.filter(function (m) { return m.key === 'used_house.heatmap'; }).length === 0;
  api_uploadImage(a1, HK, PX); r.aiClearedOnUpload = !areaById_(a1).values['tbl.' + HK] && api_get(a1).tables[HK] === null;
  api_saveTable(a1, HK, edited); api_deleteTable(a1, HK); r.aiDeleted = !areaById_(a1).values['tbl.' + HK];
  api_saveTable(a1, HK, edited); api_save(a1, (function () { var o = {}; o[HK] = ''; return o; })()); r.aiClearedOnImgDelete = !areaById_(a1).values['tbl.' + HK] && !areaById_(a1).values[HK];
  api_uploadImage(a1, HK, PX);
  __aiMode('junk'); r.aiJunk = tryCall(function () { return api_readTable(a1, HK); }).err;
  __aiMode('refusal'); r.aiRefusal = tryCall(function () { return api_readTable(a1, HK); }).err;
  __aiMode('');
  // 価格推移のグラフも同様に、貼ったら自動でAIが読み取って保存 → 折れ線グラフで描画
  var TK = 'inputs.price_trend.image';
  api_uploadImage(a1, TK, PX);
  var tt = api_readTable(a1, TK, true);
  r.trendAi = [tt.rows.join('/'), tt.cols.length, tt.cells[0][2], tt.cells[1][1], tt.warnings.length, !!areaById_(a1).values['tbl.' + TK]];
  var lpT = doGet({ parameter: { id: a1 } }).html;
  r.trendLine = lpT.indexOf('直近3年間の価格推移(万円)') >= 0 && lpT.indexOf('中古マンション') >= 0 && lpT.indexOf('の住宅価格推移グラフ"') < 0 && api_status(a1).missing.filter(function (m) { return m.key === 'price_trend.chart'; }).length === 0;
  api_saveTable(a1, TK, { type: 'bar', unit: '万円', cols: ['2023', '2024'], rows: ['土地', 'マンション'], cells: [[900, 950], [2800, 3100]] });
  var lpB = doGet({ parameter: { id: a1 } }).html;
  r.trendBar = lpB.indexOf('価格推移(棒グラフ)') >= 0 && lpB.indexOf('単位: 万円') >= 0 && lpB.indexOf('<rect') >= 0 && api_get(a1).tables[TK].type === 'bar';
  api_saveTable(a1, TK, { type: 'line', unit: '万円', cols: ['2023', '2024', '2025'], rows: ['土地'], cells: [[900, 950, 1000]] });
  r.trendLineLabel = doGet({ parameter: { id: a1 } }).html.indexOf('1,000万円') >= 0;
  r.trendEdit = api_saveTable(a1, TK, { cols: ['2023', '2024'], rows: ['土地'], cells: [[-1.5, '2']] }).ok && api_get(a1).tables[TK].cells[0][0] === -1.5;
  r.trendNegBlockedForDist = !!tryCall(function () { return api_saveTable(a1, HK, { cols: ['a'], rows: ['b'], cells: [[-3]] }); }).err;
  r.autoSaveStale = (function () { api_uploadImage(a1, HK, PX); var t = api_readTable(a1, HK, true); return !!areaById_(a1).values['tbl.' + HK] && t.total === 29; })();
  api_ai_set('sk-ant-wrongwrongwrongwrongwrong'); r.aiWrongKey = tryCall(function () { return api_readTable(a1, HK); }).err;
  api_ai_set(''); r.aiKeyRemoved = api_settings_get().aiKeySet === false;
  r.aiDenied = (function () { __setEmail('x@gmail.com'); var e = ['api_readTable', 'api_saveTable', 'api_deleteTable', 'api_ai_set'].map(function (n) { var m = tryCall(function () { return this[n](a1, HK, {}); }.bind(this)).err; return !!m && (m.indexOf('メールアドレス') >= 0 || m.indexOf('使えません') >= 0); }, this); __setEmail('ishikawa@bukkenking.com'); return e.every(Boolean); }).call(this);
  // --- 地図のピン(商談先の住所・周辺加盟店) ---
  var pinA = api_create_company('ピンテスト', '長野県', '上田市').areaId;
  var g0 = __geoCalls();
  var noPin = doGet({ parameter: { id: pinA } }).html;
  r.pinNone = noPin.indexOf('pin-client') < 0 && __geoCalls() > g0 - 1 && buildArea_(pinA).report.missing().some(function (i) { return i.key === 'area.pin_client'; }) === false;
  api_save(pinA, { 'inputs.client.address': '長野県上田市中央1-1-1' });
  var bp = buildArea_(pinA), pm = bp.model.area.pins;
  r.pinClient = pm.filter(function (x) { return x.kind === 'client'; }).length === 1 && pm[0].on_map === true && bp.html.indexOf('class="pin pin-client"') >= 0 && bp.html.indexOf('map-legend') >= 0 && bp.html.indexOf('>御社</text>') >= 0 && bp.html.indexOf('商談先') < 0;
  var frPins = pm.filter(function (x) { return x.kind === 'fr' && x.on_map; });
  r.pinFr = frPins.length >= 1 && bp.html.split('class="pin pin-fr"').length - 1 === frPins.length && bp.html.indexOf('class="pinno"') >= 0 && frPins.every(function (x) { return x.n >= 1 && x.n <= 3; });
  var gc = __geoCalls(); buildArea_(pinA); doGet({ parameter: { id: pinA } }); r.pinCached = __geoCalls() === gc;   // 住所の位置はキャッシュ(連打しない)
  api_save(pinA, { 'inputs.client.address': '大阪府大阪市北区1-1' }); var far = buildArea_(pinA);
  r.pinOutOfMap = far.model.area.pins[0].on_map === false && far.html.indexOf('pin-client') < 0 && far.report.missing().length >= 0;
  api_save(pinA, { 'inputs.client.address': 'ZZZ' }); r.pinNotFound = !!buildArea_(pinA).model.area.pins[0].why && buildArea_(pinA).model.area.pins[0].lat === null;
  __geoMode('fail'); api_save(pinA, { 'inputs.client.address': '長野県上田市テスト失敗' }); r.pinGeoFail = buildArea_(pinA).html.indexOf('pin-client') < 0; __geoMode('');
  // 位置の正確さ: 住所の市区町村が違う結果は採用しない / 地理院で補う / 概算は報告する
  api_save(pinA, { 'inputs.client.address': '長野県松本市中央1-1-1' }); var mis = buildArea_(pinA);
  r.pinMismatch = mis.model.area.pins[0].lat === null && /一致しません/.test(mis.model.area.pins[0].why) && mis.html.indexOf('pin-client') < 0;
  var gs0 = __gsiCalls(); api_save(pinA, { 'inputs.client.address': '長野県上田市GSI' + '999' }); var gsi = buildArea_(pinA);
  r.pinGsi = __gsiCalls() > gs0 && gsi.model.area.pins[0].source === '国土地理院' && gsi.model.area.pins[0].on_map === true;
  api_save(pinA, { 'inputs.client.address': '長野県上田市概算' }); var rough = buildArea_(pinA);
  r.pinRough = rough.model.area.pins[0].precise === false && rough.report.items.some(function (i) { return i.key === 'area.pin_client' && /概算/.test(i.reason); });
  r.pinFrExpect = bp.model.area.pins.filter(function (x) { return x.kind === 'fr'; }).every(function (x) { return x.source === 'Googleマップ'; });
  r.geoAddrNorm = normalizeAddr_('〒386-0012　長野県上田市中央１－１－１') === '長野県上田市中央1-1-1';
  // ピンの表示/非表示(既定は表示)
  api_save(pinA, { 'inputs.client.address': '長野県上田市中央1-1-1' });
  r.pinsDefaultOn = buildArea_(pinA).html.indexOf('class="pin pin-client"') >= 0 && api_get(pinA).fields.some(function (f) { return f.k === 'show.pins' && f.t === 'bool'; });
  var gcOff = __geoCalls(); api_save(pinA, { 'show.pins': '0' }); var off = buildArea_(pinA);
  r.pinsOff = off.html.indexOf('class="pin ') < 0 && off.html.indexOf('<p class="map-legend">') < 0 && off.html.indexOf('class="pinno"') < 0 && off.model.area.pins.length === 0 && __geoCalls() === gcOff && off.html.indexOf('area-map') >= 0;
  api_save(pinA, { 'show.pins': '1' }); r.pinsBackOn = buildArea_(pinA).html.indexOf('class="pin pin-client"') >= 0;
  r.pinsBad = !!api_save(pinA, { 'show.pins': 'maybe' }).errors['show.pins'];
  api_save(pinA, { 'inputs.client.address': '' }); r.pinRemoved = buildArea_(pinA).html.indexOf('pin-client') < 0;
  r.pinSvgValid = (function () { var h = bp.html, i = h.indexOf('<svg class="area-map"'), seg = h.slice(i, h.indexOf('</svg>', i)); return i > 0 && seg.split('<g ').length === seg.split('</g>').length; })();
  api_delete_company(api_list().companies.filter(function (x) { return x.name === 'ピンテスト'; })[0].id);
  // --- 商談先一覧(自動で記載・更新) ---
  function idxRows() { var sh = ss.getSheetByName('商談先一覧'); var last = sh.getLastRow(); return { head: sh.getRange(1, 1, 1, 9).getValues()[0], rows: last > 1 ? sh.getRange(2, 1, last - 1, 9).getValues() : [] }; }
  function idxOf(id) { return idxRows().rows.filter(function (x) { return x[8] === id; })[0]; }
  var ix0 = idxRows();
  r.idxHead = ix0.head.join(',');
  r.idxSheetEarly = typeof ss.getSheetByName('商談先一覧') === 'object';
  var rowA1 = idxOf(a1);
  r.idxRow = rowA1 && rowA1[0] === '株式会社○○' && rowA1[1] === '長野県' && rowA1[2] === '上田市' && rowA1[3] === 'https://script.google.com/macros/s/AKfycbxTEST/exec?id=' + a1 && rowA1[7] === 'ishikawa@bukkenking.com';
  r.idxStatus = rowA1[4];
  r.idxCount = ix0.rows.length === listAreas_().length;
  r.idxUpdated = String(rowA1[6]).length > 0 && String(rowA1[5]).length > 0;
  // --- 会社の複製(エリア・入力内容・画像ごと。複製後は独立) ---
  var srcCompanyId = api_list().companies.filter(function (x) { return x.name === '株式会社○○'; })[0].id;
  var filesBefore = DriveApp.__files.size;
  var dup = api_duplicate_company(srcCompanyId, '');
  var dl = api_list().companies;
  var dupC = dl.filter(function (x) { return x.id === dup.companyId; })[0], srcC = dl.filter(function (x) { return x.id === srcCompanyId; })[0];
  r.dupName = dupC.name; r.dupAreas = dupC.areas.length === srcC.areas.length && dupC.areas.length === 2;
  var dA = dupC.areas.filter(function (x) { return x.city === '上田市'; })[0];
  var dv = areaById_(dA.id).values, sv = areaById_(a1).values;
  r.dupValues = dv['inputs.income.city_avg_man'] === sv['inputs.income.city_avg_man'] && dv['compare.0'] === sv['compare.0'] && dv['auto.date.income'] === sv['auto.date.income'] && dv['inputs.price_trend.image'] !== sv['inputs.price_trend.image'] && dv['inputs.price_trend.image'].indexOf('drive:') === 0;
  r.dupNewFiles = DriveApp.__files.size === filesBefore + 2;                              // 画像は別ファイルにコピー
  r.dupLp = doGet({ parameter: { id: dA.id } }).html.indexOf('414') >= 0 && doGet({ parameter: { id: dA.id } }).html.indexOf(dupC.name) >= 0;
  r.dupIndex = idxRows().rows.filter(function (x) { return x[0] === dupC.name; }).length === 2;
  api_save(dA.id, { 'inputs.income.city_avg_man': '999' }); r.dupIndependent = areaById_(a1).values['inputs.income.city_avg_man'] === '476' && areaById_(dA.id).values['inputs.income.city_avg_man'] === '999';
  var copyFile = dv['inputs.price_trend.image'].slice(6); api_delete_company(dup.companyId);
  r.dupDeleted = DriveApp.getFileById(copyFile).trashed === true && DriveApp.getFileById(sv['inputs.price_trend.image'].slice(6)).trashed === false;   // コピーを消しても元の画像は残る
  r.dupIdxGone = idxRows().rows.filter(function (x) { return x[0] === dupC.name; }).length === 0;
  r.dupNamed = api_duplicate_company(srcCompanyId, '別会社 提案用').companyId.length === 16 && api_list().companies.some(function (x) { return x.name === '別会社 提案用'; });
  r.dupBad = tryCall(function () { return api_duplicate_company('nope', 'x'); }).err;
  // URL作り直し・削除
  var nid = api_rotate(a1).id; r.rotated = nid !== a1 && doGet({ parameter: { id: a1 } }).html.indexOf('見つかりません') >= 0 && doGet({ parameter: { id: nid } }).html.indexOf('414') >= 0;
  r.lpBadId = ['nope', '../../x', ''].map(function (id) { return id ? doGet({ parameter: { id: id } }).html.indexOf('見つかりません') >= 0 : true; });
  r.idxRotated = !!idxOf(nid) && !idxOf(a1);
  api_delete_company(api_list().companies.filter(function (x) { return x.name === '別会社 提案用'; })[0].id);   // 複製テストで作った会社を片付ける
  api_delete_area(nid); r.areaDeleted = api_list().companies.filter(function (x) { return x.name === '株式会社○○'; })[0].areas.length === 1 && doGet({ parameter: { id: nid } }).html.indexOf('見つかりません') >= 0;
  r.imagesTrashed = Array.from(DriveApp.__files.values()).every(function (f) { return f.trashed; });
  api_rename_company(c.companyId, '株式会社□□'); r.idxAfterRename = idxRows().rows.some(function (x) { return x[0] === '株式会社□□'; }) && idxRows().rows.every(function (x) { return x[0] !== '株式会社○○'; });
  r.renamed = api_list().companies.filter(function (x) { return x.name === '株式会社□□'; }).length === 1 && doGet({ parameter: { id: a2 } }).html.indexOf('株式会社□□') >= 0;
  api_delete_company(c.companyId); r.companyDeleted = api_list().companies.every(function (x) { return x.name !== '株式会社□□'; }) && listAreas_().every(function (x) { return x.company !== '株式会社□□'; });
  r.idxAreaDeleted = !idxOf(nid) && idxRows().rows.length === listAreas_().length;
  r.sheetsEnd = sheetNames() === r.sheets0;
  var app = doGet({ parameter: {} }).html; r.appPage = app.indexOf('入力システム') >= 0 && doGet({ parameter: { page: 'app' } }).html === app;
  r.noOldFns = ['menuAddProspect', 'menuShowUrl', 'menuReport', 'menuRotateId', 'api_login', 'api_create'].map(function (n) { return typeof this[n]; }, this);
  return JSON.stringify(r);
}).call(this)`, ctx);
process.stdout.write(res);
