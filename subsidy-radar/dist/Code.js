// 補助金レーダー(自動生成: src/ を連結したもの。直すときは src/ を直して、node build.js を実行)

/* ===== Config.js ===== */
/**
 * Config.js — 既定値と「直す場所」を1か所に集める。
 * 運用中に直すもの(キーワード、情報源のON/OFF、ウォッチURL、通知の設定)は、
 * このファイルではなく、スプレッドシートの「設定」「ウォッチ」タブで直す。
 */

var APP_NAME = '補助金レーダー';
var DB_NAME = '補助金レーダーDB';

var TAB = {
  SUBSIDY: '制度', HISTORY: '更新の履歴', WATCH: 'ウォッチ', NOTICE: '通知の履歴',
  RUNS: '実行の記録', SETTINGS: '設定', MARKS: '気になる', ARCHIVE: 'アーカイブ'
};

var HEADERS = {};
HEADERS['制度'] = ['ID', '名前', '実施機関', '種別', '地域', '対象', '上限額', '補助率', '受付開始', '受付終了', '公開日', '更新日',
  '元のリンク', '出典', '短い抜粋', '点数', '段階', '点数の理由', '状態', '要確認', '初めて見つけた日', '最後に見た日',
  '内容のハッシュ', '新着扱い', '締切通知済', '重複候補', '詳細取得済', '情報源', '利用目的', '業種'];
HEADERS['更新の履歴'] = ['検知した日', '制度ID', '名前', '変わった項目', '前の値', '後の値'];
HEADERS['ウォッチ'] = ['有効', '名前', 'URL', '種別', '範囲の開始目印', '範囲の終了目印', '除外パターン', '最後に見た日', '本文のハッシュ',
  '行の指紋', '差分検知日', '最後の差分', '通知済の日', 'メモ'];
HEADERS['通知の履歴'] = ['日時', '日付', '宛先', 'モード', '件数', '結果', 'メモ'];
HEADERS['実行の記録'] = ['日時', '日付', '情報源', '取得件数', '新着件数', '更新件数', 'エラー', '所要秒'];
HEADERS['設定'] = ['区分', '項目', '値', '点数', '範囲', 'メモ'];
HEADERS['気になる'] = ['制度ID', '印', 'メモ', '付けた人', '日付'];
HEADERS['アーカイブ'] = HEADERS['制度'];

/** 点数の初期値(たたき台)。[カテゴリ, キーワード, 点数, 範囲(空=全項目)] — 設定タブに書き出される */
var DEFAULT_RULES = [
  ['物件王の扱う制度', 'デジタル化・AI導入', 30, ''], ['物件王の扱う制度', 'IT導入補助金', 30, ''], ['物件王の扱う制度', '人材開発支援助成金', 30, ''],
  ['物件王の扱う制度', '人材育成支援', 25, ''], ['物件王の扱う制度', 'リスキリング', 20, ''], ['物件王の扱う制度', 'キャリアアップ助成金', 30, ''],
  ['物件王の扱う制度', '業務改善助成金', 30, ''],
  ['加盟店の業種', '建設', 15, ''], ['加盟店の業種', '工務店', 15, ''], ['加盟店の業種', 'リフォーム', 15, ''], ['加盟店の業種', '住宅', 15, ''],
  ['加盟店の業種', '不動産', 15, ''], ['加盟店の業種', '空き家', 15, ''], ['加盟店の業種', '省エネ', 12, ''], ['加盟店の業種', '断熱', 12, ''],
  ['加盟店の業種', '耐震', 12, ''], ['加盟店の業種', '長期優良住宅', 15, ''], ['加盟店の業種', 'ZEH', 12, ''],
  ['中小企業向け', '小規模事業者持続化補助金', 15, ''], ['中小企業向け', 'ものづくり補助金', 15, ''], ['中小企業向け', '新事業進出', 15, ''],
  ['中小企業向け', '省力化投資', 15, ''], ['中小企業向け', '事業承継', 10, ''], ['中小企業向け', 'M&A', 10, ''], ['中小企業向け', '賃上げ', 10, ''],
  ['地域', '全国', 5, 'area'], ['地域', '愛知', 10, 'area'], ['地域', '岐阜', 10, 'area'],
  ['対象', '中小企業', 5, ''], ['対象', '小規模事業者', 5, ''], ['対象', '個人事業主', 3, ''],
  ['引く条件', '農業、林業', -25, 'industry_only'], ['引く条件', '漁業', -25, 'industry_only'], ['引く条件', '医療、福祉', -25, 'industry_only'],
  ['引く条件', '教育、学習支援業', -20, 'industry_only'], ['引く条件', 'NPO', -15, ''], ['引く条件', '学校法人', -15, ''],
  ['引く条件', '個人向け', -20, 'title'], ['引く条件', '農林水産', -20, 'title']
];

var DEFAULT_SETTINGS = [
  ['しきい値', '高', 30, '', '', '点数がこれ以上なら「高」(通知に載る)'],
  ['しきい値', '中', 10, '', '', '点数がこれ以上なら「中」(通知は件数だけ)'],
  ['情報源', 'jgrants', 'ON', '', '', 'Jグランツ API(デジタル庁)'],
  ['情報源', 'watch', 'ON', '', '', 'ウォッチ(指定ページの変化検知)'],
  ['通知', '送信モード', 'dry', '', '', 'dry=送らず履歴だけ / test=テストの部屋へ送る / prod=本番(承認後に手動で変える)'],
  ['通知', '該当なしの日も送る', 'ON', '', '', 'OFFにすると、該当が1件もない日は送らない'],
  ['通知', '時刻(時)', 9, '', '', '毎朝この時刻に通知。変えたら installTriggers を実行'],
  ['通知', '収集の時刻(時)', 8, '', '', '通知の前に収集する。変えたら installTriggers を実行'],
  ['保存', 'アーカイブまでの日数', 90, '', '', '受付終了からこの日数たったものをアーカイブへ移す']
];

/** Jグランツの検索語(2文字以上が必須)。多くしすぎない。1語ごとに待ち時間を入れる */
var JGRANTS_KEYWORDS = ['補助金', '助成金', '支援事業', '住宅', 'リフォーム', '建設', '不動産', '空き家', '省エネ', '耐震', '中小企業', '小規模事業者',
  '賃上げ', '人材育成', 'デジタル', 'IT導入', '事業承継', '省力化'];

var JGRANTS = {
  BASE: 'https://api.jgrants-portal.go.jp/exp',
  SORT: 'acceptance_end_datetime', ORDER: 'ASC', ACCEPTANCE: '1',
  WAIT_MS: 1500,            // 1リクエストごとの待ち時間
  MAX_DETAIL_PER_RUN: 40,   // 1回の実行で取る詳細の上限(残りは翌日に回す)。6分の上限に余裕を持たせる
  SOURCE_NAME: 'Jグランツ(デジタル庁)'
};

/**
 * ウォッチの初期値。範囲の目印(start/end)は、ページの作りが変わったらここ、または「ウォッチ」タブで直す。
 * 厚労省のページは <main> の中だけを見る。
 */
var WATCH_SEEDS = [
  { enabled: 'ON', name: '人材開発支援助成金(厚生労働省)', url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/kyufukin/d01-1.html', kind: 'html', start: '<main', end: '</main>' },
  { enabled: 'ON', name: 'キャリアアップ助成金(厚生労働省)', url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/part_haken/jigyounushi/career.html', kind: 'html', start: '<main', end: '</main>' },
  { enabled: 'ON', name: '業務改善助成金(厚生労働省)', url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/zigyonushi/shienjigyou/03.html', kind: 'html', start: '<main', end: '</main>' },
  { enabled: 'OFF', name: 'デジタル化・AI導入補助金(公式サイト)', url: 'https://it-shien.smrj.go.jp/', kind: 'html', start: '', end: '', memo: '利用条件(robots.txt・規約)の確認ができるまでOFF' }
];

var WATCH = { WAIT_MS: 3000, USER_AGENT: 'BukkenkingSubsidyRadar/1.0 (internal; once-a-day)' };

var NOTIFY = { CHATWORK_BASE: 'https://api.chatwork.com/v2', MAX_CHARS: 3500 };


/* ===== Logic.js ===== */
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


/* ===== Util.js ===== */
/** Util.js — Apps Script 側の小さな道具(ハッシュ、日付、待ち時間) */

function sha256Hex_(s) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function hash8(s) { return sha256Hex_(s).slice(0, 8); }

/** 今日(日本時間)。テストでは TEST_TODAY で固定できる */
function today_() {
  if (typeof TEST_TODAY !== 'undefined' && TEST_TODAY) return TEST_TODAY;
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}
function nowText_() {
  if (typeof TEST_TODAY !== 'undefined' && TEST_TODAY) return TEST_TODAY + ' 00:00:00';
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}
function props_() { return PropertiesService.getScriptProperties(); }

/** エラー文は短くし、URL・トークンらしき長い文字列は伏せる(ログに認証情報を残さない) */
function safeError_(e) {
  var m = String((e && e.message) || e || '失敗');
  return m.replace(/[A-Za-z0-9_\-]{24,}/g, '***').slice(0, 80);
}


/* ===== Db.js ===== */
/**
 * Db.js — スプレッドシート「補助金レーダーDB」の読み書き。
 * 日付が勝手に変換されないよう、全セルを「書式なしテキスト」にしてある。
 */

function setup() {
  var ss, id = props_().getProperty('DB_ID');
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create(DB_NAME);
    props_().setProperty('DB_ID', ss.getId());
  }
  Object.keys(TAB).forEach(function (k) {
    var name = TAB[k];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
      sh.getRange(1, 1, 1, HEADERS[name].length).setFontWeight('bold');
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1000, HEADERS[name].length).setNumberFormat('@');
    }
  });
  var first = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
  seedSettings_(ss);
  seedWatch_(ss);
  Logger.log('DB: ' + ss.getUrl());
  return ss.getUrl();
}

function openDb_() {
  var id = props_().getProperty('DB_ID');
  if (!id) throw new Error('DBがありません。先に setup() を実行してください');
  return SpreadsheetApp.openById(id);
}

function cellText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  return v == null ? '' : v;
}

function readTab_(ss, name) {
  var sh = ss.getSheetByName(name), head = HEADERS[name];
  var n = sh.getLastRow();
  if (n < 2) return [];
  var vals = sh.getRange(2, 1, n - 1, head.length).getValues();
  return vals.filter(function (r) { return r.some(function (c) { return c !== ''; }); }).map(function (r) {
    var o = {}; head.forEach(function (h, i) { o[h] = cellText_(r[i]); }); return o;
  });
}

function toRow_(name, o) { return HEADERS[name].map(function (h) { var v = o[h]; return v == null ? '' : v; }); }

function writeTab_(ss, name, objs) {
  var sh = ss.getSheetByName(name), head = HEADERS[name];
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, head.length).clearContent();
  if (!objs.length) return;
  sh.getRange(2, 1, objs.length, head.length).setNumberFormat('@');
  sh.getRange(2, 1, objs.length, head.length).setValues(objs.map(function (o) { return toRow_(name, o); }));
}

function appendTab_(ss, name, objs) {
  if (!objs.length) return;
  var sh = ss.getSheetByName(name), head = HEADERS[name];
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, objs.length, head.length).setNumberFormat('@');
  sh.getRange(start, 1, objs.length, head.length).setValues(objs.map(function (o) { return toRow_(name, o); }));
}

/* ---------- 設定 ---------- */

function seedSettings_(ss) {
  if (readTab_(ss, TAB.SETTINGS).length) return; // 既にあれば上書きしない(運用中の変更を守る)
  var rows = DEFAULT_SETTINGS.map(function (r) { return { '区分': r[0], '項目': r[1], '値': r[2], '点数': r[3], '範囲': r[4], 'メモ': r[5] }; });
  DEFAULT_RULES.forEach(function (r) { rows.push({ '区分': 'キーワード', '項目': r[1], '値': r[0], '点数': r[2], '範囲': r[3], 'メモ': '' }); });
  appendTab_(ss, TAB.SETTINGS, rows);
}

function seedWatch_(ss) {
  if (readTab_(ss, TAB.WATCH).length) return;
  appendTab_(ss, TAB.WATCH, WATCH_SEEDS.map(function (w) {
    return { '有効': w.enabled, '名前': w.name, 'URL': w.url, '種別': w.kind, '範囲の開始目印': w.start, '範囲の終了目印': w.end, '除外パターン': '', 'メモ': w.memo || '' };
  }));
}

function getSettings_(ss) {
  var rows = readTab_(ss, TAB.SETTINGS), s = { rules: [], thresholds: { high: 30, mid: 10 }, sources: {}, notify: {}, keep: 90 };
  rows.forEach(function (r) {
    if (r['区分'] === 'キーワード') s.rules.push({ category: r['値'], keyword: r['項目'], points: Number(r['点数']), scope: r['範囲'] });
    else if (r['区分'] === 'しきい値') s.thresholds[r['項目'] === '高' ? 'high' : 'mid'] = Number(r['値']);
    else if (r['区分'] === '情報源') s.sources[r['項目']] = String(r['値']).toUpperCase() === 'ON';
    else if (r['区分'] === '通知') s.notify[r['項目']] = r['値'];
    else if (r['区分'] === '保存' && r['項目'] === 'アーカイブまでの日数') s.keep = Number(r['値']) || 90;
  });
  return s;
}


/* ===== Jgrants.js ===== */
/**
 * Jgrants.js — Jグランツ API(デジタル庁)から集める。
 * 公式の API 仕様: https://developers.digital.go.jp/documents/jgrants/api/
 *  - 一覧 GET /v1/public/subsidies … keyword(2文字以上)・sort・order・acceptance が必須。認証なし
 *  - 詳細 GET /v2/public/subsidies/id/{id}
 * ポータルのページ(www.jgrants-portal.go.jp)は robots.txt で禁止のため、取得しない。リンクとして出すだけ。
 * 取れないもの: 実施機関・公開日・更新日(API に無い)→ 空欄のまま(推測しない)。
 */

function jgGet_(path, params) {
  var qs = params ? '?' + Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&') : '';
  var res = UrlFetchApp.fetch(JGRANTS.BASE + path + qs, { muteHttpExceptions: true, headers: { 'User-Agent': WATCH.USER_AGENT, 'Accept': 'application/json' } });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('HTTP ' + code);
  return JSON.parse(res.getContentText());
}

function kindOf_(title) {
  var t = nfkc_(title);
  return t.indexOf('助成金') >= 0 ? '助成金' : (t.indexOf('補助金') >= 0 ? '補助金' : 'その他');
}

function excerptFrom_(html) {
  var t = nfkc_(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/■[^\s]*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  var i = t.indexOf('。');
  return (i > 0 && i < 100 ? t.slice(0, i + 1) : t.slice(0, 100));
}

/** 一覧の1件 → 制度の行 */
function jgFromList_(it, today) {
  var start = isoToJstDate_(it.acceptance_start_datetime), end = isoToJstDate_(it.acceptance_end_datetime);
  // API は未設定の上限額を 0 で返すことがある。「0円」と見せると誤解を招くので、0 は空欄(要確認)にする
  var lim = (it.subsidy_max_limit == null || it.subsidy_max_limit === '' || Number(it.subsidy_max_limit) <= 0) ? '' : Number(it.subsidy_max_limit);
  var review = [];
  if (!start) review.push('受付開始'); if (!end) review.push('受付終了'); if (lim === '') review.push('上限額');
  return {
    'ID': 'jgrants:' + it.id, '名前': it.title || '', '実施機関': '', '種別': kindOf_(it.title), '地域': it.target_area_search || '',
    '対象': it.target_number_of_employees || '', '上限額': lim, '補助率': '', '受付開始': start, '受付終了': end, '公開日': '', '更新日': '',
    '元のリンク': 'https://www.jgrants-portal.go.jp/subsidy/' + it.id, '出典': JGRANTS.SOURCE_NAME, '短い抜粋': '',
    '状態': statusOf_(start, end, today), '要確認': review.join(','), '情報源': 'jgrants', '詳細取得済': ''
  };
}

var JG_TRACKED = ['名前', '受付開始', '受付終了', '上限額', '地域', '対象', '補助率'];

function jgCoreHash_(row) { return sha256Hex_(JG_TRACKED.map(function (k) { return row[k]; }).join('|')); }

function jgApplyDetail_(row, d) {
  row['補助率'] = d.subsidy_rate || '';
  row['利用目的'] = d.use_purpose || '';
  row['業種'] = d.industry || '';
  row['短い抜粋'] = excerptFrom_(d.subsidy_catch_phrase || d.detail);
  if (d.front_subsidy_detail_page_url && /^https:\/\/www\.jgrants-portal\.go\.jp\//.test(d.front_subsidy_detail_page_url)) row['元のリンク'] = d.front_subsidy_detail_page_url;
  row['詳細取得済'] = 'Y';
  return row;
}

/**
 * 収集。戻り値: {ok, count, added, updated, error, rows(全制度の配列に反映済み)}
 * ctx: {ss, settings, today, rowsById(既存), history(配列。追記用), initial}
 */
function collectJgrants_(ctx) {
  var out = { ok: true, count: 0, added: 0, updated: 0, error: '' }, seen = {};
  try {
    for (var i = 0; i < JGRANTS_KEYWORDS.length; i++) {
      if (i > 0) Utilities.sleep(JGRANTS.WAIT_MS);
      var data = jgGet_('/v1/public/subsidies', { keyword: JGRANTS_KEYWORDS[i], sort: JGRANTS.SORT, order: JGRANTS.ORDER, acceptance: JGRANTS.ACCEPTANCE });
      (data.result || []).forEach(function (it) { if (it && it.id) seen[it.id] = it; });
    }
  } catch (e) {
    out.ok = false; out.error = safeError_(e); // 失敗したら繰り返し叩かない。ここまでの分は保存する
  }
  var ids = Object.keys(seen);
  out.count = ids.length;
  var needDetail = [];
  ids.forEach(function (id) {
    var fresh = jgFromList_(seen[id], ctx.today), key = fresh['ID'], old = ctx.rowsById[key];
    if (!old) {
      fresh['初めて見つけた日'] = ctx.today; fresh['最後に見た日'] = ctx.today;
      fresh['新着扱い'] = ctx.initial ? 'N' : 'Y'; fresh['内容のハッシュ'] = jgCoreHash_(fresh);
      ctx.rowsById[key] = fresh; ctx.order.push(key); out.added++; needDetail.push(key);
      return;
    }
    old['最後に見た日'] = ctx.today;
    var changed = false;
    ['名前', '受付開始', '受付終了', '上限額', '地域', '対象'].forEach(function (k) {
      if (String(old[k]) !== String(fresh[k])) {
        if (old[k] !== '' && old[k] != null) ctx.history.push({ '検知した日': ctx.today, '制度ID': key, '名前': fresh['名前'], '変わった項目': k, '前の値': old[k], '後の値': fresh[k] });
        old[k] = fresh[k]; changed = true;
      }
    });
    old['要確認'] = fresh['要確認'];
    if (changed) { old['詳細取得済'] = ''; out.updated++; if (old['受付終了']) old['締切通知済'] = ''; }
    if (old['詳細取得済'] !== 'Y') needDetail.push(key);
  });
  // 詳細は、新着・変更・未取得のものだけ。1回の上限を超えた分は翌日に回す
  var n = 0;
  for (var j = 0; j < needDetail.length && n < JGRANTS.MAX_DETAIL_PER_RUN && out.ok; j++, n++) {
    var row = ctx.rowsById[needDetail[j]];
    try {
      Utilities.sleep(JGRANTS.WAIT_MS);
      var d = jgGet_('/v2/public/subsidies/id/' + row['ID'].replace('jgrants:', ''));
      var det = d.result && d.result[0] ? d.result[0] : d;
      var prevRate = row['補助率'];
      jgApplyDetail_(row, det);
      if (prevRate && prevRate !== row['補助率']) ctx.history.push({ '検知した日': ctx.today, '制度ID': row['ID'], '名前': row['名前'], '変わった項目': '補助率', '前の値': prevRate, '後の値': row['補助率'] });
    } catch (e) {
      out.ok = false; out.error = safeError_(e); break;
    }
  }
  return out;
}


/* ===== Watch.js ===== */
/**
 * Watch.js — 指定した公式ページの「本文の変化」を見る。
 * 保存するのは、本文のハッシュと、行ごとの指紋(ハッシュ+先頭40文字)だけ。本文の丸ごとは保存しない。
 * 範囲の目印・除外パターンは「ウォッチ」タブの列で直す(コードを触らずに)。
 */

function fetchPage_(url) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': WATCH.USER_AGENT } });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('HTTP ' + code);
  return res;
}

/** 戻り値: {ok, error, changed, added, removed, pdf} */
function checkWatch_(w, today) {
  var out = { ok: true, error: '', changed: false, added: [], removed: [], pdf: '' };
  try {
    var res = fetchPage_(w['URL']);
    if (w['種別'] === 'pdf') {
      var bytes = res.getBlob().getBytes();
      var sig = bytes.length + 'B/' + (res.getHeaders()['Last-Modified'] || '') + '/' + sha256Hex_(bytes.join(',')).slice(0, 12);
      if (w['本文のハッシュ'] && w['本文のハッシュ'] !== sig) { out.changed = true; out.pdf = 'PDFが変わりました(サイズ・更新日時・ハッシュ)'; }
      w['本文のハッシュ'] = sig;
    } else if (w['種別'] === 'html_hash') {
      // 抜粋を一切出さない・残さないモード(規約上、引用を避けたいページ用)。本文のハッシュだけを持つ
      var only = htmlToLines_(res.getContentText(), { start: w['範囲の開始目印'], end: w['範囲の終了目印'], drop: String(w['除外パターン'] || '').split('\n').filter(Boolean) });
      if (only.length < 5) throw new Error('本文を取り出せません(目印の見直しが必要)');
      var h2 = sha256Hex_(only.join('\n'));
      if (w['本文のハッシュ'] && w['本文のハッシュ'] !== h2) { out.changed = true; out.pdf = 'ページが更新されました(抜粋なし。リンク先で確認)'; }
      w['本文のハッシュ'] = h2; w['行の指紋'] = '';
    } else {
      var drop = String(w['除外パターン'] || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      var lines = htmlToLines_(res.getContentText(), { start: w['範囲の開始目印'], end: w['範囲の終了目印'], drop: drop });
      if (lines.length < 5) throw new Error('本文を取り出せません(目印の見直しが必要)');
      lines = lines.slice(0, 400);
      var hash = sha256Hex_(lines.join('\n')), fp = fingerprintLines_(lines, hash8);
      var prevFp = [];
      try { prevFp = w['行の指紋'] ? JSON.parse(w['行の指紋']) : []; } catch (e) { prevFp = []; }
      if (w['本文のハッシュ'] && w['本文のハッシュ'] !== hash) {
        var d = diffFingerprints_(prevFp, fp, lines);
        if (d.added.length || d.removed.length) { out.changed = true; out.added = d.added; out.removed = d.removed; }
      }
      w['本文のハッシュ'] = hash;
      w['行の指紋'] = JSON.stringify(fp);
    }
    w['最後に見た日'] = today;
    if (out.changed) {
      var prev = {};
      if (w['差分検知日'] === today) { try { prev = JSON.parse(w['最後の差分']); } catch (e) { prev = {}; } } // 同じ日に2回変わったら合算
      var merged = { added: (prev.added || []).concat(out.added), removed: (prev.removed || []).concat(out.removed), pdf: out.pdf || prev.pdf || '' };
      w['最後の差分'] = JSON.stringify(merged); w['差分検知日'] = today;
    }
  } catch (e) {
    out.ok = false; out.error = safeError_(e);
  }
  return out;
}

function collectWatch_(ctx) {
  var out = { ok: true, count: 0, added: 0, updated: 0, error: '' }, errs = [];
  var list = ctx.watchRows.filter(function (w) { return String(w['有効']).toUpperCase() === 'ON' && w['URL']; });
  list.forEach(function (w, i) {
    if (i > 0) Utilities.sleep(WATCH.WAIT_MS);
    var r = checkWatch_(w, ctx.today);
    out.count++;
    if (!r.ok) { errs.push(w['名前'] + ': ' + r.error); return; }
    if (r.changed) {
      out.updated++;
      ctx.history.push({ '検知した日': ctx.today, '制度ID': 'watch:' + w['名前'], '名前': w['名前'], '変わった項目': 'ページの本文', '前の値': (r.removed.slice(0, 2).join(' / ') || r.pdf).slice(0, 100), '後の値': (r.added.slice(0, 2).join(' / ') || r.pdf).slice(0, 100) });
    }
  });
  if (errs.length) { out.ok = false; out.error = errs.join(' ; ').slice(0, 200); }
  return out;
}


/* ===== Notify.js ===== */
/**
 * Notify.js — Chatwork への送信。
 * 認証情報はスクリプトのプロパティ(CHATWORK_TOKEN)。コード・ログ・シートには書かない。
 * 宛先の安全装置:
 *   dry  … 送らない(文面を通知の履歴に残すだけ)
 *   test … CHATWORK_TEST_ROOM_ID の部屋だけに送る
 *   prod … CHATWORK_PROD_ROOM_ID の部屋へ送る(依頼者の確認後に、モードを手で変える)
 */

function postChatwork_(roomId, body) {
  var token = props_().getProperty('CHATWORK_TOKEN');
  if (!token) throw new Error('CHATWORK_TOKEN が未設定です');
  var url = NOTIFY.CHATWORK_BASE + '/rooms/' + encodeURIComponent(roomId) + '/messages';
  for (var attempt = 0; attempt < 2; attempt++) {
    var res = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true, headers: { 'X-ChatWorkToken': token }, payload: { body: body, self_unread: '0' } });
    var code = res.getResponseCode();
    if (code === 200) return;
    if (code === 429 && attempt === 0) { Utilities.sleep(10000); continue; } // 公式の案内: 10秒ほど待ってリトライ
    throw new Error('Chatwork HTTP ' + code);
  }
}

function roomFor_(mode) {
  if (mode === 'test') return props_().getProperty('CHATWORK_TEST_ROOM_ID') || '';
  if (mode === 'prod') return props_().getProperty('CHATWORK_PROD_ROOM_ID') || '';
  return '';
}

/** 戻り値: {mode, result:'成功'|'失敗'|'ドライ', note} */
function deliver_(mode, body) {
  if (mode === 'dry') return { mode: mode, result: 'ドライ', note: '送信なし' };
  var room = roomFor_(mode);
  if (!room) return { mode: mode, result: '失敗', note: '宛先の部屋が未設定です(' + mode + ')' };
  try { postChatwork_(room, body); return { mode: mode, result: '成功', note: '' }; }
  catch (e) { return { mode: mode, result: '失敗', note: safeError_(e) }; }
}


/* ===== Main.js ===== */
/**
 * Main.js — 毎日の実行。
 *   collectDaily() … 収集(8時)。同じ日に何回実行しても、結果は同じ(冪等)
 *   sendMorning()  … 通知(9時)。同じ日・同じモードで成功済みなら、送らない
 *   installTriggers() … 時間トリガーを(作り直して)設定する
 */

function collectDaily() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('別の実行中のため終了'); return; }
  try { runCollect_(openDb_()); } finally { lock.releaseLock(); }
}

function runCollect_(ss) {
  var today = today_(), settings = getSettings_(ss);
  var subs = readTab_(ss, TAB.SUBSIDY), rowsById = {}, order = [];
  subs.forEach(function (r) { rowsById[r['ID']] = r; order.push(r['ID']); });
  var ctx = { ss: ss, settings: settings, today: today, rowsById: rowsById, order: order, history: [], watchRows: readTab_(ss, TAB.WATCH) };
  var runs = [];

  function record(name, t0, r) {
    runs.push({ '日時': nowText_(), '日付': today, '情報源': name, '取得件数': r.count, '新着件数': r.added, '更新件数': r.updated, 'エラー': r.error, '所要秒': Math.round((Date.now() - t0) / 1000) });
  }

  if (settings.sources.jgrants !== false) {
    var t0 = Date.now(), initKey = 'INIT_jgrants';
    ctx.initial = !props_().getProperty(initKey); // 最初の取り込みは「新着」にしない(大量通知の防止)
    var r = collectJgrants_(ctx);
    if (ctx.initial && r.count > 0) props_().setProperty(initKey, today);
    record('Jグランツ', t0, r);
  }
  if (settings.sources.watch !== false) {
    var t1 = Date.now();
    var w = collectWatch_(ctx);
    record('ウォッチ', t1, w);
    writeTab_(ss, TAB.WATCH, ctx.watchRows);
  }

  // 点数・状態・重複の候補(全件を毎回計算し直す。キーワード表を変えると、翌回に反映される)
  var all = order.map(function (id) { return rowsById[id]; });
  all.forEach(function (row) {
    var sc = scoreRecord_({ title: row['名前'], institution: row['実施機関'], purpose: row['利用目的'], industry: row['業種'], area: row['地域'], target: row['対象'], excerpt: row['短い抜粋'] }, settings.rules, settings.thresholds);
    row['点数'] = sc.score; row['段階'] = sc.level; row['点数の理由'] = sc.reasons;
    row['状態'] = statusOf_(row['受付開始'], row['受付終了'], today);
  });
  markDuplicates_(all, today);

  // アーカイブ(消さずに移す)
  var keep = [], archive = [];
  all.forEach(function (row) {
    if (row['受付終了'] && daysBetween_(row['受付終了'], today) > settings.keep) archive.push(row); else keep.push(row);
  });
  writeTab_(ss, TAB.SUBSIDY, keep);
  if (archive.length) {
    var have = {}; readTab_(ss, TAB.ARCHIVE).forEach(function (r) { have[r['ID']] = 1; });
    appendTab_(ss, TAB.ARCHIVE, archive.filter(function (r) { return !have[r['ID']]; }));
  }
  appendTab_(ss, TAB.HISTORY, ctx.history);
  appendTab_(ss, TAB.RUNS, runs);
  return runs;
}

function markDuplicates_(rows, today) {
  var sources = {}; rows.forEach(function (r) { sources[r['情報源']] = 1; });
  if (Object.keys(sources).length < 2) return;
  var recs = rows.map(function (r) { return { source: r['情報源'], title: r['名前'], end: r['受付終了'], institution: r['実施機関'] }; });
  rows.forEach(function (r, i) {
    if (r['初めて見つけた日'] !== today) return;
    var hits = [];
    for (var j = 0; j < rows.length; j++) {
      if (i === j) continue;
      var k = duplicateKind_(recs[i], recs[j]);
      if (k) hits.push(rows[j]['ID'] + '(' + k + ')');
    }
    r['重複候補'] = hits.join(' ');
  });
}

/* ---------- 通知 ---------- */

function buildCtx_(ss, today, settings) {
  var rows = readTab_(ss, TAB.SUBSIDY), watch = readTab_(ss, TAB.WATCH), runs = readTab_(ss, TAB.RUNS);
  var link = function (r) { return r['元のリンク']; };
  var newRows = rows.filter(function (r) { return r['新着扱い'] === 'Y'; });
  var newHigh = newRows.filter(function (r) { return r['段階'] === '高'; }).sort(function (a, b) { return Number(b['点数']) - Number(a['点数']); });
  var deadlines = rows.filter(function (r) {
    if (r['段階'] !== '高' || r['状態'] !== '募集中') return false;
    var lv = deadlineLevel_(r['受付終了'], today), sent = r['締切通知済'] === '' ? 99 : Number(r['締切通知済']);
    return lv > 0 && lv < sent;
  }).sort(function (a, b) { return a['受付終了'] < b['受付終了'] ? -1 : 1; });
  var changes = watch.filter(function (w) { return w['差分検知日'] && w['差分検知日'] > (w['通知済の日'] || ''); }).map(function (w) {
    var d = {}; try { d = JSON.parse(w['最後の差分']); } catch (e) { d = {}; }
    return { name: w['名前'], url: w['URL'], added: d.added || [], removed: d.removed || [], pdf: d.pdf || '', _row: w };
  });
  // 今日の取得結果: 情報源ごとに、その日の最後の記録
  var bySrc = {};
  runs.filter(function (r) { return r['日付'] === today; }).forEach(function (r) { bySrc[r['情報源']] = r; });
  var sources = Object.keys(bySrc).map(function (k) { var r = bySrc[k]; return { name: k, ok: !r['エラー'], count: r['取得件数'], error: r['エラー'] }; });
  var sheetUrl = ss.getUrl();
  return {
    today: today, watch: changes, sheetUrl: sheetUrl, sources: sources, prevFailed: false,
    deadlines: deadlines.map(function (r) { return { title: r['名前'], end: r['受付終了'], url: link(r), _row: r }; }),
    newHigh: newHigh.map(function (r) { return { title: r['名前'], institution: r['実施機関'], start: r['受付開始'], end: r['受付終了'], limit: r['上限額'] === '' ? null : r['上限額'], reasons: r['点数の理由'], url: link(r), _row: r }; }),
    midCount: newRows.filter(function (r) { return r['段階'] === '中'; }).length,
    _newRows: newRows
  };
}

function sendMorning(force) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('別の実行中のため終了'); return; }
  try { return runSend_(openDb_(), force === true); } finally { lock.releaseLock(); }
}

function runSend_(ss, force) {
  var today = today_(), settings = getSettings_(ss), mode = String(settings.notify['送信モード'] || 'dry');
  var log = readTab_(ss, TAB.NOTICE);
  var done = log.some(function (r) { return r['日付'] === today && r['モード'] === mode && (r['結果'] === '成功' || r['結果'] === 'ドライ'); });
  if (done && !force) { Logger.log('本日は送信済み(' + mode + ')'); return { skipped: true }; }
  var ctx = buildCtx_(ss, today, settings);
  var last = log.filter(function (r) { return r['モード'] === mode && r['日付'] < today; }).pop();
  ctx.prevFailed = !!(last && last['結果'] === '失敗');
  var empty = !(ctx.watch.length || ctx.deadlines.length || ctx.newHigh.length);
  var anyBad = ctx.sources.some(function (s) { return !s.ok; });
  if (empty && !anyBad && String(settings.notify['該当なしの日も送る']).toUpperCase() === 'OFF') {
    appendTab_(ss, TAB.NOTICE, [{ '日時': nowText_(), '日付': today, '宛先': '-', 'モード': mode, '件数': 0, '結果': 'ドライ', 'メモ': '該当なしのため送らない設定' }]);
    return { skipped: true };
  }
  var body = buildMorningMessage_(ctx);
  if (body.length > NOTIFY.MAX_CHARS) body = body.slice(0, NOTIFY.MAX_CHARS - 40) + '\n…(続きは表で確認)[/info]';
  var r = deliver_(mode, body);
  appendTab_(ss, TAB.NOTICE, [{ '日時': nowText_(), '日付': today, '宛先': mode === 'dry' ? '-' : 'chatwork:' + mode, 'モード': mode, '件数': ctx.watch.length + ctx.deadlines.length + ctx.newHigh.length, '結果': r.result, 'メモ': mode === 'dry' ? body.slice(0, 45000) : r.note }]);
  if (r.result === 'ドライ') Logger.log(body); // 公開情報のみの文面
  if (r.result === '成功') markNotified_(ss, ctx, today);
  return r;
}

/** 送れたものだけ「通知済」にする(失敗した日は、翌日に持ち越される) */
function markNotified_(ss, ctx, today) {
  var rows = readTab_(ss, TAB.SUBSIDY), byId = {};
  rows.forEach(function (r) { byId[r['ID']] = r; });
  ctx._newRows.forEach(function (n) { if (byId[n['ID']]) byId[n['ID']]['新着扱い'] = 'done'; });
  ctx.deadlines.forEach(function (d) { var r = byId[d._row['ID']]; if (r) r['締切通知済'] = deadlineLevel_(r['受付終了'], today); });
  writeTab_(ss, TAB.SUBSIDY, rows);
  var watch = readTab_(ss, TAB.WATCH);
  watch.forEach(function (w) { if (w['差分検知日']) w['通知済の日'] = w['差分検知日']; });
  writeTab_(ss, TAB.WATCH, watch);
}

/* ---------- トリガー・手動実行 ---------- */

function installTriggers() {
  var ss = openDb_(), st = getSettings_(ss);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'collectDaily' || f === 'sendMorning') ScriptApp.deleteTrigger(t);
  });
  var hCollect = Number(st.notify['収集の時刻(時)']) || 8, hSend = Number(st.notify['時刻(時)']) || 9;
  ScriptApp.newTrigger('collectDaily').timeBased().everyDays(1).atHour(hCollect).inTimezone('Asia/Tokyo').create();
  ScriptApp.newTrigger('sendMorning').timeBased().everyDays(1).atHour(hSend).inTimezone('Asia/Tokyo').create();
  Logger.log('トリガー設定: 収集 ' + hCollect + '時台 / 通知 ' + hSend + '時台(毎日)');
}

/** 手動テスト用: 収集→通知(ドライ/テスト)まで1回通す */
function runAllNow() { collectDaily(); return sendMorning(); }

/** 手動テスト用: テストの部屋へ短い確認メッセージを送る(CHATWORK_TOKEN と CHATWORK_TEST_ROOM_ID が必要) */
function sendTestPing() {
  var r = deliver_('test', '[info][title]補助金レーダー 接続テスト[/title]この投稿が見えれば、Chatworkへの送信は成功です。[/info]');
  Logger.log(r.result + ' ' + r.note);
  return r;
}

/**
 * テスト期間の確認用: 直近N日(既定7日)について、収集のエラー、通知の成功/失敗、件数を集計して、ログに出す。
 * 戻り値の days[] を見て、「取れなかった日」「送れなかった日」「誤検知らしい更新」を振り返る。
 */
function weeklyHealth(n) {
  n = n || 7;
  var ss = openDb_(), today = today_(), runs = readTab_(ss, TAB.RUNS), notices = readTab_(ss, TAB.NOTICE), hist = readTab_(ss, TAB.HISTORY);
  var days = [];
  for (var i = n - 1; i >= 0; i--) {
    var d = shiftDate_(today, -i);
    var rs = runs.filter(function (r) { return r['日付'] === d; });
    var ns = notices.filter(function (r) { return r['日付'] === d; });
    days.push({
      date: d,
      collected: rs.length > 0,
      errors: rs.filter(function (r) { return r['エラー']; }).map(function (r) { return r['情報源'] + ': ' + r['エラー']; }),
      notices: ns.map(function (r) { return r['モード'] + '/' + r['結果']; }),
      updates: hist.filter(function (r) { return r['検知した日'] === d; }).length
    });
  }
  var ok = days.filter(function (x) { return x.collected && !x.errors.length && x.notices.some(function (t) { return /成功|ドライ/.test(t); }); }).length;
  var res = { days: days, okDays: ok, total: n };
  Logger.log(JSON.stringify(res));
  return res;
}

function shiftDate_(ymd, delta) {
  var p = ymd.split('-'), t = new Date(Date.UTC(+p[0], p[1] - 1, +p[2]) + delta * 86400000);
  return t.getUTCFullYear() + '-' + pad2_(t.getUTCMonth() + 1) + '-' + pad2_(t.getUTCDate());
}
