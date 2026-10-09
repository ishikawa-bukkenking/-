/** 設定(シート)→ 取得 → 集計 → モデルと取得レポート(areasheet/pipeline.py の移植) */

var PRICE_NOTES = [
  '※この情報は不動産価格を保証するものではありません。',
  '※相場価格はSUUMOでの最終掲載時の価格をもとに算出しています。',
  '※相場価格は成約価格を表すものではありません'];

function deepMerge_(base, over) {
  var out = JSON.parse(JSON.stringify(base || {}));
  Object.keys(over || {}).forEach(function (k) {
    var v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge_(out[k], v);
    else if (v !== undefined) out[k] = v;
  });
  return out;
}

function Report_() { this.items = []; }
Report_.prototype.add = function (key, label, status, method, reason) {
  this.items.push({ key: key, label: label, status: status, method: method || '', reason: reason || '' });
};
Report_.prototype.missing = function () { return this.items.filter(function (i) { return i.status === 'missing'; }); };

function empty_(v) { return v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && v !== null && !Array.isArray(v) && !Object.keys(v).length); }

function status_(rep, key, label, value, hint) {
  if (empty_(value)) rep.add(key, label, 'missing', '', '未入力。' + hint);
  else rep.add(key, label, 'input', '入力システム');
}

function src_(sec, created, rep, key) {
  var s = sec.source;
  if (!s) { rep.add(key + '.source', key + ' 出典名', 'missing', '', '出典名(source)が未設定'); s = '出典未設定'; }
  var d = sec.date;
  if (!d) { d = created; rep.add(key + '.date', key + ' 取得日', 'input', '', 'date未設定のため作成日を表示'); }
  return [s, fmtDate_(d)];
}

var KEYS_ = {
  income: ['city_avg_man', 'prefecture_avg_man', 'national_avg_man', 'rank_in_prefecture', 'municipalities_in_prefecture', 'headline', 'body', 'brackets', 'largest_bracket', 'share_sum', 'diff_vs_national_man'],
  price_trend: ['city_3y_pct', 'prefecture_3y_pct', 'yearly_pct', 'series', 'image', 'body', 'judgement_vs_prefecture'],
  land: ['tsubo_price_man', 'tsubo_price_low_rise_residential_man', 'tsubo_price_other_residential_man', 'listings', 'price_man', 'price_per_m2_man', 'land_area_median_m2', 'heatmaps', 'heatmap_image'],
  used_house: ['price_man', 'listings', 'building_area_median_m2', 'land_area_median_m2', 'age_median_years', 'heatmaps', 'heatmap_image'],
  used_mansion: ['price_man', 'listings', 'exclusive_area_median_m2', 'age_median_years', 'heatmaps', 'heatmap_image'],
  new_house: ['price_man', 'listings', 'building_area_median_m2', 'land_area_median_m2', 'heatmaps', 'heatmap_image']
};

/**
 * cfg: 会社名・商圏・inputs など(YAML設定と同じ構造)
 * services: { cacheGet, cachePut, fetchJson, estatHouseholds(areaCode) }
 * data: { franchiseRows: [], listingRows: [] }
 */
function buildModel_(cfg, services, data) {
  var rep = new Report_();
  var pref = normalizePrefecture_(cfg.prefecture), city = cfg.city, created = cfg.created;
  var inputs = cfg.inputs || {}, opts = deepMerge_({
    trend_same_threshold_pt: 1.0, point_round_unit: 10, compare_city_count: 5,
    franchise: { max: 3, tiers: ['same_city', 'adjacent', 'same_prefecture'], stop_at_first_tier: true }
  }, cfg.options || {});
  var now = services.now ? services.now() : new Date().toISOString();

  var geo = null;
  try {
    geo = loadGeo_(services, pref, city);
    city = geo.city;
    rep.add('area.map', '対象市区町村の地図', 'auto', GEO_SOURCE);
  } catch (e) {
    if (String(e.message).indexOf('見つかりません') >= 0) throw e;
    rep.add('area.map', '対象市区町村の地図', 'missing', '', String(e.message));
  }
  var munis = geo ? geo.count : null, neighbors = geo ? geo.neighbors : [], areaCode = geo ? geo.code : '';

  var model = { meta: { company: cfg.company, prefecture: pref, city: city, created: created, created_display: fmtDate_(created),
    generated_at: now, municipalities_in_prefecture: munis, area_code: areaCode, map_source: GEO_LICENSE_NOTE } };

  // --- 対象エリア ---
  var areaIn = inputs.area || {}, hh = { value: null };
  if (areaIn.households != null) {
    hh = { value: areaIn.households, source: areaIn.source || '入力値', fetched_at: String(areaIn.date || created) };
    rep.add('area.households', '世帯数', 'input', '入力システム');
  } else {
    try {
      if (!services.estatHouseholds) throw new Error('e-Stat のアプリケーションIDが未設定');
      var got = services.estatHouseholds(areaCode);
      hh = { value: got.value, source: got.source, fetched_at: now };
      rep.add('area.households', '世帯数', 'auto', got.source);
    } catch (e) {
      rep.add('area.households', '世帯数', 'missing', '', e.message + '。入力システムの「世帯数」に入力');
    }
  }
  model.area = { households: hh.value, households_source: hh.source || null,
    households_date: hh.value ? fmtDate_(String(hh.fetched_at).slice(0, 10)) : null };

  var frOver = cfg.nearby_franchise, sel;
  if (frOver && frOver.length) {
    sel = { items: frOver.map(function (r) { return { name: r.name, area: r.area || '', url: r.url || '', tier: 'override' }; }), tiers_used: ['override'] };
    rep.add('area.franchise', '周辺加盟店', 'input', '上書き');
  } else {
    var rows = data.franchiseRows || [];
    sel = selectFranchise_(rows, pref, city, neighbors, opts.franchise);
    rep.add('area.franchise', '周辺加盟店', rows.length ? 'auto' : 'missing', '加盟店一覧から選定', rows.length ? '' : '加盟店一覧が空です(入力システムの「加盟店」で追加)');
  }
  model.area.franchise = sel;

  // --- 年収 ---
  var incIn = JSON.parse(JSON.stringify(inputs.income || {}));
  if (incIn.municipalities_in_prefecture == null && munis) incIn.municipalities_in_prefecture = munis;
  var inc = incomeView_(city, pref, incIn);
  var s1 = src_(incIn, created, rep, 'income'); inc.source = s1[0]; inc.date = s1[1];
  model.income = inc;
  [['city_avg_man', '市の平均年収'], ['prefecture_avg_man', '県平均年収'], ['national_avg_man', '全国平均年収'],
   ['rank_in_prefecture', '県内順位'], ['brackets', '年収階級別の世帯構成']].forEach(function (p) {
    status_(rep, 'income.' + p[0], p[1], inc[p[0]], '入力システムの年収');
  });

  // --- 価格推移 ---
  var trIn = JSON.parse(JSON.stringify(inputs.price_trend || {}));
  var tr = trendView_(city, pref, trIn, opts.trend_same_threshold_pt);
  var s2 = src_(trIn, created, rep, 'price_trend'); tr.source = s2[0]; tr.date = s2[1];
  tr.ai_note = ['※以下の条件でAI査定した参考価格', '・マンション：築10年/専有面積70㎡', '・一戸建て：築10年/延床面積70㎡', '・土地：敷地面積70㎡'];
  model.price_trend = tr;
  [['city_3y_pct', '市の3年上昇率'], ['prefecture_3y_pct', '県の3年上昇率'], ['yearly_pct', '年ごとの内訳']].forEach(function (p) {
    status_(rep, 'price_trend.' + p[0], p[1], tr[p[0]], '入力システムの価格推移');
  });
  status_(rep, 'price_trend.chart', '価格推移グラフ', tr.series || tr.image, '価格推移グラフの画像');

  // --- 物件(シートの物件データ → 手入力で上書き) ---
  var csvStats = (data.listingRows && data.listingRows.length) ? summarizeListings_(data.listingRows) : {};
  if (data.listingRows && data.listingRows.length) rep.add('listings_data', '物件データ', 'csv', '物件データ(' + data.listingRows.length + '行)');
  [['land', '土地'], ['used_house', '中古戸建て'], ['used_mansion', '中古マンション'], ['new_house', '新築戸建て']].forEach(function (p) {
    var key = p[0], label = p[1], cs = csvStats[key] || {}, secIn = inputs[key] || {};
    var sec = deepMerge_(cs, secIn), fromCsv = !!csvStats[key];
    var source = secIn.source || inputs.listings_source || (fromCsv ? (inputs.listings_source || '自社物件データ') : null);
    var date = secIn.date || inputs.listings_date || (fromCsv ? created : null);
    var sd = src_({ source: source, date: date }, created, rep, key); sec.source = sd[0]; sec.date = sd[1];
    model[key] = sec;
    status_(rep, key + '.price_man', label + ' 売却価格相場', sec.price_man, label + 'の入力');
    status_(rep, key + '.listings', label + ' 物件数', sec.listings, label + 'の入力');
    if (key !== 'land') status_(rep, key + '.heatmap', label + ' 面積×価格の分布', sec.heatmaps || sec.heatmap_image, '分布表の画像');
  });
  var land = model.land;
  [['tsubo_price_man', '坪単価'], ['tsubo_price_low_rise_residential_man', '低層住居専用地域の坪単価'], ['tsubo_price_other_residential_man', 'その他の住居専用地域の坪単価']].forEach(function (p) {
    status_(rep, 'land.' + p[0], p[1], land[p[0]], '土地の入力');
  });
  var lsIn = inputs.land_summary || {};
  ['price_man', 'price_per_m2_man', 'land_area_median_m2'].forEach(function (k) { if (lsIn[k] != null) land[k] = lsIn[k]; });
  [['price_man', '土地 売却価格相場(まとめ用)'], ['price_per_m2_man', '土地 ㎡単価'], ['land_area_median_m2', '土地 土地面積(中央値)']].forEach(function (p) {
    status_(rep, 'land_summary.' + p[0], p[1], land[p[0]], '土地の入力');
  });
  var low = land.tsubo_price_low_rise_residential_man, oth = land.tsubo_price_other_residential_man, allp = land.tsubo_price_man;
  land.tsubo_note = !!(allp != null && low != null && oth != null && allp < Math.min(low, oth));
  land.compare = compare_(cfg, land, city, neighbors, rep, opts);

  // --- キーワード ---
  var kwIn = inputs.keywords || {};
  var terms = kwIn.terms || ['土地', '中古マンション', '不動産', '中古物件'];
  var given = {};
  (kwIn.rows || []).forEach(function (r) { given[r.term] = r; });
  var rows2 = terms.map(function (t) {
    var r = given[t] || {};
    status_(rep, 'keywords.' + t, '検索ボリューム「' + city + ' ' + t + '」', r.monthly_volume, '入力システムの検索ボリューム。Google広告APIは未接続');
    return { keyword: city + '　' + t, term: t, monthly_volume: r.monthly_volume == null ? null : r.monthly_volume,
      cpc_low_yen: r.cpc_low_yen == null ? null : r.cpc_low_yen, cpc_high_yen: r.cpc_high_yen == null ? null : r.cpc_high_yen };
  });
  rows2.sort(function (a, b) { return (b.monthly_volume == null ? -1 : b.monthly_volume) - (a.monthly_volume == null ? -1 : a.monthly_volume); });
  var kwSrc = kwIn.source || (Object.keys(given).length ? 'google広告調べ' : null);
  var s3 = src_({ source: kwSrc, date: kwIn.date }, created, rep, 'keywords');
  model.keywords = { rows: rows2, source: s3[0], date: s3[1] };

  // --- まとめ ---
  var counts = {}, prices = {};
  TYPES.forEach(function (t) { counts[t] = model[t].listings == null ? null : model[t].listings; prices[t] = model[t].price_man == null ? null : model[t].price_man; });
  var total = listingsTotal_(counts), bu = brokerageUnit_(prices, counts);
  var sdates = TYPES.map(function (t) { return model[t].date; });
  var uniq = sdates.filter(function (d, i) { return sdates.indexOf(d) === i; });
  var srcs = TYPES.map(function (t) { return model[t].source; }).filter(function (d, i, a) { return a.indexOf(d) === i; });
  model.totals = {
    listings_total: total, brokerage_unit_man: bu == null ? null : roundHalfUp_(bu, 2),
    brokerage_unit_display_man: bu == null ? null : roundHalfUp_(bu, 0),
    point_listings_rounded: total == null ? null : ceilTo_(total, opts.point_round_unit),
    point_text: total == null ? null : pointText_(total, opts.point_round_unit),
    source: srcs.join('・'), date: uniq.length === 1 ? sdates[0] : sdates.slice().sort(function (a, b) { return new Date(a.replace(/\//g, '-')) - new Date(b.replace(/\//g, '-')); }).pop()
  };
  rep.add('totals.listings_total', '物件総数', total != null ? 'calc' : 'missing', '4種別の物件数の合計', total != null ? '' : '4種別すべての物件数が必要');
  rep.add('totals.brokerage_unit', '仲介単価', bu != null ? 'calc' : 'missing', '各種別(相場×3%+6万円)の物件数による加重平均(税抜)', bu != null ? '' : '4種別すべての相場と物件数が必要');

  // --- 近隣不動産会社 ---
  var comps = cfg.competitors || [];
  model.competitors = { items: comps.map(function (c) { return { name: c.name, area: c.area || city, url: c.url || '', listing_count: c.listing_count == null ? null : c.listing_count }; }),
    queries: [city + '　不動産', city + '　土地', city + '　中古'] };
  rep.add('competitors', '近隣不動産会社3社', comps.length >= 3 ? 'input' : 'missing', comps.length ? '入力システム' : '',
    comps.length >= 3 ? '' : '検索結果の自動取得は規約上行わない。入力システムの「近隣不動産会社」に3社入力(検索語: ' + model.competitors.queries.join(' / ') + ')');
  model.competitors.items.forEach(function (c) {
    rep.add('competitors.count.' + c.name, c.name + ' 掲載物件数', c.listing_count != null ? 'input' : 'optional', c.listing_count != null ? '入力システム' : '',
      c.listing_count != null ? '' : '各社サイトの構造が異なり自動取得しない。任意(サンプルも空欄)');
  });
  model.cta_url = cfg.cta_url || null;
  rep.add('hero', 'ヒーロー・結論の指標', 'calc', '入力値と計算値から生成');
  rep.add('fixed.listings_image', '加盟店様の物件情報量(画像)', 'fixed', '固定画像');
  rep.add('fixed.question', '問いかけ', 'fixed', 'サンプルから流用');

  model._mapSvg = geo ? geo.svg : null;
  Object.keys(KEYS_).forEach(function (sec) { KEYS_[sec].forEach(function (k) { if (model[sec][k] === undefined) model[sec][k] = null; }); });
  return { model: model, report: rep };
}

function compare_(cfg, land, city, neighbors, rep, opts) {
  var given = cfg.compare_cities || ((cfg.inputs || {}).land || {}).compare_cities;
  var n = opts.compare_city_count;
  var suggestion = neighbors.filter(function (x) { return /市$/.test(x); }).slice(0, Math.max(0, n - 1));
  var items = (given || []).map(function (r) { var o = Object.assign({}, r); o.highlight = (o.city === city); return o; });
  if (items.length && !items.some(function (r) { return r.highlight; })) {
    items.push({ city: city, tsubo_price_man: land.tsubo_price_man, listings: land.listings, highlight: true });
  }
  items.forEach(function (r) {
    if (r.highlight) {
      if (land.tsubo_price_man != null) r.tsubo_price_man = land.tsubo_price_man;
      if (land.listings != null) r.listings = land.listings;
    }
  });
  if (!items.length) {
    rep.add('land.compare', '土地 比較5市の坪単価・物件数', 'missing', '',
      '比較市の値が未入力。人口データが未接続のため、隣接市(境界の長い順)を候補として提示: ' + suggestion.join('、') + '。入力システムの「比較市」に 市名・坪単価・物件数 を入力');
  } else {
    var bad = items.filter(function (r) { return r.tsubo_price_man == null || r.listings == null; }).map(function (r) { return r.city; });
    rep.add('land.compare', '土地 比較5市の坪単価・物件数', bad.length ? 'missing' : 'input', '設定値', bad.length ? '値が欠けている市: ' + bad.join('、') : '');
  }
  return { items: items, suggested: suggestion };
}
