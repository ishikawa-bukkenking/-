/*
 * 助成金シミュレーター 計算(画面なし・外部通信なし・保存なし)
 * 制度の数字は、すべて params.json から読む。このファイルに、数字は書かない。
 * ブラウザ(window.SubsidyCalc)と Node.js(require)の、どちらでも動く。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SubsidyCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const val = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x);

  // 小数の誤差(0.6*100000 など)を丸めてから、円未満を切り捨てる。端数処理は、params.common.rounding(仮)
  function yen(n) {
    return Math.floor(Math.round(n * 1000) / 1000 + 1e-9);
  }

  function limitTier(course, hours) {
    for (const t of course.expenseLimit) {
      if (hours >= t.minHours && (t.maxHours === null || hours < t.maxHours)) return t;
    }
    return null;
  }

  const GROUPS = [
    { key: 'regular', label: '正規雇用労働者等' },
    { key: 'fixedTerm', label: '有期契約労働者等' },
  ];

  // 1人あたり。bonus=true で、賃金要件等を満たす場合(加算込み)
  function perPerson(params, course, input, bonus, groupKey) {
    const c = params.common;
    const size = input.size;
    const phase = bonus ? 'bonus' : 'base';
    const elearning = input.format === 'elearning';
    const hours = input.hours;

    const rate = val(course.expenseRate[size][groupKey][phase]);
    let limit, tier = null;
    if (elearning) {
      limit = val(course.elearningLimit[size]);
    } else {
      tier = limitTier(course, hours);
      limit = val(tier[size]);
    }
    const expenseRaw = yen(input.expensePerPerson * rate);
    const expense = Math.min(expenseRaw, limit);

    const wageUnit = val(course.wageUnit[size][phase]);
    const sched = (input.scheduledPercent ?? 100) / 100;
    const attend = (input.attendancePercent ?? 100) / 100;
    const attendedScheduledHours = hours * sched * attend;
    const wageHours = elearning && !val(course.elearningWage) ? 0 : Math.min(attendedScheduledHours, val(c.wageHoursCap));
    const wage = yen(wageUnit * wageHours);

    return {
      rate, limit, limitHit: expenseRaw > limit, expenseRaw, expense,
      wageUnit, wageHours, wage, total: expense + wage,
      tier: tier ? { minHours: tier.minHours, maxHours: tier.maxHours } : null,
    };
  }

  function validate(params, input) {
    const errors = [];
    const warnings = [];
    let eligible = true;
    let reason = null;
    const c = params.common;
    const minH = val(c.minTrainingHours);

    if (!params.courses[input.course]) errors.push('コースを選んでください。');
    const n = (input.regular || 0) + (input.fixedTerm || 0);
    if (!(n > 0)) errors.push('受講者の人数を、1人以上で入力してください。');
    if (!(input.hours > 0)) errors.push('訓練時間を入力してください。');
    if (!(input.expensePerPerson >= 0)) errors.push('対象経費は、0円以上で入力してください(消費税込み)。');

    if (!errors.length) {
      if (input.hours < minH) {
        eligible = false;
        reason = 'under_min_hours';
        warnings.push('訓練時間は' + minH + '時間以上で入力してください。' + minH + '時間未満は、この助成金の対象外です。');
      } else if (input.format !== 'elearning' && (input.attendancePercent ?? 100) < val(c.attendanceMinPercent)) {
        eligible = false;
        reason = 'attendance';
        warnings.push('通学・同時双方向型は、実訓練時間の' + val(c.attendanceMinPercent) + '%以上の受講が必要です。この受講率では、対象外になります。');
      }
    }
    return { errors, warnings, eligible, reason };
  }

  function totalsFor(params, course, input, bonus) {
    const groups = GROUPS.filter((g) => (input[g.key] || 0) > 0).map((g) => {
      const pp = perPerson(params, course, input, bonus, g.key);
      const count = input[g.key];
      return { key: g.key, label: g.label, count, perPerson: pp,
        expense: pp.expense * count, wage: pp.wage * count, total: pp.total * count };
    });
    let expense = 0, wage = 0;
    for (const g of groups) { expense += g.expense; wage += g.wage; }
    const people = groups.reduce((a, g) => a + g.count, 0);

    // リスキリングコースの設備投資加算(中小企業のみ。加算込みの場合のみ)
    let equipment = 0, equipmentCapHit = false;
    const add = course.equipmentAddOn;
    if (bonus && add && input.size === 'small' && (input.equipmentCost || 0) > 0) {
      const raw = yen(input.equipmentCost * val(add.rate));
      const cap = people >= 10 ? val(add.capTenOrMore) : val(add.capPerWorker) * people;
      equipment = Math.min(raw, cap);
      equipmentCapHit = raw > cap;
    }

    const raw = expense + wage + equipment;
    const cap = val(course.annualCap);
    const capped = Math.min(raw, cap);
    return { groups, people, expense, wage, equipment, equipmentCapHit,
      raw, cap, total: capped, capApplied: raw > cap, capReached: raw >= cap };
  }

  function calculate(params, input) {
    const v = validate(params, input);
    const out = { ok: v.errors.length === 0, errors: v.errors, warnings: v.warnings.slice(),
      eligible: v.eligible, ineligibleReason: v.reason, input };
    if (!out.ok) return out;

    const course = params.courses[input.course];
    const people = (input.regular || 0) + (input.fixedTerm || 0);
    out.expenseTotal = input.expensePerPerson * people;

    if (!v.eligible) {
      const zero = { groups: [], people, expense: 0, wage: 0, equipment: 0, raw: 0, cap: val(course.annualCap),
        total: 0, capApplied: false, capReached: false, equipmentCapHit: false };
      out.base = zero; out.withBonus = zero; out.bonus = 0;
      out.burden = { base: out.expenseTotal, withBonus: out.expenseTotal };
      return out;
    }

    out.base = totalsFor(params, course, input, false);
    out.withBonus = totalsFor(params, course, input, true);
    out.bonus = out.withBonus.total - out.base.total;

    // 実質負担(目安) = 対象経費の合計 − 経費助成の合計(賃金助成は引かない。別に表示)。
    // 年間上限で切った場合は、切った分を、経費助成から先に減らす(仮)
    const exp = (t) => Math.max(0, t.expense - (t.raw - t.total));
    out.burden = {
      base: out.expenseTotal - exp(out.base),
      withBonus: out.expenseTotal - exp(out.withBonus),
    };

    if (out.base.capApplied) out.warnings.push('1事業所1年度の上限(' + val(course.annualCap).toLocaleString('ja-JP') + '円)に達しています。超えた分は、支給されません。');
    else if (out.base.capReached) out.warnings.push('1事業所1年度の上限に達しています。');
    if (input.format === 'elearning') out.warnings.push('eラーニング・通信制は、経費助成のみです(賃金助成は対象外)。');
    return out;
  }

  // ---- 日付(目安。休日・祝日の扱いは、労働局の指示に従う) ----
  function parse(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  function iso(dt) { return dt.toISOString().slice(0, 10); }
  function addMonths(dt, n) {
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + n, d = dt.getUTCDate();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(d, last)));
  }
  function addDays(dt, n) { return new Date(dt.getTime() + n * 86400000); }

  // 計画届:訓練開始日の6か月前〜1か月前(同日。同日がなければ月末)
  function planWindow(params, startIso) {
    const s = parse(startIso), c = params.common.planWindowMonths;
    return { from: iso(addMonths(s, -val(c.earliest))), to: iso(addMonths(s, -val(c.latest))) };
  }
  // 支給申請:訓練終了日の翌日から2か月以内
  function claimDeadline(params, endIso) {
    const first = addDays(parse(endIso), 1);
    return iso(addDays(addMonths(first, val(params.common.claimWithinMonthsAfterEnd)), -1));
  }
  // 割増し分の申請:要件を満たす賃金を3か月継続して支払った日の翌日から5か月以内
  function bonusClaimDeadline(params, threeMonthsPaidEndIso) {
    const first = addDays(parse(threeMonthsPaidEndIso), 1);
    return iso(addDays(addMonths(first, val(params.common.bonusClaim.withinMonthsAfter)), -1));
  }

  // 中小企業の判定(資本金か労働者数のどちらか一方が基準以下)。資本金がない法人・個人は、労働者数のみ
  function judgeSme(params, industryKey, capital, employees) {
    const d = params.common.smeDefinition[industryKey];
    if (!d) return null;
    const byCapital = capital != null && capital <= val(d.capital);
    const byEmployees = employees != null && employees <= val(d.employees);
    return byCapital || byEmployees ? 'small' : 'large';
  }

  return { calculate, validate, planWindow, claimDeadline, bonusClaimDeadline, judgeSme, val, yen };
});
