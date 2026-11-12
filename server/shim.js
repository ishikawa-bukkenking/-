// Google Apps Script のサービス(SpreadsheetApp など)を、Node.js上で動かすための代替実装。
// gas/dist/Bundle.gs をそのまま vm で実行し、保存先はスナップショット(Postgres またはファイル)にする。
const vm = require('vm');
const { spawnSync } = require('child_process');

function colNum(s) { let n = 0; for (const c of s) n = n * 26 + c.charCodeAt(0) - 64; return n; }

/** 同期HTTP(GASのUrlFetchApp.fetchは同期なので、別プロセスのNodeで実行して結果を待つ) */
const FETCH_SCRIPT = `
let s = ''; process.stdin.on('data', d => s += d).on('end', async () => {
  const a = JSON.parse(s);
  try {
    const o = { method: a.method || 'GET', headers: a.headers || {}, redirect: a.followRedirects === false ? 'manual' : 'follow', signal: AbortSignal.timeout(60000) };
    if (a.payload != null) o.body = a.payload;
    const r = await fetch(a.url, o), buf = Buffer.from(await r.arrayBuffer());
    process.stdout.write(JSON.stringify({ code: r.status, type: r.headers.get('content-type') || '', body: buf.toString('base64') }));
  } catch (e) { process.stdout.write(JSON.stringify({ error: String(e && e.message || e) })); }
});`;
function syncFetch(url, opts) {
  opts = opts || {};
  const input = JSON.stringify({ url, method: (opts.method || 'GET').toUpperCase(), headers: opts.headers || {}, payload: opts.payload, followRedirects: opts.followRedirects });
  const r = spawnSync(process.execPath, ['-e', FETCH_SCRIPT], { input, maxBuffer: 256 * 1024 * 1024, timeout: 90000 });
  if (r.error) throw new Error('通信に失敗しました: ' + r.error.message);
  let j; try { j = JSON.parse(r.stdout.toString('utf8')); } catch (e) { throw new Error('通信に失敗しました'); }
  if (j.error) throw new Error('通信に失敗しました: ' + j.error);
  const body = Buffer.from(j.body, 'base64');
  const resp = { getResponseCode: () => j.code, getContentText: () => body.toString('utf8'), getBlob: () => ({ getBytes: () => Array.from(body), getContentType: () => j.type }) };
  if (j.code >= 400 && opts.muteHttpExceptions !== true) throw new Error('Request failed for ' + url + ' returned code ' + j.code);
  return resp;
}

/** Asia/Tokyo の日時を、GASの Utilities.formatDate と同じ書式指定(yyyy MM dd HH mm ss)で整形 */
function formatDate(date, tz, fmt) {
  const p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Tokyo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(date).forEach(x => { p[x.type] = x.value; });
  return fmt.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, lit) => lit !== undefined ? lit : m === 'yyyy' ? p.year : m === 'MM' ? p.month : m === 'dd' ? p.day : m === 'HH' ? p.hour : m === 'mm' ? p.minute : p.second);
}

/**
 * 保存データ(スプレッドシート相当・プロパティ・画像)を持つ環境を作る。
 * state: { sheets: { 名前: { cells: [[key, value], ...] } }, order: [名前], props: {}, files: { id: {mime, name, trashed, data(base64)} }, folder }
 * onDirty(kind): 保存が必要になったとき呼ぶ
 */
function makeRuntime(bundleSrc, state, opts) {
  opts = opts || {};
  const dirty = new Set(); const mark = k => { dirty.add(k); };
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    _each(f) { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(f(this.r + i, this.c + j)); out.push(row); } return out; }
    getValues() { return this._each((r, c) => this.sh.get(r, c)); }
    getDisplayValues() { return this._each((r, c) => { const v = this.sh.get(r, c); return typeof v === 'string' && v.startsWith('=') ? '' : String(v); }); }
    getValue() { return this.sh.get(this.r, this.c); }
    getDisplayValue() { return String(this.getValue()); }
    setValue(v) { this.sh.set(this.r, this.c, v); return this; }
    clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.del(this.r + i, this.c + j); return this; }
    setValues(vs) { vs.forEach((row, i) => row.forEach((v, j) => this.sh.set(this.r + i, this.c + j, v))); return this; }
  }
  ['setNumberFormat', 'setFontWeight', 'setBackground', 'setFontColor', 'setNote'].forEach(m => { Range.prototype[m] = function () { return this; }; });
  class Sheet {
    constructor(name, cells) { this.name = name; this.cells = new Map(cells || []); }
    get(r, c) { const v = this.cells.get(r + ',' + c); return v === undefined ? '' : v; }
    set(r, c, v) { this.cells.set(r + ',' + c, v); mark('sheets'); }
    del(r, c) { this.cells.delete(r + ',' + c); mark('sheets'); }
    getName() { return this.name; }
    getLastRow() { let m = 0; for (const [k, v] of this.cells) if (v !== '') m = Math.max(m, Number(k.split(',')[0])); return m; }
    getRange(a, b, c, d) {
      if (typeof a === 'string') {
        const m = a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/); const c1 = colNum(m[1]), r1 = +m[2], c2 = m[3] ? colNum(m[3]) : c1, r2 = m[4] ? +m[4] : r1;
        return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
      }
      return new Range(this, a, b, c || 1, d || 1);
    }
    setFrozenRows() {} setColumnWidth() {} hideColumns() {}
    clear() { this.cells.clear(); mark('sheets'); }
    deleteRow(r) { const n = new Map(); for (const [k, v] of this.cells) { const [rr, cc] = k.split(',').map(Number); if (rr < r) n.set(k, v); else if (rr > r) n.set((rr - 1) + ',' + cc, v); } this.cells = n; mark('sheets'); }
  }
  const sheets = (state.order || []).map(n => new Sheet(n, ((state.sheets || {})[n] || {}).cells));
  const ss = {
    getId: () => 'SS1', getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: n => { const s = new Sheet(n); sheets.push(s); mark('sheets'); return s; }, setActiveSheet() {}, getActiveSheet: () => sheets[sheets.length - 1]
  };
  state.props = state.props || {}; state.files = state.files || {};
  const cache = new Map();
  let nFile = Object.keys(state.files).length;
  const fileObj = id => {
    const rec = state.files[id]; if (!rec) throw new Error('not found');
    const f = { getId: () => id,
      getBlob: () => { const bytes = Array.from(Buffer.from(rec.data, 'base64')); return { getBytes: () => bytes, getContentType: () => rec.mime }; },
      setTrashed(t) { rec.trashed = !!t; mark('file:' + id); },
      makeCopy(name) { const nid = 'f' + (++nFile) + Math.random().toString(36).slice(2, 8); state.files[nid] = { mime: rec.mime, name, trashed: false, data: rec.data }; mark('file:' + nid); return fileObj(nid); } };
    return f;
  };
  const folder = { getId: () => 'folder1', createFile: blob => { const id = 'f' + (++nFile) + Math.random().toString(36).slice(2, 8); state.files[id] = { mime: blob.mime, name: blob.name, trashed: false, data: Buffer.from(blob.bytes).toString('base64') }; mark('file:' + id); return fileObj(id); } };
  const gm = opts.mapsKey || '';
  const ctx = vm.createContext({
    console, Math, JSON, Date, Object, Array, String, Number, isNaN, parseInt, parseFloat, RegExp, Error, encodeURIComponent, decodeURIComponent,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, getUi: () => { throw new Error('no ui'); } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (state.props[k] === undefined ? null : state.props[k]), setProperty: (k, v) => { state.props[k] = v; mark('props'); }, deleteProperty: k => { delete state.props[k]; mark('props'); } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k), putAll: kv => Object.keys(kv).forEach(k => cache.set(k, kv[k])) }) },
    Utilities: { formatDate, base64Decode: b => Array.from(Buffer.from(b, 'base64')), base64Encode: b => Buffer.from(b).toString('base64'),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name, getBytes: () => bytes, getContentType: () => mime }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => ctx.__email || '' }) },
    ScriptApp: { getService: () => ({ getUrl: () => opts.baseUrl || '' }) },
    DriveApp: { createFolder: () => folder, getFolderById: () => folder, getFileById: id => fileObj(id) },
    HtmlService: { XFrameOptionsMode: { ALLOWALL: 1 }, createHtmlOutput: html => { const o = { html, setTitle() { return o; }, addMetaTag() { return o; }, setXFrameOptionsMode() { return o; } }; return o; } },
    Maps: { newGeocoder: () => ({ setLanguage() { return this; }, setRegion() { return this; }, geocode: addr => {   // Googleの Geocoding API(キーが無いときは結果なし → 国土地理院で補う)
      if (!gm) return { status: 'ZERO_RESULTS', results: [] };
      const r = syncFetch('https://maps.googleapis.com/maps/api/geocode/json?language=ja&region=jp&address=' + encodeURIComponent(addr) + '&key=' + encodeURIComponent(gm), { muteHttpExceptions: true });
      try { return JSON.parse(r.getContentText()); } catch (e) { return { status: 'UNKNOWN_ERROR', results: [] }; }
    } }) },
    UrlFetchApp: { fetch: syncFetch }
  });
  ctx.__email = '';
  vm.runInContext(bundleSrc, ctx, { filename: 'Bundle.gs' });
  ctx.__ss = ss;
  /** 変更されたデータを取り出す(保存用)。{ sheets?, props?, files: {id: rec} } */
  function takeDirty() {
    const out = { files: {} };
    for (const k of dirty) {
      if (k === 'sheets') { out.sheets = { order: sheets.map(s => s.name), sheets: Object.fromEntries(sheets.map(s => [s.name, { cells: [...s.cells] }])) }; }
      else if (k === 'props') out.props = state.props;
      else if (k.startsWith('file:')) out.files[k.slice(5)] = state.files[k.slice(5)];
    }
    dirty.clear();
    return out;
  }
  return { ctx, takeDirty, isDirty: () => dirty.size > 0, sheetNames: () => sheets.map(s => s.name) };
}
module.exports = { makeRuntime, syncFetch, formatDate };
