// 商談先一覧の写し: node tests/mirror_test.js
const assert = require('assert'), crypto = require('crypto');
const { Mirror } = require('../server/sheetsMirror');
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const sheet = [['会社A', '東京都', '大田区', 'https://x/?id=A1', '入力完了', '2026-11-12', '2026-11-12 15:28:15', 'a@x', 'A1'], ['会社B', '愛知県', '春日井市', 'https://x/?id=B1', '未入力 2件', '2026-11-24', '2026-11-24 20:57:08', 'b@x', 'B1']];
const calls = [];
const fakeFetch = async (url, o) => {
  const body = o.body ? (o.headers['Content-Type'] === 'application/json' ? JSON.parse(o.body) : o.body) : undefined; calls.push([o.method, url, body]);
  const ok = j => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j) });
  if (url.includes('oauth2')) return ok({ access_token: 't' });
  if (o.method === 'GET') return ok({ values: sheet });
  return ok({});
};
(async () => {
  const m = new Mirror({ credentials: { client_email: 'sa@x', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }, sheetId: 'SID', fetch: fakeFetch, log: { log() {}, error() {} } });
  const rows = [sheet[0], ['会社B', '愛知県', '春日井市', 'https://x/?id=B1', '入力完了', '2026-11-24', '2026-11-25 10:00:00', 'b@x', 'B1'], ['会社C', '大阪府', '堺市', 'https://x/?id=QMQjC5pgNcwHVHEk', '入力完了', '2026-11-25', '2026-11-25 11:00:00', 'c@x', 'QMQjC5pgNcwHVHEk']];
  const r = await m.sync(rows);
  assert.deepStrictEqual(r, { added: 1, updated: 1 });
  const upd = calls.find(c => c[1].includes('batchUpdate')), app = calls.find(c => c[1].includes(':append'));
  assert.strictEqual(upd[2].data[0].range, "'商談先一覧'!A3:I3"); assert.strictEqual(app[2].values[0][8], 'QMQjC5pgNcwHVHEk'); assert.ok(app[1].includes('insertDataOption=INSERT_ROWS'));
  calls.length = 0; assert.deepStrictEqual(await m.sync([sheet[0]]), { added: 0, updated: 0 }); assert.ok(!calls.some(c => c[0] !== 'GET' && !c[1].includes('oauth2')));   // 同じなら、書かない
  assert.deepStrictEqual(await m.sync([]), { added: 0, updated: 0 });
  console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });
