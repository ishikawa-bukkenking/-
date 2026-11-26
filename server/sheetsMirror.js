// 「商談先一覧」を、元のスプレッドシート(エリア調査シート)にも書き写す。
// セールスベース(Sales base)が、このスプレッドシートの「商談先一覧」を読んで、エリア調査の一覧を作っているため。
// 保存先(Postgres)が本体で、これは写し。失敗しても、入力・保存は止めない(ログに出すだけ)。
//   環境変数: GOOGLE_SERVICE_ACCOUNT_JSON(または GOOGLE_SERVICE_ACCOUNT_B64) … サービスアカウントの鍵。そのメールアドレスを、シートの「編集者」にしておく
//            AREA_MIRROR_SHEET_ID … 写し先のスプレッドシートID(省略すると、下の既定値)
// やること: IDの列(I列)で照らして、シートにない行は最後に足し、内容が違う行は書き換える。シートにあって、こちらにない行は、消さない。
const crypto = require('crypto');

const DEFAULT_SHEET_ID = '17U8V6Ft4B-lS6Wbkfs-UCB0ndHJbA1_Dq3ed3m8rTfs';
const TAB = '商談先一覧', COLS = 9;
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

function credentials(env) {
  let raw = env.GOOGLE_SERVICE_ACCOUNT_JSON || (env.GOOGLE_SERVICE_ACCOUNT_B64 ? Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8') : '');
  if (!raw) return null;
  const c = JSON.parse(raw); c.private_key = String(c.private_key || '').replace(/\\n/g, '\n'); return c;
}
const norm = v => (v === null || v === undefined ? '' : String(v)).trim();
const colName = n => String.fromCharCode(64 + n);

class Mirror {
  constructor(opts) {
    opts = opts || {}; const env = opts.env || process.env;
    this.cred = opts.credentials !== undefined ? opts.credentials : credentials(env);
    this.sheetId = opts.sheetId || env.AREA_MIRROR_SHEET_ID || DEFAULT_SHEET_ID;
    this.fetch = opts.fetch || fetch; this.log = opts.log || console;
    this.token = null; this.tokenAt = 0;
  }
  enabled() { return !!this.cred; }
  async accessToken() {
    if (this.token && Date.now() - this.tokenAt < 3000 * 1000) return this.token;
    const now = Math.floor(Date.now() / 1000), b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = b({ alg: 'RS256', typ: 'JWT' }) + '.' + b({ iss: this.cred.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
    const sig = crypto.createSign('RSA-SHA256').update(head).sign(this.cred.private_key).toString('base64url');
    const r = await this.fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + sig });
    const j = await r.json(); if (!r.ok || !j.access_token) throw new Error('Googleのログインに失敗: ' + (j.error_description || j.error || r.status));
    this.token = j.access_token; this.tokenAt = Date.now(); return this.token;
  }
  async call(method, url, body) {
    const r = await this.fetch(url, { method, headers: { Authorization: 'Bearer ' + await this.accessToken(), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { /* 本文なし */ }
    if (!r.ok) throw new Error('Sheets API ' + r.status + ': ' + String((j.error && j.error.message) || t).slice(0, 200) + (r.status === 403 ? '(サービスアカウントを、シートの編集者にしてください)' : ''));
    return j;
  }
  /** rows: [[会社名, 都道府県, 市区町村, URL, 状態, 作成日, 更新日時, 作成者, エリアID], …] → { added, updated } */
  async sync(rows) {
    const want = (rows || []).map(r => { const x = []; for (let i = 0; i < COLS; i++) x.push(norm(r[i])); return x; }).filter(r => r[COLS - 1]);
    if (!want.length) return { added: 0, updated: 0 };
    const range = encodeURIComponent("'" + TAB + "'!A2:" + colName(COLS)), cur = await this.call('GET', API + '/' + this.sheetId + '/values/' + range + '?valueRenderOption=FORMATTED_VALUE');
    const have = {}; (cur.values || []).forEach((r, i) => { const id = norm(r[COLS - 1]); if (id) have[id] = { row: i + 2, vals: Array.from({ length: COLS }, (_, k) => norm(r[k])) }; });
    const upd = [], add = [];
    want.forEach(w => {
      const h = have[w[COLS - 1]];
      if (!h) add.push(w);
      else if (w.some((v, k) => v !== h.vals[k] && !(k === 5 || k === 6) )) upd.push({ range: "'" + TAB + "'!A" + h.row + ':' + colName(COLS) + h.row, values: [w] });   // 日付・日時の表記の違い(シートの書式)だけでは、書き換えない
    });
    if (upd.length) await this.call('POST', API + '/' + this.sheetId + '/values:batchUpdate', { valueInputOption: 'USER_ENTERED', data: upd });
    if (add.length) await this.call('POST', API + '/' + this.sheetId + '/values/' + encodeURIComponent("'" + TAB + "'!A:" + colName(COLS)) + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', { values: add });
    return { added: add.length, updated: upd.length };
  }
}

/** 保存のたびに呼ぶ。続けて呼ばれたら、まとめて1回だけ書く(直列) */
function makeScheduler(mirror, readRows) {
  let timer = null, running = false, again = false;
  async function run() {
    if (running) { again = true; return; }
    running = true;
    try { const r = await mirror.sync(readRows()); if (r.added || r.updated) mirror.log.log('[商談先一覧の写し] 追加 ' + r.added + '件 / 更新 ' + r.updated + '件'); }
    catch (e) { mirror.log.error('[商談先一覧の写し] 失敗: ' + (e && e.message || e)); }
    finally { running = false; if (again) { again = false; schedule(); } }
  }
  function schedule(ms) { if (!mirror.enabled()) return; clearTimeout(timer); timer = setTimeout(run, ms === undefined ? 3000 : ms); }
  return { schedule, runNow: run };
}
module.exports = { Mirror, makeScheduler, DEFAULT_SHEET_ID };
