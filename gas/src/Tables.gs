/** 分布表の画像 → AI(Claude API)で読み取り → 内容そのままの表に作り直す */

var AI_MODEL_ = 'claude-opus-5-5';
var TREND_KEY_ = 'inputs.price_trend.image';
var STATION_KEYS_ = ['inputs.land.station_image', 'inputs.used_house.station_image', 'inputs.used_mansion.station_image', 'inputs.new_house.station_image'];
var TABLE_KEYS_ = [TREND_KEY_, 'inputs.used_house.heatmap_image', 'inputs.used_mansion.heatmap_image', 'inputs.new_house.heatmap_image'].concat(STATION_KEYS_);
function isTableKey_(key) { return TABLE_KEYS_.indexOf(key) >= 0; }
function isStationKey_(key) { return STATION_KEYS_.indexOf(key) >= 0; }
function tableValueKey_(key) { return 'tbl.' + key; }

function aiKey_() { return String(PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY') || '').trim(); }

/** 表データの検証と整形(純粋関数)。不正ならエラーを投げる */
function normalizeTable_(t, allowNeg) {
  if (!t || typeof t !== 'object') throw new Error('表のデータがありません。');
  var cols = (t.cols || []).map(function (x) { return String(x === null || x === undefined ? '' : x).trim().slice(0, 30); });
  var rows = (t.rows || []).map(function (x) { return String(x === null || x === undefined ? '' : x).trim().slice(0, 30); });
  if (!cols.length || !rows.length) throw new Error('表の列と行が空です。');
  if (cols.length > 60 || rows.length > 40) throw new Error('表が大きすぎます(60列・40行まで)。');
  var cells = rows.map(function (r, i) {
    var line = (t.cells && t.cells[i]) || [];
    return cols.map(function (c, j) {
      var v = line[j];
      if (v === null || v === undefined || String(v).trim() === '') return null;
      var n = parseNum_(v);
      if (n === undefined || (n < 0 && !allowNeg)) throw new Error('表の数値が正しくありません(' + (i + 1) + '行目・' + (j + 1) + '列目)。');
      return n;
    });
  });
  var out = { caption: String(t.caption || '').trim().slice(0, 60), cols: cols, rows: rows, cells: cells };
  if (allowNeg) { out.type = t.type === 'bar' ? 'bar' : 'line'; out.unit = String(t.unit || '').trim().slice(0, 10); }   // 価格推移グラフ: 折れ線/棒と単位
  return out;
}

/** 路線・駅別の物件数(純粋関数): { caption, cols:['物件数'], lines:[路線名], rows:[駅名], cells:[[件数]] }。路線名・駅名のどちらかと件数がある行だけ残す */
function normalizeStationTable_(t) {
  if (!t || typeof t !== 'object') throw new Error('表のデータがありません。');
  var rows = t.rows || [], lines = t.lines || [], cells = t.cells || [], out = { caption: String(t.caption || '').trim().slice(0, 60), cols: ['物件数'], lines: [], rows: [], cells: [] };
  if (rows.length > 150) throw new Error('行が多すぎます(150行まで)。');
  rows.forEach(function (st, i) {
    var line = String(lines[i] === null || lines[i] === undefined ? '' : lines[i]).trim().slice(0, 30), name = String(st === null || st === undefined ? '' : st).trim().replace(/[~～]/g, '〜').slice(0, 60);
    var raw = (cells[i] || [])[0], blank = raw === null || raw === undefined || String(raw).trim() === '';
    if (!line && !name && blank) return;   // 空の行は無視
    if (!line && !name) throw new Error('路線名か駅名を入力してください(' + (i + 1) + '行目)。');
    var n = blank ? null : parseNum_(raw);
    if (n === undefined || (n !== null && (n < 0 || n !== Math.floor(n)))) throw new Error('物件数は0以上の整数で入力してください(' + (i + 1) + '行目)。');
    out.lines.push(line); out.rows.push(name); out.cells.push([n]);
  });
  return out;
}

function stnId_(line, st) { return (line || '') + '\u0001' + st; }
/**
 * 路線・駅を、他の物件種別の表にも反映する(件数は種別ごとなので、反映しない。入力済みの件数は残す)。
 * - 保存した表の路線・駅が、他の表に無ければ、件数を空にして追加する(並びは保存した表に合わせる)
 * - 他の表にだけある行は、件数が入っていれば残し(末尾)、件数が空なら消す(保存した表と同じ路線・駅にそろえる)。消す前の表は「ひとつ前に戻す」で戻せる
 * values を書き換え、{ キー: 表 } を返す。表示しない種別(show.*=0)は対象外
 */
function syncStationTables_(values, srcKey, src) {
  var out = {};
  STATION_KEYS_.forEach(function (k) {
    if (k === srcKey) return;
    if (values['show.' + k.split('.')[1]] === '0') return;
    var cur = savedTable_(values, k), have = {}, used = {}, lines = [], rows = [], cells = [];
    if (cur) cur.rows.forEach(function (r, i) { have[stnId_(cur.lines[i], r)] = cur.cells[i][0]; });
    src.rows.forEach(function (r, i) {
      var id = stnId_(src.lines[i], r);
      lines.push(src.lines[i] || ''); rows.push(r); cells.push([have[id] === undefined ? null : have[id]]); used[id] = 1;
    });
    if (cur) cur.rows.forEach(function (r, i) { if (!used[stnId_(cur.lines[i], r)] && cur.cells[i][0] !== null) { lines.push(cur.lines[i] || ''); rows.push(r); cells.push([cur.cells[i][0]]); } });
    var t = { caption: cur ? cur.caption : '', cols: ['物件数'], lines: lines, rows: rows, cells: cells };
    putStationTable_(values, k, t); out[k] = t;
  });
  return out;
}

/** 路線・駅の表を保存する。書き換える前の表は1つ前の版として残す(「ひとつ前に戻す」用) */
function putStationTable_(values, key, t) {
  var old = values[tableValueKey_(key)], nw = JSON.stringify({ caption: t.caption, cols: t.cols, lines: t.lines, rows: t.rows, cells: t.cells });
  if (old && old !== nw && old.length < 2500) values['tblprev.' + key] = old;   // 1つ前の版は小さい表だけ残す(入力データの大きさの上限に近づけないため)
  values[tableValueKey_(key)] = nw;
}

/** 表 → 描画用(heat_html_ の入力) */
function tableToHeat_(t) {
  var max = 0;
  t.cells.forEach(function (r) { r.forEach(function (v) { if (v > max) max = v; }); });
  return { cols: t.cols, rows: t.rows, grid: t.cells.map(function (r) { return r.map(function (v) { return v || 0; }); }), max: max || 1 };
}
function tableTotal_(t) { var s = 0; t.cells.forEach(function (r) { r.forEach(function (v) { s += v || 0; }); }); return s; }

var TREND_PROMPT_ = [
  'この画像は、不動産の価格推移の折れ線グラフです。グラフの内容を読み取って表にしてください。',
  '- cols に横軸の時点ラベル(年月など)を左から順に、rows に線(系列)の名前(凡例や線の脇の表記。マンション・戸建て・土地など)を書きます。',
  '- cells は、各系列の各時点の値です。グラフに数値が書かれていればその値を、無ければ縦軸の目盛りから読み取った値にします。',
  '- 線が途切れていて値が読めない時点は null にします。読み取りが概算になる場合は、warnings に日本語で書いてください。',
  '- グラフが折れ線なら type は "line"、棒グラフなら "bar" にします。縦軸の単位(万円、%、指数など)が分かれば unit に書きます(不明なら空文字)。',
  '- 縦軸の指数の基準などの補足が画像にあれば caption に書き写します(無ければ空文字)。',
  '次のJSONだけを返してください(説明文やコードブロックは付けない)。',
  '{"type":"line","unit":"","caption":"","cols":["時点",...],"rows":["系列名",...],"cells":[[数値またはnull,...],...],"warnings":["..."]}',
  'cells は rows と同じ行数、cols と同じ列数にしてください。'
].join('\n');

var TABLE_PROMPT_ = [
  'この画像は、不動産の「面積×価格」の分布表(ヒートマップ)です。表の内容を、一切変えずに正確に読み取ってください。',
  '- 行見出し(面積の区分など)、列見出し(価格の区分など)、各セルの数値を、画像に書かれているとおり書き写します。',
  '- 色の濃さではなく、セルに書かれている数字を読み取ります。数字が書かれていない空欄のセルは null にします。',
  '- 読み取れない・自信がない数値は推測せず null にし、warnings にその位置を日本語で書きます。',
  '- caption には、表のタイトルや単位の説明が画像にあれば書き写します(無ければ空文字)。',
  '次のJSONだけを返してください(説明文やコードブロックは付けない)。',
  '{"caption":"","cols":["列見出し",...],"rows":["行見出し",...],"cells":[[数値またはnull,...],...],"warnings":["..."]}',
  'cells は rows と同じ行数、cols と同じ列数にしてください。'
].join('\n');

function extractJson_(text) {
  var a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('AIの返答から表を読み取れませんでした。');
  return JSON.parse(text.slice(a, b + 1));
}

/** Claude API で画像を読み取る。fetch は UrlFetchApp.fetch 互換(テスト用に差し替え可) */
function aiReadTable_(base64, mediaType, key, fetch, kind) {
  if (!key) throw new Error('AIのAPIキーが未設定です。「設定」で入力してください。');
  var body = {
    model: AI_MODEL_, max_tokens: 8000, output_config: { effort: 'low' },
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      { type: 'text', text: kind === 'trend' ? TREND_PROMPT_ : TABLE_PROMPT_ }] }]
  };
  var res = fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, payload: JSON.stringify(body)
  });
  var code = res.getResponseCode(), txt = res.getContentText();
  if (code === 401 || code === 403) throw new Error('AIのAPIキーが正しくないか、権限がありません(' + code + ')。');
  if (code === 429) throw new Error('AIの利用制限に達しました。少し待ってからやり直してください。');
  if (code !== 200) { var m = ''; try { m = JSON.parse(txt).error.message; } catch (e) { m = txt.slice(0, 200); } throw new Error('AIの呼び出しに失敗しました(' + code + '): ' + m); }
  var r = JSON.parse(txt);
  if (r.stop_reason === 'refusal') throw new Error('AIがこの画像の読み取りを行えませんでした。手入力してください。');
  if (r.stop_reason === 'max_tokens') throw new Error('表が大きすぎて読み取りきれませんでした。');
  var text = (r.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  var raw = extractJson_(text);
  var t = normalizeTable_(raw, kind === 'trend');
  t.warnings = (raw.warnings || []).map(String).slice(0, 10);
  return t;
}

function savedTable_(values, key) {
  var s = values[tableValueKey_(key)];
  if (!s) return null;
  try { return isStationKey_(key) ? normalizeStationTable_(JSON.parse(s)) : normalizeTable_(JSON.parse(s), key === TREND_KEY_); } catch (e) { return null; }
}

/** 保存済みの画像をAIで読み取る。save=true なら表として自動保存(貼り付け時)。false は候補を返すだけ */
function api_readTable(areaId, key, save) {
  requireUser_();
  if (!isTableKey_(key) || isStationKey_(key)) throw new Error('この項目は表に作り直せません(路線・駅別の物件数は手入力です)。');
  var a = areaById_(areaId);
  if (!a) throw new Error('エリアが見つかりません。');
  var ref = String(a.values[key] || '').match(/^drive:([A-Za-z0-9_-]+)$/);
  if (!ref) throw new Error('先に画像を登録してください。');
  var blob = DriveApp.getFileById(ref[1]).getBlob();
  var t = aiReadTable_(Utilities.base64Encode(blob.getBytes()), blob.getContentType(), aiKey_(), function (u, o) { return UrlFetchApp.fetch(u, o); }, key === TREND_KEY_ ? 'trend' : 'table');
  t.total = tableTotal_(t);
  if (save) {   // 貼り付けたら自動で表にして保存する(あとから画面で直せる)
    writeAreaValues_(areaId, function (values) {
      if (values[key] !== a.values[key]) throw new Error('画像が差し替えられました。もう一度やり直してください。');
      values[tableValueKey_(key)] = JSON.stringify(t);
      var dk = dateKeyFor_(key); if (dk) values[dk] = todayStr_();
    });
  }
  return t;
}

function api_saveTable(areaId, key, table) {
  requireUser_();
  if (!isTableKey_(key)) throw new Error('この項目は表に作り直せません。');
  var t = isStationKey_(key) ? normalizeStationTable_(table) : normalizeTable_(table, key === TREND_KEY_);
  if (isStationKey_(key)) t.lines.forEach(function (ln, i) { if (!ln) throw new Error('路線名を入力してください(' + (i + 1) + '行目: ' + (t.rows[i] || '') + ')。不要な行は「×」で削除するか、「路線名が空の行を削除」を押してください。'); });
  var synced = {};
  writeAreaValues_(areaId, function (values) {
    var dk = dateKeyFor_(key); if (dk) values[dk] = todayStr_();
    if (isStationKey_(key)) { putStationTable_(values, key, t); synced = syncStationTables_(values, key, t); }   // 路線・駅は他の種別にも反映
    else values[tableValueKey_(key)] = JSON.stringify(t);
  });
  return { ok: true, total: tableTotal_(t), table: t, synced: synced };
}

/** 他の物件種別の表にある路線・駅を、この表に取り込む(いまの行と件数は残し、無い行を件数を空で足す) */
function api_stationFromOthers(areaId, key) {
  requireUser_();
  if (!isStationKey_(key)) throw new Error('この項目は路線・駅の表ではありません。');
  var res = null;
  writeAreaValues_(areaId, function (values) {
    var cur = savedTable_(values, key) || { caption: '', cols: ['物件数'], lines: [], rows: [], cells: [] }, add = 0, seen = {};
    cur.rows.forEach(function (r, i) { seen[stnId_(cur.lines[i], r)] = 1; });
    STATION_KEYS_.forEach(function (k) {
      var o = k === key ? null : savedTable_(values, k);
      if (o) o.rows.forEach(function (r, i) { var id = stnId_(o.lines[i], r); if (!seen[id]) { seen[id] = 1; cur.lines.push(o.lines[i] || ''); cur.rows.push(r); cur.cells.push([null]); add++; } });
    });
    if (!add) throw new Error('取り込める路線・駅が、他の物件種別にありません。');
    putStationTable_(values, key, cur); res = { table: cur, added: add, total: tableTotal_(cur) };
  });
  return res;
}

/** 路線名が空の行(路線・駅の表に混ざった余分な行)を、このエリアの全種別の表から削除する */
function api_stationCleanup(areaId) {
  requireUser_();
  var removed = 0, tables = {};
  writeAreaValues_(areaId, function (values) {
    STATION_KEYS_.forEach(function (k) {
      var t = savedTable_(values, k);
      if (!t) return;
      var lines = [], rows = [], cells = [];
      t.rows.forEach(function (r, i) { if (t.lines[i]) { lines.push(t.lines[i]); rows.push(r); cells.push(t.cells[i]); } else removed++; });
      if (rows.length === t.rows.length) { tables[k] = t; return; }
      var nt = { caption: t.caption, cols: ['物件数'], lines: lines, rows: rows, cells: cells };
      if (rows.length) putStationTable_(values, k, nt); else { values['tblprev.' + k] = values[tableValueKey_(k)]; delete values[tableValueKey_(k)]; nt = null; }
      tables[k] = nt;
    });
  });
  return { removed: removed, tables: tables };
}

/** 路線・駅の表を、ひとつ前の版に戻す(いまの表は入れ替わりで「ひとつ前」になる) */
function api_stationUndo(areaId, key) {
  requireUser_();
  if (!isStationKey_(key)) throw new Error('この項目は路線・駅の表ではありません。');
  var res = null;
  writeAreaValues_(areaId, function (values) {
    var prev = values['tblprev.' + key];
    if (!prev) throw new Error('戻せる内容がありません。');
    var now = values[tableValueKey_(key)];
    values[tableValueKey_(key)] = prev;
    if (now && now.length < 2500) values['tblprev.' + key] = now; else delete values['tblprev.' + key];
    var t = savedTable_(values, key); res = { table: t, total: t ? tableTotal_(t) : 0 };
  });
  return res;
}

function api_deleteTable(areaId, key) {
  requireUser_();
  if (!isTableKey_(key)) throw new Error('この項目は表に作り直せません。');
  writeAreaValues_(areaId, function (values) { delete values[tableValueKey_(key)]; });
  return { ok: true };
}

/** 設定画面: APIキーの保存(空なら削除)。キーはスクリプトのプロパティに保存し、画面や共有には出さない */
function api_ai_set(key) {
  requireUser_();
  key = String(key || '').trim();
  var p = PropertiesService.getScriptProperties();
  if (!key) { p.deleteProperty('ANTHROPIC_KEY'); return { set: false }; }
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) throw new Error('APIキーの形式が正しくありません(sk-ant- で始まる文字列)。');
  p.setProperty('ANTHROPIC_KEY', key);
  return { set: true };
}

/** 価格推移の表(行=系列、列=時点) → 描画用の系列データ */
function trendTableToSeries_(t) {
  var s = { labels: t.cols.slice(), type: t.type || 'line', unit: t.unit || '' };
  t.rows.forEach(function (name, i) { if (name) s[name] = t.cells[i].slice(); });
  return s;
}
