// 路線・駅版(パターン2)を、Googleのサービスを模擬して確認する。入力(JSON, stdin): { geoDir } 出力: JSON
const fs = require('fs');
const vm = require('vm');
const { makeEnv } = require('./mockgas');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const ctx = makeEnv(input.geoDir); ctx.__input = input;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
ctx.__png = PNG;
const r = vm.runInContext(`(function () {
  var r = {}; setupSheets_(ss_()); __setEmail('ishikawa@bukkenking.com');
  PropertiesService.getScriptProperties().setProperty('ANTHROPIC_KEY', 'sk-ant-testtesttesttesttesttest');
  var std = api_create_company('株式会社標準', '長野県', '上田市'), stn = api_create_company('株式会社駅', '長野県', '上田市', 'station');
  var gs = api_get(std.areaId), gt = api_get(stn.areaId);
  var keys = function (g) { return g.fields.filter(function (f) { return f.k; }).map(function (f) { return f.k; }); };
  r.pattern = [gs.pattern, gt.pattern];
  r.fields = [keys(gs).indexOf('inputs.used_house.listings') >= 0, keys(gs).some(function (k) { return /station_image/.test(k); }),
              keys(gt).indexOf('inputs.used_house.listings') >= 0, keys(gt).filter(function (k) { return /station_image/.test(k); }).length];
  var base = { 'inputs.area.households': '12000', 'inputs.used_house.price_man': '3550', 'inputs.land.tsubo_price_man': '25', 'inputs.land.price_man': '3310' };
  api_save(stn.areaId, base);
  // 手入力
  var sv = api_saveTable(stn.areaId, 'inputs.used_house.station_image', { lines: ['JR中央線', 'JR中央線', '', ''], rows: ['上田駅', '西上田駅', '', ''], cells: [['120'], ['35'], [''], ['']] });
  r.save = [sv.total, sv.table.rows, sv.table.lines];
  var bad; try { api_saveTable(stn.areaId, 'inputs.used_house.station_image', { lines: ['A'], rows: ['B'], cells: [['x']] }); bad = ''; } catch (e) { bad = e.message; } r.bad = bad.indexOf('整数') >= 0;
  var bad2; try { api_saveTable(stn.areaId, 'inputs.used_house.station_image', { lines: [''], rows: [''], cells: [['5']] }); bad2 = ''; } catch (e) { bad2 = e.message; } r.bad2 = bad2.indexOf('路線名か駅名') >= 0;
  var b = buildArea_(stn.areaId), m = b.model;
  r.listings = [m.used_house.listings, m.pattern, m.totals.listings_total];
  r.html = [b.html.indexOf('class="stn-blk"') > 0, b.html.indexOf('JR中央線') > 0, b.html.indexOf('上田駅') > 0, b.html.indexOf('合計 <b>155件</b>') > 0, b.html.indexOf('中古戸建ての相場は<span class="em">3,550万円</span>、物件数は<span class="em">155件</span>') > 0];
  r.stdHtml = buildArea_(std.areaId).html.indexOf('stn-blk"') < 0 && buildArea_(std.areaId).html.indexOf('class="stn-blk"') < 0;
  r.missing = buildArea_(stn.areaId).report.missing().map(function (i) { return i.key; }).filter(function (k) { return /stations|listings/.test(k); }).sort();
  // 画像の入力はない(アップロードも、AIの読み取りも使えない)
  var noImg; try { api_uploadImage(stn.areaId, 'inputs.land.station_image', __png); noImg = ''; } catch (e) { noImg = e.message; }
  var noAi; try { api_readTable(stn.areaId, 'inputs.land.station_image', true); noAi = ''; } catch (e) { noAi = e.message; }
  r.noImage = [noImg.indexOf('登録できない') >= 0, noAi.indexOf('手入力') >= 0, api_get(stn.areaId).fields.filter(function (f) { return /station_image/.test(f.k || ''); }).every(function (f) { return f.t === 'stations'; })];
  api_saveTable(stn.areaId, 'inputs.land.station_image', { lines: ['JR中央線', 'JR中央線', 'しなの鉄道'], rows: ['上田駅', '西上田駅', '大屋駅'], cells: [['120'], ['35'], ['']] });
  var m2 = buildArea_(stn.areaId).model;
  r.land = [m2.land.listings, !!m2.land.stations, JSON.stringify(m2).indexOf('station_image') < 0];
  // 保存した路線・駅は、他の種別にも反映される(件数は種別ごと・件数が入っている行は残る)
  api_saveTable(stn.areaId, 'inputs.used_mansion.station_image', { lines: ['しなの鉄道', 'JR中央線'], rows: ['大屋駅', '上田駅'], cells: [['7'], ['']] });
  var sy = api_saveTable(stn.areaId, 'inputs.used_house.station_image', { lines: ['JR中央線', 'JR中央線', 'しなの鉄道'], rows: ['上田駅', '西上田駅', '上田駅'], cells: [['120'], ['35'], ['']] });
  var tm = api_get(stn.areaId).tables['inputs.used_mansion.station_image'], tn = api_get(stn.areaId).tables['inputs.new_house.station_image'];
  r.sync = [Object.keys(sy.synced).sort().length, tm.rows, tm.lines, tm.cells.map(function (c) { return c[0]; }), tn.rows, tn.cells.map(function (c) { return c[0]; })];
  var mm = buildArea_(stn.areaId).model;
  r.syncList = [mm.used_mansion.listings, mm.new_house.listings];   // 件数が空なら物件数は未入力(0件にしない)
  var tl = api_get(stn.areaId).tables['inputs.land.station_image'];
  r.syncLand = tl.rows;   // AIで読んだ土地の表(上田駅・西上田駅・大屋駅)に、保存した駅が加わり、件数が入っている行は残る
  api_save(stn.areaId, { 'show.new_house': '0' });
  var sy2 = api_saveTable(stn.areaId, 'inputs.used_house.station_image', { lines: ['JR中央線'], rows: ['上田駅'], cells: [['120']] });
  r.syncHidden = Object.keys(sy2.synced).indexOf('inputs.new_house.station_image') < 0;
  api_save(stn.areaId, { 'show.new_house': '' });
  api_saveTable(stn.areaId, 'inputs.used_house.station_image', { lines: ['JR中央線', 'JR中央線', 'しなの鉄道', 'JR篠ノ井線'], rows: ['上田駅', '西上田駅', '大屋駅', '篠ノ井駅'], cells: [['1'], [''], [''], ['44']] });
  api_saveTable(stn.areaId, 'inputs.used_house.station_image', { lines: ['JR中央線', 'JR中央線', 'しなの鉄道', 'JR篠ノ井線'], rows: ['上田駅', '西上田駅', '大屋駅', '篠ノ井駅'], cells: [['120'], ['35'], [''], ['44']] });
  // ひとつ前に戻す/他の種別から取り込む
  var un = api_stationUndo(stn.areaId, 'inputs.used_house.station_image');
  r.undo = [un.table.cells.map(function (c) { return c[0]; }), api_get(stn.areaId).prevs['inputs.used_house.station_image']];
  var noPrev; try { api_stationUndo(stn.areaId, 'inputs.new_house.station_image'); noPrev = ''; } catch (e) { noPrev = e.message; } r.noPrev = noPrev.indexOf('戻せる内容') >= 0 || r.undo.length > 0;
  api_deleteTable(stn.areaId, 'inputs.new_house.station_image');
  var fo = api_stationFromOthers(stn.areaId, 'inputs.new_house.station_image');
  r.fromOthers = [fo.added > 0, fo.table.cells.every(function (c) { return c[0] === null; })];
  // 路線ごとに「○○駅〜○○駅」(1駅だけも可)。「~」は「〜」にそろえる
  var rg = api_saveTable(stn.areaId, 'inputs.used_house.station_image', { lines: ['JR中央線', '上田電鉄別所線', '大糸線'], rows: ['上田駅~屋代駅', '上田駅〜別所温泉駅', '松本駅'], cells: [['10'], ['20'], ['5']] });
  var h = buildArea_(stn.areaId).html;
  r.range = [rg.table.rows, h.indexOf('上田駅〜屋代駅') > 0, h.indexOf('class="stn-range">松本駅') > 0, rg.total];
  // 路線と駅名だけ(件数は空)を保存しても、他の種別に反映される。件数は反映しない
  var c3 = api_create_company('株式会社名前だけ', '長野県', '上田市', 'station').areaId;
  var n1 = api_saveTable(c3, 'inputs.land.station_image', { lines: ['JR中央線', '大糸線'], rows: ['上田駅〜屋代駅', '松本駅'], cells: [[''], ['']] });
  var g3 = api_get(c3).tables;
  r.namesOnly = [Object.keys(n1.synced).length, ['used_house', 'used_mansion', 'new_house'].map(function (t) { var x = g3['inputs.' + t + '.station_image']; return [x.lines.join('/'), x.rows.join('/'), x.cells.map(function (c) { return c[0]; }).join(',')].join('|'); })];
  api_saveTable(c3, 'inputs.land.station_image', { lines: ['JR中央線', '大糸線', '篠ノ井線'], rows: ['上田駅〜屋代駅', '松本駅', '篠ノ井駅'], cells: [['100'], ['50'], ['']] });
  var g4 = api_get(c3).tables['inputs.used_house.station_image'];
  r.noCounts = [g4.rows.length, g4.cells.every(function (c) { return c[0] === null; })];
  // 路線名が空の行(混ざった余分な行)は、まとめて削除できる。保存時は路線名を必須にする
  var c5 = api_create_company('株式会社掃除', '長野県', '上田市', 'station').areaId;
  writeAreaValues_(c5, function (v) {
    v['tbl.inputs.land.station_image'] = JSON.stringify({ caption: '', cols: ['物件数'], lines: ['東急多摩川線', '', '', ''], rows: ['多摩川〜蒲田', '〜450m²', '400〜450m²', '350〜400m²'], cells: [[5], [null], [null], [null]] });
    v['tbl.inputs.used_house.station_image'] = JSON.stringify({ caption: '', cols: ['物件数'], lines: ['', ''], rows: ['〜50m²', '50〜100m²'], cells: [[null], [null]] });
  });
  var bs; try { api_saveTable(c5, 'inputs.land.station_image', { lines: ['東急多摩川線', '', ''], rows: ['多摩川〜蒲田', '〜450m²', '400〜450m²'], cells: [['5'], [''], ['']] }); bs = ''; } catch (e) { bs = e.message; }
  var cl = api_stationCleanup(c5), tt = api_get(c5).tables;
  r.cleanup = [bs.indexOf('路線名を入力') >= 0, cl.removed, tt['inputs.land.station_image'].rows, tt['inputs.used_house.station_image']];
  // 保存した路線・駅と同じにそろう: 他の種別にだけある、件数が空の行は消え、件数が入っている行は残る
  var c6 = api_create_company('株式会社そろえる', '長野県', '上田市', 'station').areaId;
  api_saveTable(c6, 'inputs.used_house.station_image', { lines: ['東急東横', '東急東横', '東急多摩川', '東急池上'], rows: ['田園調布〜多摩川', '田園調布', '多摩川〜蒲田', '長原〜蒲田'], cells: [[''], [''], [''], ['7']] });
  api_saveTable(c6, 'inputs.land.station_image', { lines: ['東急池上', '東急多摩川', '東急大井', '東急東横'], rows: ['長原〜蒲田', '多摩川〜矢口渡', '北千束〜大岡山', '田園調布'], cells: [['63'], ['20'], [''], ['']] });
  var al = api_get(c6).tables['inputs.used_house.station_image'];
  r.mirror = [al.lines.join('/'), al.rows.join('/'), al.cells.map(function (c) { return c[0]; }).join(',')];
  // 入力データが大きいとき(GAS版は1セル5万文字の制限): 保存できないときは、理由と大きさをエラーで知らせる
  var c7 = api_create_company('株式会社大きい', '長野県', '上田市', 'station').areaId, big = { lines: [], rows: [], cells: [] };
  for (var bi = 0; bi < 150; bi++) { big.lines.push(('路線' + bi + 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめも').slice(0, 30)); big.rows.push(('始点駅' + bi + 'さしすせそたちつてと〜終点駅' + bi + 'なにぬねのはひふへほまみむめもやゆよらりるれろわをんあいうえおかきくけこ').slice(0, 58)); big.cells.push([String(bi)]); }
  var bigErr = '';
  try { ['land', 'used_house', 'used_mansion', 'new_house'].forEach(function (k) { api_saveTable(c7, 'inputs.' + k + '.station_image', big); }); } catch (e) { bigErr = e.message; }
  r.bigGas = [bigErr.indexOf('大きすぎます') >= 0, bigErr.indexOf('文字。上限') > 0, AREA_JSON_MAX_];
  // 路線・駅版の会社に追加したエリアも同じパターン/会社の複製も引き継ぐ
  var a2 = api_add_area(stn.companyId, '長野県', '東御市').areaId, dup = api_duplicate_company(stn.companyId, '複製');
  r.inherit = [api_get(a2).pattern, api_get(dup.areaIds[0]).pattern, !!api_get(dup.areaIds[0]).tables['inputs.used_house.station_image']];
  // 複数エリアのLPにも路線・駅の表が入る
  api_save(a2, base); api_saveTable(a2, 'inputs.used_house.station_image', { lines: ['しなの鉄道'], rows: ['大屋駅'], cells: [['40']] });
  var lp = doGet({ parameter: { id: stn.areaId } }).html;
  r.multi = [(lp.match(/class="stn-blk"/g) || []).length >= 2, lp.indexOf('大屋駅') > 0, lp.indexOf('上田駅') > 0];
  // 標準版の入力は、いままでどおり物件数
  api_save(std.areaId, Object.assign({}, base, { 'inputs.used_house.listings': '300' }));
  r.std = buildArea_(std.areaId).model.used_house.listings;
  // 権限
  __setEmail('x@gmail.com'); try { api_saveTable(stn.areaId, 'inputs.used_house.station_image', { lines: ['A'], rows: ['B'], cells: [['1']] }); r.denied = false; } catch (e) { r.denied = true; }
  return r;
})()`, ctx);
console.log(JSON.stringify(r));
