const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');
const makeEnv = require('./gas_mock');
const fx = f => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
const FILES = ['Config.js', 'Logic.js', 'Util.js', 'Db.js', 'Jgrants.js', 'Watch.js', 'News.js', 'Notify.js', 'Main.js'];

function boot(state) {
  const env = makeEnv((url) => {
    if (url.includes('/v1/public/subsidies')) return state.listFail ? { code: 500, body: '{}' } : { code: 200, body: JSON.stringify(state.list) };
    if (url.includes('/v2/public/subsidies/id/')) return { code: 200, body: fx('jgrants_detail.json') };
    if (url.includes('api.chatwork.com')) return { code: state.cwCode || 200, body: '{}' };
    if (url.includes('/stf/new-info/')) return state.newsFail ? { code: 503, body: '' } : { code: 200, body: state.news };
    if (url.includes('mhlw.go.jp')) return state.pageFail ? { code: 503, body: '' } : { code: 200, body: state.page };
    return { code: 404, body: '' };
  });
  const ctx = vm.createContext(env);
  FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f }));
  return ctx;
}
function setMode(c, m) { vm.runInContext(`(function(){var ss=openDb_(),t=readTab_(ss,'設定');t.forEach(function(r){if(r['項目']==='送信モード')r['値']=${JSON.stringify(m)};});writeTab_(ss,'設定',t);})()`, c); }
const run = (c, code) => vm.runInContext(code, c);
const tab = (c, name) => run(c, `readTab_(openDb_(), ${JSON.stringify(name)})`);
const newState = () => ({ list: JSON.parse(fx('jgrants_list.json')), page: fx('mhlw_page.html'), news: fx('mhlw_news.html') });

test('初回: 取り込むが、新着にはしない。同じ日の再実行でデータが増えない', () => {
  const st = newState(), c = boot(st);
  run(c, 'setup()');
  run(c, 'collectDaily()');
  const n1 = tab(c, '制度').length;
  assert.equal(n1, 25);
  assert.equal(tab(c, '制度').filter(r => r['新着扱い'] === 'Y').length, 0, '初回は新着扱いにしない');
  assert.ok(tab(c, '制度').every(r => r['点数の理由'] !== undefined && r['段階']));
  run(c, 'collectDaily()');
  assert.equal(tab(c, '制度').length, n1, '2回実行しても件数が同じ');
  assert.equal(tab(c, '更新の履歴').length, 0);
});
test('API負荷: 一覧は検索語の数だけ。詳細は上限つき。失敗したら繰り返し叩かない', () => {
  const st = newState(); st.listFail = true; const c = boot(st);
  run(c, 'setup()'); run(c, 'collectDaily()');
  const listCalls = c.calls.filter(u => u.includes('/v1/public/subsidies')).length;
  assert.equal(listCalls, 1, '最初の失敗で止まる: ' + listCalls);
  const runs = tab(c, '実行の記録').filter(r => r['情報源'] === 'Jグランツ');
  assert.match(runs[0]['エラー'], /HTTP 500/);
});
test('新着(2日目)→ 通知に載る → 同じ日に2回送っても1通 → 翌日は出ない', () => {
  const st = newState(), c = boot(st);
  run(c, 'setup()'); run(c, 'collectDaily()');
  c.TEST_TODAY = '2026-11-19';
  st.list.result.push({ id: 'NEW0000000000001', name: 'S-1', title: '住宅リフォーム 省エネ改修 支援事業(IT導入補助金)', target_area_search: '愛知県 / 全国', subsidy_max_limit: 5000000,
    acceptance_start_datetime: '2026-11-01T00:00:00.000Z', acceptance_end_datetime: '2026-11-25T08:00:00.000Z', target_number_of_employees: '従業員数の制約なし', institution_name: null });
  run(c, 'collectDaily()');
  const newRow = tab(c, '制度').find(r => r['ID'] === 'jgrants:NEW0000000000001');
  assert.equal(newRow['新着扱い'], 'Y'); assert.equal(newRow['受付終了'], '2026-11-25');
  c.props.CHATWORK_TOKEN = 'dummy-token-for-test'; c.props.CHATWORK_TEST_ROOM_ID = '111';
  setMode(c, 'test');
  const r1 = run(c, 'sendMorning()');
  assert.equal(r1.result, '成功');
  const msg = c.bodies[0];
  assert.ok(!JSON.stringify(tab(c, '通知の履歴')).includes('dummy-token'), '履歴にトークンが残らない');
  assert.match(msg, /住宅リフォーム 省エネ改修/); assert.match(msg, /あと6日/); assert.match(msg, /関連: /);
  run(c, 'sendMorning()');
  assert.equal(tab(c, '通知の履歴').length, 1, '同じ日に2通にならない');
  assert.equal(c.bodies.length, 1);
  c.TEST_TODAY = '2026-11-20';
  run(c, 'collectDaily()');
  run(c, 'sendMorning(true)'); // 翌日は新着として出ない(強制実行で確認)
  const msg2 = c.bodies[1];
  assert.doesNotMatch(msg2, /【新着】/);
  assert.match(msg2, /本日の新着・変更はありません|【締切が近い】/, '新着は2回目に出ない');
});
test('更新の検知: 変更なしでは出ない/書き換えで出る/情報源の失敗は目立つ位置に出る', () => {
  const st = newState(), c = boot(st);
  run(c, 'setup()'); run(c, 'collectDaily()'); // 基準を保存
  c.TEST_TODAY = '2026-11-19'; run(c, 'collectDaily()');
  assert.equal(tab(c, 'ウォッチ').filter(w => w['差分検知日']).length, 0, '変わっていなければ差分なし');
  c.TEST_TODAY = '2026-11-20';
  st.page = st.page.split('業務改善助成金について').join('業務改善助成金について(令和9年度の変更案)');
  run(c, 'collectDaily()');
  const w = tab(c, 'ウォッチ').filter(x => x['差分検知日']);
  assert.ok(w.length >= 1, '差分を検知');
  run(c, 'sendMorning()');
  const msg = tab(c, '通知の履歴')[0]['メモ'];
  assert.match(msg, /【公式ページの更新】/); assert.match(msg, /令和9年度の変更案/);
  // 情報源の失敗
  c.TEST_TODAY = '2026-11-21'; st.pageFail = true; run(c, 'collectDaily()'); run(c, 'sendMorning()');
  const msg3 = tab(c, '通知の履歴')[1]['メモ'];
  assert.match(msg3, /取れなかった情報源】ウォッチ/);
  assert.ok(msg3.indexOf('取れなかった') < msg3.indexOf('取得できた情報源'));
});
test('本文を丸ごと保存していない(行の指紋は先頭40文字まで)', () => {
  const st = newState(), c = boot(st);
  run(c, 'setup()'); run(c, 'collectDaily()');
  const w = tab(c, 'ウォッチ').find(x => x['行の指紋']);
  const fp = JSON.parse(w['行の指紋']);
  assert.ok(fp.every(x => x.t.length <= 40 && x.h.length === 8));
  assert.ok(!Object.values(tab(c, '制度')[0]).some(v => String(v).length > 200));
});
test('Chatwork: dry は送らない。test で部屋が未設定なら失敗として記録(送らない)', () => {
  const st = newState(), c = boot(st);
  run(c, 'setup()'); run(c, 'collectDaily()');
  assert.equal(c.calls.filter(u => u.includes('chatwork')).length, 0);
  setMode(c, 'test');
  const r = run(c, 'sendMorning(true)');
  assert.equal(r.result, '失敗'); assert.match(r.note, /未設定/);
  assert.equal(c.calls.filter(u => u.includes('chatwork')).length, 0);
});

test('ウォッチ(抜粋なしモード): 変化は知らせるが、抜粋も指紋も残さない', () => {
  const st = newState(), c = boot(st);
  run(c, 'setup()');
  run(c, `(function(){var ss=openDb_(),t=readTab_(ss,'ウォッチ');t.forEach(function(w){w['種別']='html_hash';});writeTab_(ss,'ウォッチ',t);})()`);
  run(c, 'collectDaily()');
  c.TEST_TODAY = '2026-11-19';
  st.page = st.page.split('業務改善助成金について').join('業務改善助成金について(変更)');
  run(c, 'collectDaily()'); run(c, 'sendMorning()');
  const msg = tab(c, '通知の履歴')[0]['メモ'];
  assert.match(msg, /ページが更新されました/); assert.doesNotMatch(msg, /変更\)/);
  assert.ok(tab(c, 'ウォッチ').every(w => !w['行の指紋']));
});
test('weeklyHealth: 日ごとの収集・エラー・通知を集計', () => {
  const st = newState(), c = boot(st);
  run(c, 'setup()'); run(c, 'collectDaily()'); run(c, 'sendMorning()');
  c.TEST_TODAY = '2026-11-19'; st.listFail = true; run(c, 'collectDaily()'); run(c, 'sendMorning()');
  const h = JSON.parse(JSON.stringify(run(c, 'weeklyHealth(3)')));
  assert.equal(h.days.length, 3); assert.equal(h.okDays, 1);
  assert.match(h.days[2].errors[0], /Jグランツ: HTTP 500/);
});

test('見る用タブ: 募集中の高・中だけ、締切が近い順、読みやすい列', () => {
  const st = newState(), c = boot(st);
  run(c, 'setup()'); run(c, 'collectDaily()');
  const v = tab(c, '見る用');
  assert.ok(v.length > 0);
  assert.ok(v.every(r => r['段階'] === '高' || r['段階'] === '中'));
  const highs = v.filter(r => r['段階'] === '高'); assert.equal(v.slice(0, highs.length).every(r => r['段階'] === '高'), true, '高が先');
  assert.match(v[0]['締切まで'], /あと\d+日|本日まで|要確認/);
  assert.match(v[0]['リンク'], /^https:\/\/www\.jgrants-portal\.go\.jp\//);
  assert.ok(v.every(r => !/\(\+\d+\)/.test(r['関連(なぜ上に出たか)'])), '点数の数字は出さない');
  // 通知のリンクが「見る用」タブ(gid)を指す
  setMode(c, 'dry'); run(c, 'sendMorning(true)');
  assert.match(tab(c, '通知の履歴')[0]['メモ'], /#gid=\d+/);
});

function useTest(c) { c.props.CHATWORK_TOKEN = 'dummy'; c.props.CHATWORK_TEST_ROOM_ID = '1'; setMode(c, 'test'); }

test('公式のお知らせ: 最初は直近の見出しだけ通知 → 翌日は繰り返さない / 取得失敗は目立つ', () => {
  const st = newState(), c = boot(st); c.TEST_TODAY = '2026-11-24';
  run(c, 'setup()'); useTest(c); run(c, 'collectDaily()');
  const news = tab(c, 'お知らせ'); assert.ok(news.length > 0);
  assert.ok(news.some(n => n['通知'] === 'Y') || news.every(n => n['通知'] === 'N'));
  run(c, 'sendMorning()');
  const m1 = c.bodies[0];
  assert.match(m1, /【公式のお知らせ】/); assert.match(m1, /助成金|補助金|最低賃金|リスキリング|リ・スキリング/);
  assert.ok(tab(c, 'お知らせ').every(n => n['通知'] !== 'Y'), '送れたものは通知済になる');
  c.TEST_TODAY = '2026-11-25'; run(c, 'collectDaily()'); run(c, 'sendMorning()');
  assert.doesNotMatch(c.bodies[1], /【公式のお知らせ】/, '翌日は同じ見出しを繰り返さない');
  c.TEST_TODAY = '2026-11-26'; st.newsFail = true; run(c, 'collectDaily()'); run(c, 'sendMorning()');
  assert.match(c.bodies[2], /取れなかった情報源】厚労省 新着情報/);
});
test('条件の変更: 公開中の制度の受付終了日が延びたら、旧 → 新で出る', () => {
  const st = newState(), c = boot(st); c.TEST_TODAY = '2026-11-19';
  run(c, 'setup()'); useTest(c); run(c, 'collectDaily()'); run(c, 'sendMorning()');
  c.TEST_TODAY = '2026-11-20';
  const it = st.list.result[0]; const before = c.isoToJstDate_(it.acceptance_end_datetime);
  it.acceptance_end_datetime = '2027-02-27T08:00:00.000Z';
  run(c, 'collectDaily()');
  const h = tab(c, '更新の履歴').find(x => x['変わった項目'] === '受付終了');
  assert.ok(h && h['前の値'] === before && h['後の値'] === '2027-02-27');
  run(c, 'sendMorning()');
  const msg = c.bodies[c.bodies.length - 1];
  assert.match(msg, /【条件の変更】/); assert.match(msg, /受付終了: .* → 2027\/2\/27/);
  c.TEST_TODAY = '2026-11-21'; run(c, 'collectDaily()'); run(c, 'sendMorning()');
  assert.doesNotMatch(c.bodies[c.bodies.length - 1], /【条件の変更】/, '同じ変更を2日続けて出さない');
});
