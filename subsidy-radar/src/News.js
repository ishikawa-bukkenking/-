/**
 * News.js — 公式のお知らせ(厚生労働省の新着情報)から、助成金・補助金などの見出しを集める。
 * 保存するのは、見出し・分類・公開日・リンクだけ。本文は取らない。
 */

function collectNews_(ctx) {
  var out = { ok: true, count: 0, added: 0, updated: 0, error: '' };
  try {
    var res = fetchPage_(NEWS_SOURCE.URL);
    var items = parseMhlwNews_(res.getContentText());
    if (items.length < 20) throw new Error('見出しを取り出せません(ページの作りの変更?)');
    var hits = filterNews_(items, ctx.settings.newsWords, ctx.settings.newsExclude, ctx.settings.newsExcludeWords);
    out.count = hits.length;
    var seen = {};
    ctx.newsRows.forEach(function (r) { seen[r['リンク'] + '|' + r['見出し']] = 1; });
    var firstCut = shiftDate_(ctx.today, -NEWS_SOURCE.FIRST_DAYS);
    hits.forEach(function (x) {
      var k = x.url + '|' + x.title;
      if (seen[k]) return;
      seen[k] = 1;
      // 最初の取り込みでは、直近の見出しだけを通知の対象にする(古いものは通知しない)
      var notify = ctx.newsInitial ? (x.date >= firstCut ? 'Y' : 'N') : 'Y';
      ctx.newsRows.push({ '検知した日': ctx.today, '出典': '厚生労働省', '分類': x.cat, '見出し': x.title, '公開日': x.date, 'リンク': x.url, '通知': notify });
      out.added++;
    });
    ctx.newsRows.sort(function (a, b) { return a['公開日'] < b['公開日'] ? 1 : -1; });
    if (ctx.newsRows.length > NEWS_SOURCE.KEEP) ctx.newsRows.length = NEWS_SOURCE.KEEP;
  } catch (e) {
    out.ok = false; out.error = safeError_(e);
  }
  return out;
}
