/** 分布表の画像 → AI(Claude API)で読み取り → 内容そのままの表に作り直す */

var AI_MODEL_ = 'claude-opus-5-5';
var TABLE_KEYS_ = ['inputs.used_house.heatmap_image', 'inputs.used_mansion.heatmap_image', 'inputs.new_house.heatmap_image'];
function isTableKey_(key) { return TABLE_KEYS_.indexOf(key) >= 0; }
function tableValueKey_(key) { return 'tbl.' + key; }

function aiKey_() { return String(PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY') || '').trim(); }

/** 表データの検証と整形(純粋関数)。不正ならエラーを投げる */
function normalizeTable_(t) {
  if (!t || typeof t !== 'object') throw new Error('表のデータがありません。');
  var cols = (t.cols || []).map(function (x) { return String(x === null || x === undefined ? '' : x).trim().slice(0, 30); });
  var rows = (t.rows || []).map(function (x) { return String(x === null || x === undefined ? '' : x).trim().slice(0, 30); });
  if (!cols.length || !rows.length) throw new Error('表の列と行が空です。');
  if (cols.length > 30 || rows.length > 40) throw new Error('表が大きすぎます(30列・40行まで)。');
  var cells = rows.map(function (r, i) {
    var line = (t.cells && t.cells[i]) || [];
    return cols.map(function (c, j) {
      var v = line[j];
      if (v === null || v === undefined || String(v).trim() === '') return null;
      var n = parseNum_(v);
      if (n === undefined || n < 0) throw new Error('表の数値が正しくありません(' + (i + 1) + '行目・' + (j + 1) + '列目)。');
      return n;
    });
  });
  return { caption: String(t.caption || '').trim().slice(0, 60), cols: cols, rows: rows, cells: cells };
}

/** 表 → 描画用(heat_html_ の入力) */
function tableToHeat_(t) {
  var max = 0;
  t.cells.forEach(function (r) { r.forEach(function (v) { if (v > max) max = v; }); });
  return { cols: t.cols, rows: t.rows, grid: t.cells.map(function (r) { return r.map(function (v) { return v || 0; }); }), max: max || 1 };
}
function tableTotal_(t) { var s = 0; t.cells.forEach(function (r) { r.forEach(function (v) { s += v || 0; }); }); return s; }

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
function aiReadTable_(base64, mediaType, key, fetch) {
  if (!key) throw new Error('AIのAPIキーが未設定です。「設定」で入力してください。');
  var body = {
    model: AI_MODEL_, max_tokens: 8000, output_config: { effort: 'low' },
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      { type: 'text', text: TABLE_PROMPT_ }] }]
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
  var t = normalizeTable_(raw);
  t.warnings = (raw.warnings || []).map(String).slice(0, 10);
  return t;
}

function savedTable_(values, key) {
  var s = values[tableValueKey_(key)];
  if (!s) return null;
  try { return normalizeTable_(JSON.parse(s)); } catch (e) { return null; }
}

/** 保存済みの画像をAIで読み取り、表の候補を返す(保存はしない。画面で確認・修正してから保存) */
function api_readTable(areaId, key) {
  requireUser_();
  if (!isTableKey_(key)) throw new Error('この項目は表に作り直せません。');
  var a = areaById_(areaId);
  if (!a) throw new Error('エリアが見つかりません。');
  var ref = String(a.values[key] || '').match(/^drive:([A-Za-z0-9_-]+)$/);
  if (!ref) throw new Error('先に画像を登録してください。');
  var blob = DriveApp.getFileById(ref[1]).getBlob();
  var t = aiReadTable_(Utilities.base64Encode(blob.getBytes()), blob.getContentType(), aiKey_(), function (u, o) { return UrlFetchApp.fetch(u, o); });
  t.total = tableTotal_(t);
  return t;
}

function api_saveTable(areaId, key, table) {
  requireUser_();
  if (!isTableKey_(key)) throw new Error('この項目は表に作り直せません。');
  var t = normalizeTable_(table);
  writeAreaValues_(areaId, function (values) {
    values[tableValueKey_(key)] = JSON.stringify(t);
    var dk = dateKeyFor_(key); if (dk) values[dk] = todayStr_();
  });
  return { ok: true, total: tableTotal_(t) };
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
