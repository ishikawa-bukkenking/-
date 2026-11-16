/**
 * 助成金シミュレーター(物件王・社内専用)
 * このスクリプトは、HTMLを返すだけです。入力した数字は、サーバーに送られません(計算はブラウザの中だけ)。
 * ?page=test を付けると、印刷(window.print)の動作確認ページが開きます。
 */
function doGet(e) {
  var page = e && e.parameter && e.parameter.page === 'test' ? 'test' : 'index';
  return HtmlService.createHtmlOutputFromFile(page)
    .setTitle('助成金シミュレーター')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
