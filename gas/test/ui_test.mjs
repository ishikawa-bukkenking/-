// 入力画面(app.html)をブラウザで動かし、模擬サーバー(Apps Script側のコード)と通しで確認する。
// 使い方: CHROME=<chromium> [PLAYWRIGHT_CORE=<index.mjs>] node gas/test/ui_test.mjs <geoDir> <出力先フォルダ>
import { createRequire } from 'module';
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');   // npm i playwright-core(または PLAYWRIGHT_CORE にindex.mjsのパス)
const require = createRequire(import.meta.url);
const vm = require('vm');
const { makeEnv } = require('./mockgas.js');
const [geoDir, outDir] = process.argv.slice(2);
const ctx = makeEnv(geoDir);
vm.runInContext("setupSheets_(ss_())", ctx);
const pw = vm.runInContext("readSettings_().pw", ctx);
ctx.__args = null;
function srv(name, args) {
  ctx.__name = name; ctx.__a = args;
  try { return { ok: vm.runInContext("JSON.stringify(this[__name].apply(this, __a))", ctx) }; }
  catch (e) { return { err: String(e.message) }; }
}
const html = vm.runInContext("APP_HTML_", ctx);
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.exposeFunction('__srv', (name, args) => srv(name, args));
await page.addInitScript(() => {
  function make(ok, fail) {
    const o = { withSuccessHandler: f => make(f, fail), withFailureHandler: f => make(ok, f) };
    return new Proxy(o, { get: (t, k) => t[k] || ((...args) => { setTimeout(async () => {
      const r = await window.__srv(k, args);
      if (r.err) (fail || (() => {}))({ message: r.err }); else (ok || (() => {}))(JSON.parse(r.ok === undefined ? 'null' : r.ok));
    }, 5); }) });
  }
  window.google = { script: { run: make() } };
});
await page.route('http://app.test/', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
await page.goto('http://app.test/');
const log = {};
// 誤ったパスワード
await page.fill('#pw', 'wrong'); await page.click('button:has-text("ログイン")'); await page.waitForSelector('.msg:not(:empty)');
log.wrongPw = await page.textContent('#msg');
await page.fill('#pw', pw); await page.click('button:has-text("ログイン")');
await page.waitForSelector('#nc');
// 商談先を追加
await page.fill('#nc', '株式会社テスト工務店'); await page.selectOption('#np', '愛知県'); await page.fill('#ncity', '岡崎市');
await page.click('text=追加して入力を始める');
await page.waitForSelector('.field');
log.title = await page.textContent('#title');
log.sections = await page.locator('details.sec').count();
// 入力(自動保存)
await page.evaluate(() => document.querySelectorAll('details.sec').forEach(d => d.open = true));
const inputOf = (label) => page.locator('.field', { hasText: label }).first().locator('input');
await inputOf('世帯数').first().fill('150000');
await inputOf('市の平均世帯年収').first().fill('520');
await page.locator('.field[data-k="compare.0"] input').nth(0).fill('豊田市');
await page.locator('.field[data-k="compare.0"] input').nth(1).fill('12');
await page.locator('.field[data-k="compare.0"] input').nth(2).fill('80');
await inputOf('県の平均世帯年収').first().fill('abc');   // 不正値
await page.waitForFunction(() => /保存/.test(document.getElementById('saved').textContent) && !/保存中|入力中/.test(document.getElementById('saved').textContent), null, { timeout: 8000 });
await page.waitForTimeout(600);
log.saved = await page.textContent('#saved');
log.badShown = await page.locator('.field.bad .err').count();
log.stat = await page.textContent('#stat');
// 実際にシートへ書かれたか
log.sheet = JSON.parse(vm.runInContext("JSON.stringify((function(){var id=api_list(readSettings_().pw).items[0].id;var v=api_get(readSettings_().pw,id).values;return {hh:v['inputs.area.households'],inc:v['inputs.income.city_avg_man'],cmp:v['compare.0'],pref:v['inputs.income.prefecture_avg_man']||''};})())", ctx));
await page.screenshot({ path: outDir + '/ui-edit.png', fullPage: false });
// 画像アップロード(ブラウザ内で縮小 → サーバーへ)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await page.locator('.field[data-k="inputs.price_trend.image"] input[type=file]').setInputFiles({ name: 'g.png', mimeType: 'image/png', buffer: png });
await page.waitForFunction(() => /アップロード済み/.test(document.querySelector('.field[data-k="inputs.price_trend.image"]').textContent), null, { timeout: 8000 });
log.imageSaved = vm.runInContext("(function(){var id=api_list(readSettings_().pw).items[0].id;return /^drive:/.test(api_get(readSettings_().pw,id).values['inputs.price_trend.image']);})()", ctx);
log.fieldsNoCta = await page.locator('.field[data-k="cta_url"]').count();
log.noSourceFields = await page.locator('.field[data-k$=".source"], .field[data-k$=".date"]').count();
// 一覧に戻る
await page.click('#back'); await page.waitForSelector('.item');
log.list = await page.locator('.item').count();
await page.screenshot({ path: outDir + '/ui-list.png' });
// 加盟店の管理
await page.click('#navfr'); await page.waitForSelector('text=加盟店を追加');
await page.locator('input[placeholder^="名称"]').first().fill('岡崎工務店');
await page.locator('select').first().selectOption('愛知県');
await page.locator('input[placeholder="市区町村"]').first().fill('岡崎市');
await page.locator('button:has-text("追加")').first().click();
await page.waitForFunction(() => /登録済み\(3件\)/.test(document.body.textContent), null, { timeout: 8000 });
log.frAdded = true;
await page.screenshot({ path: outDir + '/ui-fr.png' });
// 設定
await page.click('#navset'); await page.waitForSelector('#s_max');
await page.fill('#s_max', '2'); await page.click('button:has-text("保存する")');
await page.waitForFunction(() => /保存しました/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
log.settingMax = vm.runInContext("readSettings_().max", ctx);
await page.screenshot({ path: outDir + '/ui-set.png' });
await page.click('#back'); await page.waitForSelector('.item');
// スマホ幅
await page.setViewportSize({ width: 375, height: 800 });
await page.click('text=入力する'); await page.waitForSelector('.field');
log.hscroll = await page.evaluate(() => document.documentElement.scrollWidth + '/' + innerWidth);
await page.screenshot({ path: outDir + '/ui-mobile.png' });
log.errors = errors;
console.log(JSON.stringify(log, null, 1));
await browser.close();
