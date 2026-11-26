// 路線・駅の表: 入力すると自動で保存される/入力中の表は、他の種別の保存で書き換えられない(Railway版のサーバーを起動して、ブラウザで確認)
import { chromium } from '/home/user/-/node_modules/playwright-core/index.mjs';
const [exe, base] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }), p = await b.newPage({ viewport: { width: 1200, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const rpc = (n, ...a) => p.evaluate(async ([n, a]) => (await (await fetch('/rpc/' + n, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: a }) })).json()), [n, a]);
await p.goto(base + '/'); await p.waitForTimeout(500);
const c = (await rpc('api_create_company', '株式会社UI', '長野県', '上田市', 'station')).result;
await p.goto(base + '/#a=' + c.areaId); await p.waitForTimeout(300);
await p.evaluate(id => { openArea(id); }, c.areaId); await p.waitForTimeout(1500);
const field = k => p.locator('.field[data-k="inputs.' + k + '.station_image"]');
const fill = async (k, row, vals) => { const inp = field(k).locator('table.stn-ed tr').nth(row + 1).locator('input'); for (let i = 0; i < vals.length; i++) if (vals[i] !== null) await inp.nth(i).fill(vals[i]); };
const out = {};
// 土地: 1行目に路線・駅・件数を入力(保存ボタンは押さない)
await fill('land', 0, ['JR中央線', '上田駅', '屋代駅', '93']); await p.waitForTimeout(2000);
let t = (await rpc('api_get', c.areaId)).result.tables;
out.autosaved = [t['inputs.land.station_image'].cells[0][0], t['inputs.used_house.station_image'] && t['inputs.used_house.station_image'].rows[0]];
// 中古戸建ての表に、件数だけ入力中(未保存)の状態で、土地の路線を追加保存 → 中古戸建ての入力は消えない
await p.waitForTimeout(500);
const uh = field('used_house').locator('table.stn-ed tr').nth(1).locator('input');
await uh.nth(3).fill('7');   // 自動保存を待たずに
await fill('land', 1, ['東急大井', '北千束', '大岡山', '1']);
await p.waitForTimeout(2500);
t = (await rpc('api_get', c.areaId)).result.tables;
const u = t['inputs.used_house.station_image'];
out.kept = [u.rows.length >= 2, u.cells[0][0], await uh.nth(3).inputValue()];
// 再読み込みしても残る
await p.evaluate(id => { openArea(id); }, c.areaId); await p.waitForTimeout(1500);
out.reload = [await field('land').locator('table.stn-ed tr').nth(1).locator('input').nth(3).inputValue(), await field('used_house').locator('table.stn-ed tr').nth(1).locator('input').nth(3).inputValue()];
// 検索ボリューム: チェックを外すとそのキーワードの入力欄が薄くなり(必須でなくなる)、保存される
const ck = p.locator('.field[data-k="show.kw.不動産"] input[type=checkbox]');
out.kwChecked = await ck.isChecked();
await ck.uncheck(); await p.waitForTimeout(1800);
out.kwOff = await p.locator('.field[data-k="kw.不動産"]').evaluate(e => [e.classList.contains('off'), e.classList.contains('need')]);
out.kwSaved = (await rpc('api_get', c.areaId)).result.values['show.kw.不動産'];
out.errs = errs;
console.log(JSON.stringify(out));
await b.close();
