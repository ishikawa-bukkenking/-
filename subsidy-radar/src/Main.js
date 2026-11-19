/**
 * Main.js — 毎日の実行。
 *   collectDaily() … 収集(8時)。同じ日に何回実行しても、結果は同じ(冪等)
 *   sendMorning()  … 通知(9時)。同じ日・同じモードで成功済みなら、送らない
 *   installTriggers() … 時間トリガーを(作り直して)設定する
 */

function collectDaily() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('別の実行中のため終了'); return; }
  try { runCollect_(openDb_()); } finally { lock.releaseLock(); }
}

function runCollect_(ss) {
  var today = today_(), settings = getSettings_(ss);
  var subs = readTab_(ss, TAB.SUBSIDY), rowsById = {}, order = [];
  subs.forEach(function (r) { rowsById[r['ID']] = r; order.push(r['ID']); });
  var ctx = { ss: ss, settings: settings, today: today, rowsById: rowsById, order: order, history: [], watchRows: readTab_(ss, TAB.WATCH) };
  var runs = [];

  function record(name, t0, r) {
    runs.push({ '日時': nowText_(), '日付': today, '情報源': name, '取得件数': r.count, '新着件数': r.added, '更新件数': r.updated, 'エラー': r.error, '所要秒': Math.round((Date.now() - t0) / 1000) });
  }

  if (settings.sources.jgrants !== false) {
    var t0 = Date.now(), initKey = 'INIT_jgrants';
    ctx.initial = !props_().getProperty(initKey); // 最初の取り込みは「新着」にしない(大量通知の防止)
    var r = collectJgrants_(ctx);
    if (ctx.initial && r.count > 0) props_().setProperty(initKey, today);
    record('Jグランツ', t0, r);
  }
  if (settings.sources.watch !== false) {
    var t1 = Date.now();
    var w = collectWatch_(ctx);
    record('ウォッチ', t1, w);
    writeTab_(ss, TAB.WATCH, ctx.watchRows);
  }

  // 点数・状態・重複の候補(全件を毎回計算し直す。キーワード表を変えると、翌回に反映される)
  var all = order.map(function (id) { return rowsById[id]; });
  all.forEach(function (row) {
    var sc = scoreRecord_({ title: row['名前'], institution: row['実施機関'], purpose: row['利用目的'], industry: row['業種'], area: row['地域'], target: row['対象'], excerpt: row['短い抜粋'] }, settings.rules, settings.thresholds);
    row['点数'] = sc.score; row['段階'] = sc.level; row['点数の理由'] = sc.reasons;
    row['状態'] = statusOf_(row['受付開始'], row['受付終了'], today);
  });
  markDuplicates_(all, today);

  // アーカイブ(消さずに移す)
  var keep = [], archive = [];
  all.forEach(function (row) {
    if (row['受付終了'] && daysBetween_(row['受付終了'], today) > settings.keep) archive.push(row); else keep.push(row);
  });
  writeTab_(ss, TAB.SUBSIDY, keep);
  buildViewTab_(ss, keep, today);
  if (archive.length) {
    var have = {}; readTab_(ss, TAB.ARCHIVE).forEach(function (r) { have[r['ID']] = 1; });
    appendTab_(ss, TAB.ARCHIVE, archive.filter(function (r) { return !have[r['ID']]; }));
  }
  appendTab_(ss, TAB.HISTORY, ctx.history);
  appendTab_(ss, TAB.RUNS, runs);
  return runs;
}

/**
 * 「見る用」タブ: 募集中で、点数が高・中のものだけを、読みやすい列で、締切が近い順に並べる。
 * 毎回、作り直す(編集しても消える。気になる印・メモは「気になる」タブへ)
 */
function buildViewTab_(ss, rows, today) {
  var list = rows.filter(function (r) { return r['状態'] === '募集中' && (r['段階'] === '高' || r['段階'] === '中'); });
  list.sort(function (a, b) {
    if (a['段階'] !== b['段階']) return a['段階'] === '高' ? -1 : 1;
    return (a['受付終了'] || '9999') < (b['受付終了'] || '9999') ? -1 : 1;
  });
  var out = list.map(function (r) {
    var lim = r['上限額'] === '' ? REVIEW : fmtLimit_(r['上限額']);
    return {
      '締切まで': r['受付終了'] ? daysLabel_(r['受付終了'], today) + '(' + mdLabel_(r['受付終了'], today) + ')' : REVIEW,
      '段階': r['段階'], '名前': r['名前'], '上限額': lim,
      '受付期間': (r['受付開始'] ? mdLabel_(r['受付開始'], today) : REVIEW) + ' 〜 ' + (r['受付終了'] ? mdLabel_(r['受付終了'], today) : REVIEW),
      '関連(なぜ上に出たか)': shortReasons_(r['点数の理由'], 4), 'リンク': r['元のリンク'], '確認が必要な項目': r['要確認']
    };
  });
  writeTab_(ss, TAB.VIEW, out);
  try {
    var sh = ss.getSheetByName(TAB.VIEW), w = [110, 50, 380, 90, 150, 260, 300, 120];
    w.forEach(function (px, i) { sh.setColumnWidth(i + 1, px); });
    if (out.length) sh.getRange(2, 1, out.length, w.length).setWrap(true).setVerticalAlignment('top');
    sh.getRange(1, 1, 1, w.length).setBackground('#04746D').setFontColor('#FFFFFF');
  } catch (e) { /* 見た目の設定に失敗しても、収集は止めない */ }
}

function viewUrl_(ss) {
  var sh = ss.getSheetByName(TAB.VIEW);
  return sh ? ss.getUrl() + '#gid=' + sh.getSheetId() : ss.getUrl();
}

function markDuplicates_(rows, today) {
  var sources = {}; rows.forEach(function (r) { sources[r['情報源']] = 1; });
  if (Object.keys(sources).length < 2) return;
  var recs = rows.map(function (r) { return { source: r['情報源'], title: r['名前'], end: r['受付終了'], institution: r['実施機関'] }; });
  rows.forEach(function (r, i) {
    if (r['初めて見つけた日'] !== today) return;
    var hits = [];
    for (var j = 0; j < rows.length; j++) {
      if (i === j) continue;
      var k = duplicateKind_(recs[i], recs[j]);
      if (k) hits.push(rows[j]['ID'] + '(' + k + ')');
    }
    r['重複候補'] = hits.join(' ');
  });
}

/* ---------- 通知 ---------- */

function buildCtx_(ss, today, settings) {
  var rows = readTab_(ss, TAB.SUBSIDY), watch = readTab_(ss, TAB.WATCH), runs = readTab_(ss, TAB.RUNS);
  var link = function (r) { return r['元のリンク']; };
  var newRows = rows.filter(function (r) { return r['新着扱い'] === 'Y'; });
  var newHigh = newRows.filter(function (r) { return r['段階'] === '高'; }).sort(function (a, b) { return Number(b['点数']) - Number(a['点数']); });
  var deadlines = rows.filter(function (r) {
    if (r['段階'] !== '高' || r['状態'] !== '募集中') return false;
    var lv = deadlineLevel_(r['受付終了'], today), sent = r['締切通知済'] === '' ? 99 : Number(r['締切通知済']);
    return lv > 0 && lv < sent;
  }).sort(function (a, b) { return a['受付終了'] < b['受付終了'] ? -1 : 1; });
  var changes = watch.filter(function (w) { return w['差分検知日'] && w['差分検知日'] > (w['通知済の日'] || ''); }).map(function (w) {
    var d = {}; try { d = JSON.parse(w['最後の差分']); } catch (e) { d = {}; }
    return { name: w['名前'], url: w['URL'], added: d.added || [], removed: d.removed || [], pdf: d.pdf || '', _row: w };
  });
  // 今日の取得結果: 情報源ごとに、その日の最後の記録
  var bySrc = {};
  runs.filter(function (r) { return r['日付'] === today; }).forEach(function (r) { bySrc[r['情報源']] = r; });
  var sources = Object.keys(bySrc).map(function (k) { var r = bySrc[k]; return { name: k, ok: !r['エラー'], count: r['取得件数'], error: r['エラー'] }; });
  return {
    today: today, watch: changes, viewUrl: viewUrl_(ss), sources: sources, prevFailed: false, maxNew: NOTIFY.MAX_NEW, maxDeadline: NOTIFY.MAX_DEADLINE,
    deadlines: deadlines.map(function (r) { return { title: r['名前'], end: r['受付終了'], limit: r['上限額'] === '' ? null : r['上限額'], url: link(r), _row: r }; }),
    newHigh: newHigh.map(function (r) { return { title: r['名前'], institution: r['実施機関'], start: r['受付開始'], end: r['受付終了'], limit: r['上限額'] === '' ? null : r['上限額'], reasons: r['点数の理由'], url: link(r), _row: r }; }),
    midCount: newRows.filter(function (r) { return r['段階'] === '中'; }).length,
    _newRows: newRows
  };
}

function sendMorning(force) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('別の実行中のため終了'); return; }
  try { return runSend_(openDb_(), force === true); } finally { lock.releaseLock(); }
}

function runSend_(ss, force) {
  var today = today_(), settings = getSettings_(ss), mode = String(settings.notify['送信モード'] || 'dry');
  var log = readTab_(ss, TAB.NOTICE);
  var done = log.some(function (r) { return r['日付'] === today && r['モード'] === mode && (r['結果'] === '成功' || r['結果'] === 'ドライ'); });
  if (done && !force) { Logger.log('本日は送信済み(' + mode + ')'); return { skipped: true }; }
  var ctx = buildCtx_(ss, today, settings);
  var last = log.filter(function (r) { return r['モード'] === mode && r['日付'] < today; }).pop();
  ctx.prevFailed = !!(last && last['結果'] === '失敗');
  var empty = !(ctx.watch.length || ctx.deadlines.length || ctx.newHigh.length);
  var anyBad = ctx.sources.some(function (s) { return !s.ok; });
  if (empty && !anyBad && String(settings.notify['該当なしの日も送る']).toUpperCase() === 'OFF') {
    appendTab_(ss, TAB.NOTICE, [{ '日時': nowText_(), '日付': today, '宛先': '-', 'モード': mode, '件数': 0, '結果': 'ドライ', 'メモ': '該当なしのため送らない設定' }]);
    return { skipped: true };
  }
  var body = buildMorningMessage_(ctx);
  if (body.length > NOTIFY.MAX_CHARS) body = body.slice(0, NOTIFY.MAX_CHARS - 40) + '\n…(続きは表で確認)[/info]';
  var r = deliver_(mode, body);
  appendTab_(ss, TAB.NOTICE, [{ '日時': nowText_(), '日付': today, '宛先': mode === 'dry' ? '-' : 'chatwork:' + mode, 'モード': mode, '件数': ctx.watch.length + ctx.deadlines.length + ctx.newHigh.length, '結果': r.result, 'メモ': mode === 'dry' ? body.slice(0, 45000) : r.note }]);
  if (r.result === 'ドライ') Logger.log(body); // 公開情報のみの文面
  if (r.result === '成功') markNotified_(ss, ctx, today);
  return r;
}

/** 送れたものだけ「通知済」にする(失敗した日は、翌日に持ち越される) */
function markNotified_(ss, ctx, today) {
  var rows = readTab_(ss, TAB.SUBSIDY), byId = {};
  rows.forEach(function (r) { byId[r['ID']] = r; });
  ctx._newRows.forEach(function (n) { if (byId[n['ID']]) byId[n['ID']]['新着扱い'] = 'done'; });
  ctx.deadlines.forEach(function (d) { var r = byId[d._row['ID']]; if (r) r['締切通知済'] = deadlineLevel_(r['受付終了'], today); });
  writeTab_(ss, TAB.SUBSIDY, rows);
  var watch = readTab_(ss, TAB.WATCH);
  watch.forEach(function (w) { if (w['差分検知日']) w['通知済の日'] = w['差分検知日']; });
  writeTab_(ss, TAB.WATCH, watch);
}

/* ---------- トリガー・手動実行 ---------- */

function installTriggers() {
  var ss = openDb_(), st = getSettings_(ss);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'collectDaily' || f === 'sendMorning') ScriptApp.deleteTrigger(t);
  });
  var hCollect = Number(st.notify['収集の時刻(時)']) || 8, hSend = Number(st.notify['時刻(時)']) || 9;
  ScriptApp.newTrigger('collectDaily').timeBased().everyDays(1).atHour(hCollect).inTimezone('Asia/Tokyo').create();
  ScriptApp.newTrigger('sendMorning').timeBased().everyDays(1).atHour(hSend).inTimezone('Asia/Tokyo').create();
  Logger.log('トリガー設定: 収集 ' + hCollect + '時台 / 通知 ' + hSend + '時台(毎日)');
}

/** 手動テスト用: 収集→通知(ドライ/テスト)まで1回通す */
function runAllNow() { collectDaily(); return sendMorning(); }

/** 手動テスト用: テストの部屋へ短い確認メッセージを送る(CHATWORK_TOKEN と CHATWORK_TEST_ROOM_ID が必要) */
function sendTestPing() {
  var r = deliver_('test', '[info][title]補助金レーダー 接続テスト[/title]この投稿が見えれば、Chatworkへの送信は成功です。[/info]');
  Logger.log(r.result + ' ' + r.note);
  return r;
}

/**
 * テスト期間の確認用: 直近N日(既定7日)について、収集のエラー、通知の成功/失敗、件数を集計して、ログに出す。
 * 戻り値の days[] を見て、「取れなかった日」「送れなかった日」「誤検知らしい更新」を振り返る。
 */
function weeklyHealth(n) {
  n = n || 7;
  var ss = openDb_(), today = today_(), runs = readTab_(ss, TAB.RUNS), notices = readTab_(ss, TAB.NOTICE), hist = readTab_(ss, TAB.HISTORY);
  var days = [];
  for (var i = n - 1; i >= 0; i--) {
    var d = shiftDate_(today, -i);
    var rs = runs.filter(function (r) { return r['日付'] === d; });
    var ns = notices.filter(function (r) { return r['日付'] === d; });
    days.push({
      date: d,
      collected: rs.length > 0,
      errors: rs.filter(function (r) { return r['エラー']; }).map(function (r) { return r['情報源'] + ': ' + r['エラー']; }),
      notices: ns.map(function (r) { return r['モード'] + '/' + r['結果']; }),
      updates: hist.filter(function (r) { return r['検知した日'] === d; }).length
    });
  }
  var ok = days.filter(function (x) { return x.collected && !x.errors.length && x.notices.some(function (t) { return /成功|ドライ/.test(t); }); }).length;
  var res = { days: days, okDays: ok, total: n };
  Logger.log(JSON.stringify(res));
  return res;
}

function shiftDate_(ymd, delta) {
  var p = ymd.split('-'), t = new Date(Date.UTC(+p[0], p[1] - 1, +p[2]) + delta * 86400000);
  return t.getUTCFullYear() + '-' + pad2_(t.getUTCMonth() + 1) + '-' + pad2_(t.getUTCDate());
}
