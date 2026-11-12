// エリア調査シート: Railway(Node.js)で動かすサーバー。
// gas/dist/Bundle.gs(Google Apps Script 版と同じコード)をそのまま実行し、Googleのサービスは shim.js で置き換える。
//   /?id=XXXX  … LP(誰でも見られる。noindex)
//   /          … 入力システム(Googleログイン。@bukkenking.com のみ)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { makeRuntime, syncFetch } = require('./shim');
const { openStore } = require('./store');

const ALLOWED_DOMAIN = 'bukkenking.com';
const PORT = Number(process.env.PORT || 3000);
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET が未設定です。再起動のたびにログインし直しになります。');
const BASE_URL = (process.env.BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '')).replace(/\/+$/, '');
const DEV_EMAIL = process.env.NODE_ENV === 'production' ? '' : (process.env.DEV_LOGIN_EMAIL || '');
const SESSION_DAYS = 14;

// ---- セッション(署名つきクッキー) ----
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function makeSession(email) { const p = Buffer.from(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url'); return p + '.' + sign(p); }
function readSession(req) {
  if (DEV_EMAIL) return DEV_EMAIL;
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)sid=([^;]+)/); if (!m) return '';
  const [p, s] = m[1].split('.'); if (!p || !s || s.length !== sign(p).length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(sign(p)))) return '';
  try { const j = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); return j.x > Date.now() ? String(j.e || '') : ''; } catch (e) { return ''; }
}
async function verifyGoogleToken(idToken) {
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken)), j = await r.json();
  if (!r.ok || j.aud !== CLIENT_ID || String(j.email_verified) !== 'true') throw new Error('Googleアカウントを確認できませんでした。');
  const e = String(j.email || '').toLowerCase();
  if (!e.endsWith('@' + ALLOWED_DOMAIN)) throw new Error('このアカウント(' + e + ')では使えません。@' + ALLOWED_DOMAIN + ' のアカウントでログインしてください。');
  return e;
}

// ---- ページ ----
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RPC_SHIM = '<script>window.google={script:{run:(function(){function mk(ok,fail){return new Proxy({},{get:function(_,n){' +
  'if(n==="withSuccessHandler")return function(f){return mk(f,fail)};if(n==="withFailureHandler")return function(f){return mk(ok,f)};' +
  'return function(){var a=[].slice.call(arguments);fetch("/rpc/"+n,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({args:a})})' +
  '.then(function(r){if(r.status===401){location.reload();throw new Error("ログインし直してください")}return r.json()})' +
  '.then(function(j){if(j.ok){if(ok)ok(j.result)}else if(fail)fail({message:j.error})},function(e){if(fail)fail({message:String(e&&e.message||e)})})}}})}return mk()})()}};</script>';
function loginPage(msg) {
  if (!CLIENT_ID) msg = '設定が足りません: 環境変数 GOOGLE_CLIENT_ID が空です。Railway の Variables に追加して、Deploy を押してください。';
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>エリア調査シート 入力システム</title>' +
    '<script src="https://accounts.google.com/gsi/client" async defer></script><style>body{font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f4f8f9}.b{background:#fff;padding:36px 32px;border-radius:12px;box-shadow:0 2px 12px #0001;text-align:center;max-width:360px}h1{font-size:18px;color:#0097A7;margin:0 0 8px}p{color:#555;font-size:14px;line-height:1.7}#m{color:#c33}</style></head><body><div class="b"><h1>エリア調査シート 入力システム</h1>' +
    '<p>@' + ALLOWED_DOMAIN + ' のGoogleアカウントでログインしてください。</p><div id="g" style="display:flex;justify-content:center;margin:18px 0"></div><p id="m">' + esc(msg || '') + '</p></div>' +
    '<script>window.onload=function(){if(!window.google||!google.accounts){setTimeout(window.onload,300);return}if(!' + JSON.stringify(CLIENT_ID) + ')return;google.accounts.id.initialize({client_id:' + JSON.stringify(CLIENT_ID) + ',callback:function(r){' +
    'fetch("/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({credential:r.credential})}).then(function(x){return x.json()}).then(function(j){if(j.ok)location.reload();else document.getElementById("m").textContent=j.error},function(){document.getElementById("m").textContent="通信に失敗しました"})}});' +
    'google.accounts.id.renderButton(document.getElementById("g"),{theme:"outline",size:"large",text:"signin_with",locale:"ja"})}</script></body></html>';
}

(async () => {
  const store = openStore(), state = await store.load();
  const bundle = fs.readFileSync(path.join(__dirname, '..', 'gas', 'dist', 'Bundle.gs'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'gas', 'dist', 'Assets.gs'), 'utf8');
  const rt = makeRuntime(bundle, state, { baseUrl: BASE_URL, mapsKey: process.env.GOOGLE_MAPS_API_KEY || '' });
  const ctx = rt.ctx;
  vm_run(ctx, 'setupSheets_(ss_())');   // 初回: 保存先の表と同梱の加盟店一覧を用意(2回目以降は入力済みのデータを消さない)
  if (process.env.ANTHROPIC_API_KEY && !state.props.ANTHROPIC_KEY) vm_run(ctx, 'PropertiesService.getScriptProperties().setProperty("ANTHROPIC_KEY", ' + JSON.stringify(process.env.ANTHROPIC_API_KEY) + ')');
  await flush();
  async function flush() { if (rt.isDirty()) await store.save(rt.takeDirty()); }
  function vm_run(c, code) { return require('vm').runInContext(code, c); }

  let queue = Promise.resolve();   // GASのコードは同期で動くので、リクエストは1つずつ処理する
  const serial = fn => { const p = queue.then(fn); queue = p.catch(() => {}); return p; };
  const readBody = (req, limit) => new Promise((res, rej) => { const a = []; let n = 0; req.on('data', d => { n += d.length; if (n > limit) { rej(new Error('too large')); req.destroy(); } else a.push(d); }).on('end', () => res(Buffer.concat(a).toString('utf8'))).on('error', rej); });
  const send = (res, code, body, type, extra) => { res.writeHead(code, Object.assign({ 'Content-Type': type || 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' }, extra || {})); res.end(body); };
  const json = (res, code, o, extra) => send(res, code, JSON.stringify(o), 'application/json; charset=utf-8', extra);

  http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x'), p = u.pathname;
      if (p === '/healthz') return send(res, 200, 'ok', 'text/plain');
      if (p === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /\n', 'text/plain');
      if (req.method === 'POST' && p === '/auth') {
        const j = JSON.parse(await readBody(req, 1e5) || '{}');
        try { const e = await verifyGoogleToken(String(j.credential || '')); return json(res, 200, { ok: true }, { 'Set-Cookie': 'sid=' + makeSession(e) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + SESSION_DAYS * 86400 + (BASE_URL.startsWith('https') ? '; Secure' : '') }); }
        catch (e) { return json(res, 200, { ok: false, error: String(e.message || e) }); }
      }
      if (req.method === 'POST' && p.startsWith('/rpc/')) {
        const email = readSession(req); if (!email) return json(res, 401, { ok: false, error: 'ログインが必要です' });
        const name = p.slice(5); if (!/^api_[A-Za-z0-9_]+$/.test(name)) return json(res, 404, { ok: false, error: '不明な操作です' });
        const body = JSON.parse(await readBody(req, 40e6) || '{}');
        return json(res, 200, await serial(async () => {
          ctx.__email = email; ctx.__args = Array.isArray(body.args) ? body.args : [];
          try {
            const r = vm_run(ctx, 'typeof ' + name + ' === "function" ? ' + name + '.apply(null, __args) : (function () { throw new Error("不明な操作です"); })()');
            await flush(); return { ok: true, result: r === undefined ? null : JSON.parse(JSON.stringify(r)) };
          } catch (e) { try { await flush(); } catch (e2) { /* 保存の失敗は次回に再試行 */ } return { ok: false, error: String(e && e.message || e) }; }
          finally { ctx.__email = ''; }
        }));
      }
      if (req.method === 'GET' && (p === '/' || p === '/app' || p === '/lp')) {
        const id = String(u.searchParams.get('id') || '').trim();
        if (id) {   // LP(誰でも見られる)
          const out = await serial(async () => { ctx.__email = ''; ctx.__id = id; const o = vm_run(ctx, 'doGet({ parameter: { id: __id } })'); await flush(); return o.html; });
          return send(res, 200, out);
        }
        if (!readSession(req)) return send(res, 200, loginPage(''));
        const html = vm_run(ctx, 'APP_HTML_'), i = html.search(/<head[^>]*>/i);
        return send(res, 200, i >= 0 ? html.replace(/<head[^>]*>/i, m => m + RPC_SHIM) : RPC_SHIM + html);
      }
      send(res, 404, '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><p style="font-family:sans-serif;padding:40px">ページが見つかりません。</p>');
    } catch (e) { console.error(e && e.stack || e); try { send(res, 500, 'error', 'text/plain'); } catch (e2) { /* 送信済み */ } }
  }).listen(PORT, () => console.log('listening on ' + PORT + (DEV_EMAIL ? ' (開発用ログイン: ' + DEV_EMAIL + ')' : '')));
})().catch(e => { console.error(e); process.exit(1); });
