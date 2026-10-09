/**
 * エリア調査シート LP(Google スプレッドシート連携版)
 *  - シートが正本。商談先ごとのタブに入力すると、LPのURLを開き直すだけで最新内容が表示される。
 *  - 公開は「ウェブアプリ」。URL は  <ウェブアプリURL>?id=<商談先ID>
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('エリア調査シート')
    .addItem('初期設定(最初に1回)', 'menuSetup')
    .addItem('使い方を表示', 'menuShowHelp')
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

/** 設定シート(保存先)の読み取り。LPの公開URLは設定に入力(入力システムの「設定」で変更) */
function readSettings_() {
  var sh = ss_().getSheetByName(SHEET_SETTINGS_), o = { url: '', estat: '', max: 3, threshold: 1, unit: 10, opts: {} };
  if (sh) {
    var v = sh.getRange(1, 2, 5, 1).getDisplayValues().map(function (r) { return r[0]; });
    o.url = v[0].trim().replace(/\/+$/, ''); o.estat = v[1].trim();
    var mx = parseNum_(v[2]), th = parseNum_(v[3]), unit = parseNum_(v[4]);
    if (mx) o.max = mx; if (th !== undefined) o.threshold = th; if (unit) o.unit = unit;
  }
  o.opts.franchise = { max: o.max }; o.opts.trend_same_threshold_pt = o.threshold; o.opts.point_round_unit = o.unit;
  return o;
}

var ALLOWED_DOMAIN_ = 'bukkenking.com';

function realServices_(settings) {
  var s = { cacheGet: cacheGet_, cachePut: cachePut_, fetchJson: fetchJson_, now: function () { return new Date().toISOString(); } };
  if (settings.estat) s.estatHouseholds = function (code) { return estatHouseholds_(settings.estat, code); };
  return s;
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

/** エリア(保存データ) → { model, report, html, checks } */
function buildArea_(areaId) {
  var a = areaById_(areaId);
  if (!a) throw new Error('エリアが見つかりません。');
  var c = companyById_(a.companyId), settings = readSettings_(), ss = ss_();
  var vals = Object.assign({}, a.values, { company: c ? c.name : '', prefecture: a.values.prefecture || a.pref, city: a.values.city || a.city });
  var cfg = valuesToConfig_(vals, todayIso_());
  cfg.options = settings.opts;
  resolveImages_(cfg);
  var frSh = ss.getSheetByName(SHEET_FR_);
  var data = { franchiseRows: frSh && frSh.getLastRow() > 1 ? franchiseRowsFrom_(frSh.getRange(2, 1, frSh.getLastRow() - 1, 6).getDisplayValues()) : [], listingRows: [] };
  var built = buildModel_(cfg, realServices_(settings), data);
  var html = renderPage_(built.model, built.report, ASSETS, STYLE_CSS_);
  return { model: built.model, report: built.report, html: html, checks: runChecks_(built.model, html) };
}

// ---------- ウェブアプリ ----------
function doGet(e) {
  var page = String((e && e.parameter && e.parameter.page) || '').trim();
  var id = String((e && e.parameter && e.parameter.id) || '').trim();
  if (page === 'app' || (!id && !page)) return appPage_();
  var a = areaById_(id);
  if (!a) return errorPage_('ページが見つかりません。URLをご確認ください。');
  try {
    var r = buildArea_(a.id);
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

var HELP_TEXT_ = '【使い方】\n\n入力・加盟店の管理・設定は、すべて「入力システム」で行います。このシートはデータの保存先です(直接編集しないでください)。\n\n■ デプロイは2つ作ります(拡張機能 → Apps Script → デプロイ → 新しいデプロイ → ウェブアプリ)\n① LP用(お客様に見せる)\n   実行ユーザー: 自分 / アクセスできるユーザー: 全員\n   → 発行されたURL(…/exec)を、入力システムの「設定」の「LPの公開URL」に入れる\n② 入力システム用(社内)\n   実行ユーザー: 自分 / アクセスできるユーザー: ' + ALLOWED_DOMAIN_ + ' 内の全員(組織内)\n   → このURL(…/exec)を開くと入力システムが使える\n   (ログインは、Googleアカウントのメールアドレスが @' + ALLOWED_DOMAIN_ + ' かどうかで判定)';

function menuSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SSID', ss.getId());
  setupSheets_(ss);
  SpreadsheetApp.getUi().alert('初期設定が完了しました。\n\n' + HELP_TEXT_);
}

function menuShowHelp() { SpreadsheetApp.getUi().alert(HELP_TEXT_); }

/** 保存先のシートを用意する(再実行しても入力済みのデータは消さない)。加盟店は初回のみ同梱の一覧を取り込む */
function setupSheets_(ss) {
  var st = ss.getSheetByName(SHEET_SETTINGS_) || ss.insertSheet(SHEET_SETTINGS_);
  var defs = [
    ['LPの公開URL', '', 'お客様に見せるLP用デプロイのURL(…/exec)。入力システムの「設定」で入力'],
    ['e-Stat アプリケーションID', '', '任意。入れると世帯数の自動取得を試みる'],
    ['周辺加盟店の最大社数', 3, ''],
    ['県との差が「同程度」とみなす範囲(ポイント)', 1, ''],
    ['POINTの切り上げ単位(件)', 10, '414件→420件']];
  defs.forEach(function (d, i) {
    st.getRange(i + 1, 1).setValue(d[0]); st.getRange(i + 1, 3).setValue(d[2]);
    var b = st.getRange(i + 1, 2);
    if (String(b.getValue()).trim() === '') b.setValue(d[1]);   // 既存の入力は消さない
  });
  st.getRange('B1:B5').setNumberFormat('@');
  st.getRange('A7').setValue('※この設定は入力システムの「設定」から変更します。');
  st.setColumnWidth(1, 300); st.setColumnWidth(2, 360); st.setColumnWidth(3, 460);
  var co = ss.getSheetByName(SHEET_COMPANY_) || ss.insertSheet(SHEET_COMPANY_);
  if (co.getLastRow() < 1) { co.getRange(1, 1, 1, 3).setValues([['会社ID', '会社名', '作成日']]).setFontWeight('bold'); co.setFrozenRows(1); co.setColumnWidth(1, 150); co.setColumnWidth(2, 260); }
  var ar = ss.getSheetByName(SHEET_AREA_) || ss.insertSheet(SHEET_AREA_);
  if (ar.getLastRow() < 1) {
    ar.getRange(1, 1, 1, 9).setValues([['エリアID(LPのID)', '会社ID', '会社名', '都道府県', '市区町村', '作成日', '更新日時', '未入力件数', 'データ(入力システムが管理)']]).setFontWeight('bold');
    ar.setFrozenRows(1); ar.setColumnWidth(1, 150); ar.setColumnWidth(3, 240); ar.setColumnWidth(9, 300);
    ar.getRange('A1').setNote('このシートは入力システムが管理するデータの保存先です。直接編集しないでください。');
  }
  var fr = ss.getSheetByName(SHEET_FR_) || ss.insertSheet(SHEET_FR_);
  if (fr.getLastRow() < 1) {
    fr.getRange(1, 1, 1, 9).setValues([['名称', '都道府県', '市区町村', '住所', 'URL', '有効(×で停止)', '屋号', '対応エリア', '顧客番号']]).setFontWeight('bold');
    fr.setFrozenRows(1); fr.setColumnWidth(1, 260); fr.setColumnWidth(4, 300); fr.setColumnWidth(5, 280);
  }
  if (fr.getLastRow() < 2 && typeof SEED_FRANCHISES_CSV_ !== 'undefined') importFranchiseRows_(fr, parseFranchiseAny_(SEED_FRANCHISES_CSV_).rows);
}
