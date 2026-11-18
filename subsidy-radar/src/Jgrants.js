/**
 * Jgrants.js — Jグランツ API(デジタル庁)から集める。
 * 公式の API 仕様: https://developers.digital.go.jp/documents/jgrants/api/
 *  - 一覧 GET /v1/public/subsidies … keyword(2文字以上)・sort・order・acceptance が必須。認証なし
 *  - 詳細 GET /v2/public/subsidies/id/{id}
 * ポータルのページ(www.jgrants-portal.go.jp)は robots.txt で禁止のため、取得しない。リンクとして出すだけ。
 * 取れないもの: 実施機関・公開日・更新日(API に無い)→ 空欄のまま(推測しない)。
 */

function jgGet_(path, params) {
  var qs = params ? '?' + Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&') : '';
  var res = UrlFetchApp.fetch(JGRANTS.BASE + path + qs, { muteHttpExceptions: true, headers: { 'User-Agent': WATCH.USER_AGENT, 'Accept': 'application/json' } });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('HTTP ' + code);
  return JSON.parse(res.getContentText());
}

function kindOf_(title) {
  var t = nfkc_(title);
  return t.indexOf('助成金') >= 0 ? '助成金' : (t.indexOf('補助金') >= 0 ? '補助金' : 'その他');
}

function excerptFrom_(html) {
  var t = nfkc_(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/■[^\s]*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  var i = t.indexOf('。');
  return (i > 0 && i < 100 ? t.slice(0, i + 1) : t.slice(0, 100));
}

/** 一覧の1件 → 制度の行 */
function jgFromList_(it, today) {
  var start = isoToJstDate_(it.acceptance_start_datetime), end = isoToJstDate_(it.acceptance_end_datetime);
  // API は未設定の上限額を 0 で返すことがある。「0円」と見せると誤解を招くので、0 は空欄(要確認)にする
  var lim = (it.subsidy_max_limit == null || it.subsidy_max_limit === '' || Number(it.subsidy_max_limit) <= 0) ? '' : Number(it.subsidy_max_limit);
  var review = [];
  if (!start) review.push('受付開始'); if (!end) review.push('受付終了'); if (lim === '') review.push('上限額');
  return {
    'ID': 'jgrants:' + it.id, '名前': it.title || '', '実施機関': '', '種別': kindOf_(it.title), '地域': it.target_area_search || '',
    '対象': it.target_number_of_employees || '', '上限額': lim, '補助率': '', '受付開始': start, '受付終了': end, '公開日': '', '更新日': '',
    '元のリンク': 'https://www.jgrants-portal.go.jp/subsidy/' + it.id, '出典': JGRANTS.SOURCE_NAME, '短い抜粋': '',
    '状態': statusOf_(start, end, today), '要確認': review.join(','), '情報源': 'jgrants', '詳細取得済': ''
  };
}

var JG_TRACKED = ['名前', '受付開始', '受付終了', '上限額', '地域', '対象', '補助率'];

function jgCoreHash_(row) { return sha256Hex_(JG_TRACKED.map(function (k) { return row[k]; }).join('|')); }

function jgApplyDetail_(row, d) {
  row['補助率'] = d.subsidy_rate || '';
  row['利用目的'] = d.use_purpose || '';
  row['業種'] = d.industry || '';
  row['短い抜粋'] = excerptFrom_(d.subsidy_catch_phrase || d.detail);
  if (d.front_subsidy_detail_page_url && /^https:\/\/www\.jgrants-portal\.go\.jp\//.test(d.front_subsidy_detail_page_url)) row['元のリンク'] = d.front_subsidy_detail_page_url;
  row['詳細取得済'] = 'Y';
  return row;
}

/**
 * 収集。戻り値: {ok, count, added, updated, error, rows(全制度の配列に反映済み)}
 * ctx: {ss, settings, today, rowsById(既存), history(配列。追記用), initial}
 */
function collectJgrants_(ctx) {
  var out = { ok: true, count: 0, added: 0, updated: 0, error: '' }, seen = {};
  try {
    for (var i = 0; i < JGRANTS_KEYWORDS.length; i++) {
      if (i > 0) Utilities.sleep(JGRANTS.WAIT_MS);
      var data = jgGet_('/v1/public/subsidies', { keyword: JGRANTS_KEYWORDS[i], sort: JGRANTS.SORT, order: JGRANTS.ORDER, acceptance: JGRANTS.ACCEPTANCE });
      (data.result || []).forEach(function (it) { if (it && it.id) seen[it.id] = it; });
    }
  } catch (e) {
    out.ok = false; out.error = safeError_(e); // 失敗したら繰り返し叩かない。ここまでの分は保存する
  }
  var ids = Object.keys(seen);
  out.count = ids.length;
  var needDetail = [];
  ids.forEach(function (id) {
    var fresh = jgFromList_(seen[id], ctx.today), key = fresh['ID'], old = ctx.rowsById[key];
    if (!old) {
      fresh['初めて見つけた日'] = ctx.today; fresh['最後に見た日'] = ctx.today;
      fresh['新着扱い'] = ctx.initial ? 'N' : 'Y'; fresh['内容のハッシュ'] = jgCoreHash_(fresh);
      ctx.rowsById[key] = fresh; ctx.order.push(key); out.added++; needDetail.push(key);
      return;
    }
    old['最後に見た日'] = ctx.today;
    var changed = false;
    ['名前', '受付開始', '受付終了', '上限額', '地域', '対象'].forEach(function (k) {
      if (String(old[k]) !== String(fresh[k])) {
        if (old[k] !== '' && old[k] != null) ctx.history.push({ '検知した日': ctx.today, '制度ID': key, '名前': fresh['名前'], '変わった項目': k, '前の値': old[k], '後の値': fresh[k] });
        old[k] = fresh[k]; changed = true;
      }
    });
    old['要確認'] = fresh['要確認'];
    if (changed) { old['詳細取得済'] = ''; out.updated++; if (old['受付終了']) old['締切通知済'] = ''; }
    if (old['詳細取得済'] !== 'Y') needDetail.push(key);
  });
  // 詳細は、新着・変更・未取得のものだけ。1回の上限を超えた分は翌日に回す
  var n = 0;
  for (var j = 0; j < needDetail.length && n < JGRANTS.MAX_DETAIL_PER_RUN && out.ok; j++, n++) {
    var row = ctx.rowsById[needDetail[j]];
    try {
      Utilities.sleep(JGRANTS.WAIT_MS);
      var d = jgGet_('/v2/public/subsidies/id/' + row['ID'].replace('jgrants:', ''));
      var det = d.result && d.result[0] ? d.result[0] : d;
      var prevRate = row['補助率'];
      jgApplyDetail_(row, det);
      if (prevRate && prevRate !== row['補助率']) ctx.history.push({ '検知した日': ctx.today, '制度ID': row['ID'], '名前': row['名前'], '変わった項目': '補助率', '前の値': prevRate, '後の値': row['補助率'] });
    } catch (e) {
      out.ok = false; out.error = safeError_(e); break;
    }
  }
  return out;
}
