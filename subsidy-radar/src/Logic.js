/**
 * Logic.js — 純粋関数(Apps Script と Node の両方で動く。外部アクセスなし)
 * 画面・シート・通信は触らない。テストは tests/logic.test.js。
 */
var REVIEW = '要確認';

function nfkc_(s) { return String(s == null ? '' : s).normalize('NFKC'); }

/* ---------- 日付 ---------- */

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function validYmd_(y, m, d) {
  if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  var t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function ymd_(y, m, d) { return y + '-' + pad2_(m) + '-' + pad2_(d); }

/** UTC の ISO 文字列 → 日本時間の 'YYYY-MM-DD'(読めなければ '') */
function isoToJstDate_(iso) {
  var t = Date.parse(iso);
  if (isNaN(t)) return '';
  var j = new Date(t + 9 * 3600 * 1000);
  return ymd_(j.getUTCFullYear(), j.getUTCMonth() + 1, j.getUTCDate());
}

/**
 * 日本語の日付表記 → {date, status, note}
 * status: 'ok'(日付が読めた) / 'ongoing'(随時・予算がなくなり次第など) / 'review'(要確認。推測しない)
 */
function parseJaDate_(text) {
  var s = nfkc_(text).replace(/\s+/g, '');
  if (!s) return { date: '', status: 'review', note: '空' };
  if (/随時|なくなり次第|なくなるまで|達し次第|通年|常時/.test(s)) return { date: '', status: 'ongoing', note: s.slice(0, 20) };
  var m, y;
  if ((m = s.match(/(令和|平成)(元|\d+)年(\d{1,2})月(\d{1,2})日/))) {
    var n = m[2] === '元' ? 1 : parseInt(m[2], 10);
    y = (m[1] === '令和' ? 2018 : 1988) + n;
    return finishYmd_(y, +m[3], +m[4]);
  }
  if ((m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/))) return finishYmd_(+m[1], +m[2], +m[3]);
  if ((m = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/))) return finishYmd_(+m[1], +m[2], +m[3]);
  if (/(\d{1,2})月(\d{1,2})日/.test(s) || /(^|[^\d])\d{1,2}\/\d{1,2}([^\d]|$)/.test(s)) {
    return { date: '', status: 'review', note: '年がない' };
  }
  return { date: '', status: 'review', note: '読み取れない' };
}

function finishYmd_(y, m, d) {
  return validYmd_(y, m, d) ? { date: ymd_(y, m, d), status: 'ok', note: '' }
    : { date: '', status: 'review', note: '日付が正しくない' };
}

/** 「A〜B」「〜Bまで」「Aから」の期間 → {start,end,status,note}。どちらか読めなければ status='review' */
function parseJaPeriod_(text) {
  var s = nfkc_(text).replace(/\s+/g, '');
  var parts = s.split(/〜|~|から|—|–/);
  var a = parts[0] || '', b = parts.length > 1 ? parts.slice(1).join('') : '';
  var pa = a ? parseJaDate_(a) : null, pb = b ? parseJaDate_(b.replace(/まで$|迄$/, '')) : null;
  var out = { start: pa && pa.status === 'ok' ? pa.date : '', end: pb && pb.status === 'ok' ? pb.date : '', status: 'ok', note: '' };
  [pa, pb].forEach(function (p) {
    if (p && p.status === 'review') { out.status = 'review'; out.note = p.note; }
    if (p && p.status === 'ongoing' && out.status === 'ok') { out.status = 'ongoing'; out.note = p.note; }
  });
  if (!pa && !pb) out.status = 'review';
  return out;
}

/** 'YYYY-MM-DD' 同士の日数差(b - a) */
function daysBetween_(a, b) {
  var pa = a.split('-'), pb = b.split('-');
  return Math.round((Date.UTC(+pb[0], pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], pa[1] - 1, +pa[2])) / 86400000);
}

/** 状態(募集中 / 予定 / 終了)。日付が読めなければ '要確認' */
function statusOf_(start, end, today) {
  if (!start && !end) return REVIEW;
  if (end && end < today) return '終了';
  if (start && start > today) return '予定';
  return end || start ? '募集中' : REVIEW;
}

/** 'あと3日' / '本日まで' / '終了' / '' */
function daysLabel_(end, today) {
  if (!end) return '';
  var n = daysBetween_(today, end);
  return n < 0 ? '終了' : (n === 0 ? '本日まで' : 'あと' + n + '日');
}

/** 締切通知の段階: 1(前日以内) / 3 / 7 / 0(対象外) */
function deadlineLevel_(end, today) {
  if (!end) return 0;
  var n = daysBetween_(today, end);
  if (n < 0 || n > 7) return 0;
  return n <= 1 ? 1 : (n <= 3 ? 3 : 7);
}

/* ---------- 点数 ---------- */

var NEGATIVE_FLOOR = -30;
var BROAD_INDUSTRY_COUNT = 8;
var CATEGORY_CAPS = { '物件王の扱う制度': 40, '加盟店の業種': 30, '中小企業向け': 20, '地域': 15, '対象': 10 };

/**
 * rules: [{category, keyword, points, scope}]  scope: all(既定)/title/industry/area/industry_only
 * rec: {title, institution, purpose, industry, area, excerpt, target}
 */
function scoreRecord_(rec, rules, thresholds, caps) {
  caps = caps || CATEGORY_CAPS;
  // 業種が多数並ぶ(=全業種が対象)制度は、業種欄では加点しない。建設・不動産に絞った制度だけを上に出すため
  var indItems = nfkc_(rec.industry).split('/').map(function (x) { return x.trim(); }).filter(Boolean);
  var broadIndustry = indItems.length >= BROAD_INDUSTRY_COUNT;
  var hay = {
    title: nfkc_(rec.title),
    industry: nfkc_(rec.industry),
    area: nfkc_(rec.area),
    all: nfkc_([rec.title, rec.institution, rec.purpose, broadIndustry ? '' : rec.industry, rec.area, rec.target, rec.excerpt].join(' '))
  };
  var perCat = {}, reasons = [], onlySet = {};
  rules.forEach(function (r) { if (r.scope === 'industry_only') onlySet[nfkc_(r.keyword).trim()] = true; });
  rules.forEach(function (r) {
    var kw = nfkc_(r.keyword).trim();
    var pts = Number(r.points);
    if (!kw || isNaN(pts) || pts === 0) return;
    var scope = r.scope || 'all', hit = false;
    if (scope === 'industry_only') {
      // 業種が「引く条件」の業種だけで構成されているときだけ引く(建設業など他の業種を含むなら引かない)
      var items = hay.industry.split('/').map(function (x) { return x.trim(); }).filter(Boolean);
      hit = items.length > 0 && items.indexOf(kw) >= 0 && items.every(function (x) { return onlySet[x]; });
    } else {
      hit = (hay[scope] || hay.all).indexOf(kw) >= 0;
    }
    if (!hit) return;
    var cat = r.category || 'その他';
    var cur = perCat[cat] || 0, cap = caps[cat];
    var add = pts;
    if (cap != null && pts > 0) add = Math.max(0, Math.min(pts, cap - cur));
    if (pts < 0) add = Math.max(pts, NEGATIVE_FLOOR - cur); // 引く点数は、カテゴリごとに下限がある
    if (add === 0) return;
    perCat[cat] = cur + add;
    reasons.push(cat + ':' + kw + '(' + (add > 0 ? '+' : '') + add + ')');
  });
  var total = 0;
  Object.keys(perCat).forEach(function (k) { total += perCat[k]; });
  var th = thresholds || { high: 30, mid: 10 };
  return { score: total, level: total >= th.high ? '高' : (total >= th.mid ? '中' : '低'), reasons: reasons.join(' / ') };
}

/* ---------- 重複の候補 ---------- */

function normTitle_(t) {
  return nfkc_(t)
    .replace(/（.*?）|\(.*?\)|【.*?】|［.*?］|\[.*?\]/g, '')
    .replace(/令和\d+年度?|平成\d+年度?|\d{4}年度?|第?\d+[次回期]/g, '')
    .replace(/公募|募集|について|のご案内|事業$/g, '')
    .replace(/[\s　・、。,.\-_:：「」『』]/g, '')
    .toLowerCase();
}

function bigrams_(s) {
  var set = {}, n = 0;
  for (var i = 0; i < s.length - 1; i++) { var g = s.substr(i, 2); if (!set[g]) { set[g] = 1; n++; } }
  return { set: set, n: n };
}

function titleSimilarity_(a, b) {
  var x = normTitle_(a), y = normTitle_(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  var bx = bigrams_(x), by = bigrams_(y), inter = 0;
  Object.keys(bx.set).forEach(function (g) { if (by.set[g]) inter++; });
  var union = bx.n + by.n - inter;
  return union ? inter / union : 0;
}

/** 別の情報源の2件が「同じ可能性」か。'' / '候補' / '有力'。完全一致でも自動では消さない */
function duplicateKind_(a, b) {
  if (a.source === b.source) return '';
  var sim = titleSimilarity_(a.title, b.title);
  var closeEnd = a.end && b.end && Math.abs(daysBetween_(a.end, b.end)) <= 3;
  var sameInst = a.institution && b.institution && nfkc_(a.institution) === nfkc_(b.institution);
  if (sim >= 0.85 && (closeEnd || sameInst || (!a.end || !b.end))) return '有力';
  if (sim >= 0.6 && (closeEnd || sameInst)) return '候補';
  return '';
}

/* ---------- ページの変化検知 ---------- */

var DEFAULT_DROP = [/アクセス(数|カウンタ)/, /閲覧(数|回数)/, /Copyright|©/, /^広告$|^PR$/, /現在の時刻/, /印刷用|ページの先頭/];

/** HTML → 行のリスト。mainStart/mainEnd は取り出す範囲の目印(文字列)。目印がなければ全体 */
function htmlToLines_(html, cfg) {
  cfg = cfg || {};
  var h = String(html || '');
  if (cfg.start) { var i = h.indexOf(cfg.start); if (i >= 0) h = h.slice(i); }
  if (cfg.end) { var j = h.indexOf(cfg.end); if (j >= 0) h = h.slice(0, j); }
  h = h.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|nav|footer|header|form)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href="([^"]*\.(?:pdf|xlsx?|docx?|zip))"[^>]*>([\s\S]*?)<\/a>/gi, function (_, href, label) { return '\n' + label + ' [' + href.split('/').pop() + ']\n'; })
    .replace(/<\/(p|div|li|tr|h[1-6]|dt|dd|section|table|ul|ol)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  var drops = DEFAULT_DROP.concat((cfg.drop || []).map(function (p) { return p instanceof RegExp ? p : new RegExp(p); }));
  return h.split('\n').map(function (l) { return nfkc_(l).replace(/\s+/g, ' ').trim(); })
    .filter(function (l) { return l.length >= 3 && !drops.some(function (re) { return re.test(l); }); });
}

/** 行ごとの指紋: 保存するのは「行のハッシュ」と「先頭40文字」だけ(本文の丸ごと保存はしない) */
function fingerprintLines_(lines, hash8) {
  return lines.map(function (l) { return { h: hash8(l), t: l.slice(0, 40) }; });
}

/** 指紋の差 → {added:[先頭60文字...], removed:[先頭40文字...]}。同じ行の入れ替わり(順序だけ)は無視 */
function diffFingerprints_(oldFp, newFp, newLines) {
  var oldCount = {}, newCount = {};
  oldFp.forEach(function (x) { oldCount[x.h] = (oldCount[x.h] || 0) + 1; });
  newFp.forEach(function (x) { newCount[x.h] = (newCount[x.h] || 0) + 1; });
  var added = [], removed = [], used = {};
  newFp.forEach(function (x, i) {
    used[x.h] = (used[x.h] || 0) + 1;
    if (used[x.h] > (oldCount[x.h] || 0)) added.push((newLines ? newLines[i] : x.t).slice(0, 60));
  });
  var usedOld = {};
  oldFp.forEach(function (x) {
    usedOld[x.h] = (usedOld[x.h] || 0) + 1;
    if (usedOld[x.h] > (newCount[x.h] || 0)) removed.push(x.t);
  });
  return { added: added, removed: removed };
}

/* ---------- 通知の文面(Chatwork 記法) ---------- */

function fmtLimit_(n) {
  if (n == null || n === '' || isNaN(Number(n))) return REVIEW;
  n = Number(n);
  if (n >= 100000000) {
    var oku = Math.floor(n / 100000000), man = Math.round((n % 100000000) / 10000);
    return oku + '億' + (man ? man + '万' : '') + '円';
  }
  return n >= 10000 ? (n % 10000 === 0 ? n / 10000 : (n / 10000).toFixed(1).replace(/\.0$/, '')) + '万円' : n + '円';
}

function fmtPeriod_(start, end, today) {
  var s = start ? start.replace(/-/g, '/') : REVIEW, e = end ? end.replace(/-/g, '/') + '(' + daysLabel_(end, today) + ')' : REVIEW;
  return s + ' 〜 ' + e;
}

/**
 * ctx: { today, watch:[{name,url,added,removed,pdf}], deadlines:[{title,end,url,level}],
 *        newHigh:[{title,institution,start,end,limit,reasons,url}], midCount, sources:[{name,ok,count,error}],
 *        sheetUrl, prevFailed }
 */
function buildMorningMessage_(ctx) {
  var L = [], today = ctx.today;
  var bad = (ctx.sources || []).filter(function (s) { return !s.ok; });
  L.push('[info][title]補助金レーダー ' + today.replace(/-/g, '/') + '[/title]');
  if (bad.length) L.push('【取れなかった情報源】' + bad.map(function (s) { return s.name + '(' + (s.error || '失敗') + ')'; }).join('、') + '\n※この情報源の分は、今日は確認できていません');
  if (ctx.prevFailed) L.push('【お知らせ】前回の通知は送信に失敗していました');
  var empty = !(ctx.watch.length || ctx.deadlines.length || ctx.newHigh.length);
  if (empty) {
    L.push('本日の新着なし(新着の点数「中」: ' + (ctx.midCount || 0) + '件)');
  } else {
    if (ctx.watch.length) {
      L.push('■ 制度の更新(' + ctx.watch.length + '件)');
      ctx.watch.forEach(function (w) {
        var line = '・' + w.name;
        if (w.pdf) line += '\n  ' + w.pdf;
        (w.added || []).slice(0, 3).forEach(function (t) { line += '\n  + ' + t; });
        (w.removed || []).slice(0, 3).forEach(function (t) { line += '\n  - ' + t; });
        var more = ((w.added || []).length - 3 > 0 ? (w.added.length - 3) : 0) + ((w.removed || []).length - 3 > 0 ? (w.removed.length - 3) : 0);
        if (more) line += '\n  ほか' + more + '行';
        L.push(line + '\n  ' + w.url);
      });
    }
    if (ctx.deadlines.length) {
      L.push('■ 締切が近い(点数「高」)');
      ctx.deadlines.slice(0, 8).forEach(function (d) {
        L.push('・' + d.title + '\n  ' + d.end.replace(/-/g, '/') + '(' + daysLabel_(d.end, today) + ')\n  ' + d.url);
      });
      if (ctx.deadlines.length > 8) L.push('  ほか' + (ctx.deadlines.length - 8) + '件は表で確認');
    }
    if (ctx.newHigh.length) {
      L.push('■ 新着(点数「高」 ' + ctx.newHigh.length + '件)');
      ctx.newHigh.slice(0, 10).forEach(function (n) {
        L.push('・' + n.title + '\n  ' + (n.institution ? n.institution + ' / ' : '') + '上限' + fmtLimit_(n.limit) +
          '\n  ' + fmtPeriod_(n.start, n.end, today) + '\n  理由: ' + n.reasons + '\n  ' + n.url);
      });
    }
    if (ctx.newHigh.length > 10) L.push('  ほか' + (ctx.newHigh.length - 10) + '件は表で確認');
    L.push('新着の点数「中」: ' + (ctx.midCount || 0) + '件(表で確認)');
  }
  var ok = (ctx.sources || []).filter(function (s) { return s.ok; });
  if (ok.length) L.push('取得: ' + ok.map(function (s) { return s.name + ' ' + s.count + '件'; }).join(' / '));
  if (ctx.sheetUrl) L.push('一覧(表): ' + ctx.sheetUrl);
  L.push('出典: Jグランツ(デジタル庁)、厚生労働省 ほか。金額・日付は必ず元のページで確認してください[/info]');
  return L.join('\n');
}
