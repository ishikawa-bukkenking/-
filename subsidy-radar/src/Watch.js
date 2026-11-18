/**
 * Watch.js — 指定した公式ページの「本文の変化」を見る。
 * 保存するのは、本文のハッシュと、行ごとの指紋(ハッシュ+先頭40文字)だけ。本文の丸ごとは保存しない。
 * 範囲の目印・除外パターンは「ウォッチ」タブの列で直す(コードを触らずに)。
 */

function fetchPage_(url) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': WATCH.USER_AGENT } });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('HTTP ' + code);
  return res;
}

/** 戻り値: {ok, error, changed, added, removed, pdf} */
function checkWatch_(w, today) {
  var out = { ok: true, error: '', changed: false, added: [], removed: [], pdf: '' };
  try {
    var res = fetchPage_(w['URL']);
    if (w['種別'] === 'pdf') {
      var bytes = res.getBlob().getBytes();
      var sig = bytes.length + 'B/' + (res.getHeaders()['Last-Modified'] || '') + '/' + sha256Hex_(bytes.join(',')).slice(0, 12);
      if (w['本文のハッシュ'] && w['本文のハッシュ'] !== sig) { out.changed = true; out.pdf = 'サイズ・更新日時・ハッシュが変わりました'; }
      w['本文のハッシュ'] = sig;
    } else {
      var drop = String(w['除外パターン'] || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      var lines = htmlToLines_(res.getContentText(), { start: w['範囲の開始目印'], end: w['範囲の終了目印'], drop: drop });
      if (lines.length < 5) throw new Error('本文を取り出せません(目印の見直しが必要)');
      lines = lines.slice(0, 400);
      var hash = sha256Hex_(lines.join('\n')), fp = fingerprintLines_(lines, hash8);
      var prevFp = [];
      try { prevFp = w['行の指紋'] ? JSON.parse(w['行の指紋']) : []; } catch (e) { prevFp = []; }
      if (w['本文のハッシュ'] && w['本文のハッシュ'] !== hash) {
        var d = diffFingerprints_(prevFp, fp, lines);
        if (d.added.length || d.removed.length) { out.changed = true; out.added = d.added; out.removed = d.removed; }
      }
      w['本文のハッシュ'] = hash;
      w['行の指紋'] = JSON.stringify(fp);
    }
    w['最後に見た日'] = today;
    if (out.changed) {
      var prev = {};
      if (w['差分検知日'] === today) { try { prev = JSON.parse(w['最後の差分']); } catch (e) { prev = {}; } } // 同じ日に2回変わったら合算
      var merged = { added: (prev.added || []).concat(out.added), removed: (prev.removed || []).concat(out.removed), pdf: out.pdf || prev.pdf || '' };
      w['最後の差分'] = JSON.stringify(merged); w['差分検知日'] = today;
    }
  } catch (e) {
    out.ok = false; out.error = safeError_(e);
  }
  return out;
}

function collectWatch_(ctx) {
  var out = { ok: true, count: 0, added: 0, updated: 0, error: '' }, errs = [];
  var list = ctx.watchRows.filter(function (w) { return String(w['有効']).toUpperCase() === 'ON' && w['URL']; });
  list.forEach(function (w, i) {
    if (i > 0) Utilities.sleep(WATCH.WAIT_MS);
    var r = checkWatch_(w, ctx.today);
    out.count++;
    if (!r.ok) { errs.push(w['名前'] + ': ' + r.error); return; }
    if (r.changed) {
      out.updated++;
      ctx.history.push({ '検知した日': ctx.today, '制度ID': 'watch:' + w['名前'], '名前': w['名前'], '変わった項目': 'ページの本文', '前の値': (r.removed.slice(0, 2).join(' / ') || r.pdf).slice(0, 100), '後の値': (r.added.slice(0, 2).join(' / ') || r.pdf).slice(0, 100) });
    }
  });
  if (errs.length) { out.ok = false; out.error = errs.join(' ; ').slice(0, 200); }
  return out;
}
