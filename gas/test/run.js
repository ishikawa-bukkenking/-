// Apps Script 版ロジックを Node 上で実行するテスト用ランナー(GASのサービスは使わない)。
// 入力(JSON, 標準入力): { cfg, franchiseRows, listingRows, geoDir }  出力(JSON): { model, report, html, checks }
const fs = require('fs'), vm = require('vm'), path = require('path');
const dist = path.join(__dirname, '..', 'dist');
const ctx = vm.createContext({ console, Math, JSON, Date, Object, Array, String, Number, isNaN, parseInt, parseFloat });
for (const f of ['Bundle.gs', 'Assets.gs']) vm.runInContext(fs.readFileSync(path.join(dist, f), 'utf8'), ctx, { filename: f });
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const mem = {};
ctx.__input = input; ctx.__fs = fs; ctx.__mem = mem;
const out = vm.runInContext(`
(function () {
  var services = {
    cacheGet: function (k) { return __mem[k] || null; }, cachePut: function (k, v) { __mem[k] = v; },
    fetchJson: function (url) { var code = url.match(/N03-21_(\\d\\d)_/)[1]; return JSON.parse(__fs.readFileSync(__input.geoDir + '/geo_' + code + '.json', 'utf8')); },
    now: function () { return '2000-01-01T00:00:00Z'; }
  };
  var cfg = __input.vals ? valuesToConfig_(__input.vals, '2026-01-19') : __input.cfg;
  var b = buildModel_(cfg, services, { franchiseRows: __input.franchiseRows || [], listingRows: __input.listingRows || [] });
  var html = renderPage_(b.model, b.report, ASSETS, STYLE_CSS_);
  var model = JSON.parse(JSON.stringify(b.model)); delete model._mapSvg;
  return JSON.stringify({ model: model, report: b.report.items, html: html, checks: runChecks_(b.model, html), mapSvgLen: (b.model._mapSvg || '').length });
})()`, ctx);
process.stdout.write(out);
