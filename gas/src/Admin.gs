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
  var st = readSettings_();
  return { id: p.id, tab: p.tab, fields: fieldsMeta_(), values: readTabValues_(p.tab), url: lpUrl_(st, p.id), prefectures: PREFECTURES };
}

/** changes: { キー: 値 }。検証に通った項目だけ書き込み、エラーは項目ごとに返す */
function api_save(pw, id, changes) {
  requireAuth_(pw);
  var p = findProspect_(String(id || '').trim());
  if (!p) throw new Error('商談先が見つかりません。');
  var sh = ss_().getSheetByName(p.tab), last = sh.getLastRow(), errors = {}, saved = 0;
  var keys = sh.getRange(FIELD_START_ROW_, 5, last - FIELD_START_ROW_ + 1, 1).getValues().map(function (r) { return String(r[0]); });
  Object.keys(changes || {}).forEach(function (k) {
    var v = changes[k] === null || changes[k] === undefined ? '' : String(changes[k]);
    var err = validateValue_(k, v);
    if (err) { errors[k] = err; return; }
    var row = keys.indexOf(k);
    if (row < 0) { errors[k] = 'シートに項目が見つかりません'; return; }
    sh.getRange(FIELD_START_ROW_ + row, 2).setValue(v.trim());
    saved++;
  });
  return { saved: saved, errors: errors };
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
