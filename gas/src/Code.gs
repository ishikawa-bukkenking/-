/**
 * エリア調査シート LP(Google スプレッドシート連携版)
 *  - シートが正本。商談先ごとのタブに入力すると、LPのURLを開き直すだけで最新内容が表示される。
 *  - 公開は「ウェブアプリ」。URL は  <ウェブアプリURL>?id=<商談先ID>
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('エリア調査シート')
    .addItem('初期設定(最初に1回)', 'menuSetup')
    .addItem('入力システムのURLとパスワードを表示', 'menuShowApp')
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

/** 設定シート(保存先)の読み取り。公開URLは B1 に入っていればそれ、無ければデプロイ済みウェブアプリのURLを自動で使う */
function readSettings_() {
  var sh = ss_().getSheetByName(SHEET_SETTINGS_), o = { url: '', estat: '', pw: '', max: 3, threshold: 1, unit: 10, opts: {} };
  if (sh) {
    var v = sh.getRange(1, 2, 6, 1).getDisplayValues().map(function (r) { return r[0]; });
    o.url = v[0].trim(); o.estat = v[1].trim(); o.pw = String(v[5] || '').trim();
    var mx = parseNum_(v[2]), th = parseNum_(v[3]), unit = parseNum_(v[4]);
    if (mx) o.max = mx; if (th !== undefined) o.threshold = th; if (unit) o.unit = unit;
  }
  if (!o.url) { try { o.url = ScriptApp.getService().getUrl() || ''; } catch (e) { o.url = ''; } }
  o.opts.franchise = { max: o.max }; o.opts.trend_same_threshold_pt = o.threshold; o.opts.point_round_unit = o.unit;
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

/** Drive に保存した画像(drive:<ID>)を data URI にして返す(LPに埋め込むため、Driveの共有設定は不要) */
function imageDataUri_(ref) {
  var m = String(ref || '').match(/^drive:([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  var key = 'img:' + m[1], hit = cacheGet_(key);
  if (hit) return hit;
  try {
    var blob = DriveApp.getFileById(m[1]).getBlob();
    var uri = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    if (uri.length < 400000) cachePut_(key, uri);
    return uri;
  } catch (e) { return null; }
}

function resolveImages_(cfg) {
  var inp = cfg.inputs || {};
  [['price_trend', 'image'], ['used_house', 'heatmap_image'], ['used_mansion', 'heatmap_image'], ['new_house', 'heatmap_image']].forEach(function (p) {
    var sec = inp[p[0]];
    if (sec && sec[p[1]]) { var uri = imageDataUri_(sec[p[1]]); if (uri) sec[p[1]] = uri; else delete sec[p[1]]; }
  });
}

/** 商談先タブ → { model, report, html, checks } */
function buildProspect_(id, tab) {
  var settings = readSettings_(), ss = ss_();
  var sheet = ss.getSheetByName(tab);
  if (sheet) syncTabRows_(sheet);
  var cfg = valuesToConfig_(readTabValues_(tab), todayIso_());
  cfg.options = settings.opts;
  resolveImages_(cfg);
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
  var page = String((e && e.parameter && e.parameter.page) || '').trim();
  var id = String((e && e.parameter && e.parameter.id) || '').trim();
  if (page === 'app' || (!id && !page)) return appPage_();
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
  SpreadsheetApp.getUi().alert('初期設定が完了しました。\n\n入力システムのパスワード: ' + readSettings_().pw + '\n(「設定」シートのB6。入力システム内でも変更できます)\n\n次の手順:\n1. 拡張機能 → Apps Script → デプロイ → 新しいデプロイ → 種類「ウェブアプリ」\n   (実行ユーザー: 自分 / アクセスできるユーザー: 全員)\n2. 発行されたURL(…/exec)を開くと「入力システム」が使えます。\n   以降の入力・加盟店の管理・設定は、すべて入力システムで行います。このシートは保存先です。');
}

function menuShowApp() {
  var s = readSettings_();
  SpreadsheetApp.getUi().alert('入力システムのURL:\n' + (s.url || '(未デプロイ。拡張機能 → Apps Script → デプロイ から、ウェブアプリとしてデプロイしてください)') + '\n\nパスワード: ' + s.pw);
}

function setupSheets_(ss) {
  var st = ss.getSheetByName(SHEET_SETTINGS_) || ss.insertSheet(SHEET_SETTINGS_);
  var defs = [
    ['公開URL(通常は空欄でOK)', '', '空欄ならデプロイ済みのウェブアプリのURLを自動で使う。独自のURLを使う場合のみ入力'],
    ['e-Stat アプリケーションID', '', '任意。入れると世帯数の自動取得を試みる'],
    ['周辺加盟店の最大社数', 3, ''],
    ['県との差が「同程度」とみなす範囲(ポイント)', 1, ''],
    ['POINTの切り上げ単位(件)', 10, '414件→420件'],
    ['入力システムのパスワード', '', '入力システム(…/exec を開く)のパスワード。自動で作成。入力システム内でも変更できる']];
  defs.forEach(function (d, i) {
    st.getRange(i + 1, 1).setValue(d[0]); st.getRange(i + 1, 3).setValue(d[2]);
    var b = st.getRange(i + 1, 2);
    if (String(b.getDisplayValue ? b.getDisplayValue() : b.getValue()).trim() === '') b.setValue(d[1]);   // 既存の入力は消さない
  });
  var pwCell = st.getRange(6, 2);
  if (String(pwCell.getValue()).trim() === '') pwCell.setValue(newPassword_());
  st.getRange('B1:B6').setNumberFormat('@');
  st.setColumnWidth(1, 300); st.setColumnWidth(2, 360); st.setColumnWidth(3, 420);
  var ls = ss.getSheetByName(SHEET_LIST_) || ss.insertSheet(SHEET_LIST_);
  if (ls.getLastRow() < 1) {
    ls.getRange(1, 1, 1, 5).setValues([['ID', '会社名', 'タブ名', '(予備)', '状態']]).setFontWeight('bold');
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
    var init = f.k === 'company' ? company : f.k === 'prefecture' ? pref : f.k === 'city' ? city : f.k === 'auto.created' ? todayIso_() : '';
    rows.push([f.l, init, f.req ? '=IF(B' + r + '="","未入力","")' : '', f.d || '', f.k]);
  });
  sh.getRange(FIELD_START_ROW_, 1, rows.length, 5).setValues(rows);
  sh.getRange(FIELD_START_ROW_, 2, rows.length, 1).setNumberFormat('@');
  sh.getRange(1, 1, 3, 2).setValues([['状態', '=IF(COUNTIF(C:C,"未入力")=0,"入力完了","未入力 "&COUNTIF(C:C,"未入力")&"件")'], ['ID', id],
    ['このタブについて', '入力システム(…/exec)のデータ保存先です。入力は入力システムで行ってください。']]);
  sh.getRange(4, 1, 1, 5).setValues([['項目', '値', '状態', '説明', 'キー']]).setFontWeight('bold').setBackground('#E0F2F4');
  sh.getRange('A1:A3').setFontWeight('bold');
  sh.setColumnWidth(1, 330); sh.setColumnWidth(2, 360); sh.setColumnWidth(3, 70); sh.setColumnWidth(4, 520);
  sh.hideColumns(5);
  sh.setFrozenRows(4);
  styles.forEach(function (s) { sh.getRange(s.r, 1, 1, 4).setBackground('#007482').setFontColor('#FFFFFF').setFontWeight('bold'); });
  sh.getRange(FIELD_START_ROW_, 3, rows.length, 1).setFontColor('#B00020').setFontWeight('bold');
  sh.getRange(FIELD_START_ROW_, 4, rows.length, 1).setFontColor('#595959');
  return sh;
}

/** 商談先タブを作り、一覧に登録する。戻り値: { id, sheet } */
function createProspect_(ss, company, pref, city) {
  pref = normalizePrefecture_(pref);
  var id = newId_(), sh = buildProspectTab_(ss, company, pref, city, id), ls = ss.getSheetByName(SHEET_LIST_), r = ls.getLastRow() + 1, q = "'" + sh.getName() + "'";
  var companyRow = FIELD_START_ROW_ + FIELDS_.map(function (f) { return f.k; }).indexOf('company');
  ls.getRange(r, 1, 1, 5).setValues([[id, '=INDIRECT("' + q + '!B' + companyRow + '")', sh.getName(), '', '=IFERROR(INDIRECT("' + q + '!B1"),"")']]);
  return { id: id, sheet: sh };
}
