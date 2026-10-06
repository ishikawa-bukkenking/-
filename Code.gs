/**
 * Chatwork「資料請求」通知 自動集計
 *
 * - 6時間おきにChatworkルームの新着メッセージを取り込み、「資料請求ログ」シートに蓄積
 * - 毎月1日の朝に先月分を名寄せ集計し、Chatworkに投稿 + 「月次サマリー」シートに記録
 *
 * スプレッドシート コンテナバインド用。設定値はスクリプトプロパティで管理する。
 * 初回は setupAll() を1回実行 → 導入手順.md を参照。
 */

// ===== 定数 =====
var TZ = 'Asia/Tokyo';
var CHATWORK_API = 'https://api.chatwork.com/v2';
var LOG_SHEET = '資料請求ログ';
var SUMMARY_SHEET = '月次サマリー';
var REQUEST_PREFIX = '【資料請求】';
var CHUNK_LIMIT = 4000; // Chatwork投稿1通あたりの文字数目安(超える場合は分割投稿)

var PROP_TOKEN = 'CHATWORK_API_TOKEN';
var PROP_SRC_ROOM = 'SOURCE_ROOM_ID';
var PROP_DST_ROOM = 'SUMMARY_ROOM_ID';
var PROP_INITIALIZED = 'INITIAL_FETCH_DONE'; // force=1での初回取得が済んだか

var LOG_HEADERS = ['メッセージID', '受信日時', '御社名', 'お名前', '役職種別', '電話番号',
  'メールアドレス', '知ったきっかけ', '取込日時'];
var SUMMARY_HEADERS = ['対象月', '計社数', '延べ件数', '会社名一覧', '生成日時'];

// 抽出対象の項目ラベル(ログシートの列と対応)
var FIELD_LABELS = ['御社名', 'お名前', '役職種別', '電話番号', 'メールアドレス', '知ったきっかけ'];


// ===================================================================
// セットアップ
// ===================================================================

/**
 * 初回セットアップ(これだけ実行すればOK)。
 * 1) スクリプトプロパティの設定  2) シート作成  3) トリガー設定
 * 先に setConfig() の引数(下の値)を書き換えるか、スクリプトプロパティを手動登録しておくこと。
 */
function setupAll() {
  ensureConfigured_();
  setupSheets();
  setupTriggers();
  Logger.log('セットアップ完了。続けて runFetchNewMessages() を手動実行して動作確認してください。');
}

/**
 * Chatwork設定をスクリプトプロパティに保存する。
 * 下の3行を書き換えて一度だけ実行 → 実行後は値をコードから消すこと(トークンを残さない)。
 * ※ GASエディタの「プロジェクトの設定 > スクリプト プロパティ」に手動登録しても同じ。
 */
function setConfig() {
  var TOKEN = 'ここにChatwork APIトークン';
  var SOURCE_ROOM_ID = 'ここに通知が届くルームID(数字)';
  var SUMMARY_ROOM_ID = 'ここにサマリー投稿先ルームID(数字。通知元と同じでも可)';

  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_TOKEN, TOKEN);
  props.setProperty(PROP_SRC_ROOM, SOURCE_ROOM_ID);
  props.setProperty(PROP_DST_ROOM, SUMMARY_ROOM_ID);
  Logger.log('スクリプトプロパティを保存しました。コード内のトークンは消してください。');
}

function ensureConfigured_() {
  var props = PropertiesService.getScriptProperties();
  [PROP_TOKEN, PROP_SRC_ROOM, PROP_DST_ROOM].forEach(function (k) {
    var v = props.getProperty(k);
    if (!v || v.indexOf('ここに') === 0) {
      throw new Error('スクリプトプロパティ ' + k + ' が未設定です。setConfig() を実行するか手動登録してください。');
    }
  });
}

function getConfig_() {
  ensureConfigured_();
  var props = PropertiesService.getScriptProperties();
  return {
    token: props.getProperty(PROP_TOKEN),
    srcRoom: props.getProperty(PROP_SRC_ROOM),
    dstRoom: props.getProperty(PROP_DST_ROOM)
  };
}

/** 「資料請求ログ」「月次サマリー」シートを(無ければ)作成する */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = getOrCreateSheet_(ss, LOG_SHEET, LOG_HEADERS);
  // 先頭0落ち・桁落ち防止: ID・電話番号列をテキスト形式に
  log.getRange(2, 1, log.getMaxRows() - 1, 1).setNumberFormat('@');
  log.getRange(2, 6, log.getMaxRows() - 1, 1).setNumberFormat('@');
  log.getRange(2, 2, log.getMaxRows() - 1, 1).setNumberFormat('yyyy/MM/dd HH:mm:ss');
  log.getRange(2, 9, log.getMaxRows() - 1, 1).setNumberFormat('yyyy/MM/dd HH:mm:ss');
  var sum = getOrCreateSheet_(ss, SUMMARY_SHEET, SUMMARY_HEADERS);
  sum.getRange(2, 1, sum.getMaxRows() - 1, 1).setNumberFormat('@');
  sum.getRange(2, 5, sum.getMaxRows() - 1, 1).setNumberFormat('yyyy/MM/dd HH:mm:ss');
}

function getOrCreateSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** 定期実行トリガーを設定する(再実行しても重複しない) */
function setupTriggers() {
  var handlers = ['runFetchNewMessages', 'runMonthlySummary'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('runFetchNewMessages')
    .timeBased().everyHours(6).create();

  // 毎月1日 8時台(スクリプトのタイムゾーン基準。appsscript.jsonでAsia/Tokyoにすること)
  ScriptApp.newTrigger('runMonthlySummary')
    .timeBased().onMonthDay(1).atHour(8).create();

  Logger.log('トリガー設定: 新着取り込み=6時間おき / 月次サマリー=毎月1日8時台');
}


// ===================================================================
// 1. 新着メッセージの取り込み
// ===================================================================

/** トリガー用エントリ: 新着を取得して「資料請求ログ」に追記する */
function runFetchNewMessages() {
  var cfg = getConfig_();
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('他の処理が実行中のためスキップ'); return; }
  try {
    // 初回は force=1(直近100件)、以降は force=0(未読=新着のみ)
    var force = props.getProperty(PROP_INITIALIZED) ? 0 : 1;
    var messages = fetchMessages_(cfg.srcRoom, cfg.token, force);
    var added = appendRequests_(messages);
    if (force === 1) props.setProperty(PROP_INITIALIZED, '1');
    Logger.log('取得 ' + messages.length + ' 件 / 資料請求として追加 ' + added + ' 件 (force=' + force + ')');
  } finally {
    lock.releaseLock();
  }
}

/** Chatworkからメッセージ取得。新着なしは204(本文なし)で返る */
function fetchMessages_(roomId, token, force) {
  var res = UrlFetchApp.fetch(CHATWORK_API + '/rooms/' + roomId + '/messages?force=' + force, {
    method: 'get',
    headers: { 'X-ChatWorkToken': token },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code === 204) return [];
  if (code !== 200) throw new Error('Chatwork メッセージ取得失敗 HTTP ' + code + ': ' + res.getContentText());
  var text = res.getContentText();
  return text ? JSON.parse(text) : [];
}

/** 資料請求メッセージを解析してログシートに追記(message_idで重複排除)。追加件数を返す */
function appendRequests_(messages) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET);
  if (!sh) { setupSheets(); sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET); }

  var existing = {};
  var last = sh.getLastRow();
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { existing[String(r[0])] = true; });
  }

  var now = new Date();
  var rows = [];
  // 古い順に並べる
  messages.slice().sort(function (a, b) { return a.send_time - b.send_time; }).forEach(function (m) {
    var id = String(m.message_id);
    if (existing[id]) return;
    var parsed = parseInquiryMessage_(m.body);
    if (!parsed) return; // 資料請求以外
    existing[id] = true;
    rows.push([id, new Date(m.send_time * 1000), parsed['御社名'], parsed['お名前'], parsed['役職種別'],
      parsed['電話番号'], parsed['メールアドレス'], parsed['知ったきっかけ'], now]);
  });

  if (rows.length) {
    var start = sh.getLastRow() + 1;
    // 追記先をテキスト形式にしてから書く(電話番号の先頭0落ち・ID桁落ち防止)
    sh.getRange(start, 1, rows.length, 1).setNumberFormat('@');
    sh.getRange(start, 6, rows.length, 1).setNumberFormat('@');
    sh.getRange(start, 1, rows.length, LOG_HEADERS.length).setValues(rows);
  }
  return rows.length;
}


// ===================================================================
// 項目抽出ロジック(フォーマット変更時はこの関数だけ差し替える)
// ===================================================================

/**
 * 資料請求通知の本文から項目を抽出する。
 * @param {string} body Chatworkメッセージ本文
 * @return {Object|null} {御社名, お名前, 役職種別, 電話番号, メールアドレス, 知ったきっかけ}
 *                       資料請求メッセージでなければ null
 */
function parseInquiryMessage_(body) {
  if (!body) return null;
  var text = String(body).replace(/\r\n?/g, '\n');
  if (text.replace(/^\s+/, '').indexOf(REQUEST_PREFIX) !== 0) return null;

  // フッター(お問い合わせ先)以降は値に含めない
  var cut = text.search(/[［\[]お問い合わせ先[］\]]/);
  if (cut >= 0) text = text.substring(0, cut);

  // 「---- / ラベル / ---- / 値」のブロックを抽出。ハイフン本数は5本以上なら可、全角ハイフン類も許容
  var sep = '[-－−‐‑–—―ー]{5,}';
  var re = new RegExp('^[ \\t]*' + sep + '[ \\t]*\\n[ \\t]*([^\\n]+?)[ \\t]*\\n[ \\t]*' + sep +
    '[ \\t]*\\n([\\s\\S]*?)(?=\\n[ \\t]*' + sep + '[ \\t]*\\n|$)', 'gm');

  var result = {};
  FIELD_LABELS.forEach(function (l) { result[l] = ''; });
  var m;
  while ((m = re.exec(text)) !== null) {
    var label = m[1].trim();
    if (FIELD_LABELS.indexOf(label) < 0) continue;
    var value = m[2].split('\n').map(function (s) { return s.trim(); })
      .filter(function (s) { return s; }).join(' ');
    result[label] = (label === 'メールアドレス') ? extractEmail_(value) : value;
  }
  return result;
}

/** `[a@b.com](mailto:a@b.com)` 等からアドレス文字列だけを取り出す */
function extractEmail_(s) {
  var mailto = s.match(/mailto:([^\s)\]]+)/i);
  if (mailto) return mailto[1];
  var addr = s.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+/);
  return addr ? addr[0] : s;
}


// ===================================================================
// 2. 月次サマリー
// ===================================================================

/** トリガー用エントリ: 先月分を集計してChatworkに投稿 + シート記録 */
function runMonthlySummary() {
  var now = new Date();
  var y = Number(Utilities.formatDate(now, TZ, 'yyyy'));
  var m = Number(Utilities.formatDate(now, TZ, 'M'));
  m -= 1;
  if (m === 0) { m = 12; y -= 1; }
  generateMonthlySummary_(y, m, { post: true, force: false });
}

/**
 * 手動で任意の月を再集計・投稿したい場合に使う(例: runSummaryFor_(2026, 9))。
 * 既に記録済みの月でも再投稿する。
 */
function runSummaryFor_(year, month) {
  generateMonthlySummary_(year, month, { post: true, force: true });
}

/** 投稿せずログ確認だけしたいとき用(投稿もシート記録もしない) */
function previewLastMonthSummary() {
  var now = new Date();
  var y = Number(Utilities.formatDate(now, TZ, 'yyyy'));
  var m = Number(Utilities.formatDate(now, TZ, 'M')) - 1;
  if (m === 0) { m = 12; y -= 1; }
  var data = collectMonth_(y, m);
  Logger.log(buildSummaryText_(y, m, data));
}

function generateMonthlySummary_(year, month, opts) {
  var cfg = getConfig_();
  var key = year + '-' + ('0' + month).slice(-2);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sumSheet = getOrCreateSheet_(ss, SUMMARY_SHEET, SUMMARY_HEADERS);

  // 二重投稿防止(トリガーが重複発火した場合など)
  if (!opts.force && sumSheet.getLastRow() >= 2) {
    var done = sumSheet.getRange(2, 1, sumSheet.getLastRow() - 1, 1).getValues()
      .some(function (r) { return String(r[0]) === key; });
    if (done) { Logger.log(key + ' は集計・投稿済みのためスキップ'); return; }
  }

  var data = collectMonth_(year, month);
  var text = buildSummaryText_(year, month, data);
  Logger.log(text);

  if (opts.post) postToChatwork_(cfg.dstRoom, cfg.token, text);

  var r = sumSheet.getLastRow() + 1;
  sumSheet.getRange(r, 1, 1, 1).setNumberFormat('@');
  sumSheet.getRange(r, 1, 1, SUMMARY_HEADERS.length).setValues([[
    key, data.groups.length, data.total,
    data.groups.map(function (g) { return g.company; }).join('\n'), new Date()
  ]]);
  sumSheet.getRange(r, 5).setNumberFormat('yyyy/MM/dd HH:mm:ss');
}

/** ログシートから対象月(受信日時がTZ基準で該当月)の行を集め、会社単位に名寄せする */
function collectMonth_(year, month) {
  var key = year + '-' + ('0' + month).slice(-2);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET);
  var rows = [];
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, LOG_HEADERS.length).getValues().forEach(function (r) {
      var d = r[1];
      if (!(d instanceof Date)) return;
      if (Utilities.formatDate(d, TZ, 'yyyy-MM') !== key) return;
      rows.push({ time: d, company: String(r[2]), name: String(r[3]), role: String(r[4]),
        phone: String(r[5]), email: String(r[6]) });
    });
  }
  return groupByCompany_(rows);
}

/**
 * 会社名の表記ゆれを吸収して名寄せ。各社の代表行は最初の問い合わせ。
 * @return {{total:number, groups:Array<{company,name,role,phone,email,count}>}}
 */
function groupByCompany_(rows) {
  rows = rows.slice().sort(function (a, b) { return a.time - b.time; });
  var map = {}, groups = [];
  rows.forEach(function (r) {
    var k = normalizeCompanyName_(r.company);
    if (!map[k]) {
      map[k] = { company: r.company, name: r.name, role: r.role, phone: r.phone, email: r.email, count: 0 };
      groups.push(map[k]);
    }
    map[k].count++;
  });
  return { total: rows.length, groups: groups };
}

/** 「株式会社〇〇」「〇〇株式会社」「〇〇(株)」「㈱〇〇」を同一キーにする */
function normalizeCompanyName_(name) {
  var s = String(name || '').normalize('NFKC').toLowerCase();
  s = s.replace(/\((株|有|合|同|名|資)\)/g, '');
  s = s.replace(/株式会社|有限会社|合同会社|合資会社|合名会社/g, '');
  s = s.replace(/[\s　・･\-ー、,.。]/g, '');
  return s || String(name || '').trim();
}

function buildSummaryText_(year, month, data) {
  var lines = ['📋 ' + year + '年' + month + '月資料請求サマリー(計' + data.groups.length + '社)',
    '延べ件数: ' + data.total + '件', ''];
  if (data.groups.length === 0) {
    lines.push('該当月の資料請求はありませんでした。');
  }
  data.groups.forEach(function (g, i) {
    var line = (i + 1) + '. ' + [g.company, g.name + '様', g.role, g.phone, g.email].join(' / ');
    if (g.count > 1) line += ' (' + g.count + '件)';
    lines.push(line);
  });
  return lines.join('\n');
}

/** Chatworkに投稿。長い場合は行単位で分割 */
function postToChatwork_(roomId, token, text) {
  var chunks = [], cur = '';
  text.split('\n').forEach(function (line) {
    if (cur && (cur + '\n' + line).length > CHUNK_LIMIT) { chunks.push(cur); cur = line; }
    else cur = cur ? cur + '\n' + line : line;
  });
  if (cur) chunks.push(cur);

  chunks.forEach(function (body) {
    var res = UrlFetchApp.fetch(CHATWORK_API + '/rooms/' + roomId + '/messages', {
      method: 'post',
      headers: { 'X-ChatWorkToken': token },
      payload: { body: body, self_unread: '0' },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('Chatwork 投稿失敗 HTTP ' + res.getResponseCode() + ': ' + res.getContentText());
    }
  });
}


// ===================================================================
// テスト
// ===================================================================

var SAMPLE_MESSAGE_ = [
  '【資料請求】',
  '株式会社マルマサ興業',
  '黒圖謙人様',
  '',
  'お世話になっております。',
  '株式会社物件王です。',
  '',
  'この度は、弊社のサービスの資料をご請求いただき',
  '誠にありがとうございます。',
  '',
  'お申し込み内容を確認後、',
  '担当者より資料をメールにてお送りさせていただきます。',
  '今しばらくお待ちください。',
  '',
  '-----------------------------------------------',
  '御社名',
  '-----------------------------------------------',
  '株式会社マルマサ興業',
  '',
  '-----------------------------------------------',
  'お名前',
  '-----------------------------------------------',
  '黒圖謙人',
  '',
  '-----------------------------------------------',
  '役職種別',
  '-----------------------------------------------',
  '経営者・役員クラス',
  '',
  '-----------------------------------------------',
  '電話番号',
  '-----------------------------------------------',
  '0926113767',
  '',
  '-----------------------------------------------',
  'メールアドレス',
  '-----------------------------------------------',
  '[norihito.kurozu@outlook.jp](mailto:norihito.kurozu@outlook.jp)',
  '',
  '-----------------------------------------------',
  '知ったきっかけ',
  '-----------------------------------------------',
  'Facebook',
  '',
  '［お問い合わせ先］',
  '＊--------------------------------------------------------＊',
  '　株式会社物件王　',
  '　<名古屋本社>',
  '　愛知県名古屋市中村区名駅1-1-1　JP名古屋タワー21階',
  '　URL: https://www.bukkenking.com',
  '＊--------------------------------------------------------＊'
].join('\n');

/** 正解データとの照合。実行ログで PASS/FAIL を確認する */
function testParseSample() {
  var expected = {
    '御社名': '株式会社マルマサ興業',
    'お名前': '黒圖謙人',
    '役職種別': '経営者・役員クラス',
    '電話番号': '0926113767',
    'メールアドレス': 'norihito.kurozu@outlook.jp',
    '知ったきっかけ': 'Facebook'
  };
  var ok = true;
  var actual = parseInquiryMessage_(SAMPLE_MESSAGE_);
  if (!actual) { Logger.log('FAIL: 資料請求として判定されませんでした'); return false; }
  FIELD_LABELS.forEach(function (k) {
    var pass = actual[k] === expected[k];
    if (!pass) ok = false;
    Logger.log((pass ? 'PASS ' : 'FAIL ') + k + ': 期待=[' + expected[k] + '] 実際=[' + actual[k] + ']');
  });

  // 資料請求以外は無視されること / ハイフン本数の揺れ / 通常のメール表記
  var other = parseInquiryMessage_('お疲れ様です。会議の件です');
  Logger.log((other === null ? 'PASS ' : 'FAIL ') + '資料請求以外は null');
  if (other !== null) ok = false;

  var variant = parseInquiryMessage_('【資料請求】\n-----\nメールアドレス\n-----\ntest@example.com\n\n-------------\n電話番号\n-------------\n03-1234-5678');
  var vpass = variant && variant['メールアドレス'] === 'test@example.com' && variant['電話番号'] === '03-1234-5678';
  Logger.log((vpass ? 'PASS ' : 'FAIL ') + 'ハイフン本数の揺れ・通常メール表記');
  if (!vpass) ok = false;

  Logger.log(ok ? '=== testParseSample: ALL PASS ===' : '=== testParseSample: FAILED ===');
  return ok;
}

/** 名寄せ・サマリー文面のテスト(シートには触れない) */
function testGrouping() {
  var base = new Date();
  var mk = function (c, t) { return { time: new Date(base.getTime() + t), company: c, name: '山田太郎',
    role: '担当者', phone: '0312345678', email: 'a@b.com' }; };
  var data = groupByCompany_([
    mk('株式会社〇〇', 1), mk('〇〇株式会社', 2), mk('〇〇(株)', 3), mk('㈱〇〇', 4), mk('有限会社△△', 5)
  ]);
  var pass = data.total === 5 && data.groups.length === 2;
  Logger.log((pass ? 'PASS ' : 'FAIL ') + '名寄せ: 延べ' + data.total + '件 / ' + data.groups.length + '社 (期待 5件/2社)');
  Logger.log(buildSummaryText_(2026, 9, data));
  return pass;
}
