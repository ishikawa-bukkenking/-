/**
 * 前受金取り崩し仕訳 生成システム — Apps Script版
 *
 * 使い方:
 *   1. このスプレッドシートで [拡張機能] > [Apps Script] を開く
 *   2. デフォルトの Code.gs の中身を全て削除し、このファイルの内容を貼り付けて保存
 *   3. スプレッドシートを再読み込み（リロード）すると、メニューバーに
 *      「前受金取り崩し仕訳」というカスタムメニューが追加される
 *   4. 「入力データ」タブにCSVを貼り付けると、自動的に変換が実行され、
 *      「変換結果（前受金取り崩し仕訳）」「要確認」タブが再計算される
 *      （貼り付け後、数秒〜十数秒ほどで画面右下に完了通知が出る）。
 *      手動で再実行したいときはメニューの [前受金取り崩し仕訳] >
 *      [変換結果を再生成] をクリックしても同じ処理が走る。
 *      「変換結果」タブの行は借方補助科目（取引先会社名）ごとにまとまるよう
 *      ソートされるので、CSVとして書き出しても同じ会社の行が連続して並ぶ
 *
 * アーカイブについて:
 *   「変換結果」タブは実行のたびに毎回上書きされる「最新の結果」用のタブ。
 *   それとは別に「変換結果アーカイブ」タブが自動作成され、実行するたびに
 *   そのデータが積み上がっていく（過去分は消えない）。
 *   同じ対象月（取引日から自動判定）で再実行した場合は、その月の古い記録
 *   だけを新しい内容に置き換える（同じ月のデータが際限なく重複しないため）。
 *
 * 処理履歴について:
 *   「処理履歴」タブには、実行するたびに [日付／データ名／リンク] の1行が
 *   追加されていく（こちらは重複置き換えせず、実行した回数分すべて残る）。
 *   リンクをクリックすると「変換結果アーカイブ」内のその回のデータへ直接
 *   ジャンプする。
 *
 * 出力する2つのデータ:
 *   データ1「変換結果1（売掛金・前受金）」
 *       (借方)売掛金[補助科目=会社名] / (貸方)前受金[補助科目=会社名]
 *   データ2「変換結果（前受金取り崩し仕訳）」
 *       (借方)前受金[補助科目=会社名] / (貸方)売上高[補助科目=物件王会費など]
 *       懇親会費は (貸方)会議費・課仕10%
 *   データ2の取引日ルール（貸方が売上高の行のみ）:
 *       ・「会費」を含む → その月の1日（例: 物件王12月分会費 → 12/1）
 *       ・「PPC広告」で期間つき → 期間の末日（例: PPC広告費用（9月1日～9月30日） → 9/30）
 *       ・上記以外・会議費 → 元データの取引日のまま
 *
 * 複合仕訳化について:
 *   同じ会社（借方補助科目）・同じ取引日の行が複数あると、MF会計の複合仕訳
 *   CSV形式（同じ取引Noを割り当て、2行目以降の借方を空欄/0円にする）に
 *   自動でまとめる。借方（前受金）は1行目に合計額でまとめ、貸方（売上高/
 *   会議費）は各行そのままカテゴリごとに残る。1件しかない会社・日付の
 *   組み合わせはそのまま（変更なし）。
 */

var SHEET_INPUT = '入力データ';
var SHEET_MAPPING = 'カテゴリマッピング';
var SHEET_OUTPUT_AR = '変換結果1（売掛金・前受金）';   // データ1: (借方)売掛金 / (貸方)前受金
var SHEET_OUTPUT = '変換結果（前受金取り崩し仕訳）';   // データ2: (借方)前受金 / (貸方)売上高・会議費
var SHEET_REVIEW = '要確認';
var SHEET_ARCHIVE = '変換結果アーカイブ';
var SHEET_HISTORY = '処理履歴';
var SHEET_README = 'README';

// タブをすっきり見せるため、常に表示しておくのはこの2枚だけ。
// それ以外（マッピング表・要確認・アーカイブ・履歴・README）は補助的な
// データなので、tidyTabs() が自動的に非表示にする（削除はしない。
// 必要なときは Google スプレッドシート側の「非表示のシート」から開ける）。
var VISIBLE_SHEETS = [SHEET_INPUT, SHEET_OUTPUT_AR, SHEET_OUTPUT];
var AUXILIARY_SHEETS = [SHEET_MAPPING, SHEET_REVIEW, SHEET_ARCHIVE, SHEET_HISTORY, SHEET_README];

var HEADERS = ['取引No', '取引日', '借方勘定科目', '借方補助科目', '借方部門', '借方取引先', '借方税区分',
  '借方インボイス', '借方金額(円)', '借方税額', '貸方勘定科目', '貸方補助科目', '貸方部門',
  '貸方取引先', '貸方税区分', '貸方インボイス', '貸方金額(円)', '貸方税額', '摘要', '仕訳メモ',
  'タグ', 'MF仕訳タイプ', '決算整理仕訳', '作成日時', '作成者', '最終更新日時', '最終更新者'];

var FILL_REVIEW = '#fff2cc';   // 薄い黄色: 要確認（マッピング済みだが確認が必要）
var FILL_UNMAPPED = '#ffc7ce'; // 薄い赤: 未マッピング
var HEADER_FILL = '#2f5597';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('前受金取り崩し仕訳')
    .addItem('変換結果を再生成', 'regenerate')
    .addToUi();
}

/**
 * 簡易トリガー: 「入力データ」または「カテゴリマッピング」タブが編集される
 * （CSVの貼り付けや手直しなど）と自動的に発火し、変換を再実行する。
 * 簡易トリガーはダイアログ（getUi().alert）を呼べない制限があるため、
 * 完了通知は画面右下に数秒だけ表示されるトースト通知を使う。
 */
function onEdit(e) {
  try {
    if (!e || !e.source) return;
    var editedSheetName = e.source.getActiveSheet().getName();
    if (editedSheetName !== SHEET_INPUT && editedSheetName !== SHEET_MAPPING) return;
    var result = regenerateCore();
    if (result.error) {
      SpreadsheetApp.getActiveSpreadsheet().toast(result.error, '前受金取り崩し仕訳', 8);
      return;
    }
    var regNote = result.registeredCount > 0
      ? (' / 新規登録' + result.registeredCount + '件' + (result.inferredCount > 0 ? '（うち類似ラベルから自動入力' + result.inferredCount + '件）' : ''))
      : '';
    var compNote = result.compoundInfo.groupedCount > 0 ? (' / 複合仕訳化' + result.compoundInfo.groupedCount + '件') : '';
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'データ1 ' + result.arRows.length + '件 / データ2 ' + result.outRows.length + '件 / 要確認' + result.reviewItems.length + '件' + regNote + compNote +
      '（対象月: ' + result.batchMonth + '）',
      '変換結果を自動更新しました', 6
    );
  } catch (err) {
    // Never let the automatic trigger surface a raw stack trace to the user.
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast('自動変換でエラーが発生しました: ' + err.message, '前受金取り崩し仕訳', 8);
    } catch (e2) { /* ignore */ }
  }
}

/** メニューから手動実行する場合のエントリーポイント。結果をダイアログで表示する。 */
function regenerate() {
  var result = regenerateCore();
  if (result.error) {
    SpreadsheetApp.getUi().alert(result.error);
    return;
  }
  SpreadsheetApp.getUi().alert(
    '再生成が完了しました。\n' +
    '入力行数: ' + result.inputRows.length + '\n' +
    '生成行数(データ1 売掛金/前受金): ' + result.arRows.length + '\n' +
    '生成行数(データ2 前受金/売上高): ' + result.outRows.length + '\n' +
    '除外行数(0円): ' + result.excludedItems.length + '\n' +
    '要確認件数: ' + result.reviewItems.length + '\n' +
    'カテゴリマッピング表に自動登録: ' + result.registeredCount + '件（うち類似ラベルから自動入力 ' + result.inferredCount + '件）\n' +
    '複合仕訳化した取引: ' + result.compoundInfo.groupedCount + '件（' + result.compoundInfo.rowsAffected + '行）\n' +
    '\n' +
    '対象月: ' + result.batchMonth + '（アーカイブに記録）\n' +
    'アーカイブ累計行数: ' + result.archiveInfo.totalRows
  );
}

/** 変換処理の本体。UIを一切呼ばないので、メニュー実行・自動トリガーの両方から使える。 */
function regenerateCore() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var inputSheet = ss.getSheetByName(SHEET_INPUT);
  var mappingSheet = ss.getSheetByName(SHEET_MAPPING);
  if (!inputSheet || !mappingSheet) {
    return { error: '「' + SHEET_INPUT + '」または「' + SHEET_MAPPING + '」タブが見つかりません。' };
  }

  var inputRows = readSheetAsObjects(inputSheet);
  var mappingRows = readSheetAsObjects(mappingSheet);

  var mapInfo = buildMapping(mappingRows);
  var mapping = mapInfo.mapping;
  var ambiguous = mapInfo.ambiguous;
  var fuzzyIndex = mapInfo.fuzzyIndex;

  var outRows = [];
  var reviewItems = [];
  var excludedItems = [];
  var newLabelsSeen = {};
  var newLabels = [];

  for (var i = 0; i < inputRows.length; i++) {
    var ir = inputRows[i];
    if (!ir['取引No'] && ir['取引No'] !== 0) continue; // skip blank trailing rows
    var result = transformRow(ir, mapping, ambiguous, fuzzyIndex);
    if (result.excludedReason) {
      excludedItems.push({
        no: ir['取引No'], date: ir['取引日'], client: ir['貸方取引先'],
        label: ir['貸方補助科目'], amount: ir['借方金額(円)'],
        reason: result.excludedReason, category: '除外(変換結果に含まれない)'
      });
      continue;
    }
    // Reviews stay attached to this exact row object (not looked up by
    // 取引No) because combineCompoundEntries() below can make several rows
    // share one 取引No — a by-number lookup would then blur together
    // review reasons that belong to different rows.
    result.row.__reviews = result.reviews;
    outRows.push(result.row);
    for (var j = 0; j < result.reviews.length; j++) {
      reviewItems.push({
        no: ir['取引No'], date: result.row['取引日'], client: ir['貸方取引先'],
        label: ir['貸方補助科目'], amount: ir['借方金額(円)'],
        reason: result.reviews[j], category: '要確認(変換結果には含む)'
      });
    }
    if ((result.needsRegistration || result.fuzzy) && !newLabelsSeen[result.label]) {
      newLabelsSeen[result.label] = true;
      if (result.fuzzy) {
        newLabels.push({ label: result.label, account: result.fuzzy.account, category: result.fuzzy.category,
          tax: result.fuzzy.tax, note: '推定: 「' + result.fuzzy.matchedLabel + '」と類似' });
      } else {
        newLabels.push({ label: result.label, account: '売上高', category: '', tax: '課売 10%', note: 'TRUE' });
      }
    }
  }

  // データ1: 売掛金/前受金（元データをそのまま会社名補助科目で整える。0円行は除外）
  var arRows = [];
  for (var ai = 0; ai < inputRows.length; ai++) {
    var air = inputRows[ai];
    if (!air['取引No'] && air['取引No'] !== 0) continue;
    var arRow = buildReceivableRow(air);
    if (arRow) arRows.push(arRow);
  }
  arRows.sort(function (a, b) {
    if (a['借方補助科目'] < b['借方補助科目']) return -1;
    if (a['借方補助科目'] > b['借方補助科目']) return 1;
    return Number(a['取引No']) - Number(b['取引No']);
  });

  var regInfo = registerMappingItems(mappingSheet, newLabels);
  var registeredCount = regInfo.total;

  // Group by client company (借方補助科目) so the CSV naturally lists each
  // company's transactions together; 取引No is the secondary key so each
  // company's own rows stay chronological.
  outRows.sort(function (a, b) {
    if (a['借方補助科目'] < b['借方補助科目']) return -1;
    if (a['借方補助科目'] > b['借方補助科目']) return 1;
    return Number(a['取引No']) - Number(b['取引No']);
  });

  var compoundInfo = combineCompoundEntries(outRows);

  // Re-sort so rows sharing a company+date compound entry end up adjacent
  // and in date order (取引No alone doesn't guarantee that once several
  // rows have been folded onto one shared 取引No).
  outRows.sort(function (a, b) {
    if (a['借方補助科目'] < b['借方補助科目']) return -1;
    if (a['借方補助科目'] > b['借方補助科目']) return 1;
    var da = dateSortValue(a['取引日']), db = dateSortValue(b['取引日']);
    if (da !== db) return da - db;
    return Number(a['取引No']) - Number(b['取引No']);
  });

  writeRowsSheet(ss, SHEET_OUTPUT_AR, arRows);
  writeOutputSheet(ss, outRows, reviewItems);
  writeReviewSheet(ss, reviewItems, excludedItems);

  var batchMonth = computeBatchMonth(outRows);
  var archiveInfo = appendToArchive(ss, outRows, reviewItems, batchMonth);
  appendToHistory(ss, batchMonth, archiveInfo);
  tidyTabs(ss);

  return {
    inputRows: inputRows,
    outRows: outRows,
    arRows: arRows,
    reviewItems: reviewItems,
    excludedItems: excludedItems,
    batchMonth: batchMonth,
    archiveInfo: archiveInfo,
    registeredCount: registeredCount,
    inferredCount: regInfo.inferred,
    compoundInfo: compoundInfo
  };
}

function dateSortValue(d) {
  var parts = String(d).split('/');
  if (parts.length !== 3) return 0;
  return Number(parts[0]) * 10000 + Number(parts[1]) * 100 + Number(parts[2]);
}

/**
 * 同じ会社（借方補助科目）・同じ取引日の行を1つの複合仕訳にまとめる。
 * MF会計のCSVインポートでは、1つの取引Noに複数行を割り当て、
 * 借方または貸方が複数項目になる場合は残りの行の反対側を0円にする
 * ことで「借方合計＝貸方合計」の複合仕訳として取り込める。
 * 取引日が異なる行は、元の取引Noが同じでも別の取引Noに振り直して、
 * 日付違いの行が1つの複合仕訳に混ざらないようにする。
 * ここでは借方（前受金）の合計額を1行目にまとめ、2行目以降は借方金額を
 * 0円にする。ただし借方勘定科目・補助科目（会社名）・税区分は、どの行を
 * 見てもひと目でわかるよう、全行に残したままにする（貸方は各行がそれぞれの
 * 商品・カテゴリを保持したまま）。1行しかない会社・日付の組み合わせは
 * 何も変更しない。
 */
function combineCompoundEntries(outRows) {
  var groups = {};
  var order = [];
  for (var i = 0; i < outRows.length; i++) {
    var row = outRows[i];
    var key = row['借方補助科目'] + '|' + row['取引日'];
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(row);
  }

  var groupedCount = 0;
  var rowsAffected = 0;

  for (var g = 0; g < order.length; g++) {
    var rows = groups[order[g]];
    if (rows.length < 2) continue;

    // Stable order within the group: by original 取引No ascending, so the
    // lowest (earliest-issued) 取引No becomes the shared one and carries
    // the combined 借方 total.
    rows.sort(function (a, b) { return Number(a['取引No']) - Number(b['取引No']); });

    var sharedNo = rows[0]['取引No'];
    var debitTotal = 0;
    for (var r = 0; r < rows.length; r++) debitTotal += Number(rows[r]['借方金額(円)']) || 0;

    for (var r2 = 0; r2 < rows.length; r2++) {
      rows[r2]['取引No'] = sharedNo;
      if (r2 === 0) {
        rows[r2]['借方金額(円)'] = debitTotal;
      } else {
        // Only the amount columns go to 0 — 借方勘定科目/補助科目/税区分
        // (account, company name, tax category) stay filled so every row
        // still shows at a glance which company/account it belongs to.
        rows[r2]['借方金額(円)'] = 0;
        rows[r2]['借方税額'] = 0;
      }
    }
    groupedCount++;
    rowsAffected += rows.length;
  }

  // 同じ取引Noが、取引日の違う複数のグループに残っていないかを確認する。
  // 元データでは同じ請求書の明細が同じ取引Noを持つことがあり、売上計上日
  // （会費=月初、PPC広告=期間末日）がずれると、MF会計では「同じ取引No＝1つの
  // 複合仕訳」として日付違いの行が一緒に取り込まれてしまう。そのため、
  // 取引Noを使うのは1つのグループ（会社＋取引日）だけにし、2つ目以降の
  // グループには未使用の新しい取引Noを振り直す。
  var maxNo = 0;
  for (var m = 0; m < outRows.length; m++) {
    var n = Number(outRows[m]['取引No']);
    if (isFinite(n) && n > maxNo) maxNo = n;
  }
  var noOwner = {};
  var renumberedCount = 0;
  for (var g2 = 0; g2 < order.length; g2++) {
    var grp = groups[order[g2]];
    var no = String(grp[0]['取引No']);
    if (!(no in noOwner)) {
      noOwner[no] = order[g2];
      continue;
    }
    if (noOwner[no] === order[g2]) continue;
    maxNo++;
    for (var q = 0; q < grp.length; q++) grp[q]['取引No'] = maxNo;
    noOwner[String(maxNo)] = order[g2];
    renumberedCount++;
  }

  return { groupedCount: groupedCount, rowsAffected: rowsAffected, renumberedCount: renumberedCount };
}

function readSheetAsObjects(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 1) return [];
  var headers = values[0];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    var blank = true;
    for (var c = 0; c < headers.length; c++) {
      var v = values[r][c];
      if (v !== '' && v !== null && v !== undefined) blank = false;
      obj[headers[c]] = (v === null || v === undefined) ? '' : v;
    }
    if (!blank) rows.push(obj);
  }
  return rows;
}

/**
 * 商品ラベルの「ゆれ」を吸収するための正規化。
 * 数字・月/年/日/分・空白・記号を取り除くので、「物件王10月会費」と
 * 「物件王11月会費」のように月だけが違うラベルは同じキーになる。
 */
function normalizeLabel(label) {
  var s = String(label || '');
  s = s.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  s = s.replace(/[0-9]+/g, '');
  s = s.replace(/[年月日分]/g, '');
  s = s.replace(/[\s　()（）\[\]【】「」『』・,，、。.:：;；\-－ー_~～〜?？!！]/g, '');
  return s.toLowerCase();
}

function buildMapping(mappingRows) {
  var byLabel = {}; // label -> array of [account, category, tax]
  var order = [];
  for (var i = 0; i < mappingRows.length; i++) {
    var r = mappingRows[i];
    var label = String(r['元データの貸方補助科目（商品ラベル）'] || '');
    if (!label) continue;
    if (!byLabel[label]) { byLabel[label] = []; order.push(label); }
    byLabel[label].push([
      String(r['出力_貸方勘定科目'] || ''),
      String(r['出力_貸方補助科目'] || ''),
      String(r['出力_貸方税区分'] || '')
    ]);
  }
  var mapping = {};
  var ambiguous = {};
  // 類似ラベル検索用: 正規化キー -> {account, category, tax, matchedLabel}。
  // カテゴリが入力済みのラベルだけを対象にし、同じキーで結果が食い違う場合は
  // 推測しない（null にして未マッピング扱いに戻す）。
  var fuzzyIndex = {};
  for (var k = 0; k < order.length; k++) {
    var lbl = order[k];
    var vals = byLabel[lbl];
    var uriage = vals.filter(function (v) { return v[0] === '売上高'; });
    mapping[lbl] = uriage.length > 0 ? uriage[0] : vals[0];
    var distinct = {};
    for (var m = 0; m < vals.length; m++) distinct[vals[m].join('|')] = true;
    if (Object.keys(distinct).length > 1) ambiguous[lbl] = true;

    var picked = mapping[lbl];
    if (picked[0] === '売上高' && picked[1]) {
      var nk = normalizeLabel(lbl);
      if (nk.length >= 3) {
        var cand = { account: picked[0], category: picked[1], tax: picked[2], matchedLabel: lbl };
        if (!(nk in fuzzyIndex)) {
          fuzzyIndex[nk] = cand;
        } else if (fuzzyIndex[nk] && (fuzzyIndex[nk].category !== cand.category || fuzzyIndex[nk].tax !== cand.tax)) {
          fuzzyIndex[nk] = null;
        }
      }
    }
  }
  return { mapping: mapping, ambiguous: ambiguous, fuzzyIndex: fuzzyIndex };
}

/**
 * 未マッピングの商品ラベルを「カテゴリマッピング」タブに自動登録する。
 * newLabels の各要素は { label, account, category, tax, note }。
 *  - 類似ラベルから推定できたもの: カテゴリ入り（note に「推定: …」）
 *  - 推定できなかったもの: カテゴリは空欄のまま（正しいカテゴリを機械的に
 *    推測すると誤った科目でMF会計に取り込まれる恐れがあるため、人が入力
 *    するまで要確認のまま残す）
 * 既に登録済みの商品ラベルは重複登録しない。
 * 戻り値: { total: 追加件数, inferred: うちカテゴリ自動入力した件数 }
 */
function registerMappingItems(mappingSheet, newLabels) {
  if (!newLabels || newLabels.length === 0) return { total: 0, inferred: 0 };

  var values = mappingSheet.getDataRange().getValues();
  var headers = values[0] || [];
  var existing = {};
  for (var r = 1; r < values.length; r++) {
    var lbl = String(values[r][0] || '');
    if (lbl) existing[lbl] = true;
  }

  var hasFlagCol = headers.length >= 5 && String(headers[4]).indexOf('要確認') !== -1;
  var rowsToAdd = [];
  var inferred = 0;
  for (var i = 0; i < newLabels.length; i++) {
    var item = newLabels[i];
    if (!item || !item.label || existing[item.label]) continue;
    var line = [item.label, item.account || '売上高', item.category || '', item.tax || '課売 10%'];
    if (hasFlagCol) line.push(item.note || 'TRUE');
    rowsToAdd.push(line);
    existing[item.label] = true;
    if (item.category) inferred++;
  }
  if (rowsToAdd.length === 0) return { total: 0, inferred: 0 };

  var startRow = mappingSheet.getLastRow() + 1;
  var numCols = hasFlagCol ? 5 : 4;
  mappingSheet.getRange(startRow, 1, rowsToAdd.length, numCols).setValues(rowsToAdd);
  mappingSheet.getRange(startRow, 1, rowsToAdd.length, numCols).setBackground(FILL_REVIEW);
  return { total: rowsToAdd.length, inferred: inferred };
}

/** 全角数字を半角にする。 */
function toHalfDigits(str) {
  return String(str || '').replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
}

/** 月日だけ分かっているとき、基準日（請求日）に最も近い年を選んで "y/m/d" を返す。 */
function pickNearestYear(month, day, refStr) {
  var rp = String(refStr).split('/');
  var refY = parseInt(rp[0], 10), refM = parseInt(rp[1], 10), refD = parseInt(rp[2], 10);
  if (!refY || !refM || !refD) return refStr;
  var ref = new Date(refY, refM - 1, refD).getTime();
  var best = refY, bestDiff = Infinity;
  for (var y = refY - 1; y <= refY + 1; y++) {
    var diff = Math.abs(new Date(y, month - 1, day).getTime() - ref);
    if (diff < bestDiff) { bestDiff = diff; best = y; }
  }
  return best + '/' + month + '/' + day;
}

/**
 * 売上高の行の取引日を商品ラベルから決める。
 *  - PPC広告 + 期間（例: PPC広告費用（9月1日～9月30日））→ 期間の末日
 *  - PPC広告で期間が無く「○月分」だけある → その月の1日
 *  - 会費（例: 物件王12月分会費）→ その月の1日
 *  - それ以外 → 変更なし（date が空のまま返る）
 * 判定できなかった場合は review に理由を入れる（日付は元のまま）。
 * ※ CSVの文字化けで「～」が「?」になっていることがあるので、区切りに「?」も許容する。
 */
function resolveSalesDate(label, invoiceDate) {
  var s = toHalfDigits(label);

  if (s.indexOf('PPC') !== -1 || s.indexOf('ＰＰＣ') !== -1) {
    var m = s.match(/(\d{1,2})月\s*(\d{1,2})日\s*[～~〜?？\-–−－ー]\s*(?:(\d{1,2})月\s*)?(\d{1,2})日/);
    if (m) {
      var endMonth = m[3] ? parseInt(m[3], 10) : parseInt(m[1], 10);
      var endDay = parseInt(m[4], 10);
      return { date: pickNearestYear(endMonth, endDay, invoiceDate), review: '' };
    }
    // 期間が書かれていない場合は「○月分」の月の1日にする
    var py = s.match(/(\d{4})年\s*(\d{1,2})月/);
    if (py) {
      return { date: parseInt(py[1], 10) + '/' + parseInt(py[2], 10) + '/1', review: '' };
    }
    var pm = s.match(/(\d{1,2})月\s*分/);
    if (pm) {
      var pmonth = parseInt(pm[1], 10);
      if (pmonth >= 1 && pmonth <= 12) {
        return { date: pickNearestYear(pmonth, 1, invoiceDate), review: '' };
      }
    }
    return { date: '', review: 'PPC広告の期間（○月○日～○月○日）も「○月分」も読み取れなかったため、取引日は元データのままです' };
  }

  if (s.indexOf('会費') !== -1) {
    var y = s.match(/(\d{4})年\s*(\d{1,2})月/);
    if (y) {
      return { date: parseInt(y[1], 10) + '/' + parseInt(y[2], 10) + '/1', review: '' };
    }
    var mm = s.match(/(\d{1,2})月/);
    if (mm) {
      var month = parseInt(mm[1], 10);
      if (month >= 1 && month <= 12) {
        return { date: pickNearestYear(month, 1, invoiceDate), review: '' };
      }
    }
    return { date: '', review: '会費の対象月（○月分）を読み取れなかったため、取引日は元データのままです' };
  }

  return { date: '', review: '' };
}

/**
 * データ1: (借方)売掛金[会社名] / (貸方)前受金[会社名] の1行を作る。
 * 0円の行は変換結果に含めない（データ2と同じ除外ルール）。
 * 売掛金・前受金はどちらも不課税なので税区分は「対象外」。
 */
function buildReceivableRow(ir) {
  var amountRaw = ir['借方金額(円)'];
  var amount = (amountRaw === '' || amountRaw === null || amountRaw === undefined) ? 0 : Number(amountRaw);
  if (amount === 0) return null;
  var company = ir['貸方取引先'] || ir['借方補助科目'] || '';
  var label = String(ir['貸方補助科目'] || '').split('?').join('～').split('？').join('～');

  var row = {};
  for (var h = 0; h < HEADERS.length; h++) row[HEADERS[h]] = '';
  row['取引No'] = ir['取引No'];
  row['取引日'] = formatDate(ir['取引日']);
  row['借方勘定科目'] = '売掛金';
  row['借方補助科目'] = company;
  row['借方税区分'] = '対象外';
  row['借方金額(円)'] = ir['借方金額(円)'];
  row['借方税額'] = 0;
  row['貸方勘定科目'] = '前受金';
  row['貸方補助科目'] = company;
  row['貸方税区分'] = '対象外';
  row['貸方金額(円)'] = ir['貸方金額(円)'] !== '' ? ir['貸方金額(円)'] : ir['借方金額(円)'];
  row['貸方税額'] = 0;
  row['摘要'] = label;
  return row;
}

/** 要確認列なしのシンプルな出力シート（データ1用）。 */
function writeRowsSheet(ss, sheetName, rows) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clear();
  var data = [HEADERS];
  for (var r = 0; r < rows.length; r++) {
    var line = [];
    for (var h = 0; h < HEADERS.length; h++) line.push(rows[r][HEADERS[h]]);
    data.push(line);
  }
  sheet.getRange(1, 1, data.length, HEADERS.length).setValues(data);
  sheet.getRange(1, 1, 1, HEADERS.length).setBackground(HEADER_FILL).setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, HEADERS.length);
}

function formatDate(d) {
  // input like "2026/10/01" or a Date object from Sheets -> "2026/10/1"
  if (Object.prototype.toString.call(d) === '[object Date]') {
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }
  var parts = String(d).split('/');
  if (parts.length !== 3) return String(d);
  return parseInt(parts[0], 10) + '/' + parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10);
}

function transformRow(ir, mapping, ambiguous, fuzzyIndex) {
  var reviews = [];
  var amountRaw = ir['借方金額(円)'];
  var amount = (amountRaw === '' || amountRaw === null || amountRaw === undefined) ? 0 : Number(amountRaw);
  var label = String(ir['貸方補助科目'] || '');

  if (amount === 0) {
    return { row: null, reviews: [], excludedReason: '借方金額(円)が0円のため出力対象外（除外ルール）', needsRegistration: false, label: label };
  }

  var isKonshinkai = label.indexOf('懇親会') !== -1;
  var isAmbiguous = !!ambiguous[label];
  var needsRegistration = false;
  var fuzzy = null;

  var row = {};
  for (var h = 0; h < HEADERS.length; h++) row[HEADERS[h]] = '';

  row['取引No'] = ir['取引No'];
  row['取引日'] = formatDate(ir['取引日']);
  row['借方勘定科目'] = '前受金';
  row['借方補助科目'] = ir['貸方取引先'];
  row['借方部門'] = '';
  row['借方取引先'] = '';
  row['借方税区分'] = '対象外'; // 前受金は不課税。元データの借方（売掛金側）の税区分は引き継がない
  row['借方インボイス'] = '';
  row['借方金額(円)'] = ir['借方金額(円)'];
  row['借方税額'] = 0;

  if (mapping.hasOwnProperty(label)) {
    var acct = mapping[label][0], cat = mapping[label][1], tax = mapping[label][2];
    row['貸方勘定科目'] = acct;
    row['貸方補助科目'] = cat;
    row['貸方税区分'] = tax;
    if (isKonshinkai && acct !== '会議費') {
      reviews.push('商品ラベルに「懇親会」を含むが、マッピング表では会議費以外に登録されている');
    }
    if (acct === '売上高' && !cat) {
      reviews.push('カテゴリマッピング表でカテゴリ（出力_貸方補助科目）が空欄です。入力してください');
    }
  } else {
    if (isKonshinkai) {
      row['貸方勘定科目'] = '会議費';
      row['貸方補助科目'] = '';
      row['貸方税区分'] = '課仕 10%';
    } else {
      var nk = normalizeLabel(label);
      var hit = (fuzzyIndex && nk.length >= 3) ? fuzzyIndex[nk] : null;
      if (hit) {
        fuzzy = hit;
        row['貸方勘定科目'] = hit.account;
        row['貸方補助科目'] = hit.category;
        row['貸方税区分'] = hit.tax;
        reviews.push('類似ラベル「' + hit.matchedLabel + '」から自動入力しました（カテゴリマッピング表に登録済み）。内容を確認してください');
      } else {
        row['貸方勘定科目'] = '売上高';
        row['貸方税区分'] = '課売 10%';
        row['貸方補助科目'] = '';
        reviews.push('商品ラベルが未マッピングだったため、カテゴリマッピング表に自動登録しました。カテゴリ列を入力してください');
        needsRegistration = true;
      }
      if (label.indexOf('研修') !== -1 || label.indexOf('コンサルタント') !== -1 || label.indexOf('参加費') !== -1) {
        reviews.push('研修・懇親会関連の請求と同時発生費用の可能性あり。会議費とすべきか要確認');
      }
    }
  }

  if (isAmbiguous) {
    reviews.push('マッピング表に同一商品ラベルで複数の異なる処理（勘定科目/カテゴリ）が登録されている');
  }

  row['貸方部門'] = '';
  row['貸方取引先'] = '';
  row['貸方インボイス'] = '';
  row['貸方金額(円)'] = ir['貸方金額(円)'];
  row['貸方税額'] = 0;

  // 取引日ルール: 貸方が売上高の行だけ、商品ラベルから売上計上日を決める
  if (row['貸方勘定科目'] === '売上高') {
    var sd = resolveSalesDate(label, row['取引日']);
    if (sd.date) row['取引日'] = sd.date;
    if (sd.review) reviews.push(sd.review);
  }

  var summary = label.split('?').join('～').split('？').join('～');
  row['摘要'] = summary;

  if ((label.indexOf('未払') !== -1 || label.indexOf('分割') !== -1) && !isKonshinkai) {
    reviews.push('商品ラベルが通常の月額会費と異なる記載パターン（未払/分割）。除外対象の可能性あり');
  }

  return { row: row, reviews: reviews, excludedReason: null, needsRegistration: needsRegistration, fuzzy: fuzzy, label: label };
}

function writeOutputSheet(ss, outRows, reviewItems) {
  var sheet = ss.getSheetByName(SHEET_OUTPUT);
  if (!sheet) sheet = ss.insertSheet(SHEET_OUTPUT);
  sheet.clear();

  var headers = HEADERS.concat(['要確認フラグ', '要確認理由']);
  var data = [headers];
  var rowMeta = []; // {flagged, unmapped}
  for (var r = 0; r < outRows.length; r++) {
    var row = outRows[r];
    // Reasons live on the row object itself (see regenerateCore), not a
    // 取引No lookup, since combineCompoundEntries() can make several rows
    // share one 取引No.
    var reasons = row.__reviews || [];
    var line = [];
    for (var h = 0; h < HEADERS.length; h++) line.push(row[HEADERS[h]]);
    line.push(reasons.length > 0 ? 'TRUE' : '');
    line.push(reasons.join(' / '));
    data.push(line);
    rowMeta.push({
      flagged: reasons.length > 0,
      unmapped: reasons.some(function (x) { return x.indexOf('未マッピング') !== -1; })
    });
  }

  sheet.getRange(1, 1, data.length, headers.length).setValues(data);
  sheet.getRange(1, 1, 1, headers.length).setBackground(HEADER_FILL).setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);

  for (var r2 = 0; r2 < rowMeta.length; r2++) {
    if (rowMeta[r2].flagged) {
      var color = rowMeta[r2].unmapped ? FILL_UNMAPPED : FILL_REVIEW;
      sheet.getRange(r2 + 2, 1, 1, headers.length).setBackground(color);
    }
  }
  sheet.autoResizeColumns(1, headers.length);
}

function writeReviewSheet(ss, reviewItems, excludedItems) {
  var sheet = ss.getSheetByName(SHEET_REVIEW);
  if (!sheet) sheet = ss.insertSheet(SHEET_REVIEW);
  sheet.clear();

  var headers = ['区分', '取引No', '取引日', '借方取引先(会社名)', '商品ラベル(元データ貸方補助科目)', '借方金額(円)', '理由'];
  var all = [];
  for (var i = 0; i < reviewItems.length; i++) all.push(reviewItems[i]);
  for (var j = 0; j < excludedItems.length; j++) all.push(excludedItems[j]);
  all.sort(function (a, b) { return Number(a.no) - Number(b.no); });

  var data = [headers];
  for (var k = 0; k < all.length; k++) {
    var item = all[k];
    data.push([item.category, item.no, item.date, item.client, item.label, item.amount, item.reason]);
  }
  if (data.length === 1) data.push(['要確認事項はありません', '', '', '', '', '', '']);

  sheet.getRange(1, 1, data.length, headers.length).setValues(data);
  sheet.getRange(1, 1, 1, headers.length).setBackground(HEADER_FILL).setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);

  for (var r = 0; r < all.length; r++) {
    var color = all[r].category.indexOf('除外') !== -1 ? FILL_UNMAPPED : FILL_REVIEW;
    sheet.getRange(r + 2, 1, 1, headers.length).setBackground(color);
  }
  sheet.autoResizeColumns(1, headers.length);
}

function computeBatchMonth(outRows) {
  // Most common "yyyy/M" among this run's 取引日 values, so a run that is
  // almost entirely one accounting month isn't thrown off by a stray date.
  var counts = {};
  for (var i = 0; i < outRows.length; i++) {
    var parts = String(outRows[i]['取引日'] || '').split('/');
    if (parts.length < 2) continue;
    var key = parts[0] + '/' + parts[1];
    counts[key] = (counts[key] || 0) + 1;
  }
  var best = '(不明)';
  var bestCount = -1;
  for (var k in counts) {
    if (counts[k] > bestCount) { bestCount = counts[k]; best = k; }
  }
  return best;
}

function appendToArchive(ss, outRows, reviewItems, batchMonth) {
  var headers = ['対象月', '生成日時'].concat(HEADERS, ['要確認フラグ', '要確認理由']);
  var sheet = ss.getSheetByName(SHEET_ARCHIVE);

  // Keep every prior row EXCEPT ones already recorded for this same target
  // month: re-running regenerate() for corrections replaces that month's
  // archive entry instead of piling up duplicates, while every other
  // month's history is left untouched.
  var existingRows = [];
  if (sheet) {
    var values = sheet.getDataRange().getValues();
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][0]) !== batchMonth) existingRows.push(values[r]);
    }
  } else {
    sheet = ss.insertSheet(SHEET_ARCHIVE);
  }
  sheet.clear();

  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var newRows = [];
  var newRowFlags = [];
  for (var r2 = 0; r2 < outRows.length; r2++) {
    var row = outRows[r2];
    // See writeOutputSheet: reasons live on the row object itself.
    var reasons = row.__reviews || [];
    var line = [batchMonth, timestamp];
    for (var h = 0; h < HEADERS.length; h++) line.push(row[HEADERS[h]]);
    line.push(reasons.length > 0 ? 'TRUE' : '');
    line.push(reasons.join(' / '));
    newRows.push(line);
    newRowFlags.push({
      flagged: reasons.length > 0,
      unmapped: reasons.some(function (x) { return x.indexOf('未マッピング') !== -1; })
    });
  }

  var allRows = [headers].concat(existingRows, newRows);
  sheet.getRange(1, 1, allRows.length, headers.length).setValues(allRows);
  sheet.getRange(1, 1, 1, headers.length).setBackground(HEADER_FILL).setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);

  var newStart = existingRows.length + 2; // 1-indexed: header row + kept rows, then new rows
  for (var r3 = 0; r3 < newRowFlags.length; r3++) {
    if (newRowFlags[r3].flagged) {
      var color = newRowFlags[r3].unmapped ? FILL_UNMAPPED : FILL_REVIEW;
      sheet.getRange(newStart + r3, 1, 1, headers.length).setBackground(color);
    }
  }
  sheet.autoResizeColumns(1, headers.length);

  return {
    totalRows: allRows.length - 1,
    newRows: newRows.length,
    sheet: sheet,
    newStartRow: newStart,
    newEndRow: newStart + newRows.length - 1,
    numCols: headers.length
  };
}

function columnToLetter(col) {
  var letter = '';
  while (col > 0) {
    var rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

/**
 * 「処理履歴」タブに [日付／データ名／リンク] の1行を追加する。
 * アーカイブとは違い置き換えは行わず、実行するたびに単純に積み上がる
 * （いつ・何回実行したかの記録そのものに意味があるため）。
 */
function appendToHistory(ss, batchMonth, archiveInfo) {
  var headers = ['日付', 'データ名', 'リンク'];
  var sheet = ss.getSheetByName(SHEET_HISTORY);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_HISTORY);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setBackground(HEADER_FILL).setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm');
  var dataName = batchMonth + ' の変換結果';

  var linkFormula = '';
  if (archiveInfo.newRows > 0) {
    var lastCol = columnToLetter(archiveInfo.numCols);
    var range = 'A' + archiveInfo.newStartRow + ':' + lastCol + archiveInfo.newEndRow;
    var url = ss.getUrl() + '#gid=' + archiveInfo.sheet.getSheetId() + '&range=' + range;
    linkFormula = '=HYPERLINK("' + url + '","結果を見る（' + archiveInfo.newRows + '件）")';
  } else {
    linkFormula = '(対象行なし)';
  }

  var row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, headers.length).setValues([[dateStr, dataName, linkFormula]]);
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * タブバーを「入力データ」と「変換結果」の2枚だけに見せる。
 * 他のタブ（カテゴリマッピング・要確認・アーカイブ・処理履歴・README）は
 * 削除せず非表示にするだけなので、データは失われず、必要なときは
 * スプレッドシート左下のシートタブを右クリック→「再表示」でいつでも開ける。
 */
function tidyTabs(ss) {
  for (var i = 0; i < VISIBLE_SHEETS.length; i++) {
    var visSheet = ss.getSheetByName(VISIBLE_SHEETS[i]);
    if (visSheet) {
      try { visSheet.showSheet(); } catch (e) { /* ignore */ }
    }
  }
  for (var j = 0; j < AUXILIARY_SHEETS.length; j++) {
    var auxSheet = ss.getSheetByName(AUXILIARY_SHEETS[j]);
    if (auxSheet) {
      try { auxSheet.hideSheet(); } catch (e) { /* ignore: e.g. can't hide the last visible sheet */ }
    }
  }
}
