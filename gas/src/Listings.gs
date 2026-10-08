/** 物件データから相場・中央値・分布表を集計(areasheet/listings.py の移植) */

var TSUBO_ = 3.305785;
var TYPE_ALIASES_ = {
  land: ['土地', 'land'], used_house: ['中古戸建て', '中古戸建', '中古一戸建て', 'used_house'],
  used_mansion: ['中古マンション', 'マンション', 'used_mansion'], new_house: ['新築戸建て', '新築戸建', '新築一戸建て', 'new_house']
};
var PRICE_EDGES_ = [2000, 3000, 4000, 5000, 6000, 7000, 10000];
var AREA_EDGES_ = {
  land_area_m2: [60, 70, 80, 90, 100, 110, 120, 130, 140, 150],
  building_area_m2: [60, 70, 80, 90, 100, 110, 120, 130],
  exclusive_area_m2: [40, 50, 60, 70, 80, 90, 100]
};

function medianOf_(xs) {
  var a = xs.slice().sort(function (x, y) { return x - y; }), n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}
function med_(rows, key, nd) {
  var xs = rows.map(function (r) { return r[key]; }).filter(function (v) { return v != null && !isNaN(v); });
  if (!xs.length) return null;
  return roundHalfUp_(medianOf_(xs), nd || 0);
}
function heat_(rows, areaKey) {
  var edges = AREA_EDGES_[areaKey], pe = PRICE_EDGES_;
  var pts = rows.filter(function (r) { return r[areaKey] != null; });
  if (!pts.length) return null;
  var grid = [];
  for (var i = 0; i <= edges.length; i++) { grid.push(new Array(pe.length + 1).fill(0)); }
  pts.forEach(function (r) {
    var a = r[areaKey], p = r.price_man, i = edges.length, j = pe.length;
    for (var n = 0; n < edges.length; n++) if (a <= edges[n]) { i = n; break; }
    for (var m = 0; m < pe.length; m++) if (p < pe[m]) { j = m; break; }
    grid[i][j]++;
  });
  var rl = edges.map(function (e) { return '〜' + e + '㎡'; }).concat([edges[edges.length - 1] + '㎡超']);
  var cl = ['〜' + num_(pe[0])].concat(pe.map(function (e) { return e < 10000 ? num_(e) + '〜' : '1億〜'; }));
  var mx = 0; grid.forEach(function (r) { r.forEach(function (v) { if (v > mx) mx = v; }); });
  return { rows: rl, cols: cl, grid: grid, max: mx };
}

/** rows: [{type, price_man, land_area_m2, building_area_m2, exclusive_area_m2, age_years, zone}] */
function summarizeListings_(rows) {
  var by = {};
  Object.keys(TYPE_ALIASES_).forEach(function (k) { by[k] = []; });
  rows.forEach(function (r) {
    var key = null;
    Object.keys(TYPE_ALIASES_).forEach(function (k) { if (TYPE_ALIASES_[k].indexOf(String(r.type).trim()) >= 0) key = k; });
    if (key && r.price_man != null && !isNaN(r.price_man)) by[key].push(r);
  });
  var res = {};
  Object.keys(by).forEach(function (key) {
    var rs = by[key];
    if (!rs.length) return;
    var s = { listings: rs.length, price_man: med_(rs, 'price_man') };
    if (key === 'land') {
      rs.forEach(function (r) { if (r.land_area_m2) { r.tsubo = r.price_man / (r.land_area_m2 / TSUBO_); r.per_m2 = r.price_man / r.land_area_m2; } });
      var low = rs.filter(function (r) { return r.zone && String(r.zone).indexOf('低層') >= 0; });
      var oth = rs.filter(function (r) { return r.zone && String(r.zone).indexOf('住居') >= 0 && String(r.zone).indexOf('低層') < 0; });
      s.tsubo_price_man = med_(rs, 'tsubo', 1);
      s.tsubo_price_low_rise_residential_man = med_(low, 'tsubo', 1);
      s.tsubo_price_other_residential_man = med_(oth, 'tsubo', 1);
      s.price_per_m2_man = med_(rs, 'per_m2', 1);
      s.land_area_median_m2 = med_(rs, 'land_area_m2');
    } else if (key === 'used_mansion') {
      rs.forEach(function (r) { if (r.exclusive_area_m2) r.per_m2 = r.price_man / r.exclusive_area_m2; });
      s.exclusive_area_median_m2 = med_(rs, 'exclusive_area_m2'); s.age_median_years = med_(rs, 'age_years');
      s.price_per_m2_man = med_(rs, 'per_m2', 1);
      s.heatmaps = { exclusive_area_m2: heat_(rs, 'exclusive_area_m2') };
    } else {
      s.building_area_median_m2 = med_(rs, 'building_area_m2'); s.land_area_median_m2 = med_(rs, 'land_area_m2');
      s.heatmaps = { land_area_m2: heat_(rs, 'land_area_m2'), building_area_m2: heat_(rs, 'building_area_m2') };
      if (key === 'used_house') s.age_median_years = med_(rs, 'age_years');
    }
    res[key] = s;
  });
  return res;
}
