/**
 * Db.js — スプレッドシート「補助金レーダーDB」の読み書き。
 * 日付が勝手に変換されないよう、全セルを「書式なしテキスト」にしてある。
 */

function setup() {
  var ss, id = props_().getProperty('DB_ID');
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create(DB_NAME);
    props_().setProperty('DB_ID', ss.getId());
  }
  Object.keys(TAB).forEach(function (k) {
    var name = TAB[k];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
      sh.getRange(1, 1, 1, HEADERS[name].length).setFontWeight('bold');
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1000, HEADERS[name].length).setNumberFormat('@');
    }
  });
  var first = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
  seedSettings_(ss);
  seedWatch_(ss);
  Logger.log('DB: ' + ss.getUrl());
  return ss.getUrl();
}

function openDb_() {
  var id = props_().getProperty('DB_ID');
  if (!id) throw new Error('DBがありません。先に setup() を実行してください');
  return SpreadsheetApp.openById(id);
}

function cellText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  return v == null ? '' : v;
}

function readTab_(ss, name) {
  var sh = ss.getSheetByName(name), head = HEADERS[name];
  var n = sh.getLastRow();
  if (n < 2) return [];
  var vals = sh.getRange(2, 1, n - 1, head.length).getValues();
  return vals.filter(function (r) { return r.some(function (c) { return c !== ''; }); }).map(function (r) {
    var o = {}; head.forEach(function (h, i) { o[h] = cellText_(r[i]); }); return o;
  });
}

function toRow_(name, o) { return HEADERS[name].map(function (h) { var v = o[h]; return v == null ? '' : v; }); }

function writeTab_(ss, name, objs) {
  var sh = ss.getSheetByName(name), head = HEADERS[name];
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, head.length).clearContent();
  if (!objs.length) return;
  sh.getRange(2, 1, objs.length, head.length).setNumberFormat('@');
  sh.getRange(2, 1, objs.length, head.length).setValues(objs.map(function (o) { return toRow_(name, o); }));
}

function appendTab_(ss, name, objs) {
  if (!objs.length) return;
  var sh = ss.getSheetByName(name), head = HEADERS[name];
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, objs.length, head.length).setNumberFormat('@');
  sh.getRange(start, 1, objs.length, head.length).setValues(objs.map(function (o) { return toRow_(name, o); }));
}

/* ---------- 設定 ---------- */

function seedSettings_(ss) {
  if (readTab_(ss, TAB.SETTINGS).length) return; // 既にあれば上書きしない(運用中の変更を守る)
  var rows = DEFAULT_SETTINGS.map(function (r) { return { '区分': r[0], '項目': r[1], '値': r[2], '点数': r[3], '範囲': r[4], 'メモ': r[5] }; });
  DEFAULT_RULES.forEach(function (r) { rows.push({ '区分': 'キーワード', '項目': r[1], '値': r[0], '点数': r[2], '範囲': r[3], 'メモ': '' }); });
  appendTab_(ss, TAB.SETTINGS, rows);
}

function seedWatch_(ss) {
  if (readTab_(ss, TAB.WATCH).length) return;
  appendTab_(ss, TAB.WATCH, WATCH_SEEDS.map(function (w) {
    return { '有効': w.enabled, '名前': w.name, 'URL': w.url, '種別': w.kind, '範囲の開始目印': w.start, '範囲の終了目印': w.end, '除外パターン': '', 'メモ': w.memo || '' };
  }));
}

function getSettings_(ss) {
  var rows = readTab_(ss, TAB.SETTINGS), s = { rules: [], thresholds: { high: 30, mid: 10 }, sources: {}, notify: {}, keep: 90 };
  rows.forEach(function (r) {
    if (r['区分'] === 'キーワード') s.rules.push({ category: r['値'], keyword: r['項目'], points: Number(r['点数']), scope: r['範囲'] });
    else if (r['区分'] === 'しきい値') s.thresholds[r['項目'] === '高' ? 'high' : 'mid'] = Number(r['値']);
    else if (r['区分'] === '情報源') s.sources[r['項目']] = String(r['値']).toUpperCase() === 'ON';
    else if (r['区分'] === '通知') s.notify[r['項目']] = r['値'];
    else if (r['区分'] === '保存' && r['項目'] === 'アーカイブまでの日数') s.keep = Number(r['値']) || 90;
  });
  return s;
}
