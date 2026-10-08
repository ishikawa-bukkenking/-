/** スプレッドシート ⇔ 設定(商談先タブの項目定義・読み取り・初期設定) */

var SHEET_LIST_ = '商談先一覧', SHEET_FR_ = '加盟店一覧', SHEET_LISTINGS_ = '物件データ', SHEET_SETTINGS_ = '設定';
var BRACKET_LABELS_ = ['300万未満', '300万〜500万未満', '500万〜700万未満', '700万〜1000万未満', '1000万以上'];
var FIELD_START_ROW_ = 5;

/** t: text|num|date|list。req: 必須(未入力なら状態欄に「未入力」と出る) */
var FIELDS_ = [
  { h: '基本情報' },
  { k: 'company', l: '会社名', req: 1, d: '例: 株式会社○○(先方の会社名。表紙に表示)' },
  { k: 'prefecture', l: '都道府県', req: 1, d: '例: 長野県' },
  { k: 'city', l: '市区町村', req: 1, d: '例: 上田市(2021年1月時点の名称)' },
  { k: 'created', l: '作成日', t: 'date', d: '空欄なら表示した日。例: 2026-01-19' },
  { k: 'cta_url', l: '問い合わせ・資料請求ページURL', d: '入力した場合のみ、表紙と末尾にボタンを表示' },
  { h: '対象エリア' },
  { k: 'inputs.area.households', l: '世帯数', t: 'num', req: 1, d: '空欄のまま、設定シートにe-StatのアプリケーションIDがあれば自動取得を試みる' },
  { k: 'inputs.area.source', l: '世帯数の出典', d: '例: 令和2年国勢調査' },
  { k: 'inputs.area.date', l: '世帯数の取得日', t: 'date' },
  { h: '年収(出典: LIFULL HOME\'S調べ など。実際に使った出典を書く)' },
  { k: 'inputs.income.source', l: '年収の出典', req: 1 },
  { k: 'inputs.income.date', l: '年収の取得日', t: 'date', req: 1 },
  { k: 'inputs.income.city_avg_man', l: '市の平均世帯年収(万円)', t: 'num', req: 1 },
  { k: 'inputs.income.prefecture_avg_man', l: '県の平均世帯年収(万円)', t: 'num', req: 1 },
  { k: 'inputs.income.national_avg_man', l: '全国の平均世帯年収(万円)', t: 'num', req: 1 },
  { k: 'inputs.income.rank_in_prefecture', l: '県内順位(位)', t: 'num', req: 1 },
  { k: 'inputs.income.municipalities_in_prefecture', l: '県内の市町村数', t: 'num', d: '空欄なら行政区域データから自動' },
  { k: 'bracket_hh.0', l: '世帯数: 300万未満', t: 'num', d: '世帯数か構成比(%)のどちらか(両方でも可)を5区分すべてに' },
  { k: 'bracket_hh.1', l: '世帯数: 300万〜500万未満', t: 'num' },
  { k: 'bracket_hh.2', l: '世帯数: 500万〜700万未満', t: 'num' },
  { k: 'bracket_hh.3', l: '世帯数: 700万〜1000万未満', t: 'num' },
  { k: 'bracket_hh.4', l: '世帯数: 1000万以上', t: 'num' },
  { k: 'bracket_sh.0', l: '構成比(%): 300万未満', t: 'num', d: '例: 38.9' },
  { k: 'bracket_sh.1', l: '構成比(%): 300万〜500万未満', t: 'num' },
  { k: 'bracket_sh.2', l: '構成比(%): 500万〜700万未満', t: 'num' },
  { k: 'bracket_sh.3', l: '構成比(%): 700万〜1000万未満', t: 'num' },
  { k: 'bracket_sh.4', l: '構成比(%): 1000万以上', t: 'num' },
  { h: '価格推移' },
  { k: 'inputs.price_trend.source', l: '価格推移の出典', req: 1 },
  { k: 'inputs.price_trend.date', l: '価格推移の取得日', t: 'date', req: 1 },
  { k: 'inputs.price_trend.city_3y_pct', l: '市の3年上昇率(%)', t: 'num', d: '空欄なら内訳の合計' },
  { k: 'inputs.price_trend.prefecture_3y_pct', l: '県の3年上昇率(%)', t: 'num', req: 1 },
  { k: 'yearly.0', l: '内訳: 初年度(%)', t: 'num', req: 1 },
  { k: 'yearly.1', l: '内訳: 2年目(%)', t: 'num', req: 1 },
  { k: 'yearly.2', l: '内訳: 3年目(%)', t: 'num', req: 1 },
  { k: 'series.labels', l: 'グラフ: 時期(カンマ区切り)', t: 'list', d: '例: 2023/01,2023/07,2024/01  (グラフを描く場合)' },
  { k: 'series.中古マンション', l: 'グラフ: 中古マンション(万円, カンマ区切り)', t: 'list' },
  { k: 'series.中古戸建て', l: 'グラフ: 中古戸建て(万円, カンマ区切り)', t: 'list' },
  { k: 'series.土地', l: 'グラフ: 土地(万円, カンマ区切り)', t: 'list' },
  { k: 'inputs.price_trend.image', l: 'グラフ画像のURL', d: '数値の代わりに画像を使う場合(誰でも見られるURL)' },
  { h: '物件の出典(土地・中古・新築・まとめに表示)' },
  { k: 'inputs.listings_source', l: '物件データの出典', req: 1, d: '実際に使った取得元を書く(使っていないソース名は書かない)' },
  { k: 'inputs.listings_date', l: '物件データの取得日', t: 'date', req: 1 },
  { h: '土地(「物件データ」シートに行があれば自動集計。ここに入力すると優先)' },
  { k: 'inputs.land.tsubo_price_man', l: '坪単価(万円/坪)', t: 'num', req: 1 },
  { k: 'inputs.land.tsubo_price_low_rise_residential_man', l: '低層住居専用地域の相場(万円/坪)', t: 'num', req: 1 },
  { k: 'inputs.land.tsubo_price_other_residential_man', l: 'それ以外の住居専用地域(万円/坪)', t: 'num', req: 1 },
  { k: 'inputs.land.listings', l: '土地の物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.land.price_man', l: '土地の売却価格相場(万円)', t: 'num', req: 1, d: 'まとめ(P10)に表示' },
  { k: 'inputs.land.price_per_m2_man', l: '土地の平米単価(万円/㎡)', t: 'num', req: 1 },
  { k: 'inputs.land.land_area_median_m2', l: '土地面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'compare.0', l: '比較市1', t: 'list', req: 1, d: '市名,坪単価,物件数  例: 長野市,25.1,217(対象市を含む5市。対象市の値は上の値が使われる)' },
  { k: 'compare.1', l: '比較市2', t: 'list', req: 1 },
  { k: 'compare.2', l: '比較市3', t: 'list', req: 1 },
  { k: 'compare.3', l: '比較市4', t: 'list', req: 1 },
  { k: 'compare.4', l: '比較市5', t: 'list', req: 1 },
  { h: '中古戸建て' },
  { k: 'inputs.used_house.price_man', l: '売却価格相場(万円)', t: 'num', req: 1 },
  { k: 'inputs.used_house.listings', l: '物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.used_house.building_area_median_m2', l: '建物面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.used_house.land_area_median_m2', l: '土地面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.used_house.age_median_years', l: '築年数の中央値(年)', t: 'num', req: 1 },
  { k: 'inputs.used_house.heatmap_image', l: '分布表の画像URL', d: '物件データが無い場合のみ' },
  { h: '中古マンション' },
  { k: 'inputs.used_mansion.price_man', l: '売却価格相場(万円)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.listings', l: '物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.exclusive_area_median_m2', l: '専有面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.age_median_years', l: '築年数の中央値(年)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.heatmap_image', l: '分布表の画像URL', d: '物件データが無い場合のみ' },
  { h: '新築戸建て' },
  { k: 'inputs.new_house.price_man', l: '売却価格相場(万円)', t: 'num', req: 1 },
  { k: 'inputs.new_house.listings', l: '物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.new_house.building_area_median_m2', l: '建物面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.new_house.land_area_median_m2', l: '土地面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.new_house.heatmap_image', l: '分布表の画像URL', d: '物件データが無い場合のみ' },
  { h: '検索ボリューム(出典: google広告調べ)' },
  { k: 'inputs.keywords.source', l: '検索ボリュームの出典', d: '空欄なら「google広告調べ」' },
  { k: 'inputs.keywords.date', l: '検索ボリュームの取得日', t: 'date', req: 1 },
  { k: 'kw.土地', l: '「{市} 土地」', t: 'list', req: 1, d: '月間検索ボリューム,CPC下限(円),CPC上限(円)  例: 1000,6,161' },
  { k: 'kw.中古マンション', l: '「{市} 中古マンション」', t: 'list', req: 1 },
  { k: 'kw.不動産', l: '「{市} 不動産」', t: 'list', req: 1 },
  { k: 'kw.中古物件', l: '「{市} 中古物件」', t: 'list', req: 1 },
  { h: '近隣不動産会社(「{市} 不動産」「{市} 土地」「{市} 中古」で検索したSEO上位3社)' },
  { k: 'comp.0', l: '近隣不動産会社1', t: 'list', req: 1, d: '名称,所在市,URL,掲載物件数(任意)  例: ピタットハウス 上田店,上田市,https://...' },
  { k: 'comp.1', l: '近隣不動産会社2', t: 'list', req: 1 },
  { k: 'comp.2', l: '近隣不動産会社3', t: 'list', req: 1 }
];

function parseNum_(s) {
  if (s === null || s === undefined) return undefined;
  s = String(s).replace(/[,，\s％%円件万㎡坪位年世帯]/g, '').replace(/[０-９．]/g, function (c) { return c === '．' ? '.' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  if (s === '' || isNaN(Number(s))) return undefined;
  return Number(s);
}
function parseDate_(s) {
  if (s === null || s === undefined || String(s).trim() === '') return undefined;
  var m = String(s).trim().match(/^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/);
  if (!m) return undefined;
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}
function splitList_(s) { return String(s).split(/[,，]/).map(function (x) { return x.trim(); }); }

function setPath_(obj, path, val) {
  var ks = path.split('.'), o = obj;
  for (var i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = val;
}

/** 商談先タブの値(キー→表示文字列)を設定オブジェクトに変換する。純粋関数(テスト可) */
function valuesToConfig_(vals, today) {
  var cfg = { inputs: {} }, hh = [], sh = [], yearly = [], series = {}, compare = [], comp = [], kw = [];
  FIELDS_.forEach(function (f) {
    if (f.h) return;
    var raw = vals[f.k];
    if (raw === undefined || String(raw).trim() === '') return;
    var k = f.k, v;
    if (f.t === 'num') v = parseNum_(raw); else if (f.t === 'date') v = parseDate_(raw); else if (f.t === 'list') v = splitList_(raw); else v = String(raw).trim();
    if (v === undefined) return;
    var m;
    if ((m = k.match(/^bracket_hh\.(\d)$/))) hh[+m[1]] = v;
    else if ((m = k.match(/^bracket_sh\.(\d)$/))) sh[+m[1]] = v;
    else if ((m = k.match(/^yearly\.(\d)$/))) yearly[+m[1]] = v;
    else if ((m = k.match(/^series\.(.+)$/))) series[m[1]] = m[1] === 'labels' ? v : v.map(parseNum_);
    else if ((m = k.match(/^compare\.(\d)$/))) { if (v[0]) compare.push({ city: v[0], tsubo_price_man: parseNum_(v[1]), listings: parseNum_(v[2]) }); }
    else if ((m = k.match(/^comp\.(\d)$/))) { if (v[0]) comp.push({ name: v[0], area: v[1] || undefined, url: v[2] || undefined, listing_count: parseNum_(v[3]) }); }
    else if ((m = k.match(/^kw\.(.+)$/))) kw.push({ term: m[1], monthly_volume: parseNum_(v[0]), cpc_low_yen: parseNum_(v[1]), cpc_high_yen: parseNum_(v[2]) });
    else setPath_(cfg, k, v);
  });
  if (!cfg.created) cfg.created = today;
  var any = false, brackets = [];
  for (var i = 0; i < 5; i++) {
    var b = { label: BRACKET_LABELS_[i] };
    if (hh[i] !== undefined) { b.households = hh[i]; any = true; }
    if (sh[i] !== undefined) { b.share = sh[i] / 100; any = true; }
    brackets.push(b);
  }
  if (any) { cfg.inputs.income = cfg.inputs.income || {}; cfg.inputs.income.brackets = brackets; }
  if (yearly.length === 3 && yearly.every(function (x) { return x !== undefined; })) { cfg.inputs.price_trend = cfg.inputs.price_trend || {}; cfg.inputs.price_trend.yearly_pct = yearly; }
  if (series.labels && Object.keys(series).length > 1) { cfg.inputs.price_trend = cfg.inputs.price_trend || {}; cfg.inputs.price_trend.series = series; }
  if (compare.length) { cfg.inputs.land = cfg.inputs.land || {}; cfg.inputs.land.compare_cities = compare; }
  if (kw.length) { cfg.inputs.keywords = cfg.inputs.keywords || {}; cfg.inputs.keywords.rows = kw; }
  if (comp.length) cfg.competitors = comp;
  return cfg;
}

/** 物件データシートの行(2行目以降)→ 指定IDの行だけ集計用の形に */
function listingRowsFor_(values, id) {
  var out = [];
  values.forEach(function (r) {
    if (String(r[0]).trim() !== id) return;
    out.push({ type: String(r[1]).trim(), price_man: parseNum_(r[2]), land_area_m2: parseNum_(r[3]), building_area_m2: parseNum_(r[4]),
      exclusive_area_m2: parseNum_(r[5]), age_years: parseNum_(r[6]), zone: String(r[7] || '').trim() });
  });
  return out;
}

function franchiseRowsFrom_(values) {
  return values.filter(function (r) { return String(r[0]).trim() && !/^(×|停止|0|無効)$/.test(String(r[5]).trim()); })
    .map(function (r) { return { name: String(r[0]).trim(), prefecture: String(r[1]).trim(), city: String(r[2]).trim(), address: String(r[3]).trim(), url: String(r[4]).trim() }; });
}
