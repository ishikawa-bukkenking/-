/** SUUMO「不動産売却」の地域ページ(売却価格相場)から、中古マンション・土地・中古戸建ての相場を取り込む */

var SUUMO_BASE_ = 'https://suumo.jp/baikyaku/';
var SUUMO_PREF_SLUG_ = { '北海道': 'hokkaido', '青森県': 'aomori', '岩手県': 'iwate', '宮城県': 'miyagi', '秋田県': 'akita', '山形県': 'yamagata', '福島県': 'fukushima',
  '茨城県': 'ibaraki', '栃木県': 'tochigi', '群馬県': 'gunma', '埼玉県': 'saitama', '千葉県': 'chiba', '東京都': 'tokyo', '神奈川県': 'kanagawa',
  '新潟県': 'niigata', '富山県': 'toyama', '石川県': 'ishikawa', '福井県': 'fukui', '山梨県': 'yamanashi', '長野県': 'nagano', '岐阜県': 'gifu',
  '静岡県': 'shizuoka', '愛知県': 'aichi', '三重県': 'mie', '滋賀県': 'shiga', '京都府': 'kyoto', '大阪府': 'osaka', '兵庫県': 'hyogo', '奈良県': 'nara',
  '和歌山県': 'wakayama', '鳥取県': 'tottori', '島根県': 'shimane', '岡山県': 'okayama', '広島県': 'hiroshima', '山口県': 'yamaguchi', '徳島県': 'tokushima',
  '香川県': 'kagawa', '愛媛県': 'ehime', '高知県': 'kochi', '福岡県': 'fukuoka', '佐賀県': 'saga', '長崎県': 'nagasaki', '熊本県': 'kumamoto',
  '大分県': 'oita', '宮崎県': 'miyazaki', '鹿児島県': 'kagoshima', '沖縄県': 'okinawa' };

/** 取り込み先の入力項目。page の「どの種別の」「どの数値」を「どの入力項目」に入れるか */
var SUUMO_MAP_ = [
  { sec: 'mansion', label: 'マンション売却価格相場', key: 'inputs.used_mansion.price_man', name: '中古マンション 売却価格相場' },
  { sec: 'mansion', label: '専有面積', key: 'inputs.used_mansion.exclusive_area_median_m2', name: '中古マンション 専有面積(中央値)' },
  { sec: 'mansion', label: '築年数', key: 'inputs.used_mansion.age_median_years', name: '中古マンション 築年数(中央値)' },
  { sec: 'land', label: '土地売却価格相場', key: 'inputs.land.price_man', name: '土地 売却価格相場' },
  { sec: 'land', label: '平米単価相場', key: 'inputs.land.price_per_m2_man', name: '土地 平米単価' },
  { sec: 'land', label: '土地面積', key: 'inputs.land.land_area_median_m2', name: '土地 土地面積(中央値)' },
  { sec: 'house', label: '一戸建て売却価格相場', key: 'inputs.used_house.price_man', name: '中古戸建て 売却価格相場' },
  { sec: 'house', label: '建物面積', key: 'inputs.used_house.building_area_median_m2', name: '中古戸建て 建物面積(中央値)' },
  { sec: 'house', label: '土地面積', key: 'inputs.used_house.land_area_median_m2', name: '中古戸建て 土地面積(中央値)' },
  { sec: 'house', label: '築年数', key: 'inputs.used_house.age_median_years', name: '中古戸建て 築年数(中央値)' }
];
var SUUMO_SEC_MARK_ = { mansion: 'KrBaikyakuSobaMedian01_01', house: 'KrBaikyakuSobaMedian01_02', land: 'KrBaikyakuSobaMedian01_03' };

function suumoText_(s) { return String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function suumoNum_(s) {
  var t = String(s).replace(/[,，\s]/g, '');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;   // 「-」など(データ不足)は取り込まない
}

/** 売却価格相場の部分を読み取る。戻り値: { mansion: {ラベル: 数値|null}, land: {...}, house: {...} } (ブロックが無い種別は null) */
function parseSuumoMarket_(html) {
  var out = {};
  Object.keys(SUUMO_SEC_MARK_).forEach(function (sec) {
    var mark = SUUMO_SEC_MARK_[sec], a = html.indexOf(mark + ' Start'), b = html.indexOf(mark + ' End');
    if (a < 0 || b < a) { out[sec] = null; return; }
    var block = html.slice(a, b), vals = {};
    block.split('marketprice-item').slice(1).forEach(function (it) {
      var h = it.match(/marketprice_inner-header[^>]*>([\s\S]*?)<\/div>/), v = it.match(/marketprice_inner-emphasis[^>]*>([\s\S]*?)<\/span>/);
      if (h) vals[suumoText_(h[1])] = v ? suumoNum_(suumoText_(v[1])) : null;
    });
    out[sec] = vals;
  });
  return out;
}

/** 地域一覧のリンク: [{ name, url }] (/baikyaku/<県>/sa_…|sc_…/top/) */
function parseSuumoLinks_(html, slug) {
  var re = new RegExp('<a [^>]*href="(?:https://suumo\\.jp)?(/baikyaku/' + slug + '/s[a-z]_[a-z0-9]+/top/)"[^>]*>([\\s\\S]*?)</a>', 'g'), out = [], m, seen = {};
  while ((m = re.exec(html))) {
    var name = suumoText_(m[2]), k = name + '|' + m[1];
    if (name && !seen[k]) { seen[k] = 1; out.push({ name: name, url: 'https://suumo.jp' + m[1] }); }
  }
  return out;
}

/** 地域名に合うリンクを選ぶ。完全一致を優先。「愛知郡東郷町」のように郡名つきなら、末尾が地域名のものも許す */
function suumoFind_(links, city) {
  var c = cityKey_(city), exact = links.filter(function (l) { return l.name === c; });
  if (exact.length) return exact[0];
  var gun = links.filter(function (l) { return l.name.length > c.length && l.name.slice(-c.length) === c && /郡/.test(l.name); });
  return gun.length === 1 ? gun[0] : null;
}

function suumoFetchText_(url, fetch) {
  var r = fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'Accept-Language': 'ja', 'User-Agent': 'Mozilla/5.0 (compatible; AreaSheet/1.0)' } });
  var code = r.getResponseCode();
  if (code !== 200) throw new Error('SUUMOのページを取得できませんでした(' + code + '): ' + url);
  return r.getContentText();
}

/** 地域名からSUUMOの売却相場を取得。fetch は UrlFetchApp.fetch 互換、cache は { get(key), put(key, str) } (省略可) */
function suumoLookup_(pref, city, fetch, cache) {
  var slug = SUUMO_PREF_SLUG_[pref];
  if (!slug) throw new Error('「' + pref + '」のSUUMOのページが分かりません。');
  var prefUrl = SUUMO_BASE_ + slug + '/', links = null, ck = 'suumo:links:' + slug;
  if (cache) { var hit = cache.get(ck); if (hit) links = JSON.parse(hit); }
  if (!links) {
    links = parseSuumoLinks_(suumoFetchText_(prefUrl, fetch), slug);
    if (cache && links.length) cache.put(ck, JSON.stringify(links));
  }
  if (!links.length) throw new Error('SUUMOの「' + pref + '」のページから地域の一覧を読み取れませんでした(ページの作りが変わった可能性があります): ' + prefUrl);
  var hitLink = suumoFind_(links, city);
  if (!hitLink) throw new Error('SUUMOの「' + pref + '」のページに「' + city + '」が見つかりません(SUUMOでは市区町村・区ごとのページです)。');
  var market = parseSuumoMarket_(suumoFetchText_(hitLink.url, fetch)), values = {}, got = [], missing = [];
  if (!market.mansion && !market.land && !market.house) throw new Error('SUUMOのページから「売却価格相場」を読み取れませんでした(ページの作りが変わった可能性があります): ' + hitLink.url);
  SUUMO_MAP_.forEach(function (m) {
    var v = market[m.sec] ? market[m.sec][m.label] : null;
    if (v === null || v === undefined) missing.push(m.name); else { values[m.key] = v; got.push(m.name); }
  });
  return { url: hitLink.url, name: hitLink.name, values: values, got: got, missing: missing };
}

/**
 * 入力画面: 地域名からSUUMOの売却相場を取り込む。
 * - 空欄の項目に入れる。前回の自動入力のままの項目は、最新の値に更新する。手で直した項目は変えない
 * - 取り込んだ項目と元のURL・日付は auto.suumo に記録する
 */
function api_suumo_fetch(areaId) {
  requireUser_();
  var a = areaById_(areaId);
  if (!a) throw new Error('エリアが見つかりません。');
  var pref = a.values.prefecture || a.pref, city = a.values.city || a.city, res;
  try {
    res = suumoLookup_(pref, city, function (u, o) { return UrlFetchApp.fetch(u, o); }, { get: cacheGet_, put: cachePut_ });
  } catch (e) {
    writeAreaValues_(areaId, function (values) { values['auto.suumo'] = JSON.stringify({ error: String(e.message || e), at: todayStr_() }); });
    return { ok: false, message: String(e.message || e) };
  }
  var filled = 0, kept = [];
  writeAreaValues_(areaId, function (values) {
    var prev = {};
    try { prev = (JSON.parse(values['auto.suumo'] || '{}').filled) || {}; } catch (e) { prev = {}; }
    var now = {};
    Object.keys(res.values).forEach(function (k) {
      var cur = values[k];
      if (cur === undefined || String(cur).trim() === '' || (prev[k] !== undefined && String(cur) === String(prev[k]))) { values[k] = String(res.values[k]); now[k] = res.values[k]; filled++; }
      else kept.push(k);
    });
    values['auto.suumo'] = JSON.stringify({ url: res.url, name: res.name, at: todayStr_(), filled: now });
    values['auto.date.listings'] = todayStr_();
  });
  return { ok: true, url: res.url, filled: filled, got: res.got, missing: res.missing, kept: kept.length };
}
