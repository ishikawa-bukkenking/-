// Apps Script 用の .js を Node で読み込む(vm 経由。グローバル関数をそのまま取り出す)
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
module.exports = function load(files) {
  const ctx = vm.createContext({ console });
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f }));
  ctx.hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
  return ctx;
};
