// Googleのサービス(SpreadsheetApp など)を模擬した実行環境。テスト専用。
const fs = require('fs'), vm = require('vm'), path = require('path');
const dist = path.join(__dirname, '..', 'dist');
function makeEnv(geoDir) {
  const input = { geoDir };
  function colNum(s) { let n = 0; for (const c of s) n = n * 26 + c.charCodeAt(0) - 64; return n; }
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    _each(f) { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(f(this.r + i, this.c + j)); out.push(row); } return out; }
    getValues() { return this._each((r, c) => this.sh.get(r, c)); }
    getDisplayValues() { return this._each((r, c) => { const v = this.sh.get(r, c); return typeof v === 'string' && v.startsWith('=') ? '' : String(v); }); }
    getValue() { return this.sh.get(this.r, this.c); }
    getDisplayValue() { return String(this.getValue()); }
    setValue(v) { this.sh.set(this.r, this.c, v); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.cells.delete((this.r + i) + ',' + (this.c + j)); return this; }
    setValues(vs) { vs.forEach((row, i) => row.forEach((v, j) => this.sh.set(this.r + i, this.c + j, v))); return this; }
  }
  ['setNumberFormat', 'setFontWeight', 'setBackground', 'setFontColor', 'setNote'].forEach(m => { Range.prototype[m] = function () { return this; }; });
  class Sheet {
    constructor(name) { this.name = name; this.cells = new Map(); }
    get(r, c) { const v = this.cells.get(r + ',' + c); return v === undefined ? '' : v; }
    set(r, c, v) { this.cells.set(r + ',' + c, v); }
    getName() { return this.name; }
    getLastRow() { let m = 0; for (const [k, v] of this.cells) if (v !== '') m = Math.max(m, Number(k.split(',')[0])); return m; }
    getRange(a, b, c, d) {
      if (typeof a === 'string') {
        const m = a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/); const c1 = colNum(m[1]), r1 = +m[2], c2 = m[3] ? colNum(m[3]) : c1, r2 = m[4] ? +m[4] : r1;
        return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
      }
      return new Range(this, a, b, c || 1, d || 1);
    }
    setFrozenRows() {} setColumnWidth() {} hideColumns() {} clear() { this.cells.clear(); }
  deleteRow(r) { const n = new Map(); for (const [k, v] of this.cells) { const [rr, cc] = k.split(',').map(Number); if (rr < r) n.set(k, v); else if (rr > r) n.set((rr - 1) + ',' + cc, v); } this.cells = n; }
  }
  const sheets = [];
  const ss = {
    getId: () => 'SS1', getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: n => { const s = new Sheet(n); sheets.push(s); return s; }, setActiveSheet() {}, getActiveSheet: () => sheets[sheets.length - 1]
  };
  const props = {}, cache = new Map();
  const ctx = vm.createContext({
    console, Math, JSON, Date, Object, Array, String, Number, isNaN, parseInt, parseFloat, RegExp, Error,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, getUi: () => { throw new Error('no ui'); } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k), putAll: kv => Object.keys(kv).forEach(k => cache.set(k, kv[k])) }) },
    Utilities: { formatDate: () => '2026-01-19', base64Decode: b => Array.from(Buffer.from(b, 'base64')), base64Encode: b => Buffer.from(b).toString('base64'),
    newBlob: (bytes, mime, name) => ({ bytes, mime, name, getBytes: () => bytes, getContentType: () => mime }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Session: { getActiveUser: () => ({ getEmail: () => (global.__email === undefined ? 'ishikawa@bukkenking.com' : global.__email) }) },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script.test/exec' }) },
  DriveApp: (() => { const files = new Map(); let n = 0;
    const mk = blob => { const id = 'file' + (++n); const f = { id, blob, trashed: false, getId: () => id, getBlob: () => ({ getContentType: () => blob.mime, getBytes: () => blob.bytes }), setTrashed(t) { f.trashed = t; }, makeCopy(name) { return mk({ mime: blob.mime, bytes: blob.bytes, name }); } }; files.set(id, f); return f; };
    const folder = { getId: () => 'folder1', createFile: mk };
    return { createFolder: () => folder, getFolderById: () => folder, getFileById: id => { if (!files.has(id)) throw new Error('not found'); return files.get(id); }, __files: files }; })(),
    HtmlService: { XFrameOptionsMode: { ALLOWALL: 1 }, createHtmlOutput: html => { const o = { html, setTitle() { return o; }, addMetaTag() { return o; }, setXFrameOptionsMode() { return o; } }; return o; } },
    UrlFetchApp: { fetch: function (url) {
    if (url.indexOf('api.anthropic.com') >= 0) {   // Claude APIの模擬(応答の形は公開仕様どおり)
      const o = arguments[1] || {}; global.__aiCalls = (global.__aiCalls || []).concat([{ url, key: (o.headers || {})['x-api-key'], body: JSON.parse(o.payload) }]);
      const reply = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
      if ((o.headers || {})['x-api-key'] !== 'sk-ant-testtesttesttesttesttest') return reply(401, { error: { message: 'invalid x-api-key' } });
      if (global.__aiMode === 'refusal') return reply(200, { stop_reason: 'refusal', content: [] });
      if (global.__aiMode === 'junk') return reply(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: '読み取れません' }] });
      const t = { caption: '土地面積×価格', cols: ['〜1000', '1000〜2000', '2000〜'], rows: ['〜100㎡', '100〜150㎡'], cells: [[3, 12, null], [5, '8', 1]], warnings: ['左下の数字がやや不鮮明'] };
      return reply(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: '```json\n' + JSON.stringify(t) + '\n```' }] });
    }
    if (url.indexOf('api.e-stat.go.jp') >= 0) {   // e-Stat APIの模擬(応答の形は公開仕様に基づく想定。実機での検証は未実施)
      global.__estatCalls = (global.__estatCalls || 0) + 1;
      const q = Object.fromEntries(new URL(url).searchParams), path = new URL(url).pathname.split('/').pop();
      const ok = body => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(body) });
      if (q.appId === 'BADID') return ok({ [path.replace('get', 'GET_').replace('StatsList', 'STATS_LIST').replace('StatsData', 'STATS_DATA')]: { RESULT: { STATUS: 100, ERROR_MSG: 'アプリケーションIDが無効です' } } });
      if (global.__estatMode === 'empty') return ok({ GET_STATS_LIST: { RESULT: { STATUS: 0 }, DATALIST_INF: { TABLE_INF: [{ '@id': '0009', TITLE: '男女別 年齢 市区町村' }] } }, GET_STATS_DATA: { RESULT: { STATUS: 0 }, STATISTICAL_DATA: { CLASS_INF: { CLASS_OBJ: [] }, DATA_INF: { VALUE: [] } } } });
      if (path === 'getStatsList') return ok({ GET_STATS_LIST: { RESULT: { STATUS: 0 }, DATALIST_INF: { TABLE_INF: [
        { '@id': '0001', TITLE: { '@no': '1', $: '男女別 年齢 市区町村' } }, { '@id': '0003445078', TITLE: { '@no': '2', $: '人口等基本集計 男女別人口,外国人人口及び世帯の種類別世帯数 市区町村' } }] } } });
      return ok({ GET_STATS_DATA: { RESULT: { STATUS: 0 }, STATISTICAL_DATA: {
        CLASS_INF: { CLASS_OBJ: [{ '@id': 'cat01', '@name': '項目', CLASS: [{ '@code': '001', '@name': '総人口' }, { '@code': '002', '@name': '世帯数' }, { '@code': '003', '@name': '1世帯当たり人員' }] }, { '@id': 'area', '@name': '地域', CLASS: { '@code': q.cdArea, '@name': '上田市' } }] },
        DATA_INF: { VALUE: [{ '@cat01': '001', '@area': q.cdArea, '$': '153,000' }, { '@cat01': '002', '@area': q.cdArea, '$': '70,809' }, { '@cat01': '003', '@area': q.cdArea, '$': '2' }] } } } });
    } const code = url.match(/N03-21_(\d\d)_/)[1]; const body = fs.readFileSync(input.geoDir + '/geo_' + code + '.json', 'utf8'); return { getResponseCode: () => 200, getContentText: () => body }; } }
  });

  ctx.__sheetNames = () => sheets.map(x => x.name);
  ctx.__aiMode = m => { global.__aiMode = m; }; ctx.__aiCalls = () => global.__aiCalls || [];
  ctx.__estatMode = m => { global.__estatMode = m; }; ctx.__estatCalls = () => global.__estatCalls || 0;
  ctx.__setEmail = e => { global.__email = e; };
  for (const f of ['Bundle.gs', 'Assets.gs']) vm.runInContext(fs.readFileSync(path.join(dist, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
module.exports = { makeEnv };
