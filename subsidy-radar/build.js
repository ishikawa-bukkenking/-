// src/ のファイルを1つにまとめて dist/Code.js を作る(Apps Script の画面に貼る用)
const fs = require('fs');
const files = ['Config', 'Logic', 'Util', 'Db', 'Jgrants', 'Watch', 'Notify', 'Main'];
const out = ['// 補助金レーダー(自動生成: src/ を連結したもの。直すときは src/ を直して、node build.js を実行)']
  .concat(files.map(f => '\n/* ===== ' + f + '.js ===== */\n' + fs.readFileSync(__dirname + '/src/' + f + '.js', 'utf8')));
fs.mkdirSync(__dirname + '/dist', { recursive: true });
fs.writeFileSync(__dirname + '/dist/Code.js', out.join('\n'));
console.log('dist/Code.js', out.join('\n').length, '文字');
