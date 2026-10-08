/** 周辺加盟店の選定(areasheet/franchise.py の移植)。一覧は 加盟店一覧 シートから読む */

var FR_TIERS_ = ['same_city', 'adjacent', 'same_prefecture'];

/** 既定: 同一市 → 隣接市 → 同一県 の順に、最初に該当があった段階の加盟店(最大 max 社) */
function selectFranchise_(rows, pref, city, neighbors, opt) {
  opt = opt || {};
  var max = opt.max || 3, tiers = opt.tiers || FR_TIERS_, stop = opt.stop_at_first_tier !== false;
  tiers.forEach(function (t) { if (FR_TIERS_.indexOf(t) < 0) throw new Error('franchise.tiers が不正です: ' + t); });
  var pool = rows.filter(function (r) { return r.prefecture === pref; });
  var picked = [], used = [];
  function add(cands, tier) {
    cands.forEach(function (r) {
      if (picked.length >= max || picked.indexOf(r) >= 0) return;
      picked.push(r); r._tier = tier;
      if (used.indexOf(tier) < 0) used.push(tier);
    });
  }
  for (var i = 0; i < tiers.length; i++) {
    var tier = tiers[i], c;
    if (tier === 'same_city') c = pool.filter(function (r) { return r.city === city; });
    else if (tier === 'adjacent') {
      c = pool.filter(function (r) { return neighbors.indexOf(r.city) >= 0; })
        .sort(function (a, b) { return neighbors.indexOf(a.city) - neighbors.indexOf(b.city); });
    } else c = pool.filter(function (r) { return r.city !== city; });
    add(c, tier);
    if (picked.length && stop) break;
  }
  return { items: picked.map(function (r) {
    return { name: r.name, prefecture: r.prefecture, city: r.city, url: r.url || '', area: r.prefecture + ' ' + r.city, tier: r._tier };
  }), tiers_used: used };
}
