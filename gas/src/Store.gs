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
  syncIndex_(rebuildIndex_);
}

// ---------- エリア ----------
function listAreas_() {
  var sh = sheetOrThrow_(SHEET_AREA_), out = [];
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 10).getDisplayValues().forEach(function (r, i) {
    if (String(r[0]).trim()) out.push({ row: i + 2, id: String(r[0]).trim(), companyId: String(r[1]).trim(), company: r[2], pref: r[3], city: r[4], created: r[5], updated: r[6], missing: r[7] === '' ? null : Number(r[7]), createdBy: r[9] });
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
function omitKey_(o, k) { var r = Object.assign({}, o); delete r[k]; return r; }

function createArea_(companyId, pref, city, initialValues) {
  var c = companyById_(companyId);
  if (!c) throw new Error('会社が見つかりません。');
  pref = normalizePrefecture_(pref); city = String(city || '').trim();
  if (!city) throw new Error('市区町村を入力してください。');
  var id = newId_(), values = Object.assign({}, initialValues ? omitKey_(initialValues, '_missing') : {}, { prefecture: pref, city: city, 'auto.created': todayIso_() }), sh = sheetOrThrow_(SHEET_AREA_);
  var json = JSON.stringify(values);
  if (json.length > 45000) throw new Error('入力データが大きすぎます。');
  sh.getRange(Math.max(sh.getLastRow(), 1) + 1, 1, 1, 10).setValues([[id, c.id, c.name, pref, city, todayIso_(), nowIso_(), initialValues && initialValues._missing != null ? initialValues._missing : '', json, currentEmail_()]]);
  syncIndex_(function () { upsertIndexRow_(id); });
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
    syncIndex_(function () { upsertIndexRow_(areaId); });
    return res;
  });
}
function setAreaMissing_(areaId, n) {
  var a = areaById_(areaId);
  if (a) { sheetOrThrow_(SHEET_AREA_).getRange(a.row, 8).setValue(n); syncIndex_(function () { upsertIndexRow_(areaId); }); }
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
    syncIndex_(function () { removeIndexRow_(areaId); });
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
    syncIndex_(rebuildIndex_);
  });
}
function rotateAreaId_(areaId) {
  return withLock_(function () {
    var a = areaById_(areaId);
    if (!a) throw new Error('エリアが見つかりません。');
    var nid = newId_();
    sheetOrThrow_(SHEET_AREA_).getRange(a.row, 1).setValue(nid);
    syncIndex_(rebuildIndex_);
    return nid;
  });
}


// ---------- 商談先一覧シート(自動で記載・更新される見やすい一覧) ----------
var SHEET_INDEX_ = '商談先一覧';
var INDEX_HEAD_ = ['会社名', '都道府県', '市区町村', 'LPのURL', '状態', '作成日', '更新日時', '作成者', 'エリアID'];

/** 一覧の更新で失敗しても、本体の保存・作成は止めない */
function syncIndex_(fn) { try { fn(); } catch (e) { console.error('商談先一覧の更新に失敗: ' + (e && e.message || e)); } }

function indexSheet_() {
  var ss = ss_(), sh = ss.getSheetByName(SHEET_INDEX_);
  if (!sh) {
    sh = ss.insertSheet(SHEET_INDEX_);
    sh.getRange(1, 1, 1, INDEX_HEAD_.length).setValues([INDEX_HEAD_]).setFontWeight('bold').setBackground('#E0F2F4');
    sh.setFrozenRows(1);
    [220, 90, 120, 480, 100, 100, 160, 200, 150].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    sh.getRange('A1').setNote('入力システムで会社・エリアを作ると、自動でここに記載されます(状態・更新日時も自動で更新)。直接編集しても反映されません。');
    rebuildIndex_();
  }
  return sh;
}
function statusLabel_(a) { return a.missing === null ? '入力中' : a.missing === 0 ? '入力完了' : '未入力 ' + a.missing + '件'; }
function indexRowFor_(a, st) {
  var base = st.url || st.urlAuto;
  return [a.company, a.pref, a.city, base ? base + '?id=' + a.id : '', statusLabel_(a), a.created, a.updated.replace('T', ' '), a.createdBy || '', a.id];
}
function rebuildIndex_() {
  var sh = indexSheet_(), st = readSettings_(), areas = listAreas_().sort(function (x, y) { return x.company === y.company ? (x.created < y.created ? -1 : 1) : (x.company < y.company ? -1 : 1); });
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, INDEX_HEAD_.length).clearContent();
  if (areas.length) sh.getRange(2, 1, areas.length, INDEX_HEAD_.length).setValues(areas.map(function (a) { return indexRowFor_(a, st); }));
}
function indexRowOf_(sh, areaId) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, INDEX_HEAD_.length, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === areaId) return i + 2;
  return -1;
}
function upsertIndexRow_(areaId) {
  var sh = indexSheet_(), a = null;
  listAreas_().forEach(function (x) { if (x.id === areaId) a = x; });
  if (!a) return;
  var row = indexRowOf_(sh, areaId), vals = indexRowFor_(a, readSettings_());
  if (row < 0) row = Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(row, 1, 1, INDEX_HEAD_.length).setValues([vals]);
}
function removeIndexRow_(areaId) {
  var sh = indexSheet_(), row = indexRowOf_(sh, areaId);
  if (row > 0) sh.deleteRow(row);
}

// ---------- 会社の複製 ----------
function copyImage_(ref, name) {
  var m = String(ref || '').match(/^drive:([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try { return 'drive:' + DriveApp.getFileById(m[1]).makeCopy(name, imageFolder_()).getId(); } catch (e) { return null; }
}

/** 会社を、エリア(入力内容・画像つき)ごと複製する。複製後は別の会社として、独立に編集できる */
function duplicateCompany_(companyId, newName) {
  var src = companyById_(companyId);
  if (!src) throw new Error('複製元の会社が見つかりません。');
  newName = String(newName || '').trim() || (src.name + '（コピー）');
  var areas = listAreas_().filter(function (a) { return a.companyId === companyId; });
  var newId = createCompany_(newName), ids = [];
  areas.forEach(function (a) {
    var full = areaById_(a.id), values = JSON.parse(JSON.stringify(full.values));
    FIELDS_.forEach(function (f) {
      if (f.t === 'image' && values[f.k]) { var c = copyImage_(values[f.k], a.id + '_copy_' + f.k.replace(/[^A-Za-z0-9_]/g, '_')); if (c) values[f.k] = c; else delete values[f.k]; }
    });
    values._missing = a.missing;
    ids.push(createArea_(newId, full.values.prefecture || a.pref, full.values.city || a.city, values));
  });
  return { companyId: newId, areaIds: ids };
}
