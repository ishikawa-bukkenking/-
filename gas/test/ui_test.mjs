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
ctx.__args = null;
function srv(name, args) {
  ctx.__name = name; ctx.__a = args;
  try { return { ok: vm.runInContext("JSON.stringify(this[__name].apply(this, __a))", ctx) }; }
  catch (e) { return { err: String(e.message) }; }
}
const html = vm.runInContext("APP_HTML_", ctx);
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
async function open(email, viewport) {
  global.__email = email;
  const page = await browser.newPage({ viewport: viewport || { width: 1100, height: 900 } });
  page.errors = []; page.on('pageerror', e => page.errors.push(String(e)));
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
  return page;
}
const log = {};
// 社外のアカウントでは入れない
let p0 = await open('someone@gmail.com');
await p0.waitForSelector('.msg'); log.deniedMsg = await p0.textContent('.msg'); await p0.close();
// bukkenking.com のアカウントで入る(パスワードは無い)
const page = await open('ishikawa@bukkenking.com');
await page.waitForSelector('#nc');
log.who = await page.textContent('#who');
// 会社+最初のエリアを追加
await page.fill('#nc', '株式会社テスト工務店'); await page.selectOption('#np', '愛知県'); await page.fill('#ncity', '岡崎市');
await page.click('button:has-text("追加して入力を始める")');
await page.waitForSelector('.field');
log.title = await page.textContent('#title');
log.noLogin = await page.locator('input[type=password]').count();
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
const area1 = vm.runInContext("listAreas_()[0].id", ctx);
log.stored = JSON.parse(vm.runInContext("JSON.stringify((function(){var v=areaById_(listAreas_()[0].id).values;return {hh:v['inputs.area.households'],inc:v['inputs.income.city_avg_man'],cmp:v['compare.0'],pref:v['inputs.income.prefecture_avg_man']||'',date:v['auto.date.area']};})())", ctx));
// 画像アップロード
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await page.locator('.field[data-k="inputs.price_trend.image"] input[type=file]').setInputFiles({ name: 'g.png', mimeType: 'image/png', buffer: png });
await page.waitForFunction(() => /アップロード済み/.test(document.querySelector('.field[data-k="inputs.price_trend.image"]').textContent), null, { timeout: 8000 });
log.imageSaved = vm.runInContext("/^drive:/.test(areaById_(listAreas_()[0].id).values['inputs.price_trend.image'])", ctx);
log.fieldsNoCta = await page.locator('.field[data-k="cta_url"], .field[data-k="company"]').count();
log.noSourceFields = await page.locator('.field[data-k$=".source"], .field[data-k$=".date"]').count();
await page.screenshot({ path: outDir + '/ui-edit.png' });
// 一覧に戻り、同じ会社にエリアを追加
await page.click('#navlist'); await page.waitForSelector('.item');
await page.locator('.card', { hasText: '株式会社テスト工務店' }).locator('select').selectOption('愛知県');
await page.locator('input[placeholder^="エリアを追加"]').fill('豊田市');
await page.click('button:has-text("エリアを追加")');
await page.waitForSelector('.field');
log.sibChips = await page.locator('button:has-text("愛知県 岡崎市"), button:has-text("愛知県 豊田市")').count();
await page.click('#navlist'); await page.waitForSelector('.item');
log.areasOfCompany = await page.locator('.card', { hasText: '株式会社テスト工務店' }).locator('.item').count();
log.sheetNames = vm.runInContext("__sheetNames().sort().join(',')", ctx);   // 会社ごとにタブは増えない
await page.screenshot({ path: outDir + '/ui-list.png' });
// 加盟店の管理(CSV取り込みと検索)
await page.click('#navfr'); await page.waitForSelector('#frcsv');
log.frShown = (await page.textContent('h2:has-text("登録済み")'));
await page.fill('#frq', '松本市'); await page.waitForTimeout(200);
log.frSearch = await page.locator('.item').count();
await page.fill('#frq', '');
const csv = Buffer.from('会社名,住所\n新規工務店株式会社【新規】《愛知県岡崎市》,愛知県岡崎市康生町1-1\n', 'utf-8');
await page.locator('#frcsv').setInputFiles({ name: 'f.csv', mimeType: 'text/csv', buffer: csv });
await page.waitForFunction(() => /1件追加/.test(document.getElementById('msg') ? document.getElementById('msg').textContent : ''), null, { timeout: 8000 });
log.frImported = true;
await page.screenshot({ path: outDir + '/ui-fr.png' });
// 設定
await page.click('#navset'); await page.waitForSelector('#s_max');
await page.fill('#s_url', 'https://script.google.com/macros/s/AKfycbxTEST/exec'); await page.fill('#s_max', '2'); await page.click('button:has-text("保存する")');
await page.waitForFunction(() => /保存しました/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
log.settingMax = vm.runInContext("readSettings_().max", ctx); log.settingUrl = vm.runInContext("readSettings_().url", ctx);
await page.screenshot({ path: outDir + '/ui-set.png' });
// スマホ幅
await page.setViewportSize({ width: 375, height: 800 });
await page.click('#navlist'); await page.waitForSelector('.item'); await page.locator('button:has-text("入力する")').first().click(); await page.waitForSelector('.field');
log.hscroll = await page.evaluate(() => document.documentElement.scrollWidth + '/' + innerWidth);
await page.screenshot({ path: outDir + '/ui-mobile.png' });
log.errors = page.errors;
console.log(JSON.stringify(log, null, 1));
await browser.close();
