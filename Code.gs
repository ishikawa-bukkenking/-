/**
 * 施策ログ管理ツール(スプレッドシート コンテナバインド)
 *
 * スプレッドシートの「施策ログ」シートに直接入力して管理する。
 *   setup()   … 初回セットアップ(シート・ヘッダー・入力規則・ダッシュボードの作成)
 *   onEdit()  … 登録日時・実施日・担当者の自動入力
 *
 * 「判定(自動)」「実施月(自動)」列はシート上の ARRAYFORMULA で自動計算する。
 */

const LOG_SHEET_NAME = '施策ログ';
const DASH_SHEET_NAME = 'ダッシュボード';
const SETTINGS_SHEET_NAME = '設定';

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
const HEADERS = [
  '登録日時', '実施日', '施策タイトル', 'カテゴリ', '担当者', 'ステータス', '施策の内容',
  '効果測定指標名', '改善の方向', '施策前の数値', '施策後の数値', '単位', '結果の補足メモ', '関連リンク',
  '判定(自動)', '実施月(自動)',
];
const VALIDATION_ROWS = 5000; // 手入力時のプルダウンを設定する行数

// ---------------------------------------------------------------------------
// 入力補助(スプレッドシートに直接入力する運用)
// ---------------------------------------------------------------------------

/**
 * 「施策ログ」でタイトル(C列)が入力された行に、次を自動で補う(空欄の場合のみ)。
 *   A列 登録日時 / B列 実施日(今日) / E列 担当者(操作した人のメールアドレス)
 * シンプルトリガーなので、承認やトリガー設定は不要。
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const range = e.range;
    const sheet = range.getSheet();
    if (sheet.getName() !== LOG_SHEET_NAME) return;
    const first = Math.max(range.getRow(), 2);
    const last = Math.min(range.getLastRow(), first + 199); // 貼り付けは200行まで
    if (last < first) return;
    if (range.getLastColumn() < COL.DATE || range.getColumn() > COL.LINK) return; // A,O,P列だけの編集は無視

    const n = last - first + 1;
    const vals = sheet.getRange(first, 1, n, COL.OWNER).getValues();
    const email = getUserEmail_();
    const now = new Date();
    for (let k = 0; k < n; k++) {
      const row = first + k;
      const v = vals[k];
      if (String(v[COL.TITLE - 1]).trim() === '') continue;
      if (v[COL.TIMESTAMP - 1] === '') sheet.getRange(row, COL.TIMESTAMP).setValue(now);
      if (v[COL.DATE - 1] === '') sheet.getRange(row, COL.DATE).setValue(now);
      if (v[COL.OWNER - 1] === '' && email) sheet.getRange(row, COL.OWNER).setValue(email);
    }
  } catch (err) {
    console.error('onEdit失敗', err && err.stack || err);
  }
}

/** 操作しているユーザーのメールアドレス。取得できない環境では空文字。 */
function getUserEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
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
  setupSettingsSheet_(ss);
  setupLogSheet_(ss);
  setupDashboard_(ss);

  // 空のままの既定シートを削除
  const blank = ss.getSheetByName('シート1');
  if (blank && ss.getSheets().length > 2 && blank.getLastRow() === 0 && blank.getLastColumn() === 0) {
    ss.deleteSheet(blank);
  }
  notify_('セットアップが完了しました。「' + DASH_SHEET_NAME + '」シートを確認してください。「' + LOG_SHEET_NAME + '」シートに直接入力できます。');
}

function rebuildDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SETTINGS_SHEET_NAME)) setupSettingsSheet_(ss);
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

/** カテゴリ候補を管理する「設定」シート。A列の固定候補は自由に編集できる。 */
function setupSettingsSheet_(ss) {
  const sh = ss.getSheetByName(SETTINGS_SHEET_NAME) || ss.insertSheet(SETTINGS_SHEET_NAME);
  sh.getRange('A1').setValue('カテゴリ(固定候補)');
  sh.getRange('C1').setValue('プルダウンの候補(自動: 固定候補 + 施策ログに入力済みのカテゴリ)');
  sh.getRange('A1:C1').setFontWeight('bold').setBackground('#e8eef7');
  if (sh.getRange('A2').isBlank()) {
    sh.getRange(2, 1, CATEGORY_PRESETS.length, 1).setValues(CATEGORY_PRESETS.map(function (c) { return [c]; }));
  }
  const L = "'" + LOG_SHEET_NAME + "'!";
  sh.getRange('C2').setFormula(
    '=IFERROR(UNIQUE(FILTER({A2:A;' + L + 'D2:D},{A2:A<>"";' + L + 'D2:D<>""})),"")');
  sh.getRange('E1').setValue('※ A列にカテゴリを追加・変更すると、施策ログのプルダウンに反映されます。C列は数式なので編集しないでください。')
    .setFontColor('#777777');
  sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 30); sh.setColumnWidth(3, 330);
  return sh;
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

  // 入力規則(プルダウン等)
  const lastRow = Math.max(sheet.getMaxRows(), VALIDATION_ROWS);
  if (sheet.getMaxRows() < lastRow) sheet.insertRowsAfter(sheet.getMaxRows(), lastRow - sheet.getMaxRows());
  const rows = sheet.getMaxRows() - 1;
  const rule = function (col, validation) { sheet.getRange(2, col, rows, 1).setDataValidation(validation); };
  const dv = function () { return SpreadsheetApp.newDataValidation(); };

  const settings = ss.getSheetByName(SETTINGS_SHEET_NAME);
  rule(COL.CATEGORY, dv()
    .requireValueInRange(settings.getRange('C2:C500'), true).setAllowInvalid(true)
    .setHelpText('候補から選択してください。新しいカテゴリは直接入力もできます(表記ゆれに注意)。').build());
  rule(COL.STATUS, dv().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  rule(COL.DIRECTION, dv().requireValueInList(DIRECTIONS, true).setAllowInvalid(false).build());
  rule(COL.DATE, dv().requireDate().setAllowInvalid(false).setHelpText('日付(例: 2026/10/06)を入力してください。').build());
  rule(COL.BEFORE, dv().requireFormulaSatisfied('=ISNUMBER(J2)').setAllowInvalid(false).setHelpText('数字で入力してください。').build());
  rule(COL.AFTER, dv().requireFormulaSatisfied('=ISNUMBER(K2)').setAllowInvalid(false).setHelpText('数字で入力してください。').build());

  // 必須項目(タイトル・カテゴリ・ステータス・施策の内容)の未入力を赤く表示
  const required = '=AND(COUNTA($B2:$N2)>0,C2="")';
  const red = function (a1, formula) {
    return SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula)
      .setBackground('#fde7e7').setRanges([sheet.getRange(a1)]).build();
  };
  sheet.setConditionalFormatRules([
    red('C2:D' + (rows + 1), required),
    red('F2:G' + (rows + 1), '=AND(COUNTA($B2:$N2)>0,F2="")'),
  ]);

  // 見出しの説明(必須項目など)
  const notes = {};
  notes[COL.TITLE] = '必須。この列に入力すると、登録日時・実施日・担当者が自動で入ります。';
  notes[COL.CATEGORY] = '必須。プルダウンから選択(新しい名前の直接入力も可)。';
  notes[COL.STATUS] = '必須。検討中 / 実施中 / 完了 / 中止';
  notes[COL.CONTENT] = '必須。背景・具体的にやったこと。';
  notes[COL.METRIC] = '任意。例: 資料請求数、CPA、商談化率、作業時間(自由記述)';
  notes[COL.DIRECTION] = '任意。「増える方が良い」か「減る方が良い」を選ぶと、改善/悪化を自動判定します。';
  notes[COL.BEFORE] = '任意。数字のみ。';
  notes[COL.AFTER] = '任意。数字のみ。';
  Object.keys(notes).forEach(function (c) { sheet.getRange(1, Number(c)).setNote(notes[c]); });

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
