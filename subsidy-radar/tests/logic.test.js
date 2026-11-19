const test = require('node:test'), assert = require('node:assert/strict');
const L = require('./load')(['Logic.js', 'Config.js']);

test('日付: 和暦・西暦・区切り', () => {
  assert.deepEqual(plain(L.parseJaDate_('令和8年12月1日')), { date: '2026-12-01', status: 'ok', note: '' });
  assert.equal(L.parseJaDate_('令和元年5月1日').date, '2019-05-01');
  assert.equal(L.parseJaDate_('平成30年4月1日').date, '2018-04-01');
  assert.equal(L.parseJaDate_('2026年12月1日(火)17:00').date, '2026-12-01');
  assert.equal(L.parseJaDate_('2026/12/1').date, '2026-12-01');
  assert.equal(L.parseJaDate_('２０２６年１２月１日').date, '2026-12-01'); // 全角
});
test('日付: 年なし・随時・不正は推測しない', () => {
  assert.equal(L.parseJaDate_('12/1').status, 'review');
  assert.equal(L.parseJaDate_('12月1日').status, 'review');
  assert.equal(L.parseJaDate_('随時').status, 'ongoing');
  assert.equal(L.parseJaDate_('予算がなくなり次第終了').status, 'ongoing');
  assert.equal(L.parseJaDate_('2026年2月30日').status, 'review');
  assert.equal(L.parseJaDate_('').status, 'review');
  assert.equal(L.parseJaDate_('近日公開').status, 'review');
});
test('期間: A〜B、〜Bまで、年なしの終了側は要確認', () => {
  const p = L.parseJaPeriod_('令和8年4月1日〜令和8年12月1日');
  assert.equal(p.start, '2026-04-01'); assert.equal(p.end, '2026-12-01'); assert.equal(p.status, 'ok');
  const q = L.parseJaPeriod_('〜令和8年12月1日まで');
  assert.equal(q.start, ''); assert.equal(q.end, '2026-12-01');
  assert.equal(L.parseJaPeriod_('令和8年4月1日〜12月1日').status, 'review');
  assert.equal(L.parseJaPeriod_('令和8年4月1日〜随時').status, 'ongoing');
});
test('JST変換・状態・あと◯日', () => {
  assert.equal(L.isoToJstDate_('2026-12-25T08:00:00.000Z'), '2026-12-25');
  assert.equal(L.isoToJstDate_('2026-12-25T16:00:00.000Z'), '2026-12-26'); // 日付をまたぐ
  assert.equal(L.isoToJstDate_('xx'), '');
  assert.equal(L.statusOf_('2026-03-01', '2026-12-25', '2026-11-18'), '募集中');
  assert.equal(L.statusOf_('2026-12-01', '2026-12-25', '2026-11-18'), '予定');
  assert.equal(L.statusOf_('2026-03-01', '2026-11-01', '2026-11-18'), '終了');
  assert.equal(L.statusOf_('', '', '2026-11-18'), '要確認');
  assert.equal(L.daysLabel_('2026-12-01', '2026-11-18'), 'あと13日');
  assert.equal(L.daysLabel_('2026-11-18', '2026-11-18'), '本日まで');
  assert.equal([0, 1, 3, 4, 7, 8].map(n => L.deadlineLevel_(addDays('2026-11-18', n), '2026-11-18')).join(), '1,1,3,7,7,0');
});
function addDays(d, n) { const t = new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000); return t.toISOString().slice(0, 10); }
function plain(o) { return JSON.parse(JSON.stringify(o)); }

const rules = () => plain(L.DEFAULT_RULES).map(r => ({ category: r[0], keyword: r[1], points: r[2], scope: r[3] }));
test('点数: 理由が出る・上限がある・引く条件が効く', () => {
  const a = L.scoreRecord_({ title: 'IT導入補助金2026', industry: '全業種', area: '全国', target: '中小企業' }, rules());
  assert.equal(a.level, '高'); assert.match(a.reasons, /物件王の扱う制度:IT導入補助金/); assert.match(a.reasons, /地域:全国/);
  const b = L.scoreRecord_({ title: '水産物の認証取得支援', industry: '農業、林業 / 漁業', area: '北海道' }, rules());
  assert.equal(b.level, '低'); assert.match(b.reasons, /-/);
  const c = L.scoreRecord_({ title: '住宅リフォーム 省エネ 断熱 耐震 ZEH 建設', area: '愛知県' }, rules());
  assert.ok(c.score <= 30 + 15 + 10, '業種カテゴリは上限30で止まる: ' + c.score);
});
test('点数: キーワード表を変えると点数が変わる(コード不変)', () => {
  const rec = { title: '特別な新制度', area: '全国' };
  const before = L.scoreRecord_(rec, rules()).score;
  const r2 = rules().concat([{ category: '物件王の扱う制度', keyword: '特別な新制度', points: 30, scope: 'all' }]);
  assert.equal(L.scoreRecord_(rec, r2).score, before + 30);
});
test('重複: 別の情報源の似たタイトルだけ候補。同じ情報源は対象外', () => {
  const A = { source: 'jgrants', title: '令和8年度 小規模事業者持続化補助金(第7回)', end: '2026-12-01', institution: '商工会議所' };
  const B = { source: 'jnet21', title: '小規模事業者持続化補助金', end: '2026-12-01', institution: '商工会議所' };
  assert.equal(L.duplicateKind_(A, B), '有力');
  assert.equal(L.duplicateKind_(A, Object.assign({}, B, { title: '空き家対策総合支援事業', end: '2027-03-01' })), '');
  assert.equal(L.duplicateKind_(A, Object.assign({}, A)), '');
});

const page1 = `<main><h1>人材開発支援助成金</h1><p>令和8年度のパンフレット</p><ul><li>助成率 60%</li><li>上限 1,000万円</li></ul>
 <a href="/files/pamphlet_r8.pdf">パンフレット</a><div>アクセス数 12345</div><script>x()</script></main>`;
test('変化検知: 変更なし→差分なし(揺れる行は除外)', () => {
  const l1 = L.htmlToLines_(page1, { start: '<main', end: '</main>' });
  assert.ok(l1.some(l => l.includes('pamphlet_r8.pdf')), 'PDFリンクも行になる');
  assert.ok(!l1.some(l => l.includes('アクセス数')));
  const l2 = L.htmlToLines_(page1.replace('12345', '99999'), { start: '<main', end: '</main>' });
  const d = L.diffFingerprints_(L.fingerprintLines_(l1, L.hash8), L.fingerprintLines_(l2, L.hash8), l2);
  assert.deepEqual(plain(d), { added: [], removed: [] });
});
test('変化検知: 書き換えを検出し、追加・削除の抜粋が出る', () => {
  const l1 = L.htmlToLines_(page1, { start: '<main', end: '</main>' });
  const l2 = L.htmlToLines_(page1.replace('助成率 60%', '助成率 75%'), { start: '<main', end: '</main>' });
  const d = L.diffFingerprints_(L.fingerprintLines_(l1, L.hash8), L.fingerprintLines_(l2, L.hash8), l2);
  assert.deepEqual(plain(d), { added: ['助成率 75%'], removed: ['助成率 60%'] });
});
test('通知文: 空の日・取れなかった情報源・件数制限・長さ', () => {
  const base = { today: '2026-11-18', watch: [], deadlines: [], newHigh: [], midCount: 4, sources: [{ name: 'Jグランツ', ok: true, count: 146 }], viewUrl: 'https://example.com/sheet#gid=1' };
  const m0 = L.buildMorningMessage_(base);
  assert.match(m0, /本日の新着はありません/); assert.ok(m0.split('\n').length < 12);
  const m1 = L.buildMorningMessage_(Object.assign({}, base, { sources: [{ name: 'Jグランツ', ok: false, error: 'HTTP 500' }] }));
  assert.match(m1, /取れなかった情報源】Jグランツ\(HTTP 500\)/);
  assert.ok(m1.indexOf('取れなかった') < m1.indexOf('本日の新着はありません'), '目立つ位置(上)に出る');
  const many = Array.from({ length: 15 }, (_, i) => ({ title: '制度' + i, institution: '機関', start: '2026-04-01', end: '2026-12-01', limit: 10000000, reasons: '地域:全国(+5)', url: 'https://x/' + i }));
  const m2 = L.buildMorningMessage_(Object.assign({}, base, { newHigh: many }));
  assert.equal((m2.match(/^\d+\. 制度/gm) || []).length, 5, '新着は5件まで'); assert.match(m2, /ほか10件は「見る用」タブ/);
  assert.match(m2, /上限1000万円/); assert.match(m2, /あと13日/);
  const m3 = L.buildMorningMessage_(Object.assign({}, base, { newHigh: [{ title: 'X', start: '', end: '', limit: null, reasons: 'r', url: 'u' }] }));
  assert.match(m3, /上限要確認/); assert.match(m3, /受付 要確認〜要確認/);
});

test('点数: 全業種が対象の制度は、業種欄では加点しない/億円の表示', () => {
  const all = ['農業、林業','漁業','建設業','製造業','情報通信業','運輸業、郵便業','卸売業、小売業','不動産業、物品賃貸業','医療、福祉'].join(' / ');
  assert.equal(L.scoreRecord_({ title: '汎用の補助金', industry: all, area: '全国' }, rules()).score, 5);
  assert.ok(L.scoreRecord_({ title: '汎用の補助金', industry: '建設業 / 不動産業、物品賃貸業', area: '全国' }, rules()).score >= 35);
  assert.equal(L.fmtLimit_(150000000), '1億5000万円'); assert.equal(L.fmtLimit_(500000000), '5億円'); assert.equal(L.fmtLimit_(1200000), '120万円');
});

test('通知文: 要点・曜日・締切・理由の短縮・リンク', () => {
  const ctx = { today: '2026-11-19', watch: [{ name: '人材開発支援助成金', url: 'https://w', added: ['助成率 75%'], removed: ['助成率 60%'], pdf: '' }],
    deadlines: [{ title: '持続化補助金', end: '2026-11-22', url: 'https://d', limit: 2000000 }],
    newHigh: [{ title: '新制度', start: '2026-11-01', end: '2026-12-25', limit: 50000000, reasons: '物件王の扱う制度:業務改善助成金(+30) / 地域:愛知(+10) / 引く条件:NPO(-15)', url: 'https://n' }],
    midCount: 2, sources: [{ name: 'Jグランツ', ok: true, count: 227 }], viewUrl: 'https://sheet#gid=9' };
  const m = L.buildMorningMessage_(ctx);
  assert.match(m, /補助金レーダー 11\/19\(木\)/);
  assert.match(m, /制度の更新: 1件 \/ 締切が近い: 1件 \/ 新着: 1件/);
  assert.match(m, /■ 【あと3日】持続化補助金\n  11\/22\(日\)まで \/ 上限200万円\n  → https:\/\/d/);
  assert.match(m, /追加: 助成率 75%\n  削除: 助成率 60%/);
  assert.match(m, /関連: 業務改善助成金、愛知\n/); assert.doesNotMatch(m, /NPO/);
  assert.match(m, /→ https:\/\/sheet#gid=9/);
  assert.ok(m.split('\n').length <= 30, '行数: ' + m.split('\n').length);
  assert.ok(m.indexOf('制度の更新】') < m.indexOf('締切が近い】') && m.indexOf('締切が近い】') < m.indexOf('新着】'));
});
