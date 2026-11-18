// Google のサービス(SpreadsheetApp など)の最小の代用品。通し試験用。
const crypto = require('crypto');
function makeSheet(name) {
  const s = { name, data: [], getLastRow() { let n = this.data.length; while (n > 0 && this.data[n - 1].every(c => c === '' || c == null)) n--; return n; },
    getRange(r, c, nr, nc) { const sh = this; return {
      getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(((sh.data[r - 1 + i] || [])[c - 1 + j]) ?? ''); o.push(row); } return o; },
      setValues(v) { v.forEach((row, i) => { sh.data[r - 1 + i] = sh.data[r - 1 + i] || []; row.forEach((x, j) => { sh.data[r - 1 + i][c - 1 + j] = x; }); }); return this; },
      clearContent() { for (let i = 0; i < nr; i++) if (sh.data[r - 1 + i]) for (let j = 0; j < nc; j++) sh.data[r - 1 + i][c - 1 + j] = ''; return this; },
      setNumberFormat() { return this; }, setFontWeight() { return this; } }; },
    setFrozenRows() {} };
  return s;
}
module.exports = function makeEnv(routes) {
  const props = {}, sheets = [], calls = [], bodies = [];
  const ss = { getId: () => 'SS1', getUrl: () => 'https://docs.example/ss1', getSheets: () => sheets,
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: n => { const s = makeSheet(n); sheets.push(s); return s; }, deleteSheet: s => sheets.splice(sheets.indexOf(s), 1) };
  const env = {
    console, calls, bodies, props, ss, TEST_TODAY: '2026-11-18',
    Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { create: () => ss, openById: () => ss },
    Utilities: {
      sleep() {}, DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (a, s) => Array.from(crypto.createHash('sha256').update(String(s), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      formatDate: (d, tz, f) => d.toISOString().slice(0, 10)
    },
    UrlFetchApp: { fetch(url, opts) {
      calls.push(url); if (opts && opts.payload && opts.payload.body) bodies.push(opts.payload.body);
      const r = routes(url, opts);
      return { getResponseCode: () => r.code, getContentText: () => r.body, getHeaders: () => r.headers || {}, getBlob: () => ({ getBytes: () => Array.from(Buffer.from(r.body)) }) };
    } },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {} }
  };
  return env;
};
