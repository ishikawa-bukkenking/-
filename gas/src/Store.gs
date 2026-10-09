/**
 * 保存層: スプレッドシートを「データベース」として使う。商談ごとにタブは増やさない。
 *   会社シート   : 会社ID | 会社名 | 作成日
 *   エリアシート : エリアID(=LPのID) | 会社ID | 会社名 | 都道府県 | 市区町村 | 作成日 | 更新日時 | 未入力件数 | データ(JSON)
 * 1社に複数のエリアを持てる。エリアごとにLPのURLが1つ。
 */

function sheetOrThrow_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('「初期設定」が済んでいません。スプレッドシートのメニューから初期設定を実行してください。');
  return sh;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function nowIso_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss"); }

// ---------- 会社 ----------
function listCompanies_() {
  var sh = sheetOrThrow_(SHEET_COMPANY_), out = [];
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getDisplayValues().forEach(function (r, i) {
    if (String(r[0]).trim()) out.push({ row: i + 2, id: String(r[0]).trim(), name: r[1], created: r[2] });
  });
  return out;
}
function companyById_(id) {
  var found = null;
  listCompanies_().forEach(function (c) { if (c.id === id) found = c; });
  return found;
}
function createCompany_(name) {
  name = String(name || '').trim();
  if (!name) throw new Error('会社名を入力してください。');
  if (name.length > 100) throw new Error('会社名が長すぎます。');
  var sh = sheetOrThrow_(SHEET_COMPANY_), id = newId_();
  sh.getRange(Math.max(sh.getLastRow(), 1) + 1, 1, 1, 3).setValues([[id, name, todayIso_()]]);
  return id;
}
function renameCompany_(id, name) {
  name = String(name || '').trim();
  if (!name || name.length > 100) throw new Error('会社名を入力してください(100文字まで)。');
  var c = companyById_(id);
  if (!c) throw new Error('会社が見つかりません。');
  sheetOrThrow_(SHEET_COMPANY_).getRange(c.row, 2).setValue(name);
  var sh = sheetOrThrow_(SHEET_AREA_);
  listAreas_().forEach(function (a) { if (a.companyId === id) sh.getRange(a.row, 3).setValue(name); });
}

// ---------- エリア ----------
function listAreas_() {
  var sh = sheetOrThrow_(SHEET_AREA_), out = [];
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 8).getDisplayValues().forEach(function (r, i) {
    if (String(r[0]).trim()) out.push({ row: i + 2, id: String(r[0]).trim(), companyId: String(r[1]).trim(), company: r[2], pref: r[3], city: r[4], created: r[5], updated: r[6], missing: r[7] === '' ? null : Number(r[7]) });
  });
  return out;
}
function areaById_(id) {
  id = String(id || '').trim();
  if (!/^[A-Za-z0-9]{8,40}$/.test(id)) return null;
  var found = null;
  listAreas_().forEach(function (a) { if (a.id === id) found = a; });
  if (!found) return null;
  var raw = sheetOrThrow_(SHEET_AREA_).getRange(found.row, 9).getValue();
  try { found.values = raw ? JSON.parse(raw) : {}; } catch (e) { found.values = {}; }
  return found;
}
function createArea_(companyId, pref, city) {
  var c = companyById_(companyId);
  if (!c) throw new Error('会社が見つかりません。');
  pref = normalizePrefecture_(pref); city = String(city || '').trim();
  if (!city) throw new Error('市区町村を入力してください。');
  var id = newId_(), values = { prefecture: pref, city: city, 'auto.created': todayIso_() }, sh = sheetOrThrow_(SHEET_AREA_);
  sh.getRange(Math.max(sh.getLastRow(), 1) + 1, 1, 1, 9).setValues([[id, c.id, c.name, pref, city, todayIso_(), nowIso_(), '', JSON.stringify(values)]]);
  return id;
}
/** 値(JSON)を書き込む。都道府県・市区町村は一覧用の列にも写す。排他制御つき */
function writeAreaValues_(areaId, mutate) {
  return withLock_(function () {
    var a = areaById_(areaId);
    if (!a) throw new Error('エリアが見つかりません。');
    var res = mutate(a.values);
    var json = JSON.stringify(a.values);
    if (json.length > 45000) throw new Error('入力データが大きすぎます。');
    var sh = sheetOrThrow_(SHEET_AREA_);
    sh.getRange(a.row, 4, 1, 2).setValues([[a.values.prefecture || a.pref, a.values.city || a.city]]);
    sh.getRange(a.row, 7).setValue(nowIso_());
    sh.getRange(a.row, 9).setValue(json);
    return res;
  });
}
function setAreaMissing_(areaId, n) {
  var a = areaById_(areaId);
  if (a) sheetOrThrow_(SHEET_AREA_).getRange(a.row, 8).setValue(n);
}
function trashImage_(ref) {
  var m = String(ref || '').match(/^drive:([A-Za-z0-9_-]+)$/);
  if (m) { try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (e) { /* 既に無ければ何もしない */ } }
}
function trashAreaImages_(values) {
  FIELDS_.forEach(function (f) { if (f.t === 'image' && values[f.k]) trashImage_(values[f.k]); });
}
function deleteArea_(areaId) {
  withLock_(function () {
    var a = areaById_(areaId);
    if (!a) throw new Error('エリアが見つかりません。');
    trashAreaImages_(a.values);
    sheetOrThrow_(SHEET_AREA_).deleteRow(a.row);
  });
}
function deleteCompany_(companyId) {
  withLock_(function () {
    var c = companyById_(companyId);
    if (!c) throw new Error('会社が見つかりません。');
    listAreas_().filter(function (a) { return a.companyId === companyId; }).map(function (a) { return a.id; }).forEach(function (id) {
      var a = areaById_(id);
      if (a) { trashAreaImages_(a.values); sheetOrThrow_(SHEET_AREA_).deleteRow(a.row); }
    });
    sheetOrThrow_(SHEET_COMPANY_).deleteRow(companyById_(companyId).row);
  });
}
function rotateAreaId_(areaId) {
  return withLock_(function () {
    var a = areaById_(areaId);
    if (!a) throw new Error('エリアが見つかりません。');
    var nid = newId_();
    sheetOrThrow_(SHEET_AREA_).getRange(a.row, 1).setValue(nid);
    return nid;
  });
}
