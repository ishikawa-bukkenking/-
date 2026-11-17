// 使い方: node subsidy-simulator/tests/run.js
const fs = require('fs');
const path = require('path');
const C = require('../calc.js');
const params = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'params.json'), 'utf8'));

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; } else { fail++; console.log('NG  ' + name + ' 期待=' + want + ' 実際=' + got); }
}
const base = { course: 'jinzai', size: 'small', regular: 1, fixedTerm: 0, format: 'classroom',
  hours: 30, scheduledPercent: 100, attendancePercent: 100, expensePerPerson: 100000 };
const run = (o) => C.calculate(params, Object.assign({}, base, o));

// ---- 9-1 正解データ(仕様書の10例) ----
const cases = [
  [1, {}, 69000, 90000],
  [2, { hours: 40, expensePerPerson: 600000 }, 182000, 190000],
  [3, { hours: 120, expensePerPerson: 800000 }, 396000, 420000],
  [4, { size: 'large', hours: 50, expensePerPerson: 200000 }, 80000, 115000],
  [5, { format: 'elearning', hours: 20 }, 45000, 60000],
  [6, { regular: 0, fixedTerm: 1 }, 94000, 115000],
  [7, { hours: 9 }, 0, 0],
  [8, { regular: 10 }, 690000, 900000],
  [10, { scheduledPercent: 50 }, 57000, 75000],
];
for (const [no, o, b, w] of cases) {
  const r = run(o);
  eq('No.' + no + ' 基本分', r.base.total, b);
  eq('No.' + no + ' 加算込み', r.withBonus.total, w);
}
eq('No.1 加算分', run({}).bonus, 21000);
eq('No.7 対象外', run({ hours: 9 }).eligible, false);
// No.9 年間上限(1人 385,000円 × 26人 = 10,010,000円 → 10,000,000円で止まる)
{
  const r = run({ hours: 200, expensePerPerson: 500000, regular: 26 });
  eq('No.9 基本分(上限)', r.base.total, 10000000);
  eq('No.9 上限適用', r.base.capApplied, true);
  eq('No.9 加算込み(上限)', r.withBonus.total, 10000000);
  eq('No.9 加算分', r.bonus, 0);
  const r25 = run({ hours: 200, expensePerPerson: 500000, regular: 25 });
  eq('上限の手前(25人)', r25.base.total, 9625000);
  eq('上限の手前 適用なし', r25.base.capApplied, false);
  // 加算込み 1人 500,000円 × 20人 = 10,000,000円ちょうど:達しているが、超えてはいない
  const r20 = run({ hours: 200, expensePerPerson: 500000, regular: 20 });
  eq('加算込み 20人=上限ちょうど', r20.withBonus.total, 10000000);
  eq('ちょうど 達している', r20.withBonus.capReached, true);
  eq('ちょうど 切っていない', r20.withBonus.capApplied, false);
  eq('加算分の増加(上限前後)', r20.bonus, 10000000 - 7700000);
}

// ---- 9-2-2 境界 ----
const big = { expensePerPerson: 10000000 };
const lim = (h, size) => run(Object.assign({ hours: h, size }, big)).base.groups[0].perPerson.limit;
eq('9時間 対象外', run({ hours: 9 }).eligible, false);
eq('10時間 限度額', lim(10, 'small'), 150000);
eq('99時間', lim(99, 'small'), 150000);
eq('100時間', lim(100, 'small'), 300000);
eq('199時間', lim(199, 'small'), 300000);
eq('200時間', lim(200, 'small'), 500000);
eq('10時間(中小以外)', lim(10, 'large'), 100000);
eq('100時間(中小以外)', lim(100, 'large'), 200000);
eq('200時間(中小以外)', lim(200, 'large'), 300000);
eq('賃金助成の上限 1,300時間 → 1,200時間分', run({ hours: 1300, expensePerPerson: 0 }).base.wage, 800 * 1200);
eq('賃金助成 1,200時間ちょうど', run({ hours: 1200, expensePerPerson: 0 }).base.wage, 800 * 1200);
eq('受講率79% 対象外', run({ attendancePercent: 79 }).eligible, false);
eq('受講率80% 対象', run({ attendancePercent: 80 }).eligible, true);
eq('eラーニングは受講率を見ない', run({ format: 'elearning', hours: 20, attendancePercent: 50 }).eligible, true);
eq('受講率80% 賃金(30時間×0.8)', run({ attendancePercent: 80 }).base.wage, 800 * 24);

// ---- リスキリング(支給要領から手計算) ----
const rk = (o) => C.calculate(params, Object.assign({}, base, { course: 'reskilling' }, o));
eq('R1 中小30h 基本', rk({}).base.total, 75000 + 30000);
eq('R2 中小120h 経費80万', rk({ hours: 120, expensePerPerson: 800000 }).base.total, 400000 + 120000);
eq('R3 大企業50h', rk({ size: 'large', hours: 50, expensePerPerson: 200000 }).base.total, 120000 + 25000);
eq('R4 eラーニング', rk({ format: 'elearning', hours: 20 }).base.total, 75000);
eq('R5 設備投資加算(3人・導入費用100万円)', rk({ regular: 3, equipmentCost: 1000000 }).withBonus.equipment, 450000);
eq('R5b 10人以上は150万円が限度', rk({ regular: 10, equipmentCost: 10000000 }).withBonus.equipment, 1500000);
eq('R5c 設備投資加算は基本分に入らない', rk({ regular: 3, equipmentCost: 1000000 }).base.equipment, 0);
eq('R6 大企業は設備投資加算なし', rk({ size: 'large', regular: 3, equipmentCost: 1000000 }).withBonus.equipment, 0);

// ---- 実質負担 ----
eq('負担(No.1) 経費10万−45,000', run({}).burden.base, 55000);
eq('負担(No.1 加算込み)', run({}).burden.withBonus, 40000);

// ---- 日付 ----
eq('計画届 7/1開始(開始)', C.planWindow(params, '2027-07-01').from, '2027-01-01');
eq('計画届 7/1開始(締切)', C.planWindow(params, '2027-07-01').to, '2027-06-01');
eq('計画届 7/31開始(締切は6/30)', C.planWindow(params, '2027-07-31').to, '2027-06-30');
eq('計画届 7/30開始(開始は1/30)', C.planWindow(params, '2027-07-30').from, '2027-01-30');
eq('計画届 9/30開始(開始は3/30)', C.planWindow(params, '2027-09-30').from, '2027-03-30');
eq('計画届 9/30開始(締切は8/30)', C.planWindow(params, '2027-09-30').to, '2027-08-30');
eq('計画届 3/30開始(締切は2/28)', C.planWindow(params, '2027-03-30').to, '2027-02-28');
eq('計画届 3/30開始(開始は9/30)', C.planWindow(params, '2027-03-30').from, '2026-09-30');
eq('支給申請 3/31終了 → 5/31', C.claimDeadline(params, '2027-03-31'), '2027-05-31');
eq('支給申請 12/15終了 → 2/15', C.claimDeadline(params, '2026-12-15'), '2027-02-15');

// ---- 中小企業の判定 ----
eq('建設業 資本金3億円以下', C.judgeSme(params, 'other', 300000000, 1000), 'small');
eq('建設業 300人以下', C.judgeSme(params, 'other', 900000000, 300), 'small');
eq('建設業 両方超過', C.judgeSme(params, 'other', 900000000, 301), 'large');
eq('個人(資本金なし)は人数のみ', C.judgeSme(params, 'service', null, 100), 'small');

// ---- 入力の検証 ----
eq('人数0はエラー', run({ regular: 0, fixedTerm: 0 }).ok, false);
eq('9時間の案内に「10時間以上」', run({ hours: 9 }).warnings[0].includes('10時間以上'), true);

// ---- 設備投資加算は通学・同時双方向型のみ、年度の注意 ----
eq('R7 eラーニングは設備投資加算なし', rk({ format: 'elearning', hours: 20, regular: 3, equipmentCost: 1000000 }).withBonus.equipment, 0);
eq('年度内の終了は注意なし', C.dateWarnings(params, '2027-01-10', '2027-01-31').length, 0);
eq('支給申請が翌年度にかかる', C.dateWarnings(params, '2027-02-01', '2027-03-31').length, 1);
eq('開始日が翌年度', C.dateWarnings(params, '2027-04-10', '').length, 1);

// ---- 分割払い・有効期限 ----
{
  const i3 = C.installments(500000, 3);
  eq('分割 50万円÷3 月額', i3.monthly, 166666);
  eq('分割 最終回に端数', i3.last, 166668);
  eq('分割 合計が総額に一致', i3.monthly * (i3.n - 1) + i3.last, 500000);
  eq('分割 1回', C.installments(500000, 1).monthly, 500000);
  eq('分割 割り切れる', C.installments(600000, 6).last, 100000);
  eq('分割 0回は不可', C.installments(500000, 0), null);
  eq('分割 小数は切り捨て', C.installments(100000, 2.9).n, 2);
  eq('有効期限 30日後', C.addDaysIso('2026-11-17', 30), '2026-12-17');
  eq('有効期限 年またぎ', C.addDaysIso('2026-12-20', 30), '2027-01-19');
}

console.log(`\n${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail ? 1 : 0);
