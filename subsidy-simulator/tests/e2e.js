const { chromium } = require('playwright');
const url = 'file://' + require('path').resolve(__dirname, '..', 'dist', 'index.html');
process.chdir(require('os').tmpdir());
let fails = 0;
const ok = (n, c, extra='') => { if (!c) { fails++; console.log('NG ', n, extra); } else console.log('OK ', n); };
(async () => {
  const b = await chromium.launch();
  const reqs = [], errs = [];
  async function page(w, h) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
    p.on('pageerror', e => errs.push(String(e)));
    p.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) reqs.push(r.url()); });
    await p.goto(url);
    return p;
  }
  const p = await page(1280, 900);
  const txt = (id) => p.$eval(id, e => e.textContent);
  // 初期値(仕様書 No.1 を5人にしたもの)
  ok('初期: 345,000', (await txt('#big')) === '¥345,000', await txt('#big'));
  // 即時反映
  await p.fill('#regular', '10'); ok('10人: 690,000', (await txt('#big')) === '¥690,000');
  await p.fill('#regular', '1');
  await p.fill('#hours', '40'); await p.fill('#expense', '600000');
  ok('No.2 182,000', (await txt('#big')) === '¥182,000');
  ok('加算 +8,000', (await txt('#bonus')).includes('+¥8,000'), await txt('#bonus'));
  await p.fill('#hours', '9'); ok('9時間は対象外の案内', (await txt('#warn')).includes('10時間以上'));
  await p.fill('#hours', '30'); await p.fill('#expense', '100000');
  // eラーニング
  await p.check('input[name=format][value=elearning]'); ok('eラーニング 45,000', (await txt('#big')) === '¥45,000');
  await p.check('input[name=format][value=classroom]');
  // 比較表
  await p.click('#cmpBtn'); ok('比較表が出る', await p.isVisible('#cmpBox'));
  ok('比較 加算あり 90,000', (await txt('#cmpFoot')).includes('¥90,000'));
  // 年間上限
  await p.fill('#regular', '26'); await p.fill('#hours', '200'); await p.fill('#expense', '500000');
  ok('上限 10,000,000', (await txt('#big')) === '¥10,000,000');
  ok('上限の表示', (await p.isVisible('#capBox')) && (await txt('#capBox')).includes('上限'));
  // 判定
  await p.fill('#regular', '1'); await p.fill('#hours', '30'); await p.fill('#expense', '100000');
  await p.check('input[name=size][value=large]'); ok('中小以外 20,000+... ', (await txt('#big')) === '¥' + (30000 + 12000).toLocaleString('en-US'), await txt('#big'));
  await p.click('#smeHelp summary'); await p.fill('#emps', '250'); await p.click('#judgeBtn');
  ok('判定: 建設業250人→中小', await p.isChecked('input[name=size][value=small]'));
  // 限度額で止まるとき、画面に理由が出る
  await p.check('input[name=course][value=reskilling]'); await p.fill('#expense', '1000000');
  ok('リスキリング 経費100万: 限度額の説明', (await p.isVisible('#limNote')) && (await txt('#limNote')).includes('限度額') && (await txt('#limNote')).includes('75%'), await txt('#limNote'));
  ok('経費助成の下に助成率75%', (await txt('#kExpS')).includes('75%'), await txt('#kExpS'));
  await p.fill('#expense', '100000'); ok('限度額内は説明なし', !(await p.isVisible('#limNote')));
  await p.check('input[name=course][value=jinzai]'); await p.fill('#expense', '100000');
  // 大きな数字が折り返さない(画面共有の幅・スマホ幅・最大の12桁)
  for (const [w, big] of [[1000, 0], [1280, 0], [375, 0], [1000, 1], [375, 1]]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.check('input[name=course][value=reskilling]');
    if (big) { await p.fill('#regular', '400'); await p.fill('#hours', '250'); await p.fill('#expense', '900000'); }
    else { await p.fill('#regular', '7'); await p.fill('#hours', '12'); await p.fill('#expense', '400000'); }
    const m = await p.evaluate(() => { const e = document.getElementById('big'); const fs = parseFloat(getComputedStyle(e).fontSize); return { t: e.textContent, h: e.offsetHeight, fs, over: e.scrollWidth - e.clientWidth }; });
    ok('金額が1行に収まる ' + w + 'px ' + m.t, m.h <= m.fs * 1.5 && m.over <= 1, JSON.stringify(m));
    const kv = await p.evaluate(() => ['kExp','kWage','kPer','burden'].map(id => { const e = document.getElementById(id); return e.scrollWidth - e.clientWidth; }));
    ok('内訳の金額がはみ出さない ' + w + 'px', kv.every(x => x <= 1), kv.join(','));
  }
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.fill('#regular', '1'); await p.fill('#hours', '30'); await p.fill('#expense', '100000'); await p.check('input[name=course][value=jinzai]');
  ok('自己負担の数字が小さくなりすぎない', await p.$eval('#burden', e => parseFloat(getComputedStyle(e).fontSize) >= 24));
  // 文言
  const body = await p.evaluate(() => document.body.innerText);
  ok('画面に「概算」', body.includes('概算')); ok('画面に「保証」', body.includes('保証'));
  ok('画面に「社会保険労務士にご相談ください」', body.includes('社会保険労務士にご相談ください'));
  // 日付
  await p.fill('#start', '2027-07-31'); await p.fill('#end', '2027-09-30');
  ok('計画届の締切 6月30日', (await txt('#check')).includes('2027年6月30日'));
  ok('年度またぎの注意', (await txt('#warn')).includes('翌年度'));
  // キーボード
  await p.focus('#title'); let seen = new Set();
  for (let i = 0; i < 12; i++) { await p.keyboard.press('Tab'); seen.add(await p.evaluate(() => document.activeElement.id || document.activeElement.name || document.activeElement.tagName)); }
  ok('Tabで入力欄を巡回できる', seen.size >= 8, [...seen].join(','));
  const outline = await p.evaluate(() => { document.getElementById('regular').focus(); return getComputedStyle(document.getElementById('regular')).outlineStyle; });
  ok('フォーカスが見える', outline !== 'none');
  // 書類(PDF)
  async function pdfPages(label) {
    let last;
    for (const type of ['estimate', 'quote']) {
      await p.emulateMedia({ media: 'screen' });
      await p.check('input[name=doctype][value=' + type + ']');
      await p.emulateMedia({ media: 'print' });
      const pdf = await p.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      const n = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      ok('書類(' + (type === 'quote' ? '見積書' : '概算') + ') ' + label + ' → ' + n + 'ページ', n === 1);
      last = pdf;
    }
    await p.emulateMedia({ media: 'screen' });
    return last;
  }
  // お支払い(総額・月々)と見積書の文言
  await p.fill('#regular', '5'); await p.fill('#fixedTerm', '0'); await p.fill('#hours', '30'); await p.fill('#expense', '200000'); await p.fill('#payMonths', '3');
  ok('総支払額 1,000,000', (await txt('#pTotal')) === '¥1,000,000', await txt('#pTotal'));
  ok('月々 333,333', (await txt('#pMonthly')) === '¥333,333', await txt('#pMonthly'));
  ok('最終回 333,334', (await txt('#pMonthlyS')).includes('333,334'), await txt('#pMonthlyS'));
  ok('回数 3回', (await txt('#pN')) === '3回');
  await p.fill('#payMonths', '0'); ok('回数0は月々を出さない', (await txt('#pMonthly')) === '—');
  await p.fill('#payMonths', '3');
  const qt = async () => p.evaluate(() => document.getElementById('docq').innerText);
  let q = await qt();
  ok('見積書: 御見積書・総支払額・月々・概算・保証・社労士', ['御見積書','総支払額','月々のお支払い','概算','保証しない','社会保険労務士にご相談ください'].every(w => q.includes(w) || (w==='保証しない' && q.includes('保証するものではなく'))), q.slice(0, 120));
  for (const [v, w] of [['flex', 'いずれも可能'], ['online', 'オンライン(講師'], ['offline', '対面(オフライン)'], ['hybrid', '組み合わせて実施'], ['none', null]]) {
    await p.selectOption('#formSel', v); q = await qt();
    ok('実施形態の文言 ' + v, w ? q.includes(w) && q.includes('打合せ') : !q.includes('打合せ'), v);
  }
  await p.selectOption('#formSel', 'flex');
  ok('チェックリストにオンラインの注意', (await txt('#check')).includes('同時双方向'));
  await p.selectOption('#formSel', 'offline'); ok('対面ならオンラインの注意は出ない', !(await txt('#check')).includes('録画の視聴'));
  await p.selectOption('#formSel', 'flex');
  await p.fill('#qNote', '分割払いは、月末締めです'); ok('備考が見積書に入る', (await qt()).includes('分割払いは、月末締め'));
  await p.fill('#qNote', '');
  q = await qt();
  ok('既定では、見積書に加算の欄が出ない', !q.includes('別途申請)') && !q.includes('¥750,000') && !q.includes('加算込み'), '');
  ok('既定でも、基本分の内訳は出る', q.includes('¥570,000') && q.includes('¥450,000'));
  await p.check('#qBonus'); q = await qt();
  ok('チェックすると、加算の欄が出る', q.includes('賃金要件等を満たす場合(別途申請)') && q.includes('¥750,000') && q.includes('加算込み'), '');
  await p.check('input[name=course][value=reskilling]'); q = await qt();
  ok('リスキリング: 「設備投資加算を含む(別途申請)」', q.includes('設備投資加算を含む(別途申請)') && q.includes('設備投資加算'), '');
  await p.uncheck('#qBonus'); q = await qt();
  ok('リスキリング: 既定では、設備投資加算が出ない', !q.includes('設備投資加算'), '');
  await p.check('input[name=course][value=jinzai]'); await p.check('#qBonus'); q = await qt();
  ok('見積書に助成金の内訳(経費・賃金・合計・上限)', ['経費助成','賃金助成','助成金の見込み合計','1人あたりの上限','賃金要件等を満たす場合'].every(w => q.includes(w)), q.slice(q.indexOf('参考'), q.indexOf('参考') + 200));
  ok('見積書の内訳に数字(経費助成 90,000×5=450,000)', q.includes('¥450,000') && q.includes('¥120,000') && q.includes('¥570,000'), '');
  await p.check('#qBonus');
  await p.fill('#company', '株式会社テスト工務店サンプルホールディングス九州支社'); await p.fill('#title', '施工管理の基礎研修と現場安全衛生マネジメント実践講座(全10回)');
  await p.emulateMedia({ media: 'print' });
  await pdfPages('通常(日付あり・正規のみ)');
  await p.emulateMedia({ media: 'screen' });
  await p.fill('#regular', '12'); await p.fill('#fixedTerm', '8'); await p.fill('#hours', '250'); await p.fill('#expense', '900000');
  await p.emulateMedia({ media: 'print' }); const pdf2 = await pdfPages('2区分・年間上限'); require('fs').writeFileSync('doc_jinzai.pdf', pdf2);
  await p.emulateMedia({ media: 'screen' });
  await p.check('input[name=course][value=reskilling]'); await p.fill('#equip', '3000000');
  await p.emulateMedia({ media: 'print' }); const pdf3 = await pdfPages('リスキリング・設備投資'); require('fs').writeFileSync('doc_reskilling.pdf', pdf3);
  await p.emulateMedia({ media: 'screen' });
  await p.check('input[name=format][value=elearning]');
  await p.emulateMedia({ media: 'print' }); await pdfPages('リスキリング・eラーニング');
  await p.emulateMedia({ media: 'screen' });
  const dt = await p.evaluate(() => document.getElementById('doc').innerText);
  ok('書類に「概算」「保証」「社会保険労務士」「出典」', ['概算','保証','社会保険労務士にご相談ください','出典'].every(w => dt.includes(w)), dt.slice(0, 80));
  ok('書類にロゴ', await p.$eval('#doc img', i => i.complete && i.naturalWidth > 0));
  // スマホ幅
  const m = await page(375, 800);
  const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('スマホ幅 横はみ出しなし', over === 0, over);
  await m.screenshot({ path: 'final_sp.png', fullPage: true });
  await p.check('input[name=course][value=jinzai]'); await p.check('input[name=format][value=classroom]'); await p.fill('#regular', '5'); await p.fill('#fixedTerm', '0'); await p.fill('#hours', '30'); await p.fill('#expense', '100000');
  await p.screenshot({ path: 'final_pc.png', fullPage: true });
  ok('JSエラーなし', errs.length === 0, errs.join('|'));
  ok('外部通信なし', reqs.length === 0, reqs.join('|'));
  console.log(fails ? fails + ' 件失敗' : 'すべて成功');
  await b.close(); process.exit(fails ? 1 : 0);
})();
