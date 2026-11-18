/** Util.js — Apps Script 側の小さな道具(ハッシュ、日付、待ち時間) */

function sha256Hex_(s) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function hash8(s) { return sha256Hex_(s).slice(0, 8); }

/** 今日(日本時間)。テストでは TEST_TODAY で固定できる */
function today_() {
  if (typeof TEST_TODAY !== 'undefined' && TEST_TODAY) return TEST_TODAY;
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}
function nowText_() {
  if (typeof TEST_TODAY !== 'undefined' && TEST_TODAY) return TEST_TODAY + ' 00:00:00';
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}
function props_() { return PropertiesService.getScriptProperties(); }

/** エラー文は短くし、URL・トークンらしき長い文字列は伏せる(ログに認証情報を残さない) */
function safeError_(e) {
  var m = String((e && e.message) || e || '失敗');
  return m.replace(/[A-Za-z0-9_\-]{24,}/g, '***').slice(0, 80);
}
