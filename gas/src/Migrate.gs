// ---------- データの移行(旧システム → 新システム) ----------
// 旧システムの「設定」→「データを書き出す」で作ったファイルを、新システムの「設定」→「データを取り込む」で読み込む。
// 会社・エリアは、同じIDがなければ追加(既にあるものは変えない)。加盟店一覧は取り込んだ内容に置き換える。
var MIG_COLS_ = {}; MIG_COLS_[SHEET_COMPANY_] = 3; MIG_COLS_[SHEET_AREA_] = 10; MIG_COLS_[SHEET_FR_] = 9;

function migRows_(name) {
  var sh = ss_().getSheetByName(name), n = MIG_COLS_[name];
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, n).getDisplayValues().filter(function (r) { return String(r[0]).trim() || String(r[1]).trim(); });
}

function api_export_all() {
  requireUser_();
  var out = { format: 'area-sheet-export', version: 1, at: nowIso_(), sheets: {}, files: {}, settings: {}, props: {} };
  [SHEET_COMPANY_, SHEET_AREA_, SHEET_FR_].forEach(function (n) { out.sheets[n] = migRows_(n); });
  var st = ss_().getSheetByName(SHEET_SETTINGS_);
  if (st) { var v = st.getRange(1, 2, 5, 1).getDisplayValues().map(function (r) { return r[0]; }); out.settings = { estat: v[1], max: v[2], threshold: v[3] }; }
  out.props.SRC_EXTRA = PropertiesService.getScriptProperties().getProperty('SRC_EXTRA') || '';
  var seen = {}, missing = [];
  out.sheets[SHEET_AREA_].forEach(function (r) {
    (String(r[8]).match(/drive:[A-Za-z0-9_-]+/g) || []).forEach(function (ref) {
      var id = ref.slice(6);
      if (seen[id]) return; seen[id] = 1;
      try { var b = DriveApp.getFileById(id).getBlob(); out.files[id] = { mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) }; }
      catch (e) { missing.push(id); }
    });
  });
  out.missingFiles = missing;
  return out;
}

function api_import_all(data) {
  requireUser_();
  if (!data || data.format !== 'area-sheet-export' || !data.sheets) throw new Error('書き出したファイルではありません。旧システムの「設定」→「データを書き出す」で作ったファイルを選んでください。');
  var res = { companies: 0, areas: 0, franchises: 0, images: 0, skipped: 0 }, idMap = {};
  Object.keys(data.files || {}).forEach(function (oldId) {   // 画像: 新しい保存先に作り直し、参照のIDを付け替える
    var f = data.files[oldId];
    try {
      var file = imageFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(f.data), f.mime || 'image/png', 'import_' + oldId));
      idMap[oldId] = file.getId(); res.images++;
    } catch (e) { /* 画像1枚の失敗で全体は止めない */ }
  });
  function remap(s) { return String(s).replace(/drive:([A-Za-z0-9_-]+)/g, function (m, id) { return idMap[id] ? 'drive:' + idMap[id] : m; }); }
  var ss = ss_(); setupSheets_(ss);
  var haveC = {}, haveA = {};
  listCompanies_().forEach(function (c) { haveC[c.id] = 1; });
  listAreas_().forEach(function (a) { haveA[a.id] = 1; });
  function append(name, rows, have, counter) {
    var sh = ss.getSheetByName(name), n = MIG_COLS_[name], add = [];
    (rows || []).forEach(function (r) {
      var id = String(r[0] || '').trim(); if (!id) return;
      if (have[id]) { res.skipped++; return; }
      var row = []; for (var i = 0; i < n; i++) row.push(r[i] === undefined || r[i] === null ? '' : String(r[i]));
      if (name === SHEET_AREA_) row[8] = remap(row[8]);
      add.push(row);
    });
    if (add.length) { sh.getRange(sh.getLastRow() + 1, 1, add.length, n).setValues(add); res[counter] += add.length; }
  }
  append(SHEET_COMPANY_, data.sheets[SHEET_COMPANY_], haveC, 'companies');
  append(SHEET_AREA_, data.sheets[SHEET_AREA_], haveA, 'areas');
  var fr = data.sheets[SHEET_FR_];
  if (fr && fr.length) {   // 加盟店一覧は置き換え
    var sh = ss.getSheetByName(SHEET_FR_), n = MIG_COLS_[SHEET_FR_], last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, n).clearContent();
    var rows = fr.map(function (r) { var row = []; for (var i = 0; i < n; i++) row.push(r[i] === undefined || r[i] === null ? '' : String(r[i])); return row; });
    sh.getRange(2, 1, rows.length, n).setValues(rows); res.franchises = rows.length;
  }
  var s = data.settings || {}, st = ss.getSheetByName(SHEET_SETTINGS_);
  if (st) {   // LPの公開URLは新しいURLを使うので、取り込まない
    if (s.estat && String(st.getRange('B2').getValue()).trim() === '') st.getRange('B2').setValue(String(s.estat));
    if (s.max) st.getRange('B3').setValue(String(s.max));
    if (s.threshold !== undefined && s.threshold !== '') st.getRange('B4').setValue(String(s.threshold));
  }
  var ex = (data.props || {}).SRC_EXTRA;
  if (ex) PropertiesService.getScriptProperties().setProperty('SRC_EXTRA', String(ex));
  syncIndex_(rebuildIndex_);
  return res;
}
