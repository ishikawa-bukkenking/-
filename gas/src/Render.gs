/** モデル → LPのHTML(areasheet/render.py + templates/index.html.j2 の移植) */

var TOC_ = [['area', '対象エリア'], ['income', '年収'], ['trend', '価格推移'], ['land', '土地'], ['used_house', '中古戸建て'],
  ['used_mansion', '中古マンション'], ['new_house', '新築戸建て'], ['search', '検索ボリューム'], ['summary', 'まとめ'], ['point', 'POINT'], ['competitors', '近隣HP']];

function slot_(label, keys) {
  return '<div class="slot" role="note"><b>未入力: ' + esc_(label) + '</b>シートに入力してください: ' +
    keys.map(function (k) { return '<code>' + esc_(k) + '</code>'; }).join(' / ') + '</div>';
}
function kpi_(value, unit, label, cls, nd) {
  var body = value != null
    ? '<span data-count="' + value + '">' + num_(value, nd) + '</span><span class="u">' + unit + '</span>'
    : '<span aria-label="未入力">—</span>';
  return '<div class="kpi ' + (cls || '') + '"><div class="kpi-num num">' + body + '</div><div class="kpi-label">' + esc_(label) + '</div></div>';
}
function srcline_(sec) { return '<p class="src">（' + esc_(sec.date) + '　' + esc_(sec.source) + '）</p>'; }

function heat_html_(h, title) {
  var th = h.cols.map(function (c) { return '<th scope="col">' + esc_(c) + '</th>'; }).join('');
  var body = h.rows.map(function (r, i) {
    return '<tr><th scope="row">' + esc_(r) + '</th>' + h.grid[i].map(function (v) {
      if (!v) return '<td></td>';
      var a = (0.12 + 0.55 * v / h.max).toFixed(2), col = v / h.max > 0.7 ? '#fff' : '#212121';
      return '<td style="background:rgba(0,151,167,' + a + ');color:' + col + '">' + v + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<div class="heat-wrap"><table class="heat"><caption>' + esc_(title) + '（件数／横軸は価格・万円）</caption><thead><tr><th scope="col"></th>' + th + '</tr></thead><tbody>' + body + '</tbody></table></div>';
}

function houseSection_(id, no, sec, label) {
  var ok = sec.price_man != null && sec.listings != null;
  var h2 = ok ? esc_(label) + 'の相場は<span class="em">' + num_(sec.price_man) + '万円</span>、物件数は<span class="em">' + num_(sec.listings) + '件</span>' : esc_(label) + 'の価格相場・物件数';
  var s = '<section class="sec' + (no % 2 === 0 ? ' alt' : '') + '" id="' + id + '"><div class="wrap rv"><p class="sec-no">' + ('0' + no).slice(-2) + '　' + esc_(label) + '</p><h2>' + h2 + '</h2>';
  s += '<div class="grid g2" style="max-width:640px">' + kpi_(sec.price_man, '万円', '売却価格相場') + kpi_(sec.listings, '件', '物件数') + '</div>';
  if (!ok) s += '<div style="margin-top:16px">' + slot_(label + 'の相場・物件数', ['シートの' + label + '欄', 'または物件データシート']) + '</div>';
  s += '<div style="margin-top:28px">';
  if (sec.heatmaps) {
    var keys = Object.keys(sec.heatmaps).filter(function (k) { return sec.heatmaps[k]; });
    s += '<div class="grid' + (keys.length > 1 ? ' g2' : '') + '">' + keys.map(function (k) {
      return heat_html_(sec.heatmaps[k], (k === 'land_area_m2' ? '土地面積' : k === 'building_area_m2' ? '建物面積' : '専有面積') + '×価格');
    }).join('') + '</div>';
  } else if (sec.heatmap_image) {
    s += '<figure class="fig"><img src="' + esc_(sec.heatmap_image) + '" alt="' + esc_(label) + 'の面積と価格の分布表" loading="lazy"></figure>';
  } else {
    s += slot_('面積×価格の分布', ['物件データシート', 'または' + label + 'の分布表画像URL']);
  }
  s += '</div><ul class="notes note">' + PRICE_NOTES.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>' + srcline_(sec) + '</div></section>';
  return s;
}

function typeCard_(title, sec, rows) {
  var s = '<div class="card tcard"><h3>' + esc_(title) + '</h3><dl><dd class="big" style="grid-column:1/-1;text-align:left">' +
    (sec.price_man != null ? num_(sec.price_man) + '<span style="font-size:.5em;font-weight:500">万円</span>' : '—') +
    '</dd><dt style="grid-column:1/-1;margin-top:-4px">売却価格相場</dt><hr>';
  rows.forEach(function (r) { s += '<dt>' + esc_(r[0]) + '</dt><dd>' + (r[1] != null ? num_(r[1]) + r[2] : '—') + '</dd>'; });
  return s + '</dl></div>';
}

function renderPage_(model, report, assets, styleCss) {
  var m = model.meta, a = model.area, inc = model.income, tr = model.price_trend, land = model.land, kw = model.keywords,
    t = model.totals, comp = model.competitors, uh = model.used_house, um = model.used_mansion, nh = model.new_house;
  var missing = report.missing().length;
  var br = inc.brackets || [];
  var donut = (br.length && br.every(function (b) { return b.share != null; })) ? donutSvg_(br) : null;
  var haveBars = inc.city_avg_man != null && inc.prefecture_avg_man != null && inc.national_avg_man != null;
  function barsFor(w) { return hbarsSvg_([[m.city, inc.city_avg_man, true], [m.prefecture, inc.prefecture_avg_man, false], ['全国', inc.national_avg_man, false]], w); }
  var trendD = tr.series ? trendLinesSvg_(tr.series, false) : null, trendC = tr.series ? trendLinesSvg_(tr.series, true) : null;
  var items = land.compare.items;
  var landOk = items.length && items.every(function (r) { return r.tsubo_price_man != null && r.listings != null; });
  var vols = kw.rows.map(function (r) { return r.monthly_volume; }).filter(function (v) { return v != null; });
  var kwMax = vols.length ? Math.max.apply(null, vols) : 1;
  var kwMissing = kw.rows.some(function (r) { return r.monthly_volume == null || r.cpc_low_yen == null; });
  var toc = [['top', '表紙']].concat(TOC_);
  var h = [];
  h.push('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow,noarchive,noimageindex"><title>エリア調査シート｜' + esc_(m.company) + ' 御中｜' + esc_(m.city) + '</title>' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap">' +
    '<style>' + styleCss + '</style><script>document.documentElement.classList.add("js")</script></head><body>');
  if (missing) h.push('<div class="draft"><div class="wrap"><b>下書き</b><span>未入力の項目が' + missing + '件あります(黄色の枠)。シートの「状態」欄を確認して入力してください。入力すると、このページを再読み込みするだけで反映されます。</span></div></div>');
  h.push('<nav class="nav" aria-label="ページ内移動"><div class="wrap"><img src="' + assets.logoTeal + '" alt="物件王">' +
    toc.map(function (x) { return '<a class="i" href="#' + x[0] + '">' + x[1] + '</a>'; }).join('') + '</div></nav>');
  // hero
  h.push('<header class="hero" id="top"><div class="wrap"><div><p class="eyebrow">エリア調査シート</p><h1>' + esc_(m.company) + '<small>御中</small></h1>' +
    '<p><span class="pill">' + esc_(m.prefecture) + '　' + esc_(m.city) + '</span><span class="date">' + m.created_display + ' 作成</span></p></div>' +
    '<img class="king" src="' + assets.king + '" alt="物件王の王様キャラクター"><div class="conclusions rv">' +
    kpi_(t.listings_total, '件', '物件総数', 'accent') + kpi_(t.brokerage_unit_display_man, '万円', '仲介単価(約)', 'accent') +
    '<div class="kpi"><div class="kpi-num">' + esc_(m.city) + '</div><div class="kpi-label">調査した商圏(' + esc_(m.prefecture) + ')</div></div></div>' +
    '<nav class="anchors" aria-label="セクション">' + toc.filter(function (x) { return x[0] !== 'top'; }).map(function (x) { return '<a href="#' + x[0] + '">' + x[1] + '</a>'; }).join('') + '</nav>' +
    (model.cta_url ? '<div><a class="btn" href="' + esc_(model.cta_url) + '">お問い合わせ・資料請求</a></div>' : '') + '</div></header><main>');
  // 01 area
  h.push('<section class="sec" id="area"><div class="wrap rv"><p class="sec-no">01　対象エリア</p><h2>' +
    (a.households != null ? esc_(m.city) + 'を商圏に、<span class="em">' + num_(a.households) + '世帯</span>のエリアを調査しました' : esc_(m.city) + 'を商圏としたエリアを調査しました') +
    '</h2><div class="split"><div>' + (model._mapSvg || slot_('地図', ['行政区域データの取得に失敗'])) + '</div><div class="grid">' + kpi_(a.households, '世帯', '世帯数', 'flat') +
    (a.households == null ? slot_('世帯数', ['シートの「世帯数」']) : '') + '<div class="card"><p class="sub">周辺加盟店</p>' +
    (a.franchise.items.length ? '<ul class="fr">' + a.franchise.items.map(function (f) {
      return '<li><b>' + esc_(f.name) + '様</b><span>※' + esc_(f.area) + '</span>' + (f.url ? '<br><a href="' + esc_(f.url) + '" rel="noopener noreferrer" target="_blank">' + esc_(f.url) + '</a>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="empty">周辺に加盟店なし</p>') + '</div></div></div>' +
    (a.households != null ? '<p class="src">（' + esc_(a.households_date) + '　' + esc_(a.households_source) + '）</p>' : '') + '</div></section>');
  // 02 income
  h.push('<section class="sec alt" id="income"><div class="wrap rv"><p class="sec-no">02　年収</p><h2>' + esc_(inc.headline || (m.city + 'の平均世帯年収')) + '</h2>' +
    (inc.body ? '<p class="lead">' + esc_(inc.body) + '</p>' : slot_('年収の説明文', ['シートの年収欄(平均年収・順位・階級別世帯数)'])) +
    '<div class="split"><div class="card"><p class="sub">平均世帯年収</p>' +
    (haveBars ? '<div class="chart-d">' + barsFor(560) + '</div><div class="chart-c">' + barsFor(340) + '</div>' : slot_('平均世帯年収', ['市の平均年収', '県平均', '全国平均'])) + '</div>' +
    '<div class="card"><p class="sub">年収階級別の世帯構成比</p>' +
    (donut ? '<div class="chart-d">' + donut + '</div><div class="chart-c"><ul class="dlist">' + br.map(function (b) {
      var top = inc.largest_bracket && b.label === inc.largest_bracket.label, p = roundHalfUp_(b.share * 100, 1);
      return '<li' + (top ? ' class="top"' : '') + '><span>' + esc_(b.label) + '</span><b class="num">' + p + '%</b><i style="width:' + p + '%" aria-hidden="true"></i></li>';
    }).join('') + '</ul></div>' : slot_('年収階級別の世帯構成', ['年収階級の世帯数(5区分)または構成比'])) + '</div></div>' + srcline_(inc) + '</div></section>');
  // 03 trend
  var c3 = tr.city_3y_pct;
  h.push('<section class="sec" id="trend"><div class="wrap rv"><p class="sec-no">03　価格推移</p><h2>' +
    (c3 != null ? '直近3年で価格は<span class="em">' + num_(c3, 2) + '%' + (c3 >= 0 ? '上昇' : '下落') + '</span>' + (tr.judgement_vs_prefecture ? '、' + esc_(m.prefecture) + 'と' + tr.judgement_vs_prefecture : '') : '直近3年間の価格推移') + '</h2>' +
    (tr.body ? '<p class="lead">' + esc_(tr.body) + '</p>' : slot_('価格推移の説明文', ['市の3年上昇率', '県の3年上昇率', '年ごとの内訳(3年分)'])) +
    '<div class="grid g4" style="margin-bottom:24px">' + kpi_(tr.city_3y_pct, '%', m.city + ' 3年間', 'accent', 2) + kpi_(tr.prefecture_3y_pct, '%', m.prefecture + ' 3年間', 'flat', 2) +
    (tr.yearly_pct ? '<div class="kpi flat" style="grid-column:span 2"><div style="display:flex;gap:24px;flex-wrap:wrap">' + ['初年度', '2年目', '3年目'].map(function (lab, i) {
      return '<div><div class="kpi-num num" style="font-size:1.75rem">' + num_(tr.yearly_pct[i], 2) + '<span class="u">%</span></div><div class="kpi-label" style="display:block">' + lab + '</div></div>';
    }).join('') + '</div></div>' : '') + '</div><div class="card">' +
    (trendD ? '<div class="chart-d">' + trendD + '</div><div class="chart-c">' + trendC + '</div>' :
      tr.image ? '<figure class="fig" style="border:0;padding:0"><img src="' + esc_(tr.image) + '" alt="' + esc_(m.city) + 'の住宅価格推移グラフ"></figure>' :
        slot_('価格推移グラフ', ['価格推移データ(時期と各種別の数値)', 'またはグラフ画像URL'])) +
    '<ul class="notes note" style="margin-top:14px">' + tr.ai_note.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul></div>' + srcline_(tr) + '</div></section>');
  // 04 land
  h.push('<section class="sec alt" id="land"><div class="wrap rv"><p class="sec-no">04　土地</p><h2>' +
    (land.tsubo_price_man != null ? esc_(m.city) + 'の土地相場は<span class="em">坪' + num_(land.tsubo_price_man) + '万円</span>' + (land.listings != null ? '、物件数は<span class="em">' + num_(land.listings) + '件</span>' : '') : esc_(m.city) + 'の土地価格相場・物件数') +
    '</h2><div class="grid g4">' + kpi_(land.tsubo_price_man, '万円/坪', '坪単価', 'accent') + kpi_(land.tsubo_price_low_rise_residential_man, '万円/坪', '低層住居専用地域相場', 'flat') +
    kpi_(land.tsubo_price_other_residential_man, '万円/坪', 'それ以外の住居専用地域', 'flat') + kpi_(land.listings, '件', '物件数', 'flat') + '</div>' +
    (land.tsubo_note ? '<p class="note" style="margin-top:12px">※「坪単価」は用途地域を問わず全物件を対象とした中央値のため、用途地域別の相場より低くなる場合があります。</p>' : '') +
    ((land.tsubo_price_man == null || land.listings == null) ? '<div style="margin-top:14px">' + slot_('土地の坪単価・物件数', ['シートの土地欄', 'または物件データ']) + '</div>' : '') +
    '<div class="card" style="margin-top:24px"><p class="sub">' + esc_(m.city) + 'と近隣・県内主要市の比較（坪単価と物件数）</p>' +
    (landOk ? '<div class="chart-d">' + landBarsSvg_(items, false) + '</div><div class="chart-c">' + landBarsSvg_(items, true) + '</div>' :
      slot_('比較5市の坪単価・物件数', ['比較市(市名,坪単価,物件数)'].concat(land.compare.suggested.length ? ['候補(隣接市): ' + land.compare.suggested.join('、')] : []))) + '</div>' + srcline_(land) + '</div></section>');
  h.push(houseSection_('used_house', 5, uh, '中古戸建て'), houseSection_('used_mansion', 6, um, '中古マンション'), houseSection_('new_house', 7, nh, '新築戸建て'));
  // 08 search
  var top0 = kw.rows[0];
  h.push('<section class="sec alt" id="search"><div class="wrap rv"><p class="sec-no">08　検索ボリューム</p><h2>' +
    (top0 && top0.monthly_volume != null ? '「' + esc_(top0.keyword) + '」は<span class="em">月に約' + num_(top0.monthly_volume) + '回</span>検索されています' : esc_(m.city) + 'の不動産関連キーワードの検索ボリューム') +
    '</h2><div class="card"><table class="kw"><thead><tr><th scope="col">検索キーワード</th><th scope="col">月間平均検索ボリューム</th><th scope="col">予想クリック単価</th></tr></thead><tbody>' +
    kw.rows.map(function (r) {
      return '<tr><td>' + esc_(r.keyword) + '</td><td class="v num">' + (r.monthly_volume != null ? num_(r.monthly_volume) + '<span class="bar" style="width:' + roundHalfUp_(100 * r.monthly_volume / kwMax, 1) + '%" aria-hidden="true"></span>' : '<span class="note">未入力</span>') +
        '</td><td class="num">' + (r.cpc_low_yen != null && r.cpc_high_yen != null ? '￥' + num_(r.cpc_low_yen) + '～￥' + num_(r.cpc_high_yen) : '<span class="note">未入力</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    (kwMissing ? '<div style="margin-top:14px">' + slot_('検索ボリューム・クリック単価', ['シートのキーワード欄(月間ボリューム,CPC下限,CPC上限)']) + '</div>' : '') +
    '<p class="src">（' + esc_(kw.date) + '　' + esc_(kw.source) + '）</p></div></section>');
  // 09 summary
  h.push('<section class="sec" id="summary"><div class="wrap rv"><p class="sec-no">09　物件総数・売却相場まとめ</p><h2>' +
    (t.listings_total != null ? '物件総数<span class="em">' + num_(t.listings_total) + '件</span>、仲介単価は約<span class="em">' + t.brokerage_unit_display_man + '万円</span>' : '物件総数・売却相場まとめ') + '</h2>' +
    '<div class="big2">' + kpi_(t.brokerage_unit_display_man, '万円', '仲介単価(約)', 'accent') + kpi_(t.listings_total, '件', '物件総数', 'accent') + '</div>' +
    (t.listings_total == null ? slot_('物件総数・仲介単価', ['4種別すべての相場と物件数(各セクションの入力)']) : '') +
    '<div class="grid tgrid" style="margin-top:16px">' +
    typeCard_('マンション', um, [['専有面積（中央値）', um.exclusive_area_median_m2, '㎡'], ['築年数（中央値）', um.age_median_years, '年']]) +
    typeCard_('土地', land, [['平米単価相場（中央値）', land.price_per_m2_man, '万円/㎡'], ['土地面積（中央値）', land.land_area_median_m2, '㎡']]) +
    typeCard_('新築一戸建て', nh, [['建物面積（中央値）', nh.building_area_median_m2, '㎡'], ['土地面積（中央値）', nh.land_area_median_m2, '㎡']]) +
    typeCard_('中古一戸建て', uh, [['建物面積（中央値）', uh.building_area_median_m2, '㎡'], ['土地面積（中央値）', uh.land_area_median_m2, '㎡'], ['築年数（中央値）', uh.age_median_years, '年']]) +
    '</div><p class="note" style="margin-top:16px">※仲介単価は加重平均で計算しております</p>' + srcline_(t) + '</div></section></main>');
  // point
  h.push('<section class="point" id="point"><div class="wrap rv"><img src="' + assets.king + '" alt="物件王の王様キャラクター"><div><span class="tag">POINT</span>' +
    (t.point_listings_rounded != null ? '<p class="t">商圏で<b class="num">' + num_(t.point_listings_rounded) + '件</b>前後の物件情報数を担保できれば、商圏No.1の情報量を担保するHPを作り上げることが実証される</p>' :
      '<div class="slot"><b>未入力: 物件総数</b>4種別の物件数が揃うと自動で表示されます。</div>') + '</div></div></section>');
  // competitors
  h.push('<section class="sec" id="competitors"><div class="wrap rv comp"><p class="sec-no">10　近隣不動産会社のHP</p><h2>近隣不動産会社のHPだと・・・</h2>' +
    (comp.items.length ? '<div class="grid g3">' + comp.items.map(function (c) {
      return '<div class="card"><p class="name">▼' + esc_(c.name) + '（' + esc_(c.area) + '）</p>' + (c.url ? '<p><a href="' + esc_(c.url) + '" rel="noopener noreferrer" target="_blank" style="word-break:break-all;font-size:.875rem">' + esc_(c.url) + '</a></p>' : '') +
        '<p class="cnt">掲載物件数：' + (c.listing_count != null ? '<b class="num">' + num_(c.listing_count) + '</b>件' : '<span class="note">未入力</span>') + '</p></div>';
    }).join('') + '</div>' + (comp.items.length < 3 ? '<div style="margin-top:14px">' + slot_('近隣不動産会社(3社)・掲載物件数', ['近隣不動産会社(名称,所在市,URL,掲載物件数)', '検索語: ' + comp.queries.join(' / ')]) + '</div>' : '') :
      slot_('近隣不動産会社3社', ['近隣不動産会社(名称,所在市,URL,掲載物件数)', '検索語: ' + comp.queries.join(' / ')])) +
    '<p class="note" style="margin-top:20px">※「' + esc_(m.city) + '　不動産・土地・中古」とそれぞれ検索し、その中から、SEO上位のものを選んでおります</p></div></section>');
  h.push('<section class="sec alt" id="listings"><div class="wrap rv"><p class="sec-no">11　弊社加盟店様の物件情報量</p><h2>弊社加盟店様の物件情報量</h2><figure class="fig"><img src="' + assets.listings + '" alt="加盟店様のホームページの物件掲載例" loading="lazy"></figure></div></section>');
  h.push('<section class="sec q" id="question"><div class="wrap rv"><img class="th" src="' + assets.thinker + '" alt="考え込む男性のイラスト"><h2>どちらのサイトが<br>エンドユーザー様にとって<br><span class="em">魅力的なサイト</span>でしょうか？</h2>' +
    (model.cta_url ? '<a class="btn" href="' + esc_(model.cta_url) + '">お問い合わせ・資料請求</a>' : '') + '<button class="btn" style="background:#fff;border:2px solid var(--c-ink)" onclick="window.print()">PDFで保存(印刷)</button></div></section>');
  h.push('<footer class="foot"><div class="wrap"><p>' + esc_(m.company) + ' 御中　' + esc_(m.prefecture) + esc_(m.city) + '　エリア調査シート（' + m.created_display + ' 作成）</p><p>' + esc_(m.map_source) + '</p><p><img src="' + assets.logoTeal + '" alt="物件王" style="height:22px;margin-top:10px"></p></div></footer>');
  h.push('<script>' + APP_JS_ + '</script></body></html>');
  return h.join('');
}

/** 生成のたびに走る品質チェック(areasheet/checks.py の移植) */
function runChecks_(model, html) {
  var res = [];
  function chk(name, ok, detail) { res.push({ name: name, ok: !!ok, detail: detail || '' }); }
  var counts = {}, prices = {};
  TYPES.forEach(function (t) { counts[t] = model[t].listings; prices[t] = model[t].price_man; });
  var t = model.totals;
  if (t.listings_total != null) {
    chk('物件総数＝種別ごとの物件数の合計', t.listings_total === TYPES.reduce(function (s, k) { return s + counts[k]; }, 0));
    var bu = TYPES.reduce(function (s, k) { return s + (prices[k] * 0.03 + 6) * counts[k]; }, 0) / t.listings_total;
    chk('仲介単価＝Σ(相場×3%+6万円)×物件数 / 物件総数(税抜)', Math.abs(bu - t.brokerage_unit_man) < 0.01, bu.toFixed(2));
  }
  var tr = model.price_trend;
  if (tr.yearly_pct && tr.city_3y_pct != null) chk('3年上昇率＝内訳の合計', Math.abs(tr.yearly_pct[0] + tr.yearly_pct[1] + tr.yearly_pct[2] - tr.city_3y_pct) <= 0.015);
  if (model.income.share_sum != null) chk('年収階級の構成比の合計＝100%(±0.5)', Math.abs(model.income.share_sum * 100 - 100) <= 0.5, (model.income.share_sum * 100).toFixed(1) + '%');
  return res;
}
