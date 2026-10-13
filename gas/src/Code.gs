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

/** e-Stat API(政府統計の総合窓口)から令和2年国勢調査の市区町村別の世帯数を取得する。失敗時は、試した表と理由をメッセージにして投げる */
function estatHouseholds_(appId, areaCode) {
  var base = 'https://api.e-stat.go.jp/rest/3.0/app/json/', log = [];
  function get(path, params) {
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    var r = UrlFetchApp.fetch(base + path + '?' + q, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode());
    var j = JSON.parse(r.getContentText()), root = j[Object.keys(j)[0]] || {}, res = root.RESULT || {};
    if (res.STATUS !== undefined && Number(res.STATUS) !== 0 && Number(res.STATUS) !== 1) throw new Error('e-Stat: ' + (res.ERROR_MSG || ('STATUS ' + res.STATUS)));
    return root;
  }
  function arr(x) { return x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]; }
  function txt(x) { return x && typeof x === 'object' ? String(x.$ || '') : String(x || ''); }
  var tabs;
  try {
    var lst = get('getStatsList', { appId: appId, lang: 'J', statsCode: '00200521', surveyYears: '2020', searchWord: '世帯', limit: 100 });
    tabs = arr((lst.DATALIST_INF || {}).TABLE_INF);
  } catch (e) { throw new Error('表の一覧を取得できません(' + e.message + ')。アプリケーションIDとネットワークを確認してください。'); }
  if (!tabs.length) throw new Error('国勢調査(令和2年)の表が見つかりませんでした。');
  var scored = tabs.map(function (t) {
    var title = txt(t.TITLE) + ' ' + txt(t.STATISTICS_NAME);
    var sc = (/市区町村/.test(title) ? 4 : 0) + (/世帯/.test(title) ? 3 : 0) + (/基本集計|人口等基本集計/.test(title) ? 2 : 0) - (/男女|年齢|配偶|産業|職業|就業|従業|外国|移動|住居|教育|在学/.test(title) ? 3 : 0);
    return { id: t['@id'], title: txt(t.TITLE), sc: sc };
  }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 8);
  for (var i = 0; i < scored.length; i++) {
    var t = scored[i];
    try {
      var d = get('getStatsData', { appId: appId, lang: 'J', statsDataId: t.id, cdArea: areaCode, metaGetFlg: 'Y', limit: 300 });
      var inf = d.STATISTICAL_DATA || {}, names = {};
      arr((inf.CLASS_INF || {}).CLASS_OBJ).forEach(function (o) { arr(o.CLASS).forEach(function (c) { names[o['@id'] + ':' + c['@code']] = String(c['@name'] || ''); }); });
      var best = null;
      arr((inf.DATA_INF || {}).VALUE).forEach(function (v) {
        var cats = Object.keys(v).filter(function (k) { return /^@(cat\d+|tab)$/.test(k); }).map(function (k) { return names[k.slice(1) + ':' + v[k]] || ''; });
        var joined = cats.join(' / ');
        if (!/世帯/.test(joined) || /当たり|人員|割合|率|増減|比/.test(joined)) return;
        if (v['@area'] && v['@area'] !== areaCode) return;
        var n = parseInt(String(v.$).replace(/,/g, ''), 10);
        if (!n) return;
        var score = (/^(一般)?世帯数$|総世帯|世帯総数|^一般世帯$/.test(cats.join(''))) ? 2 : 1;
        if (!best || score > best.score) best = { value: n, score: score, label: joined };
      });
      if (best) return { value: best.value, source: '総務省統計局 令和2年国勢調査(e-Stat)', table: t.id + ' ' + t.title, label: best.label };
      log.push(t.id + '「' + t.title.slice(0, 30) + '」: 世帯数の値なし');
    } catch (e) { log.push(t.id + ': ' + e.message); }
  }
  throw new Error('世帯数を取得できませんでした。試した表: ' + log.join(' / '));
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
  var sh = ss_().getSheetByName(SHEET_SETTINGS_), o = { url: '', estat: '', max: 3, threshold: 1, opts: {} };
  if (sh) {
    var v = sh.getRange(1, 2, 5, 1).getDisplayValues().map(function (r) { return r[0]; });
    o.url = v[0].trim().replace(/\/+$/, ''); o.estat = v[1].trim();
    var mx = parseNum_(v[2]), th = parseNum_(v[3]);
    if (mx) o.max = mx; if (th !== undefined) o.threshold = th;
  }
  o.opts.franchise = { max: o.max }; o.opts.trend_same_threshold_pt = o.threshold;
  return o;
}

/** 世帯数の自動取得。取得できたらエリアのデータに保存し、以後はAPIを呼ばない(市区町村が変わったら取り直す)。失敗は10分間だけ覚えて連打を避ける */
function householdsFor_(settings, areaId, code) {
  var a = areaId ? areaById_(areaId) : null;
  if (a && a.values['auto.households'] && a.values['auto.households_code'] === code)
    return { value: Number(a.values['auto.households']), source: '総務省統計局 令和2年国勢調査(e-Stat)', date: a.values['auto.date.households'] };
  var failKey = 'estatfail:' + code, hit = cacheGet_(failKey);
  if (hit) throw new Error(hit);
  try {
    var got = estatHouseholds_(settings.estat, code);
    if (a) writeAreaValues_(areaId, function (v) { v['auto.households'] = String(got.value); v['auto.households_code'] = code; v['auto.date.households'] = todayIso_(); });
    got.date = todayIso_();
    return got;
  } catch (e) { cachePut_(failKey, e.message, 600); throw e; }
}

var ALLOWED_DOMAIN_ = 'bukkenking.com';

function realServices_(settings, areaId) {
  var s = { cacheGet: cacheGet_, cachePut: cachePut_, fetchJson: fetchJson_, now: function () { return new Date().toISOString(); } };
  if (settings.estat) s.estatHouseholds = function (code) { return householdsFor_(settings, areaId, code); };
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
  var built = buildModel_(cfg, realServices_(settings, a.id), data);
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
    ['(未使用)', '', 'POINTの件数は上位2桁で自動的に切り上げます(414件→420件、1,898件→1,900件)']];
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
