/** 入力システム(ウェブアプリ上の入力画面)のサーバー側。すべての api_* は、ログイン中のGoogleアカウントのメールアドレスを検証する */

function appPage_() {
  return HtmlService.createHtmlOutput(APP_HTML_).setTitle('エリア調査シート 入力システム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 利用者の確認: Googleアカウントのメールアドレスに「@bukkenking.com」が付いている人だけ使える。
 * 「アクセスできるユーザー: 組織内」で公開した入力システム用デプロイでのみメールアドレスが取得できる
 * (誰でも見られるLP用デプロイでは取得できないため、そちらからは入力システムを操作できない)
 */
function currentEmail_() {
  try { return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) { return ''; }
}
function requireUser_() {
  var e = currentEmail_();
  if (!e) throw new Error('ログイン中のメールアドレスを確認できません。入力システム用のURL(組織内限定でデプロイしたもの)から開いてください。');
  if (e.slice(-('@' + ALLOWED_DOMAIN_).length) !== '@' + ALLOWED_DOMAIN_) throw new Error('このアカウント(' + e + ')では使えません。@' + ALLOWED_DOMAIN_ + ' のアカウントでログインしてください。');
  return e;
}

/** LPのURL。「設定」でLPの公開URLを入れていれば、それを使う。未設定のときは、いま開いているウェブアプリ自身のURLで仮に作る(社内でしか開けない場合がある) */
function lpBase_(settings) { return settings.url || settings.urlAuto || ''; }
function lpUrl_(settings, id) { var b = lpBase_(settings); return b ? b + '?id=' + id : ''; }
function todayStr_() { return todayIso_(); }

function api_whoami() { return { email: requireUser_(), url: readSettings_().url }; }

function statusText_(a) { return a.missing === null ? '入力中' : a.missing === 0 ? '入力完了' : '未入力 ' + a.missing + '件'; }

/** 会社ごとのエリア一覧 */
function api_list() {
  requireUser_();
  var st = readSettings_(), areas = listAreas_();
  var companies = listCompanies_().map(function (c) {
    return { id: c.id, name: c.name, areas: areas.filter(function (a) { return a.companyId === c.id; }).map(function (a) {
      return { id: a.id, pref: a.pref, city: a.city, status: statusText_(a), done: a.missing === 0, url: lpUrl_(st, a.id) };
    }) };
  });
  companies.reverse();
  return { companies: companies, hasUrl: !!lpBase_(st), provisional: !st.url };
}

function api_create_company(name, pref, city) {
  requireUser_();
  normalizePrefecture_(pref);
  if (!String(city || '').trim()) throw new Error('市区町村を入力してください。');
  var cid = createCompany_(name);
  return { companyId: cid, areaId: createArea_(cid, pref, city) };
}
function api_add_area(companyId, pref, city) { requireUser_(); return { areaId: createArea_(companyId, pref, city) }; }
function api_rename_company(id, name) { requireUser_(); renameCompany_(id, name); return { ok: true }; }
function api_delete_area(areaId) { requireUser_(); deleteArea_(areaId); return { ok: true }; }
function api_delete_company(id) { requireUser_(); deleteCompany_(id); return { ok: true }; }
function api_duplicate_company(companyId, newName) { requireUser_(); return duplicateCompany_(companyId, newName); }
function api_rotate(areaId) { requireUser_(); return { id: rotateAreaId_(areaId) }; }

function api_get(areaId) {
  requireUser_();
  var a = areaById_(areaId);
  if (!a) throw new Error('エリアが見つかりません。');
  var c = companyById_(a.companyId), st = readSettings_(), images = {};
  FIELDS_.forEach(function (f) { if (f.t === 'image') images[f.k] = /^drive:/.test(a.values[f.k] || ''); });
  var siblings = listAreas_().filter(function (x) { return x.companyId === a.companyId; }).map(function (x) { return { id: x.id, label: x.pref + ' ' + x.city }; });
  return { id: a.id, company: c ? { id: c.id, name: c.name } : { id: '', name: '' }, fields: fieldsMeta_(), values: a.values, images: images,
    tables: TABLE_KEYS_.reduce(function (o, k) { o[k] = savedTable_(a.values, k); return o; }, {}), aiReady: !!aiKey_(),
    autoHouseholds: a.values['auto.households'] ? Number(a.values['auto.households']) : null, hasEstat: !!st.estat,
    url: lpUrl_(st, a.id), provisional: !st.url, prefectures: PREFECTURES, siblings: siblings };
}

/** changes: { キー: 値 }。検証に通った項目だけ書き込み、エラーは項目ごとに返す。区分ごとの取得日(入力日)を自動で更新 */
function api_save(areaId, changes) {
  requireUser_();
  var errors = {}, saved = 0;
  writeAreaValues_(areaId, function (values) {
    var touched = {};
    Object.keys(changes || {}).forEach(function (k) {
      var v = changes[k] === null || changes[k] === undefined ? '' : String(changes[k]);
      var isImg = isImageKey_(k);
      var err = isImg ? (v.trim() === '' ? '' : '画像はアップロードで登録してください') : validateValue_(k, v);
      if (err) { errors[k] = err; return; }
      if (isImg && values[k]) { trashImage_(values[k]); delete values[tableValueKey_(k)]; }
      if (v.trim() === '') delete values[k]; else values[k] = v.trim();
      var dk = dateKeyFor_(k); if (dk) touched[dk] = 1;
      saved++;
    });
    Object.keys(touched).forEach(function (dk) { values[dk] = todayStr_(); });
  });
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
function api_uploadImage(areaId, key, dataUrl) {
  requireUser_();
  if (!isImageKey_(key)) throw new Error('画像を登録できない項目です。');
  var m = String(dataUrl || '').match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+\/=]+)$/);
  if (!m) throw new Error('JPEGまたはPNGの画像を選んでください。');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('画像が大きすぎます(5MBまで)。');
  var file = imageFolder_().createFile(Utilities.newBlob(bytes, 'image/' + m[1], areaId + '_' + key.replace(/[^A-Za-z0-9_]/g, '_') + (m[1] === 'png' ? '.png' : '.jpg')));
  writeAreaValues_(areaId, function (values) {
    if (values[key]) trashImage_(values[key]);
    delete values[tableValueKey_(key)];
    values[key] = 'drive:' + file.getId();
    var dk = dateKeyFor_(key); if (dk) values[dk] = todayStr_();
  });
  return { ok: true };
}

/** 未入力の項目と整合性チェック(LPを組み立てて判定)。未入力件数は一覧用に保存する */
function api_status(areaId) {
  requireUser_();
  try {
    var r = buildArea_(areaId), miss = r.report.missing();
    setAreaMissing_(areaId, miss.length);
    return {
      missing: miss.map(function (i) { return { key: i.key, label: i.label, reason: i.reason }; }),
      checksNg: r.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name + (c.detail ? '(' + c.detail + ')' : ''); }),
      city: r.model.meta.city, households: r.model.area.households, householdsAuto: r.model.area.households_source && /e-Stat/.test(r.model.area.households_source),
      pins: (r.model.area.pins || []).map(function (p) { return { kind: p.kind, n: p.n, name: p.name, address: p.address, lat: p.lat, lng: p.lng, source: p.source, precise: p.precise, on_map: p.on_map, why: p.why }; }),
      totals: { listings_total: r.model.totals.listings_total, brokerage: r.model.totals.brokerage_unit_display_man }
    };
  } catch (e) {
    return { error: String(e.message || e), missing: [], checksNg: [], totals: {} };
  }
}

// ---------- 加盟店の管理(保存先は 加盟店一覧 シート) ----------
function frSheet_() { return sheetOrThrow_(SHEET_FR_); }
function isActive_(v) { return !/^(×|停止|0|無効)$/.test(String(v).trim()); }

function api_fr_list() {
  requireUser_();
  var sh = frSheet_(), out = [];
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 9).getDisplayValues().forEach(function (r, i) {
    if (String(r[0]).trim()) out.push({ i: i, name: r[0], prefecture: r[1], city: r[2], url: r[4], active: isActive_(r[5]), shop: r[6], area: r[7] });
  });
  return { items: out, prefectures: PREFECTURES };
}

function api_fr_save(idx, rec) {
  requireUser_();
  rec = rec || {};
  var name = String(rec.name || '').trim(), city = String(rec.city || '').trim(), url = String(rec.url || '').trim();
  if (!name || !city) throw new Error('名称と市区町村を入力してください。');
  var pref = normalizePrefecture_(rec.prefecture);
  if (url && !/^https?:\/\//.test(url)) throw new Error('URLは https:// から始めてください。');
  var sh = frSheet_(), isNew = !(Number(idx) >= 0), row = isNew ? Math.max(sh.getLastRow(), 1) + 1 : Number(idx) + 2;
  var address = pref + ' ' + city;
  if (!isNew) { var old = sh.getRange(row, 1, 1, 4).getDisplayValues()[0]; if (old[1] === pref && old[2] === city && old[3]) address = old[3]; }   // 住所は、都道府県・市区町村を変えない限り元のまま
  sh.getRange(row, 1, 1, 6).setValues([[name, pref, city, address, url, rec.active === false ? '×' : '']]);
  return { ok: true };
}

function api_fr_delete(idx) {
  requireUser_();
  var sh = frSheet_(), row = Number(idx) + 2;
  if (!(Number(idx) >= 0) || row > sh.getLastRow()) throw new Error('対象が見つかりません。');
  sh.deleteRow(row);
  return { ok: true };
}

/** 加盟店CSV(会社名,住所 / 顧客番号,会社名,住所)の取り込み。名称+住所が同じものは更新、無ければ追加 */
function api_fr_import(text) {
  requireUser_();
  if (!text || String(text).length > 2000000) throw new Error('CSVが空、または大きすぎます。');
  var p = parseFranchiseAny_(text);
  var res = importFranchiseRows_(frSheet_(), p.rows);
  return { added: res.added, updated: res.updated, unresolved: res.unresolved, total: p.rows.length };
}

// ---------- 設定(保存先は 設定 シート) ----------
function api_settings_get() {
  requireUser_();
  var s = readSettings_();
  return { aiKeySet: !!aiKey_(), estat: s.estat, max: s.max, threshold: s.threshold, url: s.url, email: currentEmail_() };
}

function api_settings_set(v) {
  requireUser_();
  v = v || {};
  var max = parseNum_(v.max), th = parseNum_(v.threshold), url = String(v.url || '').trim();
  if (!(max >= 1 && max <= 10)) throw new Error('周辺加盟店の最大社数は1〜10で入力してください。');
  if (th === undefined || th < 0) throw new Error('「同程度」の範囲は0以上の数で入力してください。');
  if (url && !/^https:\/\/script\.google\.com\/(macros\/s\/[A-Za-z0-9_-]+\/exec|a\/macros\/[^\/]+\/s\/[A-Za-z0-9_-]+\/exec)$/.test(url.replace(/\/+$/, '')))
    throw new Error('LPの公開URLは https://script.google.com/macros/s/…/exec の形で入力してください。');
  var sh = sheetOrThrow_(SHEET_SETTINGS_);
  sh.getRange('B1').setValue(url.replace(/\/+$/, '')); sh.getRange('B2').setValue(String(v.estat || '').trim());
  syncIndex_(rebuildIndex_);   // 商談先一覧のURLも新しい公開URLに更新
  sh.getRange('B3').setValue(String(max)); sh.getRange('B4').setValue(String(th));
  return { ok: true };
}

/** e-Statの接続テスト(設定画面のボタン用)。長野県上田市の世帯数を取得してみて、結果または失敗の理由を返す */
function api_estat_test(appId) {
  requireUser_();
  var id = String(appId || readSettings_().estat || '').trim();
  if (!id) throw new Error('アプリケーションIDを入力してください。');
  try {
    var r = estatHouseholds_(id, '20203');
    return { ok: true, message: '接続できました。上田市の世帯数: ' + num_(r.value) + '(表: ' + r.table + ' / 項目: ' + r.label + ')' };
  } catch (e) { return { ok: false, message: String(e.message || e) }; }
}

/** 市区町村の入力候補(都道府県を選んだとき)。政令指定都市は「横浜市」と「横浜市中区」の両方。名前の一覧だけをキャッシュする */
function api_cities(pref) {
  requireUser_();
  var p = normalizePrefecture_(pref), key = 'cities:' + p, hit = cacheGet_(key);
  if (hit) return JSON.parse(hit);
  var P = buildPrefecture_(p, fetchJson_(GEO_URL_.replace('{code}', ('0' + prefCode_(p)).slice(-2))));
  cachePut_(key, JSON.stringify(P.names));
  return P.names;
}

/** 入力画面: このエリアに表示する加盟店の候補(県内の全加盟店)とチェック状態 */
function api_franchise_pick(areaId) {
  requireUser_();
  var a = areaById_(areaId);
  if (!a) throw new Error('エリアが見つかりません。');
  return { items: franchiseCandidates_(a) };
}

/** チェックを外した加盟店(キー: 名称@市)を保存。新しく加盟店が増えたときは、既定で表示される */
function api_set_franchise_off(areaId, offKeys) {
  requireUser_();
  var off = (Array.isArray(offKeys) ? offKeys : []).map(String).filter(function (k) { return k.length < 200; }).slice(0, 500);
  writeAreaValues_(areaId, function (values) { if (off.length) values['fr.off'] = JSON.stringify(off); else delete values['fr.off']; });
  return { ok: true, off: off.length };
}
