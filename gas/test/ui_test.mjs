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
await inputOf('県の平均世帯年収').first().fill('abc');   // 不正値
await page.waitForFunction(() => /保存/.test(document.getElementById('saved').textContent) && !/保存中|入力中/.test(document.getElementById('saved').textContent), null, { timeout: 8000 });
await page.waitForTimeout(600);
log.saved = await page.textContent('#saved');
log.badShown = await page.locator('.field.bad .err').count();
log.stat = await page.textContent('#stat');
const area1 = vm.runInContext("listAreas_()[0].id", ctx);
log.stored = JSON.parse(vm.runInContext("JSON.stringify((function(){var v=areaById_(listAreas_()[0].id).values;return {hh:v['inputs.area.households'],inc:v['inputs.income.city_avg_man'],cmp:v['compare.0'],pref:v['inputs.income.prefecture_avg_man']||'',date:v['auto.date.area']};})())", ctx));
// 構成比(%)は小数点第1位まで表示(39 → 39.0)
const pct0 = page.locator('.field[data-k="bracket_sh.0"] input');
await pct0.fill('39'); await pct0.blur();
log.pct = await pct0.inputValue();
log.noHhInputs = await page.locator('.field[data-k^="bracket_hh"], .field[data-k="inputs.income.municipalities_in_prefecture"]').count();
log.pctLabel = await page.locator('.field[data-k="bracket_sh.0"] label').first().textContent();
// 価格推移の表示チェック(既定はオン。外すと入力不要になる)
log.trendDefaultOn = await page.locator('#b_show_price_trend').isChecked();
const needBefore = await page.locator('.field.need').count();
await page.locator('#b_show_price_trend').uncheck();
log.trendDisabled = await page.locator('.field[data-grp="trend"] input:not([disabled])').count();
log.trendNeedGone = (await page.locator('.field[data-grp="trend"].need').count()) === 0 && (await page.locator('.field.need').count()) < needBefore;
await page.waitForFunction(() => /保存しました/.test(document.getElementById('saved').textContent), null, { timeout: 8000 });
log.trendStored = vm.runInContext("areaById_(listAreas_()[0].id).values['show.price_trend']", ctx);
await page.locator('#b_show_price_trend').check(); await page.waitForTimeout(900);
log.trendOnAgain = (await page.locator('.field[data-grp="trend"] input:not([disabled])').count()) > 0;
// 画像アップロード
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await page.locator('.field[data-k="inputs.price_trend.image"] input[type=file]').setInputFiles({ name: 'g.png', mimeType: 'image/png', buffer: png });
await page.waitForFunction(() => /アップロード済み/.test(document.querySelector('.field[data-k="inputs.price_trend.image"]').textContent), null, { timeout: 8000 });
// 対象エリアに表示する加盟店: 県内の全加盟店がチェック付きで並び、外すと保存される
const pickF = page.locator('.field[data-k="fr.pick"]');
await pickF.locator('.frrow').first().waitFor({ timeout: 8000 });
log.pickN = await pickF.locator('.frrow').count();
log.pickAllOn = await pickF.locator('.frrow input:checked').count() === log.pickN;
await pickF.locator('.frrow input').first().uncheck();
await page.waitForFunction(() => /1\s*\//.test('') || true);
await page.waitForTimeout(700);
log.pickOff = vm.runInContext("JSON.parse(areaById_(listAreas_()[0].id).values['fr.off'] || '[]').length", ctx);
await pickF.locator('button:has-text("すべて外す")').click(); await page.waitForTimeout(700);
log.pickNone = vm.runInContext("JSON.parse(areaById_(listAreas_()[0].id).values['fr.off'] || '[]').length", ctx) === log.pickN;
await pickF.locator('button:has-text("すべて選ぶ")').click(); await page.waitForTimeout(700);
log.pickBack = vm.runInContext("areaById_(listAreas_()[0].id).values['fr.off']", ctx) === undefined;
log.noMaxSetting = true;
// 物件データの参照元: チェックで選び、足りなければ追加できる
const srcF = page.locator('.field[data-k="src.pick"]');
await srcF.locator('input[type=checkbox]').first().waitFor({ timeout: 8000 });
await srcF.screenshot({ path: outDir + '/ui-src.png' });
log.srcN = await srcF.locator('input[type=checkbox]').count();
log.srcDefault = await srcF.locator('input[type=checkbox]:checked').count();
await srcF.locator('label:has-text("アットホーム") input').check();
await page.waitForTimeout(700);
log.srcSaved = vm.runInContext("JSON.parse(areaById_(listAreas_()[0].id).values['src.sel'] || '[]').join(',')", ctx);
await srcF.locator('input[type=text]').fill('テスト参照元'); await srcF.locator('button:has-text("追加")').click();
await page.waitForTimeout(700);
log.srcAdded = (await srcF.textContent()).indexOf('テスト参照元') >= 0 && vm.runInContext("srcMaster_().indexOf('テスト参照元') >= 0", ctx);
log.srcNote = /REINS・SUUMO・アットホーム・テスト参照元調べ/.test(await srcF.textContent());
// 物件種別の表示/非表示: 外すと、その種別の入力欄が薄くなる
await page.locator('.field[data-k="show.land"] input[type=checkbox]').uncheck();
log.typeDim = await page.locator('.field[data-grp="land"].off').count() >= 5 && await page.locator('.field[data-grp="used_house"].off').count() === 0;
await page.waitForTimeout(700);
log.typeSaved = vm.runInContext("areaById_(listAreas_()[0].id).values['show.land']", ctx);
await page.locator('.field[data-k="show.land"] input[type=checkbox]').check();
// ピンの名称
log.pinLabelField = await page.locator('.field[data-k="inputs.client.pin_label"] input').count();
// APIキー未設定のときは、表への作り直しの案内だけを出す
vm.runInContext("PropertiesService.getScriptProperties().deleteProperty('ANTHROPIC_KEY')", ctx);
await page.reload(); await page.waitForSelector('.field');
log.aiHint = /APIキーを入れる/.test(await page.locator('.field[data-k="inputs.used_house.heatmap_image"]').textContent());
vm.runInContext("PropertiesService.getScriptProperties().setProperty('ANTHROPIC_KEY', 'sk-ant-testtesttesttesttesttest')", ctx);
await page.reload(); await page.waitForSelector('.field');
// 画像はペーストでも貼れる(クリップボードの画像)
await page.locator('.field[data-k="inputs.used_house.heatmap_image"] .paste').click();
await page.evaluate(() => { const b = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
  const dt = new DataTransfer(); dt.items.add(new File([b], 'p.png', { type: 'image/png' }));
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
await page.waitForFunction(() => /アップロード済み/.test(document.querySelector('.field[data-k="inputs.used_house.heatmap_image"]').textContent), null, { timeout: 8000 });
// 貼った画像は、自動でAIが表にして保存する(LPにも反映)。あとから数字を直して保存もできる
const hf = page.locator('.field[data-k="inputs.used_house.heatmap_image"]');
await hf.locator('.tbl table').waitFor({ timeout: 8000 });
log.aiAuto = /AIが自動で作りました/.test(await hf.textContent()) && /要確認/.test(await hf.textContent());
log.aiAutoStored = vm.runInContext("!!areaById_(listAreas_()[0].id).values['tbl.inputs.used_house.heatmap_image']", ctx);
log.aiCells = await hf.locator('.tbl td input').evaluateAll(l => l.map(x => x.value).join(','));
await hf.locator('.tbl td input').nth(3).fill('9');
await hf.locator('button:has-text("修正を保存")').click();
await page.waitForFunction(() => /AIで作り直し済み/.test(document.querySelector('.field[data-k="inputs.used_house.heatmap_image"]').textContent), null, { timeout: 8000 });
log.aiSaved = vm.runInContext("JSON.parse(areaById_(listAreas_()[0].id).values['tbl.inputs.used_house.heatmap_image']).cells[1][0]", ctx);
// 価格推移のグラフも同じ(アップロードすると自動で系列の表になる)
const tf = page.locator('.field[data-k="inputs.price_trend.image"]');
await tf.locator('input[type=file]').setInputFiles({ name: 'g2.png', mimeType: 'image/png', buffer: png });
await tf.locator('.tbl table').waitFor({ timeout: 8000 });
log.trendAuto = /概算/.test(await tf.textContent()) && (await tf.locator('.tbl th input').count()) >= 4;
await page.reload(); await page.waitForSelector('.field');
log.aiPersisted = /AIで作り直し済み/.test(await page.locator('.field[data-k="inputs.used_house.heatmap_image"]').textContent());
log.pasted = vm.runInContext("/^drive:/.test(areaById_(listAreas_()[0].id).values['inputs.used_house.heatmap_image'])", ctx);
log.imageSaved = vm.runInContext("/^drive:/.test(areaById_(listAreas_()[0].id).values['inputs.price_trend.image'])", ctx);
log.fieldsNoCta = await page.locator('.field[data-k="cta_url"], .field[data-k="company"]').count();
log.noSourceFields = await page.locator('.field[data-k$=".source"], .field[data-k$=".date"]').count();
log.editUrlText = (await page.locator('.card').first().textContent()).replace(/.*(LPのURL\(仮[^：]*：).*/, '$1');
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
log.listUrlText = (await page.locator('.card', { hasText: '株式会社テスト工務店' }).locator('.item').first().textContent()).replace(/.*(LPのURL\(仮\)：https:\/\/script\.test\/exec\?id=\w+).*/, '$1');
// 会社の複製(一覧の会社から)
await page.locator('.card', { hasText: '株式会社テスト工務店' }).locator('button:has-text("複製")').first().click();
await page.locator('input[aria-label="複製後の会社名"]').fill('株式会社テスト工務店 複製');
await page.click('button:has-text("この名前で複製する")');
await page.waitForSelector('.card:has-text("株式会社テスト工務店 複製")');
log.dupAreas = await page.locator('.card', { hasText: '株式会社テスト工務店 複製' }).locator('.item').count();
log.indexRows = vm.runInContext("(function(){var sh=ss_().getSheetByName('商談先一覧');return sh.getLastRow()-1;})()", ctx);
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
log.noHpCount = await page.locator('label:has-text("HP未登録のみ")').textContent();
await page.check('#nohp'); await page.waitForTimeout(200);
log.noHpListed = await page.locator('.chip:has-text("HP未登録")').count() > 0 && await page.locator('a:has-text("不動産HP")').count() === 0;
await page.uncheck('#nohp');
await page.screenshot({ path: outDir + '/ui-fr.png' });
// 設定
await page.click('#navset'); await page.waitForSelector('#s_threshold');
await page.fill('#s_estat', 'APPID'); await page.click('button:has-text("e-Statの接続テスト")');
await page.waitForFunction(() => /接続できました/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
log.estatTest = await page.textContent('#msg');
log.noUnitField = await page.locator('#s_unit').count();
await page.fill('#s_url', 'https://script.google.com/macros/s/AKfycbxTEST/exec'); await page.fill('#s_threshold', '2'); await page.click('button:has-text("保存する")');
log.noMaxField = await page.locator('#s_max').count();
await page.waitForFunction(() => /保存しました/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
log.settingMax = vm.runInContext("readSettings_().threshold", ctx); log.settingUrl = vm.runInContext("readSettings_().url", ctx);
await page.screenshot({ path: outDir + '/ui-set.png' });
// スマホ幅
await page.setViewportSize({ width: 375, height: 800 });
await page.click('#navlist'); await page.waitForSelector('.item'); await page.locator('button:has-text("入力する")').first().click(); await page.waitForSelector('.field');
log.hscroll = await page.evaluate(() => document.documentElement.scrollWidth + '/' + innerWidth);
await page.screenshot({ path: outDir + '/ui-mobile.png' });
log.errors = page.errors;
console.log(JSON.stringify(log, null, 1));
await browser.close();
