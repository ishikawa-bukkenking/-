/**
 * 施策ログ管理ツール(スプレッドシート コンテナバインド)
 *
 * 構成:
 *   doGet()        … Webアプリのフォーム(index.html)を返す
 *   getInitData()  … フォーム初期表示用データ(担当者メール・カテゴリ候補など)
 *   appendEntry()  … フォームの入力を「施策ログ」シートに1行追加する
 *   setup()        … 初回セットアップ(シート・ヘッダー・ダッシュボードの作成)
 *
 * 「判定(自動)」「実施月」列はシート上の ARRAYFORMULA で自動計算する。
 * フォームからは A〜N 列だけを書き込む。
 */

const LOG_SHEET_NAME = '施策ログ';
const DASH_SHEET_NAME = 'ダッシュボード';

const CATEGORY_PRESETS = ['営業', '集客・マーケティング', '社内業務改善', 'その他'];
const STATUSES = ['検討中', '実施中', '完了', '中止'];
const DIRECTIONS = ['数値は増える方が良い', '数値は減る方が良い'];
const JUDGEMENTS = ['改善', '悪化', '変化なし', '判定不可'];

// 施策ログの列(1始まり)。列順を変えるとダッシュボードの数式も直す必要がある。
const COL = {
  TIMESTAMP: 1, DATE: 2, TITLE: 3, CATEGORY: 4, OWNER: 5, STATUS: 6, CONTENT: 7,
  METRIC: 8, DIRECTION: 9, BEFORE: 10, AFTER: 11, UNIT: 12, NOTE: 13, LINK: 14,
  RESULT: 15, MONTH: 16,
};
const INPUT_COLS = 14; // フォームが書き込む列数(A〜N)
const HEADERS = [
  '登録日時', '実施日', '施策タイトル', 'カテゴリ', '担当者', 'ステータス', '施策の内容',
  '効果測定指標名', '改善の方向', '施策前の数値', '施策後の数値', '単位', '結果の補足メモ', '関連リンク',
  '判定(自動)', '実施月(自動)',
];
const VALIDATION_ROWS = 5000; // 手入力時のプルダウンを設定する行数

// ---------------------------------------------------------------------------
// Webアプリ
// ---------------------------------------------------------------------------

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('施策ログ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** フォーム表示時にクライアントから呼ばれる。 */
function getInitData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const dash = ss.getSheetByName(DASH_SHEET_NAME);
  return {
    email: getUserEmail_(),
    today: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'),
    categories: getCategories_(),
    statuses: STATUSES,
    directions: DIRECTIONS,
    spreadsheetUrl: ss.getUrl(),
    dashboardUrl: dash ? ss.getUrl() + '#gid=' + dash.getSheetId() : ss.getUrl(),
  };
}

/**
 * フォームの送信内容を検証して「施策ログ」に1行追加する。
 * 検証エラーは例外ではなく {ok:false, errors:[...]} で返す。
 */
function appendEntry(raw) {
  let step = '準備';
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tz = ss.getSpreadsheetTimeZone();
    step = 'カテゴリ読み込み';
    const existingCategories = getCategories_();
    step = '入力検証';
    const v = validateEntry_(raw || {}, tz, existingCategories);
    if (v.errors.length) return { ok: false, errors: v.errors };
    const e = v.entry;

    step = 'ロック取得';
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      step = 'シート取得';
      const sheet = ss.getSheetByName(LOG_SHEET_NAME);
      if (!sheet) throw new Error('「' + LOG_SHEET_NAME + '」シートがありません。setup() を実行してください。');

      step = '書き込み位置の計算';
      const row = nextRow_(sheet);
      if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);

      step = '書き込み';
      const values = [
        new Date(), e.date, e.title, e.category, e.owner, e.status, e.content,
        e.metric, e.direction, e.before, e.after, e.unit, e.note, e.link,
      ].map(function (x) { return typeof x === 'string' ? escapeCell_(x) : x; });

      sheet.getRange(row, 1, 1, INPUT_COLS).setValues([values]);
      return { ok: true, row: row, category: e.category };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error('appendEntry失敗 [' + step + ']', err && err.stack || err);
    throw new Error('[' + step + '] ' + (err && err.message ? err.message : err));
  }
}

// ---------------------------------------------------------------------------
// 検証
// ---------------------------------------------------------------------------

function validateEntry_(raw, tz, existingCategories) {
  const errors = [];
  const str = function (v) { return v == null ? '' : String(v).trim(); };

  const title = str(raw.title);
  if (!title) errors.push('施策タイトルは必須です。');
  else if (title.length > 200) errors.push('施策タイトルは200文字以内にしてください。');

  // カテゴリ: 全角英数→半角などを正規化し、既存カテゴリと表記が一致すればそちらに寄せる。
  // (QUERY式に埋め込むため引用符は全角に置き換える)
  let category = str(raw.category).normalize('NFKC').replace(/\s+/g, ' ')
    .replace(/'/g, '’').replace(/"/g, '”');
  if (!category) errors.push('カテゴリは必須です。');
  else if (category.length > 50) errors.push('カテゴリは50文字以内にしてください。');
  else {
    const key = category.toLowerCase();
    const hit = existingCategories.filter(function (c) { return c.toLowerCase() === key; })[0];
    if (hit) category = hit;
  }

  const status = str(raw.status);
  if (!status) errors.push('ステータスは必須です。');
  else if (STATUSES.indexOf(status) < 0) errors.push('ステータスの値が不正です。');

  const content = str(raw.content);
  if (!content) errors.push('施策の内容は必須です。');
  else if (content.length > 10000) errors.push('施策の内容は10000文字以内にしてください。');

  // 実施日: 未入力なら今日
  let date = null;
  const dateStr = str(raw.date) || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    errors.push('実施日の形式が不正です。');
  } else {
    date = Utilities.parseDate(dateStr, tz, 'yyyy-MM-dd');
    if (Utilities.formatDate(date, tz, 'yyyy-MM-dd') !== dateStr) {
      errors.push('実施日が存在しない日付です。');
      date = null;
    }
  }

  const direction = str(raw.direction);
  if (direction && DIRECTIONS.indexOf(direction) < 0) errors.push('改善の方向の値が不正です。');

  const before = parseNumber_(raw.before);
  const after = parseNumber_(raw.after);
  if (before.error) errors.push('施策前の数値は数字で入力してください。');
  if (after.error) errors.push('施策後の数値は数字で入力してください。');

  const link = str(raw.link);
  if (link && !/^https?:\/\/\S+$/i.test(link)) errors.push('関連リンクは http:// または https:// で始まるURLを入力してください。');

  const owner = str(raw.owner);
  const metric = str(raw.metric);
  const unit = str(raw.unit);
  const note = str(raw.note);
  if (owner.length > 100) errors.push('担当者は100文字以内にしてください。');
  if (metric.length > 100) errors.push('効果測定指標名は100文字以内にしてください。');
  if (unit.length > 20) errors.push('単位は20文字以内にしてください。');
  if (note.length > 10000) errors.push('結果の補足メモは10000文字以内にしてください。');

  return {
    errors: errors,
    entry: {
      date: date, title: title, category: category, owner: owner, status: status, content: content,
      metric: metric, direction: direction, before: before.value, after: after.value,
      unit: unit, note: note, link: link,
    },
  };
}

function parseNumber_(v) {
  if (v === '' || v == null) return { value: '', error: false };
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return isFinite(n) ? { value: n, error: false } : { value: '', error: true };
}

/** 先頭が = + - @ の文字列は数式として解釈されるので、文字列として保存させる。 */
function escapeCell_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** 担当者の初期値。デプロイ設定や組織によっては空文字になる(導入手順.md 参照)。 */
function getUserEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}

/** プリセット + 過去に入力されたカテゴリ(登録が多い順)。datalistの候補に使う。 */
function getCategories_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET_NAME);
  const result = CATEGORY_PRESETS.slice();
  if (!sheet || sheet.getLastRow() < 2) return result;

  const counts = {};
  sheet.getRange(2, COL.CATEGORY, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
    const c = String(r[0]).trim();
    if (c) counts[c] = (counts[c] || 0) + 1;
  });
  Object.keys(counts)
    .filter(function (c) { return result.indexOf(c) < 0; })
    .sort(function (a, b) { return counts[b] - counts[a]; })
    .forEach(function (c) { result.push(c); });
  return result;
}

/** A列(登録日時)の最終入力行の次の行。O/P列の自動計算列の影響を受けない。 */
function nextRow_(sheet) {
  const max = sheet.getMaxRows();
  const vals = sheet.getRange(1, 1, max, 1).getValues();
  for (let i = max - 1; i >= 1; i--) {
    if (vals[i][0] !== '') return i + 2;
  }
  return 2;
}

// ---------------------------------------------------------------------------
// セットアップ
// ---------------------------------------------------------------------------

/** スプレッドシートを開いたときにメニューを追加する。 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('施策ログ')
    .addItem('初期セットアップ / 再セットアップ', 'setup')
    .addItem('ダッシュボードを作り直す', 'rebuildDashboard')
    .addToUi();
}

/**
 * 初回セットアップ。何度実行しても既存データは消えない(ダッシュボードは作り直される)。
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupLogSheet_(ss);
  setupDashboard_(ss);

  // 空のままの既定シートを削除
  const blank = ss.getSheetByName('シート1');
  if (blank && ss.getSheets().length > 2 && blank.getLastRow() === 0 && blank.getLastColumn() === 0) {
    ss.deleteSheet(blank);
  }
  notify_('セットアップが完了しました。「' + DASH_SHEET_NAME + '」シートを確認し、Webアプリとしてデプロイしてください。');
}

function rebuildDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(LOG_SHEET_NAME)) setupLogSheet_(ss);
  setupDashboard_(ss);
  notify_('ダッシュボードを作り直しました。');
}

function notify_(msg) {
  Logger.log(msg);
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(msg, '施策ログ', 8);
  } catch (err) { /* UIなしの実行では無視 */ }
}

function setupLogSheet_(ss) {
  const sheet = ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME);

  // ヘッダー
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setBackground('#1f3b63').setFontColor('#ffffff').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);

  // 自動計算列(判定・実施月)。O2/P2 の ARRAYFORMULA が下の行まで自動で展開される。
  const up = DIRECTIONS[0], down = DIRECTIONS[1];
  const judge =
    '=ARRAYFORMULA(IF(C2:C="","",IF((J2:J="")+(K2:K="")>0,"判定不可",IF(K2:K=J2:J,"変化なし",' +
    'IF(I2:I="' + up + '",IF(K2:K>J2:J,"改善","悪化"),' +
    'IF(I2:I="' + down + '",IF(K2:K<J2:J,"改善","悪化"),"判定不可"))))))';
  sheet.getRange('O2').setFormula(judge);
  sheet.getRange('P2').setFormula('=ARRAYFORMULA(IF(B2:B="","",TEXT(B2:B,"yyyy-mm")))');
  sheet.getRange('O1:P1').setBackground('#5b6b82');

  // 表示形式
  sheet.getRange('A2:A').setNumberFormat('yyyy/mm/dd hh:mm:ss');
  sheet.getRange('B2:B').setNumberFormat('yyyy/mm/dd');
  sheet.getRange('G2:G').setWrap(true);
  sheet.getRange('M2:M').setWrap(true);
  sheet.getRange('A2:P').setVerticalAlignment('top');

  // 手入力でステータス等を直すとき用のプルダウン
  const lastRow = Math.max(sheet.getMaxRows(), VALIDATION_ROWS);
  if (sheet.getMaxRows() < lastRow) sheet.insertRowsAfter(sheet.getMaxRows(), lastRow - sheet.getMaxRows());
  const rows = sheet.getMaxRows() - 1;
  sheet.getRange(2, COL.STATUS, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  sheet.getRange(2, COL.DIRECTION, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(DIRECTIONS, true).setAllowInvalid(false).build());

  const widths = [150, 90, 220, 130, 180, 90, 320, 130, 150, 90, 90, 60, 280, 220, 90, 90];
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  return sheet;
}

/** ダッシュボードのレイアウト(行番号)。表・グラフ・一覧の位置はここで決まる。 */
const DASH = {
  monthly:  { title: 3,  header: 4,  first: 5,  last: 16 },  // 直近12か月
  category: { title: 19, header: 20, first: 21, last: 30 },  // 最大10カテゴリ
  status:   { title: 35, header: 36, first: 37, last: 40 },
  judge:    { title: 51, header: 52, first: 53, last: 56 },
  list:     { title: 67, filterCat: 68, filterStatus: 69, header: 71, first: 72 },
  helperCol: 13, // M列: カテゴリ絞り込み用の候補(非表示)
};

function setupDashboard_(ss) {
  const sh = ss.getSheetByName(DASH_SHEET_NAME) || ss.insertSheet(DASH_SHEET_NAME);
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.clear();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  sh.showColumns(1, sh.getMaxColumns());
  sh.setHiddenGridlines(true);

  const L = "'" + LOG_SHEET_NAME + "'!";
  const sectionStyle = function (row, text) {
    sh.getRange(row, 1, 1, 2).merge().setValue(text)
      .setFontWeight('bold').setFontSize(12).setBackground('#e8eef7').setFontColor('#1f3b63');
  };
  const headerStyle = function (row, labels) {
    sh.getRange(row, 1, 1, labels.length).setValues([labels])
      .setFontWeight('bold').setBackground('#f1f3f5').setBorder(false, false, true, false, false, false);
  };

  // タイトル + サマリー
  sh.getRange('A1').setValue('施策ログ ダッシュボード').setFontSize(16).setFontWeight('bold').setFontColor('#1f3b63');
  const j = DASH.judge;
  sh.getRange('A2').setFormula(
    '="総件数: "&COUNTA(' + L + 'C2:C)&" 件　／　改善率(判定できた施策のうち): "&' +
    'IFERROR(TEXT(B' + j.first + '/(B' + j.first + '+B' + (j.first + 1) + '+B' + (j.first + 2) + '),"0%"),"-")')
    .setFontColor('#555555');

  // 1. 月別件数(実施日ベース・直近12か月)
  const m = DASH.monthly;
  sectionStyle(m.title, '月別 施策実施件数(直近12か月)');
  headerStyle(m.header, ['実施月', '件数']);
  sh.getRange(m.first, 1).setFormula(
    '=IFERROR(SORT(QUERY(' + L + "A2:P,\"select P,count(C) where P<>'' group by P order by P desc limit 12\",0),1,TRUE),)");

  // 2. カテゴリ別
  const c = DASH.category;
  sectionStyle(c.title, 'カテゴリ別 件数');
  headerStyle(c.header, ['カテゴリ', '件数']);
  sh.getRange(c.first, 1).setFormula(
    '=IFERROR(QUERY(' + L + "A2:P,\"select D,count(C) where C is not null group by D order by count(C) desc limit " +
    (c.last - c.first + 1) + '",0),)');

  // 3. ステータス別
  const s = DASH.status;
  sectionStyle(s.title, 'ステータス別 件数');
  headerStyle(s.header, ['ステータス', '件数']);
  STATUSES.forEach(function (name, i) {
    const r = s.first + i;
    sh.getRange(r, 1).setValue(name);
    sh.getRange(r, 2).setFormula('=COUNTIF(' + L + '$F$2:$F,A' + r + ')');
  });

  // 4. 改善の自動判定
  sectionStyle(j.title, '改善したか(施策前後の数値と改善の方向から自動判定)');
  headerStyle(j.header, ['判定', '件数']);
  JUDGEMENTS.forEach(function (name, i) {
    const r = j.first + i;
    sh.getRange(r, 1).setValue(name);
    sh.getRange(r, 2).setFormula('=COUNTIF(' + L + '$O$2:$O,A' + r + ')');
  });
  sh.getRange(j.last + 1, 1, 1, 2).merge().setValue('※ 数値の未入力、または改善の方向が未選択の場合は「判定不可」')
    .setFontColor('#777777').setFontSize(9);

  // 5. 絞り込み一覧
  const li = DASH.list;
  sectionStyle(li.title, '施策一覧(カテゴリ・ステータスで絞り込み)');
  sh.getRange(li.filterCat, 1).setValue('カテゴリ').setFontWeight('bold');
  sh.getRange(li.filterStatus, 1).setValue('ステータス').setFontWeight('bold');
  sh.getRange(li.filterCat, 2).setValue('すべて');
  sh.getRange(li.filterStatus, 2).setValue('すべて');
  sh.getRange(li.filterCat, 2, 2, 1).setBackground('#fff8e1');

  // カテゴリ候補(非表示のM列)
  const h = DASH.helperCol;
  sh.getRange(1, h).setValue('カテゴリ候補(自動)');
  sh.getRange(2, h).setFormula(
    '=IFERROR({"すべて";SORT(UNIQUE(FILTER(' + L + 'D2:D,' + L + 'D2:D<>"")))},"すべて")');
  sh.getRange(li.filterCat, 2).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(sh.getRange(2, h, 200, 1), true).setAllowInvalid(false).build());
  sh.getRange(li.filterStatus, 2).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['すべて'].concat(STATUSES), true).setAllowInvalid(false).build());
  sh.hideColumns(h);

  headerStyle(li.header, ['実施日', '施策タイトル', 'カテゴリ', '担当者', 'ステータス', '指標名', '施策前', '施策後', '単位', '判定', '関連リンク']);
  const catRef = '$B$' + li.filterCat, stRef = '$B$' + li.filterStatus;
  sh.getRange(li.first, 1).setFormula(
    '=IFERROR(QUERY(' + L + 'A2:P,"select B,C,D,E,F,H,J,K,L,O,N where C is not null"' +
    '&IF(' + catRef + '="すべて",""," and D=\'"&' + catRef + '&"\'")' +
    '&IF(' + stRef + '="すべて",""," and F=\'"&' + stRef + '&"\'")' +
    '&" order by B desc",0),"該当なし")');
  sh.getRange(li.first, 1, sh.getMaxRows() - li.first + 1, 1).setNumberFormat('yyyy/mm/dd');
  sh.getRange(li.first, 1, sh.getMaxRows() - li.first + 1, 11).setVerticalAlignment('top');

  // 列幅
  [150, 260, 130, 170, 90, 120, 70, 70, 50, 70, 240].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  // グラフ
  const chartBase = function (type, range, row, title) {
    return sh.newChart().setChartType(type).addRange(range).setNumHeaders(1)
      .setPosition(row, 4, 0, 0)
      .setOption('title', title).setOption('width', 560).setOption('height', 300);
  };
  sh.insertChart(chartBase(Charts.ChartType.COLUMN, sh.getRange(m.header, 1, m.last - m.header + 1, 2), m.title, '月別 施策実施件数')
    .setOption('legend', { position: 'none' }).setOption('colors', ['#1f6feb']).build());
  sh.insertChart(chartBase(Charts.ChartType.PIE, sh.getRange(c.header, 1, c.last - c.header + 1, 2), c.title, 'カテゴリ別 件数')
    .setOption('pieSliceText', 'value').build());
  sh.insertChart(chartBase(Charts.ChartType.BAR, sh.getRange(s.header, 1, s.last - s.header + 1, 2), s.title, 'ステータス別 件数')
    .setOption('legend', { position: 'none' }).setOption('colors', ['#e8a317']).build());
  sh.insertChart(chartBase(Charts.ChartType.PIE, sh.getRange(j.header, 1, j.last - j.header + 1, 2), j.title, '改善の自動判定')
    .setOption('pieSliceText', 'value').setOption('colors', ['#2e7d32', '#c62828', '#9e9e9e', '#cfd8dc']).build());

  sh.setFrozenRows(0);
  return sh;
}
