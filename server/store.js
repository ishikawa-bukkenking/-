// 保存先。DATABASE_URL があれば Postgres(Railway)、無ければファイル(ローカル確認用)。
// 保存するもの: シート(スプレッドシート相当) / プロパティ(AIのキーなど) / 画像。変更があった分だけ書き込む。
const fs = require('fs');
const path = require('path');

class FileStore {
  constructor(file) { this.file = file; }
  async load() {
    try { const j = JSON.parse(fs.readFileSync(this.file, 'utf8')); return { order: (j.sheets || {}).order || [], sheets: (j.sheets || {}).sheets || {}, props: j.props || {}, files: j.files || {} }; }
    catch (e) { return { order: [], sheets: {}, props: {}, files: {} }; }
  }
  async save(d) {
    const cur = await this.load(), j = { sheets: d.sheets ? { order: d.sheets.order, sheets: d.sheets.sheets } : { order: cur.order, sheets: cur.sheets }, props: d.props || cur.props, files: Object.assign({}, cur.files, d.files) };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(j)); fs.renameSync(this.file + '.tmp', this.file);
  }
}

class PgStore {
  constructor(url) {
    const { Pool } = require('pg');
    this.pool = new Pool({ connectionString: url, ssl: /sslmode=disable|localhost|127\.0\.0\.1|\.railway\.internal/.test(url) ? false : { rejectUnauthorized: false } });
  }
  async init() { await this.pool.query('CREATE TABLE IF NOT EXISTS kv (k text PRIMARY KEY, v text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())'); }
  async load() {
    await this.init();
    const rows = (await this.pool.query('SELECT k, v FROM kv')).rows, out = { order: [], sheets: {}, props: {}, files: {} };
    rows.forEach(r => {
      if (r.k === 'sheets') { const j = JSON.parse(r.v); out.order = j.order; out.sheets = j.sheets; }
      else if (r.k === 'props') out.props = JSON.parse(r.v);
      else if (r.k.startsWith('file:')) out.files[r.k.slice(5)] = JSON.parse(r.v);
    });
    return out;
  }
  async save(d) {
    const up = (k, v) => this.pool.query('INSERT INTO kv (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()', [k, JSON.stringify(v)]);
    const jobs = [];
    if (d.sheets) jobs.push(up('sheets', d.sheets));
    if (d.props) jobs.push(up('props', d.props));
    Object.keys(d.files || {}).forEach(id => jobs.push(up('file:' + id, d.files[id])));
    await Promise.all(jobs);
  }
}

function openStore() {
  if (process.env.DATABASE_URL) return new PgStore(process.env.DATABASE_URL);
  return new FileStore(process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'local-store.json'));
}
module.exports = { openStore, FileStore, PgStore };
