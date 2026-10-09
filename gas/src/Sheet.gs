/** スプレッドシート ⇔ 設定(商談先タブの項目定義・読み取り・初期設定) */

var SHEET_COMPANY_ = '会社', SHEET_AREA_ = 'エリア', SHEET_FR_ = '加盟店一覧', SHEET_SETTINGS_ = '設定';
var BRACKET_LABELS_ = ['300万未満', '300万〜500万未満', '500万〜700万未満', '700万〜1000万未満', '1000万以上'];

/**
 * 入力項目の定義。t: text|num|date|list|image。req: 必須(未入力なら状態に出る)。hidden: 自動記録(画面に出さない)
 * 出典は固定、取得日は「その区分を最後に入力した日」が自動で入る(auto.date.*)。
 */
var FIXED_SOURCES_ = {
  area: '総務省統計局 令和2年国勢調査', income: 'LIFULL HOME\'S調べ', price_trend: 'LIFULL HOME\'S調べ',
  listings: 'REINS調べ', keywords: 'Google広告調べ'
};
var FIELDS_ = [
  { h: 'エリア' },
  { k: 'prefecture', l: '都道府県', req: 1, d: '例: 長野県' },
  { k: 'city', l: '市区町村', req: 1, d: '例: 上田市(2021年1月時点の名称)' },
  { k: 'created', l: '作成日', t: 'date', d: '空欄なら、この商談先を追加した日' },
  { h: '対象エリア(出典: 総務省統計局 令和2年国勢調査)' },
  { k: 'inputs.area.households', l: '世帯数', t: 'num', req: 1, d: '空欄のまま、設定にe-StatのアプリケーションIDがあれば自動取得を試みる' },
  { h: '年収(出典: LIFULL HOME\'S調べ)' },
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
  { h: '価格推移(出典: LIFULL HOME\'S調べ)' },
  { k: 'inputs.price_trend.city_3y_pct', l: '市の3年上昇率(%)', t: 'num', d: '空欄なら内訳の合計' },
  { k: 'inputs.price_trend.prefecture_3y_pct', l: '県の3年上昇率(%)', t: 'num', req: 1 },
  { k: 'yearly.0', l: '内訳: 初年度(%)', t: 'num', req: 1 },
  { k: 'yearly.1', l: '内訳: 2年目(%)', t: 'num', req: 1 },
  { k: 'yearly.2', l: '内訳: 3年目(%)', t: 'num', req: 1 },
  { k: 'inputs.price_trend.image', l: '価格推移グラフ(画像)', t: 'image', req: 1, d: 'グラフのスクリーンショットなどの画像' },
  { h: '土地(出典: REINS調べ)' },
  { k: 'inputs.land.tsubo_price_man', l: '坪単価(万円/坪)', t: 'num', req: 1 },
  { k: 'inputs.land.tsubo_price_low_rise_residential_man', l: '低層住居専用地域の相場(万円/坪)', t: 'num', req: 1 },
  { k: 'inputs.land.tsubo_price_other_residential_man', l: 'それ以外の住居専用地域(万円/坪)', t: 'num', req: 1 },
  { k: 'inputs.land.listings', l: '土地の物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.land.price_man', l: '土地の売却価格相場(万円)', t: 'num', req: 1, d: 'まとめ(P10)に表示' },
  { k: 'inputs.land.price_per_m2_man', l: '土地の平米単価(万円/㎡)', t: 'num', req: 1 },
  { k: 'inputs.land.land_area_median_m2', l: '土地面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'compare.0', l: '比較市1', t: 'list', req: 1, d: '対象市を含む5市。対象市の値は上の坪単価・物件数が使われる' },
  { k: 'compare.1', l: '比較市2', t: 'list', req: 1 },
  { k: 'compare.2', l: '比較市3', t: 'list', req: 1 },
  { k: 'compare.3', l: '比較市4', t: 'list', req: 1 },
  { k: 'compare.4', l: '比較市5', t: 'list', req: 1 },
  { h: '中古戸建て(出典: REINS調べ)' },
  { k: 'inputs.used_house.price_man', l: '売却価格相場(万円)', t: 'num', req: 1 },
  { k: 'inputs.used_house.listings', l: '物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.used_house.building_area_median_m2', l: '建物面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.used_house.land_area_median_m2', l: '土地面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.used_house.age_median_years', l: '築年数の中央値(年)', t: 'num', req: 1 },
  { k: 'inputs.used_house.heatmap_image', l: '面積×価格の分布表(画像)', t: 'image', req: 1 },
  { h: '中古マンション(出典: REINS調べ)' },
  { k: 'inputs.used_mansion.price_man', l: '売却価格相場(万円)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.listings', l: '物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.exclusive_area_median_m2', l: '専有面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.age_median_years', l: '築年数の中央値(年)', t: 'num', req: 1 },
  { k: 'inputs.used_mansion.heatmap_image', l: '面積×価格の分布表(画像)', t: 'image', req: 1 },
  { h: '新築戸建て(出典: REINS調べ)' },
  { k: 'inputs.new_house.price_man', l: '売却価格相場(万円)', t: 'num', req: 1 },
  { k: 'inputs.new_house.listings', l: '物件数(件)', t: 'num', req: 1 },
  { k: 'inputs.new_house.building_area_median_m2', l: '建物面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.new_house.land_area_median_m2', l: '土地面積の中央値(㎡)', t: 'num', req: 1 },
  { k: 'inputs.new_house.heatmap_image', l: '面積×価格の分布表(画像)', t: 'image', req: 1 },
  { h: '検索ボリューム(出典: Google広告調べ)' },
  { k: 'kw.土地', l: '「{市} 土地」', t: 'list', req: 1 },
  { k: 'kw.中古マンション', l: '「{市} 中古マンション」', t: 'list', req: 1 },
  { k: 'kw.不動産', l: '「{市} 不動産」', t: 'list', req: 1 },
  { k: 'kw.中古物件', l: '「{市} 中古物件」', t: 'list', req: 1 },
  { h: '近隣不動産会社(「{市} 不動産」「{市} 土地」「{市} 中古」で検索したSEO上位3社)' },
  { k: 'comp.0', l: '近隣不動産会社1', t: 'list', req: 1 },
  { k: 'comp.1', l: '近隣不動産会社2', t: 'list', req: 1 },
  { k: 'comp.2', l: '近隣不動産会社3', t: 'list', req: 1 },
  { h: '自動記録(編集不要)' },
  { k: 'company', l: '(会社名)', hidden: 1 },
  { k: 'auto.created', l: '(自動)追加した日', hidden: 1 },
  { k: 'auto.date.area', l: '(自動)世帯数の入力日', hidden: 1 },
  { k: 'auto.date.income', l: '(自動)年収の入力日', hidden: 1 },
  { k: 'auto.date.price_trend', l: '(自動)価格推移の入力日', hidden: 1 },
  { k: 'auto.date.listings', l: '(自動)物件データの入力日', hidden: 1 },
  { k: 'auto.date.keywords', l: '(自動)検索ボリュームの入力日', hidden: 1 }
];

/** 値を書いたとき、取得日(入力日)を更新する区分 */
function dateKeyFor_(key) {
  if (key === 'inputs.area.households') return 'auto.date.area';
  if (/^inputs\.income\.|^bracket_/.test(key)) return 'auto.date.income';
  if (/^inputs\.price_trend\.|^yearly\./.test(key)) return 'auto.date.price_trend';
  if (/^inputs\.(land|used_house|used_mansion|new_house)\.|^compare\./.test(key)) return 'auto.date.listings';
  if (/^kw\./.test(key)) return 'auto.date.keywords';
  return null;
}
function isImageKey_(key) { return /\.image$|\.heatmap_image$/.test(key) && FIELDS_.some(function (f) { return f.k === key && f.t === 'image'; }); }

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
    if (f.t === 'image') v = String(raw).trim(); else if (f.t === 'num') v = parseNum_(raw); else if (f.t === 'date') v = parseDate_(raw); else if (f.t === 'list') v = splitList_(raw); else v = String(raw).trim();
    if (v === undefined) return;
    var m;
    if ((m = k.match(/^bracket_hh\.(\d)$/))) hh[+m[1]] = v;
    else if ((m = k.match(/^bracket_sh\.(\d)$/))) sh[+m[1]] = v;
    else if ((m = k.match(/^yearly\.(\d)$/))) yearly[+m[1]] = v;
    else if ((m = k.match(/^series\.(.+)$/))) series[m[1]] = m[1] === 'labels' ? v : v.map(parseNum_);
    else if ((m = k.match(/^compare\.(\d)$/))) { if (v[0]) compare.push({ city: v[0], tsubo_price_man: parseNum_(v[1]), listings: parseNum_(v[2]) }); }
    else if ((m = k.match(/^comp\.(\d)$/))) { if (v[0]) comp.push({ name: v[0], area: v[1] || undefined, url: v[2] || undefined, listing_count: parseNum_(v[3]) }); }
    else if ((m = k.match(/^kw\.(.+)$/))) kw.push({ term: m[1], monthly_volume: parseNum_(v[0]), cpc_low_yen: parseNum_(v[1]), cpc_high_yen: parseNum_(v[2]) });
    else if (k.indexOf('auto.') === 0) { /* 下で処理 */ }
    else setPath_(cfg, k, v);
  });
  var auto = function (k) { var x = vals[k]; return x ? parseDate_(x) : undefined; };
  cfg.created = cfg.created || auto('auto.created') || today;
  cfg.inputs.area = cfg.inputs.area || {}; cfg.inputs.income = cfg.inputs.income || {}; cfg.inputs.price_trend = cfg.inputs.price_trend || {};
  cfg.inputs.keywords = cfg.inputs.keywords || {};
  cfg.inputs.area.source = FIXED_SOURCES_.area; cfg.inputs.area.date = auto('auto.date.area');
  cfg.inputs.income.source = FIXED_SOURCES_.income; cfg.inputs.income.date = auto('auto.date.income');
  cfg.inputs.price_trend.source = FIXED_SOURCES_.price_trend; cfg.inputs.price_trend.date = auto('auto.date.price_trend');
  cfg.inputs.keywords.source = FIXED_SOURCES_.keywords; cfg.inputs.keywords.date = auto('auto.date.keywords');
  cfg.inputs.listings_source = FIXED_SOURCES_.listings; cfg.inputs.listings_date = auto('auto.date.listings');
  var any = false, brackets = [];
  for (var i = 0; i < 5; i++) {
    var b = { label: BRACKET_LABELS_[i] };
    if (hh[i] !== undefined) { b.households = hh[i]; any = true; }
    if (sh[i] !== undefined) { b.share = sh[i] / 100; any = true; }
    brackets.push(b);
  }
  if (any) { cfg.inputs.income = cfg.inputs.income || {}; cfg.inputs.income.brackets = brackets; }
  if (yearly.length === 3 && yearly.every(function (x) { return x !== undefined; })) { cfg.inputs.price_trend = cfg.inputs.price_trend || {}; cfg.inputs.price_trend.yearly_pct = yearly; }
  // series: 画面からは入力しない(互換用)
  if (series.labels && Object.keys(series).length > 1) { cfg.inputs.price_trend = cfg.inputs.price_trend || {}; cfg.inputs.price_trend.series = series; }
  if (compare.length) { cfg.inputs.land = cfg.inputs.land || {}; cfg.inputs.land.compare_cities = compare; }
  if (kw.length) { cfg.inputs.keywords = cfg.inputs.keywords || {}; cfg.inputs.keywords.rows = kw; }
  if (comp.length) cfg.competitors = comp;
  return cfg;
}

/** 加盟店一覧シートの行 → 選定用のレコード(有効なものだけ) */
function franchiseRowsFrom_(values) {
  return values.filter(function (r) { return String(r[0]).trim() && !/^(×|停止|0|無効)$/.test(String(r[5]).trim()); })
    .map(function (r) { return { name: String(r[0]).trim(), prefecture: String(r[1]).trim(), city: String(r[2]).trim(), address: String(r[3]).trim(), url: String(r[4]).trim() }; });
}

/** 入力システム用: 複数項目をカンマで束ねる欄の列見出し */
function colsFor_(key) {
  if (/^compare\./.test(key)) return ['市名', '坪単価(万円/坪)', '物件数(件)'];
  if (/^comp\./.test(key)) return ['名称', '所在市', 'URL', '掲載物件数(任意)'];
  if (/^kw\./.test(key)) return ['月間検索ボリューム', 'CPC下限(円)', 'CPC上限(円)'];
  return null;
}

/** クライアントに渡す項目定義 */
function fieldsMeta_() {
  var out = [];
  FIELDS_.forEach(function (f) {
    if (f.hidden) return;
    if (f.h) { if (f.h !== '自動記録(編集不要)') out.push({ h: f.h.replace(/\{市\}/g, '○○市') }); return; }
    out.push({ k: f.k, l: f.l.replace('{市}', '○○市'), t: f.t || 'text', req: f.req ? 1 : 0, d: f.d || '', cols: colsFor_(f.k) });
  });
  return out;
}

/** 値の検証。問題があればメッセージ、なければ '' */
function validateValue_(key, value) {
  var f = null;
  FIELDS_.forEach(function (x) { if (x.k === key) f = x; });
  if (!f || f.hidden) return '不明な項目です';
  if (f.t === 'image') return '画像はアップロードで登録してください';
  value = String(value);
  if (value.length > 600) return '長すぎます(600文字まで)';
  if (value.trim() === '') return '';
  if (key === 'prefecture') { try { normalizePrefecture_(value); } catch (e) { return e.message; } return ''; }
  if (f.t === 'num' && parseNum_(value) === undefined) return '数値で入力してください';
  if (f.t === 'date' && parseDate_(value) === undefined) return '日付は 2026-01-19 の形で入力してください';
  if (f.t === 'list' && colsFor_(key)) {
    var parts = splitList_(value);
    var numCols = /^compare\./.test(key) ? [1, 2] : /^comp\./.test(key) ? [3] : [0, 1, 2];
    for (var i = 0; i < numCols.length; i++) {
      var v = parts[numCols[i]];
      if (v !== undefined && v !== '' && parseNum_(v) === undefined) return colsFor_(key)[numCols[i]] + 'は数値で入力してください';
    }
  }
  return '';
}
