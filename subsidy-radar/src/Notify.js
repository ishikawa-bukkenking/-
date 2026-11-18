/**
 * Notify.js — Chatwork への送信。
 * 認証情報はスクリプトのプロパティ(CHATWORK_TOKEN)。コード・ログ・シートには書かない。
 * 宛先の安全装置:
 *   dry  … 送らない(文面を通知の履歴に残すだけ)
 *   test … CHATWORK_TEST_ROOM_ID の部屋だけに送る
 *   prod … CHATWORK_PROD_ROOM_ID の部屋へ送る(依頼者の確認後に、モードを手で変える)
 */

function postChatwork_(roomId, body) {
  var token = props_().getProperty('CHATWORK_TOKEN');
  if (!token) throw new Error('CHATWORK_TOKEN が未設定です');
  var url = NOTIFY.CHATWORK_BASE + '/rooms/' + encodeURIComponent(roomId) + '/messages';
  for (var attempt = 0; attempt < 2; attempt++) {
    var res = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true, headers: { 'X-ChatWorkToken': token }, payload: { body: body, self_unread: '0' } });
    var code = res.getResponseCode();
    if (code === 200) return;
    if (code === 429 && attempt === 0) { Utilities.sleep(10000); continue; } // 公式の案内: 10秒ほど待ってリトライ
    throw new Error('Chatwork HTTP ' + code);
  }
}

function roomFor_(mode) {
  if (mode === 'test') return props_().getProperty('CHATWORK_TEST_ROOM_ID') || '';
  if (mode === 'prod') return props_().getProperty('CHATWORK_PROD_ROOM_ID') || '';
  return '';
}

/** 戻り値: {mode, result:'成功'|'失敗'|'ドライ', note} */
function deliver_(mode, body) {
  if (mode === 'dry') return { mode: mode, result: 'ドライ', note: '送信なし' };
  var room = roomFor_(mode);
  if (!room) return { mode: mode, result: '失敗', note: '宛先の部屋が未設定です(' + mode + ')' };
  try { postChatwork_(room, body); return { mode: mode, result: '成功', note: '' }; }
  catch (e) { return { mode: mode, result: '失敗', note: safeError_(e) }; }
}
