// 使い方: CHROME=<chromiumのパス> node tools/screenshots.mjs file:///.../index.html /tmp/shot 375 768 1280 1920
// 事前に `npm i playwright-core` が必要。横スクロールの有無(scrollWidth/innerWidth)も出力する。
import { chromium } from 'playwright-core';
const [,, url, outprefix, ...widths] = process.argv;
const b = await chromium.launch({ executablePath: process.env.CHROME, args:['--no-sandbox'] });
for (const w of widths.map(Number)) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto(url); await p.waitForTimeout(500);
  await p.evaluate(()=>document.querySelectorAll('.rv').forEach(e=>e.classList.add('in')));
  await p.waitForTimeout(800);
  const sw = await p.evaluate(()=>[document.documentElement.scrollWidth, innerWidth]);
  console.log(w, 'scrollWidth/innerWidth', sw.join('/'));
  await p.screenshot({ path: `${outprefix}-${w}.png`, fullPage: true });
  await p.close();
}
await b.close();
