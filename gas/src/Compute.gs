/** 算出・文章生成ルール(areasheet/compute.py の移植) */

var TYPES = ['used_mansion', 'land', 'new_house', 'used_house'];

function listingsTotal_(counts) {
  var sum = 0;
  for (var i = 0; i < TYPES.length; i++) {
    var v = counts[TYPES[i]];
    if (v === null || v === undefined) return null;
    sum += v;
  }
  return sum;
}

function brokerageFee_(priceMan) { return priceMan * 0.03 + 6.0; }

function brokerageUnit_(prices, counts) {
  var n = 0, tot = 0;
  for (var i = 0; i < TYPES.length; i++) {
    var t = TYPES[i];
    if (prices[t] == null || counts[t] == null) return null;
    n += counts[t];
    tot += brokerageFee_(prices[t]) * counts[t];
  }
  return n === 0 ? null : tot / n;
}

function bracketPhrase_(label) {
  return label.replace('万以', '万円以').replace('万未', '万円未').replace('万〜', '万円〜');
}

function incomeView_(city, pref, d) {
  var out = Object.assign({}, d);
  var c = d.city_avg_man, n = d.national_avg_man;
  out.diff_vs_national_man = (c == null || n == null) ? null : n - c; // 全国 − 市
  var br = (d.brackets || []).map(function (b) { return Object.assign({}, b); });
  if (br.length) {
    var hh = br.map(function (b) { return b.households; });
    if (hh.every(function (h) { return h != null; }) && hh.reduce(function (a, b) { return a + b; }, 0) > 0) {
      var tot = hh.reduce(function (a, b) { return a + b; }, 0);
      br.forEach(function (b) { if (b.share == null) b.share = b.households / tot; });
    }
    out.brackets = br;
    if (br.every(function (b) { return b.share != null; })) {
      out.share_sum = br.reduce(function (a, b) { return a + b.share; }, 0);
      var top = br.reduce(function (m, b) { return b.share > m.share ? b : m; }, br[0]);
      out.largest_bracket = { label: top.label, households: top.households, share: top.share };
    }
  }
  var rank = d.rank_in_prefecture, N = d.municipalities_in_prefecture;
  if (rank && N && c != null && n != null) {
    var rel = c < n ? '下' : c > n ? '上' : '同じ';
    out.headline = pref + 'で' + rank + '位/' + N + '市町村中　全国平均より' + rel;
    var lb = out.largest_bracket;
    if (lb && lb.households != null) {
      var diff = Math.abs(n - c);
      var verb = c > n ? '上回る' : '下回る';
      var diffTxt = diff ? num_(diff) + '万円' + verb + '結果になりました' : '同水準の結果になりました';
      out.body = city + 'の平均年収は' + num_(c) + '万円です。' + pref + 'の' + N + '市町村の中で' + rank +
        '位となり、全国の平均年収からは' + diffTxt + '。' +
        '年収階級別にみると年収' + bracketPhrase_(lb.label) + 'の世帯が一番多く' +
        num_(lb.households) + '世帯（' + roundHalfUp_(lb.share * 100, 1).toFixed(1) + '%）となります。';
    }
  }
  return out;
}

function trendJudge_(cityPct, prefPct, threshold) {
  var diff = cityPct - prefPct;
  if (Math.abs(diff) <= threshold + 1e-9) return '同程度';
  return diff > 0 ? '高い' : '低い';
}

function trendView_(city, pref, d, threshold) {
  var out = Object.assign({}, d);
  var y = d.yearly_pct;
  if (d.city_3y_pct == null && y && y.length === 3) {
    out.city_3y_pct = roundHalfUp_(y[0] + y[1] + y[2], 2);
    out.city_3y_pct_derived = true;
  }
  var c = out.city_3y_pct, p = out.prefecture_3y_pct;
  if (c != null && p != null) {
    out.judgement_vs_prefecture = trendJudge_(c, p, threshold);
    out.diff_pt = roundHalfUp_(c - p, 2);
  }
  if (c != null && p != null && y && y.length === 3) {
    var verb = c >= 0 ? '上昇' : '下落';
    out.body = city + 'の標準的な物件の価格は直近の3年間で' + num_(Math.abs(c), 2) + '%程度' + verb + 'しています。' +
      'これは' + city + 'のある' + pref + 'の変動の' + num_(p, 2) + '%に比べて' + out.judgement_vs_prefecture + 'の水準です。' +
      'この3年間の価格上昇率を内訳でみると、初年度' + num_(y[0], 2) + '%、2年目' + num_(y[1], 2) + '%、' +
      '3年目' + num_(y[2], 2) + '%となっています。';
  }
  return out;
}

function pointText_(total, unit) {
  var n = ceilTo_(total, unit);
  return '商圏で' + num_(n) + '件前後の物件情報数を担保できれば、商圏No.1の情報量を担保するHPを作り上げることが実証される';
}
