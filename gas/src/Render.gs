/** モデル → LPのHTML(areasheet/render.py + templates/index.html.j2 の移植) */

var TOC_ = [['area', '対象エリア'], ['income', '年収'], ['trend', '価格推移'], ['land', '土地'], ['used_house', '中古戸建て'],
  ['used_mansion', '中古マンション'], ['new_house', '新築戸建て'], ['search', '検索ボリューム'], ['summary', 'まとめ'], ['point', 'POINT'], ['competitors', '近隣HP']];

function slot_(label, keys) {
  return '<div class="slot" role="note"><b>未入力: ' + esc_(label) + '</b>入力システムで入力してください: ' +
    keys.map(function (k) { return '<code>' + esc_(k) + '</code>'; }).join(' / ') + '</div>';
}
function kpi_(value, unit, label, cls, nd) {
  var body = value != null
    ? '<span data-count="' + value + '">' + num_(value, nd) + '</span><span class="u">' + unit + '</span>'
    : '<span aria-label="未入力">—</span>';
  return '<div class="kpi ' + (cls || '') + '"><div class="kpi-num num">' + body + '</div><div class="kpi-label">' + esc_(label) + '</div></div>';
}
function srcline_(sec) { return '<p class="src">（' + esc_(sec.date) + (sec.source ? '　' + esc_(sec.source) : '') + '）</p>'; }

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

function mapLegend_(pins) {
  var on = (pins || []).filter(function (x) { return x.on_map; });
  if (!on.length) return '';
  var parts = [];
  var names = [];   // 凡例は、入力した「ピンの名称」(本社・○○店など)。未入力なら「御社」
  on.forEach(function (x) { if (x.kind === 'client') { var n = x.label === undefined || x.label === '' ? '御社' : String(x.label); if (names.indexOf(n) < 0) names.push(n); } });
  if (names.length) parts.push('<span><i class="lg lg-client" aria-hidden="true"></i>' + esc_(names.join('・')) + '</span>');
  if (on.some(function (x) { return x.kind === 'fr'; })) parts.push('<span><i class="lg lg-fr" aria-hidden="true"></i>加盟店(番号は加盟店一覧と同じ)</span>');
  return '<p class="map-legend">' + parts.join('') + '</p>';
}

function houseSection_(id, no, sec, label, sfx) {   // no: 表示用の連番(文字列)
  var ok = sec.price_man != null && sec.listings != null;
  var h2 = ok ? esc_(label) + 'の相場は<span class="em">' + num_(sec.price_man) + '万円</span>、物件数は<span class="em">' + num_(sec.listings) + '件</span>' : esc_(label) + 'の価格相場・物件数';
  var s = '<section class="sec' + (Number(no) % 2 === 0 ? ' alt' : '') + '" id="' + id + '"><div class="wrap rv"><p class="sec-no">' + no + '　' + esc_(label) + (sfx || '') + '</p><h2>' + h2 + '</h2>';
  s += '<div class="grid g2" style="max-width:640px">' + kpi_(sec.price_man, '万円', '売却価格相場') + kpi_(sec.listings, '件', '物件数') + '</div>';
  if (!ok) s += '<div style="margin-top:16px">' + slot_(label + 'の相場・物件数', [label + 'の相場・物件数']) + '</div>';
  s += '<div style="margin-top:28px">';
  if (sec.table) {
    s += '<div class="grid">' + heat_html_(tableToHeat_(sec.table), sec.table.caption || '面積×価格') + '</div>';
  } else if (sec.heatmap_image) {
    s += '<figure class="fig"><img class="uimg" src="' + esc_(sec.heatmap_image) + '" alt="' + esc_(label) + 'の面積と価格の分布表" loading="lazy"></figure>';
  } else if (sec.heatmaps) {
    var keys = Object.keys(sec.heatmaps).filter(function (k) { return sec.heatmaps[k]; });
    s += '<div class="grid' + (keys.length > 1 ? ' g2' : '') + '">' + keys.map(function (k) {
      return heat_html_(sec.heatmaps[k], (k === 'land_area_m2' ? '土地面積' : k === 'building_area_m2' ? '建物面積' : '専有面積') + '×価格');
    }).join('') + '</div>';
  } else {
    s += slot_('面積×価格の分布', [label + 'の分布表(画像)']);
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

/** 会社の複数エリアをまとめたLPの「対象エリア」: 地図に全エリアを強調し、世帯数はエリアごと、加盟店は1つの一覧にまとめる */
function areaMultiHtml_(models, multi, no) {
  multi = multi || { maps: [], pins: [], franchise: { items: [] } };
  var names = models.map(function (x) { return x.meta.city; }), items = multi.franchise.items, frN = items.length;
  var hhs = models.map(function (x) { return x.area.households; }), allHh = hhs.every(function (v) { return v != null; });
  var total = allHh ? hhs.reduce(function (s, v) { return s + v; }, 0) : null;
  var prefs = models.map(function (x) { return x.meta.prefecture; }).filter(function (p, i, a) { return a.indexOf(p) === i; });
  var maps = multi.maps.length ? multi.maps.map(function (mp) { return mp.svg; }).join('') : slot_('地図', ['行政区域データの取得に失敗']);
  return '<section class="sec' + (frN > 6 ? ' many' : '') + '" id="area"><div class="wrap rv"><p class="sec-no">' + no + '　対象エリア</p><h2>' +
    esc_(names.join('・')) + 'を商圏に、' + (total != null ? '合計<span class="em">' + num_(total) + '世帯</span>の' : '') + 'エリアを調査しました</h2>' +
    '<div class="split"><div>' + maps + mapLegend_(multi.pins) + '</div><div class="grid">' +
    models.map(function (x) { return kpi_(x.area.households, '世帯', x.meta.city + 'の世帯数', 'flat'); }).join('') +
    (allHh ? '' : slot_('世帯数', ['各エリアの世帯数'])) + '</div></div>' +
    '<div class="card fr-card"><p class="sub">' + esc_(prefs.join('・')) + 'の物件王加盟店' + (frN ? '（' + frN + '社）' : '') + '</p>' +
    (frN ? '<ul class="fr fr-all">' + items.map(function (f) {
      return '<li><b>' + (f.pin_no ? '<span class="pinno">' + f.pin_no + '</span>' : '') + esc_(f.name) + '様</b><span>※' + esc_(f.area) + '</span>' + (f.url ? '<br><span class="note">不動産HP：</span><a href="' + esc_(f.url) + '" rel="noopener noreferrer" target="_blank">' + esc_(f.url) + '</a>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="empty">表示する加盟店がありません</p>') + '</div></div></section>';
}

function renderPage_(models, report, assets, styleCss, multi) {
  models = [].concat(models);
  var many = models.length > 1, model = models[0];   // 2エリア目以降は、1エリア目の下に続けて並べる
  var m = model.meta, a = model.area, t = model.totals, comp = model.competitors, tr = model.price_trend;
  var missing = report.missing().length;
  var trendOn = !tr.hidden;
  function sfx(mi) { return mi ? '-' + (mi + 1) : ''; }   // 2エリア目以降のセクションIDの接尾辞
  var cityNames = esc_(models.map(function (x) { return x.meta.city; }).join('・'));
  var prefs = models.map(function (x) { return x.meta.prefecture; }).filter(function (p, i, arr) { return arr.indexOf(p) === i; });
  var pills = prefs.map(function (p) {
    return '<span class="pill">' + esc_(p) + '　' + esc_(models.filter(function (x) { return x.meta.prefecture === p; }).map(function (x) { return x.meta.city; }).join('・')) + '</span>';
  }).join(' ');
  var toc = many ? [['top', '表紙'], ['area', '対象エリア']].concat(models.map(function (x, mi) { return ['income' + sfx(mi), x.meta.city + 'の調査']; })).concat([['point', 'POINT'], ['competitors', '近隣HP']])
    : [['top', '表紙']].concat(TOC_.filter(function (x) { var v = model.visible || {}; return (trendOn || x[0] !== 'trend') && v[x[0]] !== false && (x[0] !== 'summary' || ['land', 'used_house', 'used_mansion', 'new_house'].some(function (k) { return v[k] !== false; })); }));
  var n = 0, N = function () { n++; return ('0' + n).slice(-2); };
  var alt = function () { return (n + 1) % 2 === 0 ? ' alt' : ''; };   // 次の連番が偶数なら薄いグレーの背景(非表示のセクションがあっても交互になる)
  var h = [];
  h.push('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow,noarchive,noimageindex"><title>エリア調査シート｜' + esc_(m.company) + ' 御中｜' + cityNames + '</title>' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap">' +
    '<style>' + styleCss + '</style><script>document.documentElement.classList.add("js")</script></head><body>');
  if (missing) h.push('<div class="draft"><div class="wrap"><b>下書き</b><span>未入力の項目が' + missing + '件あります(黄色の枠)。入力システムで入力すると、このページを再読み込みするだけで反映されます。</span></div></div>');
  h.push('<nav class="nav" aria-label="ページ内移動"><div class="wrap"><img src="' + assets.logoTeal + '" alt="物件王">' +
    toc.map(function (x) { return '<a class="i" href="#' + x[0] + '">' + x[1] + '</a>'; }).join('') + '</div></nav>');
  // hero
  h.push('<header class="hero" id="top"><div class="wrap"><div><p class="eyebrow">エリア調査シート</p><h1>' + esc_(m.company) + '<small>御中</small></h1>' +
    '<p>' + pills + '<span class="date">' + m.created_display + ' 作成</span></p></div>' +
    '<img class="king" src="' + assets.king + '" alt="物件王の王様キャラクター">' +
    '<nav class="anchors" aria-label="セクション">' + toc.filter(function (x) { return x[0] !== 'top'; }).map(function (x) { return '<a href="#' + x[0] + '">' + x[1] + '</a>'; }).join('') + '</nav>' +
    (model.cta_url ? '<div><a class="btn" href="' + esc_(model.cta_url) + '">お問い合わせ・資料請求</a></div>' : '') + '</div></header><main>');
  if (many) h.push(areaMultiHtml_(models, multi, N())); else {
  var frN = a.franchise.items.length;
  h.push('<section class="sec' + alt() + (frN > 6 ? ' many' : '') + '" id="area"><div class="wrap rv"><p class="sec-no">' + N() + '　対象エリア</p><h2>' +
    (a.households != null ? esc_(m.city) + 'を商圏に、<span class="em">' + num_(a.households) + '世帯</span>のエリアを調査しました' : esc_(m.city) + 'を商圏としたエリアを調査しました') +
    '</h2><div class="split"><div>' + (model._mapSvg || slot_('地図', ['行政区域データの取得に失敗'])) + mapLegend_(a.pins) + '</div><div class="grid">' + kpi_(a.households, '世帯', '世帯数', 'flat') +
    (a.households == null ? slot_('世帯数', ['世帯数']) : '') + '</div></div>' +
    '<div class="card fr-card"><p class="sub">' + esc_(m.prefecture) + 'の物件王加盟店' + (frN ? '（' + frN + '社）' : '') + '</p>' +
    (frN ? '<ul class="fr fr-all">' + a.franchise.items.map(function (f) {
      return '<li><b>' + (f.pin_no ? '<span class="pinno">' + f.pin_no + '</span>' : '') + esc_(f.name) + '様</b><span>※' + esc_(f.area) + '</span>' + (f.url ? '<br><span class="note">不動産HP：</span><a href="' + esc_(f.url) + '" rel="noopener noreferrer" target="_blank">' + esc_(f.url) + '</a>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="empty">表示する加盟店がありません</p>') + '</div>' +
    '</div></section>');   // 世帯数の出典の行(日付・総務省統計局)はLPに出さない
  }
  models.forEach(function (model, mi) {
  var m = model.meta, a = model.area, inc = model.income, tr = model.price_trend, land = model.land, kw = model.keywords,
    t = model.totals, comp = model.competitors, uh = model.used_house, um = model.used_mansion, nh = model.new_house;
  var br = inc.brackets || [];
  var donut = (br.length && br.every(function (b) { return b.share != null; })) ? donutSvg_(br) : null;
  var haveBars = inc.city_avg_man != null && inc.prefecture_avg_man != null && inc.national_avg_man != null;
  function barsFor(w) { return hbarsSvg_([[m.city, inc.city_avg_man, true], [m.prefecture, inc.prefecture_avg_man, false], ['全国', inc.national_avg_man, false]], w); }
  var trendD = tr.series ? trendChart_(tr.series, false) : null, trendC = tr.series ? trendChart_(tr.series, true) : null;
  var items = land.compare.items.filter(function (r) { return r.tsubo_price_man != null; })
    .map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) { return (b.r.highlight ? 1 : 0) - (a.r.highlight ? 1 : 0) || a.i - b.i; }).map(function (x) { return x.r; });   // 選んだ市区町村を一番左に(オレンジ)   // 坪単価が入っている市だけ表示(空欄の行は使わない。5市そろっていなくてよい)
  var landOk = items.length > 0;
  var vols = kw.rows.map(function (r) { return r.monthly_volume; }).filter(function (v) { return v != null; });
  var kwMax = vols.length ? Math.max.apply(null, vols) : 1;
  var kwMissing = kw.rows.some(function (r) { return r.monthly_volume == null || r.cpc_low_yen == null; });
  var trendOn = !tr.hidden;

  var trendOn = !tr.hidden, ID = function (k) { return k + sfx(mi); }, SFX = many ? '（' + m.city + '）' : '';
  // 02 income
  h.push('<section class="sec' + alt() + '" id="' + ID('income') + '"><div class="wrap rv"><p class="sec-no">' + N() + '　年収' + SFX + '</p><h2>' + esc_(inc.headline || (m.city + 'の平均世帯年収')) + '</h2>' +
    (inc.body ? '<p class="lead">' + esc_(inc.body) + '</p>' : slot_('年収の説明文', ['平均年収・順位・階級別世帯数'])) +
    '<div class="split"><div class="card"><p class="sub">平均世帯年収</p>' +
    (haveBars ? '<div class="chart-d">' + barsFor(560) + '</div><div class="chart-c">' + barsFor(340) + '</div>' : slot_('平均世帯年収', ['市の平均年収', '県平均', '全国平均'])) + '</div>' +
    '<div class="card"><p class="sub">年収階級別の世帯構成比</p>' +
    (donut ? '<div class="chart-d">' + donut + '</div><div class="chart-c"><ul class="dlist">' + br.map(function (b) {
      var top = inc.largest_bracket && b.label === inc.largest_bracket.label, p = roundHalfUp_(b.share * 100, 1);
      return '<li' + (top ? ' class="top"' : '') + '><span>' + esc_(b.label) + '</span><b class="num">' + p + '%</b><i style="width:' + p + '%" aria-hidden="true"></i></li>';
    }).join('') + '</ul></div>' : slot_('年収階級別の世帯構成', ['年収階級の世帯数(5区分)または構成比'])) + '</div></div>' + srcline_(inc) + '</div></section>');
  // 03 trend
  var c3 = tr.city_3y_pct;
  if (trendOn) h.push('<section class="sec' + alt() + '" id="' + ID('trend') + '"><div class="wrap rv"><p class="sec-no">' + N() + '　価格推移' + SFX + '</p><h2>' +
    (c3 != null ? (Math.abs(c3) < 0.005 ? '直近3年間の価格は、ほぼ横ばいです' : '直近3年間で、価格は<span class="em">' + num_(Math.abs(c3), 2) + '%' + (c3 > 0 ? '上昇' : '下落') + '</span>しています') : '直近3年間の価格推移') + '</h2>' +
    (tr.body ? '<p class="lead">' + esc_(tr.body) + '</p>' : slot_('価格推移の説明文', ['市の3年上昇率(空欄可)', '県の3年上昇率', '年ごとの内訳(3年分)'])) +
    '<div class="grid g4" style="margin-bottom:24px">' + kpi_(tr.city_3y_pct, '%', m.city + ' 3年間', 'accent', 2) + kpi_(tr.prefecture_3y_pct, '%', m.prefecture + ' 3年間', 'flat', 2) +
    (tr.yearly_pct ? '<div class="kpi flat" style="grid-column:span 2"><div style="display:flex;gap:24px;flex-wrap:wrap">' + ['初年度', '2年目', '3年目'].map(function (lab, i) {
      return '<div><div class="kpi-num num" style="font-size:1.75rem">' + num_(tr.yearly_pct[i], 2) + '<span class="u">%</span></div><div class="kpi-label" style="display:block">' + lab + '</div></div>';
    }).join('') + '</div></div>' : '') + '</div><div class="card">' +
    (trendD ? '<div class="chart-d">' + trendD + '</div><div class="chart-c">' + trendC + '</div>' :
      tr.image ? '<figure class="fig" style="border:0;padding:0"><img class="uimg" src="' + esc_(tr.image) + '" alt="' + esc_(m.city) + 'の住宅価格推移グラフ"></figure>' :
        slot_('価格推移グラフ', ['価格推移グラフ(画像)'])) +
    '<ul class="notes note" style="margin-top:14px">' + tr.ai_note.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul></div>' + srcline_(tr) + '</div></section>');
  // 04 land
  var vis = model.visible || { land: true, used_house: true, used_mansion: true, new_house: true };
  if (vis.land) h.push('<section class="sec' + alt() + '" id="' + ID('land') + '"><div class="wrap rv"><p class="sec-no">' + N() + '　土地' + SFX + '</p><h2>' +
    (land.tsubo_price_man != null ? esc_(m.city) + 'の土地相場は<span class="em">坪' + num_(land.tsubo_price_man) + '万円</span>' + (land.listings != null ? '、物件数は<span class="em">' + num_(land.listings) + '件</span>' : '') : esc_(m.city) + 'の土地価格相場・物件数') +
    '</h2><div class="grid g4">' + kpi_(land.tsubo_price_man, '万円/坪', '坪単価', 'accent') + kpi_(land.tsubo_price_low_rise_residential_man, '万円/坪', '低層住居専用地域相場', 'flat') +
    kpi_(land.tsubo_price_other_residential_man, '万円/坪', 'それ以外の住居専用地域', 'flat') + kpi_(land.listings, '件', '物件数', 'flat') + '</div>' +
    (land.tsubo_note ? '<p class="note" style="margin-top:12px">※「坪単価」は用途地域を問わず全物件を対象とした中央値のため、用途地域別の相場より低くなる場合があります。</p>' : '') +
    ((land.tsubo_price_man == null || land.listings == null) ? '<div style="margin-top:14px">' + slot_('土地の坪単価・物件数', ['土地の坪単価・物件数']) + '</div>' : '') +
    '<div class="card" style="margin-top:24px"><p class="sub">' + esc_(m.city) + 'と近隣・県内主要市の比較（坪単価）</p>' +
    (landOk ? '<div class="chart-d">' + landBarsSvg_(items, false) + '</div><div class="chart-c">' + landBarsSvg_(items, true) + '</div>' :
      slot_('近隣・県内主要市の坪単価', ['比較市(市名,坪単価)'].concat(land.compare.suggested.length ? ['候補(隣接市): ' + land.compare.suggested.join('、')] : []))) + '</div>' + srcline_(land) + '</div></section>');
  [['used_house', uh, '中古戸建て'], ['used_mansion', um, '中古マンション'], ['new_house', nh, '新築戸建て']].forEach(function (x) { if (vis[x[0]]) h.push(houseSection_(ID(x[0]), N(), x[1], x[2], SFX)); });
  // 08 search(見出しの文章は出さない。セクション名と表だけ)
  h.push('<section class="sec' + alt() + '" id="' + ID('search') + '"><div class="wrap rv"><p class="sec-no">' + N() + '　検索ボリューム' + SFX + '</p>' +
    '<div class="card"><table class="kw"><thead><tr><th scope="col">検索キーワード</th><th scope="col">月間平均検索ボリューム</th><th scope="col">予想クリック単価</th></tr></thead><tbody>' +
    kw.rows.map(function (r) {
      return '<tr><td>' + esc_(r.keyword) + '</td><td class="v num">' + (r.monthly_volume != null ? num_(r.monthly_volume) + '<span class="bar" style="width:' + roundHalfUp_(100 * r.monthly_volume / kwMax, 1) + '%" aria-hidden="true"></span>' : '<span class="note">未入力</span>') +
        '</td><td class="num">' + (r.cpc_low_yen != null && r.cpc_high_yen != null ? '￥' + num_(r.cpc_low_yen) + '～￥' + num_(r.cpc_high_yen) : '<span class="note">未入力</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    (kwMissing ? '<div style="margin-top:14px">' + slot_('検索ボリューム・クリック単価', ['月間ボリューム・CPC下限・CPC上限']) + '</div>' : '') +
    '<p class="src">（' + esc_(kw.date) + '　' + esc_(kw.source) + '）</p></div></section>');
  // 09 summary
  if (vis.land || vis.used_house || vis.used_mansion || vis.new_house) h.push('<section class="sec' + alt() + '" id="' + ID('summary') + '"><div class="wrap rv"><p class="sec-no">' + N() + '　物件総数・売却相場まとめ' + SFX + '</p><h2>' +
    (t.listings_total != null ? '物件総数<span class="em">' + num_(t.listings_total) + '件</span>、仲介単価は約<span class="em">' + t.brokerage_unit_display_man + '万円</span>' : '物件総数・売却相場まとめ') + '</h2>' +
    '<div class="big2">' + kpi_(t.brokerage_unit_display_man, '万円', '仲介単価(約)', 'accent') + kpi_(t.listings_total, '件', '物件総数', 'accent') + '</div>' +
    (t.listings_total == null ? slot_('物件総数・仲介単価', ['4種別すべての相場と物件数(各セクションの入力)']) : '') +
    '<div class="grid tgrid" style="margin-top:16px">' +
    (vis.used_mansion ? typeCard_('マンション', um, [['専有面積（中央値）', um.exclusive_area_median_m2, '㎡'], ['築年数（中央値）', um.age_median_years, '年']]) : '') +
    (vis.land ? typeCard_('土地', land, [['平米単価相場（中央値）', land.price_per_m2_man, '万円/㎡'], ['土地面積（中央値）', land.land_area_median_m2, '㎡']]) : '') +
    (vis.new_house ? typeCard_('新築一戸建て', nh, [['建物面積（中央値）', nh.building_area_median_m2, '㎡'], ['土地面積（中央値）', nh.land_area_median_m2, '㎡']]) : '') +
    (vis.used_house ? typeCard_('中古一戸建て', uh, [['建物面積（中央値）', uh.building_area_median_m2, '㎡'], ['土地面積（中央値）', uh.land_area_median_m2, '㎡'], ['築年数（中央値）', uh.age_median_years, '年']]) : '') +
    '</div><p class="note" style="margin-top:16px">※仲介単価は加重平均で計算しております</p>' + srcline_(t) + '</div></section></main>');
  });
  // point(複数エリアのときは、全エリアの物件総数の合計から求める)
  var pointRounded = many ? (multi && multi.pointRounded != null ? multi.pointRounded : null) : t.point_listings_rounded;
  h.push('<section class="point" id="point"><div class="wrap rv"><img src="' + assets.king + '" alt="物件王の王様キャラクター"><div><span class="tag">POINT</span>' +
    (pointRounded != null ? '<p class="t">商圏で<b class="num">約' + num_(pointRounded) + '件</b>の物件情報数を担保できれば、商圏No.1の情報量を担保するHPを作り上げることが実証される</p>' :
      '<div class="slot"><b>未入力: 物件総数</b>4種別の物件数が揃うと自動で表示されます。</div>') + '</div></div></section>');
  // competitors
  h.push('<section class="sec' + alt() + '" id="competitors"><div class="wrap rv comp"><p class="sec-no">' + N() + '　近隣不動産会社のHP</p><h2>近隣不動産会社のHPだと・・・</h2>' +
    (comp.items.length ? '<div class="grid g3">' + comp.items.map(function (c) {
      return '<div class="card"><p class="name">▼' + esc_(c.name) + '（' + esc_(c.area) + '）</p>' + (c.url ? '<p><a href="' + esc_(c.url) + '" rel="noopener noreferrer" target="_blank" style="word-break:break-all;font-size:.875rem">' + esc_(c.url) + '</a></p>' : '') +
        '<p class="cnt">掲載物件数：' + (c.listing_count != null ? '<b class="num">' + num_(c.listing_count) + '</b>件' : '<span class="note">未入力</span>') + '</p></div>';
    }).join('') + '</div>' + (comp.items.length < 3 ? '<div style="margin-top:14px">' + slot_('近隣不動産会社(3社)・掲載物件数', ['近隣不動産会社(名称,所在市,URL,掲載物件数)', '検索語: ' + comp.queries.join(' / ')]) + '</div>' : '') :
      slot_('近隣不動産会社3社', ['近隣不動産会社(名称,所在市,URL,掲載物件数)', '検索語: ' + comp.queries.join(' / ')])) +
    '<p class="note" style="margin-top:20px">※「' + esc_(m.city) + '　不動産・土地・中古」とそれぞれ検索し、その中から、SEO上位のものを選んでおります</p></div></section>');
  h.push('<section class="sec' + alt() + '" id="listings"><div class="wrap rv"><p class="sec-no">' + N() + '　弊社加盟店様の物件情報量</p><h2>弊社加盟店様の物件情報量</h2><figure class="fig"><img src="' + assets.listings + '" alt="加盟店様のホームページの物件掲載例" loading="lazy"></figure></div></section>');
  h.push('<section class="sec q" id="question"><div class="wrap rv"><img class="th" src="' + assets.thinker + '" alt="考え込む男性のイラスト"><h2>どちらのサイトが<br>エンドユーザー様にとって<br><span class="em">魅力的なサイト</span>でしょうか？</h2>' +
    (model.cta_url ? '<a class="btn" href="' + esc_(model.cta_url) + '">お問い合わせ・資料請求</a>' : '') + '<button class="btn" style="background:#fff;border:2px solid var(--c-ink)" onclick="window.print()">PDFで保存(印刷)</button></div></section>');
  h.push('<footer class="foot"><div class="wrap"><p>' + esc_(m.company) + ' 御中　' + (many ? prefs.map(function (p) { return esc_(p); }).join('・') + ' ' + cityNames : esc_(m.prefecture) + esc_(m.city)) + '　エリア調査シート（' + m.created_display + ' 作成）</p><p>' + esc_(m.map_source) + '</p><p><img src="' + assets.logoTeal + '" alt="物件王" style="height:22px;margin-top:10px"></p></div></footer>');
  h.push('<script>' + APP_JS_ + '</script></body></html>');
  return h.join('');
}

/** 生成のたびに走る品質チェック(areasheet/checks.py の移植) */
function runChecks_(model, html) {
  var res = [];
  function chk(name, ok, detail) { res.push({ name: name, ok: !!ok, detail: detail || '' }); }
  var counts = {}, prices = {};
  var vt = TYPES.filter(function (k) { return !model.visible || model.visible[k] !== false; });
  vt.forEach(function (t) { counts[t] = model[t].listings; prices[t] = model[t].price_man; });
  var t = model.totals;
  if (t.listings_total != null) {
    chk('物件総数＝種別ごとの物件数の合計', t.listings_total === vt.reduce(function (s, k) { return s + counts[k]; }, 0));
    var bu = vt.reduce(function (s, k) { return s + (prices[k] * 0.03 + 6) * counts[k]; }, 0) / t.listings_total;
    chk('仲介単価＝Σ(相場×3%+6万円)×物件数 / 物件総数(税抜)', Math.abs(bu - t.brokerage_unit_man) < 0.01, bu.toFixed(2));
  }
  var tr = model.price_trend;
  if (tr.yearly_pct && tr.city_3y_pct != null) chk('3年上昇率＝内訳の合計', Math.abs(tr.yearly_pct[0] + tr.yearly_pct[1] + tr.yearly_pct[2] - tr.city_3y_pct) <= 0.015);
  if (model.income.share_sum != null) chk('年収階級の構成比の合計＝100%(±0.5)', Math.abs(model.income.share_sum * 100 - 100) <= 0.5, (model.income.share_sum * 100).toFixed(1) + '%');
  return res;
}
