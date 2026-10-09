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
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k), putAll: kv => Object.keys(kv).forEach(k => cache.set(k, kv[k])) }) },
    Utilities: { formatDate: () => '2026-01-19', base64Decode: b => Array.from(Buffer.from(b, 'base64')), base64Encode: b => Buffer.from(b).toString('base64'),
    newBlob: (bytes, mime, name) => ({ bytes, mime, name, getBytes: () => bytes, getContentType: () => mime }) },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script.test/exec' }) },
  DriveApp: (() => { const files = new Map(); let n = 0;
    const mk = blob => { const id = 'file' + (++n); const f = { id, blob, trashed: false, getId: () => id, getBlob: () => ({ getContentType: () => blob.mime, getBytes: () => blob.bytes }), setTrashed(t) { f.trashed = t; } }; files.set(id, f); return f; };
    const folder = { getId: () => 'folder1', createFile: mk };
    return { createFolder: () => folder, getFolderById: () => folder, getFileById: id => { if (!files.has(id)) throw new Error('not found'); return files.get(id); }, __files: files }; })(),
    HtmlService: { XFrameOptionsMode: { ALLOWALL: 1 }, createHtmlOutput: html => { const o = { html, setTitle() { return o; }, addMetaTag() { return o; }, setXFrameOptionsMode() { return o; } }; return o; } },
    UrlFetchApp: { fetch: url => { const code = url.match(/N03-21_(\d\d)_/)[1]; const body = fs.readFileSync(input.geoDir + '/geo_' + code + '.json', 'utf8'); return { getResponseCode: () => 200, getContentText: () => body }; } }
  });

  for (const f of ['Bundle.gs', 'Assets.gs']) vm.runInContext(fs.readFileSync(path.join(dist, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
module.exports = { makeEnv };
