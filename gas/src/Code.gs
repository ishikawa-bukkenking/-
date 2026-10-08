/**
 * エリア調査シート LP(Google スプレッドシート連携版)
 *  - シートが正本。商談先ごとのタブに入力すると、LPのURLを開き直すだけで最新内容が表示される。
 *  - 公開は「ウェブアプリ」。URL は  <ウェブアプリURL>?id=<商談先ID>
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('エリア調査シート')
    .addItem('① 初期設定(最初に1回)', 'menuSetup')
    .addItem('② 新しい商談先を追加', 'menuAddProspect')
    .addItem('このタブのLPのURLを表示', 'menuShowUrl')
    .addItem('このタブの取得レポートを表示', 'menuReport')
    .addItem('このタブのURLを作り直す(旧URLは無効)', 'menuRotateId')
    .addToUi();
}

// ---------- サービス層(テストでは差し替える) ----------
function cacheGet_(key) {
  var c = CacheService.getScriptCache(), n = c.get(key + '#n');
  if (!n) return null;
  var parts = [];
  for (var i = 0; i < Number(n); i++) { var p = c.get(key + '#' + i); if (p === null) return null; parts.push(p); }
  return parts.join('');
}
function cachePut_(key, str) {
  var c = CacheService.getScriptCache(), size = 90000, n = Math.ceil(str.length / size), kv = {};
  for (var i = 0; i < n; i++) kv[key + '#' + i] = str.slice(i * size, (i + 1) * size);
  kv[key + '#n'] = String(n);
  c.putAll(kv, 21600);
}
function fetchJson_(url) {
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('取得に失敗しました(' + r.getResponseCode() + '): ' + url);
  return JSON.parse(r.getContentText());
}

/** e-Stat API から令和2年国勢調査の世帯数を取得(実機未検証。失敗時は入力欄へ) */
function estatHouseholds_(appId, areaCode) {
  var base = 'https://api.e-stat.go.jp/rest/3.0/app/json/';
  function get(path, params) {
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetchJson_(base + path + '?' + q);
  }
  var lst = get('getStatsList', { appId: appId, statsCode: '00200521', surveyYears: '2020', searchWord: '世帯 市区町村', limit: 20 });
  var tabs = ((lst.GET_STATS_LIST || {}).DATALIST_INF || {}).TABLE_INF || [];
  tabs = Array.isArray(tabs) ? tabs : [tabs];
  var ids = tabs.filter(function (t) { return /市区町村/.test(String(t.TITLE && (t.TITLE.$ || t.TITLE))); }).map(function (t) { return t['@id']; }).slice(0, 5);
  for (var i = 0; i < ids.length; i++) {
    var d = get('getStatsData', { appId: appId, statsDataId: ids[i], cdArea: areaCode, metaGetFlg: 'Y', limit: 200 });
    var inf = (d.GET_STATS_DATA || {}).STATISTICAL_DATA || {};
    var objs = ((inf.CLASS_INF || {}).CLASS_OBJ) || [];
    objs = Array.isArray(objs) ? objs : [objs];
    var want = {};
    objs.forEach(function (o) {
      var cls = Array.isArray(o.CLASS) ? o.CLASS : [o.CLASS];
      cls.forEach(function (c) {
        var nm = (c && c['@name']) || '';
        if ((nm.indexOf('世帯') >= 0 && nm.indexOf('一般') >= 0) || nm === '世帯数' || nm === '総世帯数') { want[o['@id']] = want[o['@id']] || []; want[o['@id']].push(c['@code']); }
      });
    });
    var vals = (inf.DATA_INF || {}).VALUE || [];
    vals = Array.isArray(vals) ? vals : [vals];
    for (var j = 0; j < vals.length; j++) {
      var v = vals[j];
      if (Object.keys(want).length && Object.keys(want).every(function (k) { return want[k].indexOf(v['@' + k]) >= 0; })) {
        var n = parseInt(String(v.$).replace(/,/g, ''), 10);
        if (n) return { value: n, source: '総務省統計局 令和2年国勢調査(e-Stat)' };
      }
    }
  }
  throw new Error('該当する世帯数の表・値が見つからなかった');
}

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SSID');
  if (id) return SpreadsheetApp.openById(id);
  var a = SpreadsheetApp.getActiveSpreadsheet();
  if (a) PropertiesService.getScriptProperties().setProperty('SSID', a.getId());
  return a;
}

function readSettings_() {
  var sh = ss_().getSheetByName(SHEET_SETTINGS_), o = { url: '', estat: '', opts: {} };
  if (!sh) return o;
  var v = sh.getRange(1, 2, 6, 1).getDisplayValues().map(function (r) { return r[0]; });
  o.url = v[0].trim(); o.estat = v[1].trim();
  var mx = parseNum_(v[2]), th = parseNum_(v[3]), unit = parseNum_(v[4]);
  if (mx) o.opts.franchise = { max: mx };
  if (th !== undefined) o.opts.trend_same_threshold_pt = th;
  if (unit) o.opts.point_round_unit = unit;
  return o;
}

function realServices_(settings) {
  var s = { cacheGet: cacheGet_, cachePut: cachePut_, fetchJson: fetchJson_, now: function () { return new Date().toISOString(); } };
  if (settings.estat) s.estatHouseholds = function (code) { return estatHouseholds_(settings.estat, code); };
  return s;
}

function findProspect_(id) {
  var sh = ss_().getSheetByName(SHEET_LIST_);
  if (!sh || sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).trim() === id && id) return { id: id, tab: String(rows[i][2]).trim() };
  return null;
}

function readTabValues_(tab) {
  var sh = ss_().getSheetByName(tab);
  if (!sh) throw new Error('タブが見つかりません: ' + tab);
  var last = sh.getLastRow(), vals = {};
  if (last < FIELD_START_ROW_) return vals;
  sh.getRange(FIELD_START_ROW_, 1, last - FIELD_START_ROW_ + 1, 5).getDisplayValues().forEach(function (r) { if (r[4]) vals[r[4]] = r[1]; });
  return vals;
}

function todayIso_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'); }

/** 商談先タブ → { model, report, html, checks } */
function buildProspect_(id, tab) {
  var settings = readSettings_(), ss = ss_();
  var cfg = valuesToConfig_(readTabValues_(tab), todayIso_());
  cfg.options = settings.opts;
  var frSh = ss.getSheetByName(SHEET_FR_), liSh = ss.getSheetByName(SHEET_LISTINGS_);
  var data = {
    franchiseRows: frSh && frSh.getLastRow() > 1 ? franchiseRowsFrom_(frSh.getRange(2, 1, frSh.getLastRow() - 1, 6).getDisplayValues()) : [],
    listingRows: liSh && liSh.getLastRow() > 1 ? listingRowsFor_(liSh.getRange(2, 1, liSh.getLastRow() - 1, 8).getDisplayValues(), id) : []
  };
  var built = buildModel_(cfg, realServices_(settings), data);
  var html = renderPage_(built.model, built.report, ASSETS, STYLE_CSS_);
  return { model: built.model, report: built.report, html: html, checks: runChecks_(built.model, html) };
}

// ---------- ウェブアプリ ----------
function doGet(e) {
  var id = String((e && e.parameter && e.parameter.id) || '').trim();
  var p = /^[A-Za-z0-9]{8,40}$/.test(id) ? findProspect_(id) : null;
  if (!p) return errorPage_('ページが見つかりません。URLをご確認ください。');
  try {
    var r = buildProspect_(p.id, p.tab);
    return HtmlService.createHtmlOutput(r.html).setTitle('エリア調査シート').addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    console.error(err && err.stack || err);
    return errorPage_('ページを表示できませんでした。作成者にご連絡ください。(' + String(err.message || err).slice(0, 120) + ')');
  }
}

function errorPage_(msg) {
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="font-family:sans-serif;padding:40px;line-height:1.8"><p>' + esc_(msg) + '</p></body>').setTitle('エリア調査シート');
}

// ---------- メニュー操作 ----------
function newId_() {
  var chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
  for (var i = 0; i < 16; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function menuSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SSID', ss.getId());
  setupSheets_(ss);
  SpreadsheetApp.getUi().alert('初期設定が完了しました。\n\n次の手順:\n1. 拡張機能 → Apps Script → デプロイ → 新しいデプロイ → 種類「ウェブアプリ」\n   (実行ユーザー: 自分 / アクセスできるユーザー: 全員)\n2. 発行されたURLを「設定」シートのB1に貼る\n3. メニュー「② 新しい商談先を追加」');
}

function setupSheets_(ss) {
  var st = ss.getSheetByName(SHEET_SETTINGS_) || ss.insertSheet(SHEET_SETTINGS_);
  st.clear();
  st.getRange(1, 1, 6, 3).setValues([
    ['公開URL(ウェブアプリのURL)', '', 'デプロイで発行されたURL(…/exec)を貼る'],
    ['e-Stat アプリケーションID', '', '任意。入れると世帯数の自動取得を試みる'],
    ['周辺加盟店の最大社数', 3, ''],
    ['県との差が「同程度」とみなす範囲(ポイント)', 1, ''],
    ['POINTの切り上げ単位(件)', 10, '414件→420件'],
    ['', '', '']]);
  st.getRange('B1:B6').setNumberFormat('@'); st.getRange('B1:B2').setNumberFormat('@');
  st.setColumnWidth(1, 300); st.setColumnWidth(2, 360); st.setColumnWidth(3, 320);
  var ls = ss.getSheetByName(SHEET_LIST_) || ss.insertSheet(SHEET_LIST_);
  if (ls.getLastRow() < 1) {
    ls.getRange(1, 1, 1, 5).setValues([['ID', '会社名', 'タブ名', 'LPのURL', '状態']]).setFontWeight('bold');
    ls.setFrozenRows(1); ls.setColumnWidth(1, 150); ls.setColumnWidth(2, 220); ls.setColumnWidth(3, 200); ls.setColumnWidth(4, 520); ls.setColumnWidth(5, 120);
  }
  var fr = ss.getSheetByName(SHEET_FR_);
  if (!fr) {
    fr = ss.insertSheet(SHEET_FR_);
    fr.getRange(1, 1, 1, 6).setValues([['名称', '都道府県', '市区町村', '住所', 'URL', '有効(×で停止)']]).setFontWeight('bold');
    fr.getRange(2, 1, 2, 5).setValues([
      ['リフォームワン株式会社', '長野県', '上田市', '長野県 上田市', 'https://www.one-estate.jp/'],
      ['ミライズ不動産株式会社', '長野県', '上田市', '長野県 上田市', 'https://www.me-rise-fudosan.jp/']]);
    fr.setFrozenRows(1); fr.setColumnWidth(1, 240); fr.setColumnWidth(4, 260); fr.setColumnWidth(5, 320);
    fr.getRange('A1').setNote('加盟店が増えたら、ここに1行ずつ追加してください。LPの「周辺加盟店」は、ここから(同一市→隣接市→同一県の順に)自動で選ばれます。');
  }
  var li = ss.getSheetByName(SHEET_LISTINGS_);
  if (!li) {
    li = ss.insertSheet(SHEET_LISTINGS_);
    li.getRange(1, 1, 1, 8).setValues([['商談先ID', '種別(土地/中古戸建て/中古マンション/新築戸建て)', '価格(万円)', '土地面積(㎡)', '建物面積(㎡)', '専有面積(㎡)', '築年数', '用途地域']]).setFontWeight('bold');
    li.setFrozenRows(1);
    li.getRange('A1').setNote('任意。物件1件を1行で貼り付けると、売却価格相場(中央値)・物件数・面積の中央値・面積×価格の分布表を自動集計します。商談先タブに手入力した値がある項目はそちらが優先されます。');
  }
}

function prospectTabName_(ss, company) {
  var base = ('商談_' + company).replace(/[\[\]\*\?\/\\:]/g, '').slice(0, 40), name = base, n = 2;
  while (ss.getSheetByName(name)) name = base + '_' + (n++);
  return name;
}

function buildProspectTab_(ss, company, pref, city, id) {
  var sh = ss.insertSheet(prospectTabName_(ss, company));
  var rows = [], styles = [];
  FIELDS_.forEach(function (f, i) {
    var r = FIELD_START_ROW_ + i;
    if (f.h) { rows.push([f.h, '', '', '', '']); styles.push({ r: r, h: true }); return; }
    var init = f.k === 'company' ? company : f.k === 'prefecture' ? pref : f.k === 'city' ? city : '';
    rows.push([f.l, init, f.req ? '=IF(B' + r + '="","未入力","")' : '', f.d || '', f.k]);
  });
  sh.getRange(FIELD_START_ROW_, 1, rows.length, 5).setValues(rows);
  sh.getRange(FIELD_START_ROW_, 2, rows.length, 1).setNumberFormat('@');
  sh.getRange(1, 1, 3, 2).setValues([['状態', '=IF(COUNTIF(C:C,"未入力")=0,"入力完了","未入力 "&COUNTIF(C:C,"未入力")&"件")'], ['ID', id],
    ['LPのURL', '=IF(' + SHEET_SETTINGS_ + '!B1="","(設定シートのB1に公開URLを入れてください)",' + SHEET_SETTINGS_ + '!B1&"?id="&B2)']]);
  sh.getRange(4, 1, 1, 5).setValues([['項目', '値(ここに入力)', '状態', '説明', 'キー']]).setFontWeight('bold').setBackground('#E0F2F4');
  sh.getRange('A1:A3').setFontWeight('bold');
  sh.setColumnWidth(1, 330); sh.setColumnWidth(2, 360); sh.setColumnWidth(3, 70); sh.setColumnWidth(4, 520);
  sh.hideColumns(5);
  sh.setFrozenRows(4);
  styles.forEach(function (s) { sh.getRange(s.r, 1, 1, 4).setBackground('#007482').setFontColor('#FFFFFF').setFontWeight('bold'); });
  sh.getRange(FIELD_START_ROW_, 3, rows.length, 1).setFontColor('#B00020').setFontWeight('bold');
  sh.getRange(FIELD_START_ROW_, 4, rows.length, 1).setFontColor('#595959');
  return sh;
}

function menuAddProspect() {
  var ui = SpreadsheetApp.getUi(), ss = ss_();
  if (!ss.getSheetByName(SHEET_LIST_)) { ui.alert('先に「① 初期設定」を実行してください。'); return; }
  function ask(label, ex) { var r = ui.prompt(label, '例: ' + ex, ui.ButtonSet.OK_CANCEL); return r.getSelectedButton() === ui.Button.OK ? r.getResponseText().trim() : null; }
  var company = ask('先方の会社名', '株式会社○○'); if (!company) return;
  var pref = ask('都道府県', '長野県'); if (!pref) return;
  var city = ask('市区町村', '上田市'); if (!city) return;
  try { pref = normalizePrefecture_(pref); } catch (e) { ui.alert(e.message); return; }
  var id = newId_(), sh = buildProspectTab_(ss, company, pref, city, id), ls = ss.getSheetByName(SHEET_LIST_), r = ls.getLastRow() + 1, q = "'" + sh.getName() + "'";
  var companyRow = FIELD_START_ROW_ + FIELDS_.map(function (f) { return f.k; }).indexOf('company');
  ls.getRange(r, 1, 1, 5).setValues([[id, '=INDIRECT("' + q + '!B' + companyRow + '")', sh.getName(),
    '=IF(' + SHEET_SETTINGS_ + '!B1="","(設定シートのB1に公開URLを入れてください)",' + SHEET_SETTINGS_ + '!B1&"?id="&A' + r + ')', '=IFERROR(INDIRECT("' + q + '!B1"),"")']]);
  ss.setActiveSheet(sh);
  ui.alert('「' + sh.getName() + '」を作成しました。\nタブの「値」欄に入力すると、LPのURLを開き直すだけで反映されます。\n(赤い「未入力」が消えるまで入力してください)');
}

function currentProspect_() {
  var ss = ss_(), sh = ss.getActiveSheet(), id = String(sh.getRange('B2').getValue()).trim();
  if (!findProspect_(id)) throw new Error('商談先のタブを選んでから実行してください。');
  return { id: id, tab: sh.getName() };
}

function menuShowUrl() {
  var ui = SpreadsheetApp.getUi();
  try { var p = currentProspect_(), s = readSettings_();
    ui.alert(s.url ? s.url + '?id=' + p.id : '先に「設定」シートのB1に、ウェブアプリのURLを貼ってください。\n(このタブのIDは ' + p.id + ' です)');
  } catch (e) { ui.alert(e.message); }
}

function menuReport() {
  var ui = SpreadsheetApp.getUi();
  try {
    var p = currentProspect_(), r = buildProspect_(p.id, p.tab), miss = r.report.missing();
    var bad = r.checks.filter(function (c) { return !c.ok; });
    ui.alert('取得レポート\n\n未入力・未取得: ' + miss.length + '件\n' + miss.slice(0, 25).map(function (i) { return '・' + i.label + ': ' + i.reason; }).join('\n') +
      '\n\n整合性チェック: ' + (bad.length ? 'NG ' + bad.map(function (c) { return c.name; }).join(' / ') : 'すべてOK'));
  } catch (e) { ui.alert(e.message); }
}

function menuRotateId() {
  var ui = SpreadsheetApp.getUi();
  try {
    var p = currentProspect_(), ss = ss_(), ls = ss.getSheetByName(SHEET_LIST_), id = newId_();
    var rows = ls.getRange(2, 1, ls.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).trim() === p.id) ls.getRange(i + 2, 1).setValue(id);
    ss.getActiveSheet().getRange('B2').setValue(id);
    ui.alert('URLを作り直しました。旧URLは表示できなくなります。');
  } catch (e) { ui.alert(e.message); }
}
