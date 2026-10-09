/** 入力システム(ウェブアプリ上の入力画面)のサーバー側。すべての api_* はパスワードを検証する */

function newPassword_() {
  var chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
  for (var i = 0; i < 12; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function appPage_() {
  return HtmlService.createHtmlOutput(APP_HTML_).setTitle('エリア調査シート 入力システム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** パスワード検証。失敗が続くと一時的にロックする(総当たり対策) */
function requireAuth_(pw) {
  var cache = CacheService.getScriptCache(), fails = Number(cache.get('authfail') || 0);
  if (fails >= 10) throw new Error('パスワードの誤りが続いたため、10分間ロックしました。');
  var real = readSettings_().pw;
  if (!real) throw new Error('「設定」シートのB6にパスワードを入れてください(初期設定で自動作成されます)。');
  var given = String(pw || ''), ok = given.length === real.length, diff = 0;
  for (var i = 0; i < real.length; i++) diff |= (real.charCodeAt(i) ^ (given.charCodeAt(i) || 0));
  if (!ok || diff !== 0) { cache.put('authfail', String(fails + 1), 600); throw new Error('パスワードが違います。'); }
  if (fails) cache.remove('authfail');
}

function lpUrl_(settings, id) { return settings.url ? settings.url + '?id=' + id : ''; }

function api_login(pw) {
  requireAuth_(pw);
  return { ok: true, url: readSettings_().url };
}

function api_list(pw) {
  requireAuth_(pw);
  var ss = ss_(), sh = ss.getSheetByName(SHEET_LIST_), st = readSettings_(), out = [];
  if (!sh || sh.getLastRow() < 2) return { items: out, hasUrl: !!st.url };
  sh.getRange(2, 1, sh.getLastRow() - 1, 5).getDisplayValues().forEach(function (r) {
    if (String(r[0]).trim()) out.push({ id: String(r[0]).trim(), company: r[1], tab: r[2], status: r[4], url: lpUrl_(st, String(r[0]).trim()) });
  });
  return { items: out.reverse(), hasUrl: !!st.url };
}

function api_create(pw, company, pref, city) {
  requireAuth_(pw);
  company = String(company || '').trim(); city = String(city || '').trim();
  if (!company || !city) throw new Error('会社名と市区町村を入力してください。');
  var c = createProspect_(ss_(), company, normalizePrefecture_(pref), city);
  return { id: c.id };
}

function api_get(pw, id) {
  requireAuth_(pw);
  var p = findProspect_(String(id || '').trim());
  if (!p) throw new Error('商談先が見つかりません。');
  syncTabRows_(ss_().getSheetByName(p.tab));
  var st = readSettings_(), vals = readTabValues_(p.tab), images = {};
  FIELDS_.forEach(function (f) { if (f.t === 'image') images[f.k] = /^drive:/.test(vals[f.k] || ''); });
  return { id: p.id, tab: p.tab, fields: fieldsMeta_(), values: vals, images: images, url: lpUrl_(st, p.id), prefectures: PREFECTURES };
}

function trashImage_(ref) {
  var m = String(ref || '').match(/^drive:([A-Za-z0-9_-]+)$/);
  if (m) { try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) { /* 既に無ければ何もしない */ } }
}

function today_() { return todayIso_(); }

/** changes: { キー: 値 }。検証に通った項目だけ書き込み、エラーは項目ごとに返す。区分ごとの取得日(入力日)を自動で更新 */
function api_save(pw, id, changes) {
  requireAuth_(pw);
  var p = findProspect_(String(id || '').trim());
  if (!p) throw new Error('商談先が見つかりません。');
  var sh = ss_().getSheetByName(p.tab);
  syncTabRows_(sh);
  var last = sh.getLastRow(), errors = {}, saved = 0, touched = {};
  var keys = sh.getRange(FIELD_START_ROW_, 5, last - FIELD_START_ROW_ + 1, 1).getValues().map(function (r) { return String(r[0]); });
  Object.keys(changes || {}).forEach(function (k) {
    var v = changes[k] === null || changes[k] === undefined ? '' : String(changes[k]);
    var isImg = isImageKey_(k);
    var err = isImg ? (v.trim() === '' ? '' : '画像はアップロードで登録してください') : validateValue_(k, v);
    if (err) { errors[k] = err; return; }
    var row = keys.indexOf(k);
    if (row < 0) { errors[k] = 'シートに項目が見つかりません'; return; }
    var cell = sh.getRange(FIELD_START_ROW_ + row, 2);
    if (isImg) trashImage_(cell.getValue());
    cell.setValue(v.trim());
    var dk = dateKeyFor_(k); if (dk) touched[dk] = 1;
    saved++;
  });
  Object.keys(touched).forEach(function (dk) { var r = keys.indexOf(dk); if (r >= 0) sh.getRange(FIELD_START_ROW_ + r, 2).setValue(today_()); });
  return { saved: saved, errors: errors };
}

function imageFolder_() {
  var props = PropertiesService.getScriptProperties(), fid = props.getProperty('IMGFOLDER');
  if (fid) { try { return DriveApp.getFolderById(fid); } catch (e) { /* 作り直す */ } }
  var f = DriveApp.createFolder('エリア調査シート 画像');
  props.setProperty('IMGFOLDER', f.getId());
  return f;
}

/** 画像のアップロード(ブラウザ側で縮小済みの data URL)。Driveの非公開フォルダに保存し、LPには埋め込みで表示する */
function api_uploadImage(pw, id, key, dataUrl) {
  requireAuth_(pw);
  var p = findProspect_(String(id || '').trim());
  if (!p) throw new Error('商談先が見つかりません。');
  if (!isImageKey_(key)) throw new Error('画像を登録できない項目です。');
  var m = String(dataUrl || '').match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+\/=]+)$/);
  if (!m) throw new Error('JPEGまたはPNGの画像を選んでください。');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('画像が大きすぎます(5MBまで)。');
  var mime = 'image/' + m[1];
  var file = imageFolder_().createFile(Utilities.newBlob(bytes, mime, p.id + '_' + key.replace(/[^A-Za-z0-9_]/g, '_') + (m[1] === 'png' ? '.png' : '.jpg')));
  var sh = ss_().getSheetByName(p.tab);
  syncTabRows_(sh);
  var last = sh.getLastRow(), keys = sh.getRange(FIELD_START_ROW_, 5, last - FIELD_START_ROW_ + 1, 1).getValues().map(function (r) { return String(r[0]); });
  var row = keys.indexOf(key), cell = sh.getRange(FIELD_START_ROW_ + row, 2);
  trashImage_(cell.getValue());
  cell.setValue('drive:' + file.getId());
  var dk = dateKeyFor_(key), dr = dk ? keys.indexOf(dk) : -1;
  if (dr >= 0) sh.getRange(FIELD_START_ROW_ + dr, 2).setValue(today_());
  return { ok: true };
}

/** 未入力の項目と整合性チェック(LPを組み立てて判定) */
function api_status(pw, id) {
  requireAuth_(pw);
  var p = findProspect_(String(id || '').trim());
  if (!p) throw new Error('商談先が見つかりません。');
  var r = buildProspect_(p.id, p.tab);
  return {
    missing: r.report.missing().map(function (i) { return { key: i.key, label: i.label, reason: i.reason }; }),
    checksNg: r.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name + (c.detail ? '(' + c.detail + ')' : ''); }),
    city: r.model.meta.city, households: r.model.area.households,
    totals: { listings_total: r.model.totals.listings_total, brokerage: r.model.totals.brokerage_unit_display_man }
  };
}

/** URLを作り直す(旧URLは無効になる) */
function api_rotate(pw, id) {
  requireAuth_(pw);
  var p = findProspect_(String(id || '').trim());
  if (!p) throw new Error('商談先が見つかりません。');
  var ss = ss_(), ls = ss.getSheetByName(SHEET_LIST_), nid = newId_();
  ls.getRange(2, 1, ls.getLastRow() - 1, 1).getValues().forEach(function (r, i) { if (String(r[0]).trim() === p.id) ls.getRange(i + 2, 1).setValue(nid); });
  ss.getSheetByName(p.tab).getRange('B2').setValue(nid);
  return { id: nid };
}

// ---------- 加盟店の管理(保存先は 加盟店一覧 シート) ----------
function frSheet_() {
  var sh = ss_().getSheetByName(SHEET_FR_);
  if (!sh) throw new Error('「初期設定」が済んでいません。');
  return sh;
}
function isActive_(v) { return !/^(×|停止|0|無効)$/.test(String(v).trim()); }

function api_fr_list(pw) {
  requireAuth_(pw);
  var sh = frSheet_(), out = [];
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 6).getDisplayValues().forEach(function (r, i) {
    if (String(r[0]).trim()) out.push({ i: i, name: r[0], prefecture: r[1], city: r[2], url: r[4], active: isActive_(r[5]) });
  });
  return { items: out, prefectures: PREFECTURES };
}

function api_fr_save(pw, idx, rec) {
  requireAuth_(pw);
  rec = rec || {};
  var name = String(rec.name || '').trim(), city = String(rec.city || '').trim(), url = String(rec.url || '').trim();
  if (!name || !city) throw new Error('名称と市区町村を入力してください。');
  var pref = normalizePrefecture_(rec.prefecture);
  if (url && !/^https?:\/\//.test(url)) throw new Error('URLは https:// から始めてください。');
  var sh = frSheet_(), row = Number(idx) >= 0 ? Number(idx) + 2 : Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(row, 1, 1, 6).setValues([[name, pref, city, pref + ' ' + city, url, rec.active === false ? '×' : '']]);
  return { ok: true };
}

function api_fr_delete(pw, idx) {
  requireAuth_(pw);
  var sh = frSheet_(), row = Number(idx) + 2;
  if (!(Number(idx) >= 0) || row > sh.getLastRow()) throw new Error('対象が見つかりません。');
  sh.deleteRow(row);
  return { ok: true };
}

// ---------- 設定(保存先は 設定 シート) ----------
function api_settings_get(pw) {
  requireAuth_(pw);
  var s = readSettings_();
  return { estat: s.estat, max: s.max, threshold: s.threshold, unit: s.unit, url: s.url };
}

function api_settings_set(pw, v) {
  requireAuth_(pw);
  v = v || {};
  var max = parseNum_(v.max), th = parseNum_(v.threshold), unit = parseNum_(v.unit);
  if (!(max >= 1 && max <= 10)) throw new Error('周辺加盟店の最大社数は1〜10で入力してください。');
  if (th === undefined || th < 0) throw new Error('「同程度」の範囲は0以上の数で入力してください。');
  if (!(unit >= 1)) throw new Error('切り上げ単位は1以上で入力してください。');
  var sh = ss_().getSheetByName(SHEET_SETTINGS_);
  sh.getRange('B2').setValue(String(v.estat || '').trim()); sh.getRange('B3').setValue(String(max));
  sh.getRange('B4').setValue(String(th)); sh.getRange('B5').setValue(String(unit));
  var newPw = String(v.newPw || '');
  if (newPw) {
    if (newPw.length < 8) throw new Error('パスワードは8文字以上にしてください。');
    sh.getRange('B6').setValue(newPw);
  }
  return { ok: true, pwChanged: !!newPw };
}
