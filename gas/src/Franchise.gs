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

// ---------- 加盟店CSVの取り込み(areasheet/franchise.py の移植) ----------
var DESIGNATED_ = { '札幌市': '北海道', '仙台市': '宮城県', 'さいたま市': '埼玉県', '千葉市': '千葉県', '横浜市': '神奈川県', '川崎市': '神奈川県', '相模原市': '神奈川県',
  '新潟市': '新潟県', '静岡市': '静岡県', '浜松市': '静岡県', '名古屋市': '愛知県', '京都市': '京都府', '大阪市': '大阪府', '堺市': '大阪府', '神戸市': '兵庫県',
  '岡山市': '岡山県', '広島市': '広島県', '北九州市': '福岡県', '福岡市': '福岡県', '熊本市': '熊本県' };

/** RFC4180のCSVを行列にする(引用符・引用符内の改行に対応) */
function parseCsv_(text) {
  var rows = [], row = [], cur = '', q = false;
  text = String(text).replace(/^﻿/, '');
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/** 住所から {prefecture, city}。郡は落とし、政令市の区は市に統合する */
function splitAddress_(address) {
  var a = String(address || '').normalize('NFKC').replace(/〒?\s*\d{3}-?\d{4}/g, ' ').trim();
  var m = a.match(/^(北海道|東京都|京都府|大阪府|.{2,3}県)/), pref = '', rest;
  if (m) { pref = m[1]; rest = a.slice(m[0].length); }
  else {
    rest = a;
    Object.keys(DESIGNATED_).forEach(function (k) { if (!pref && a.indexOf(k) === 0) pref = DESIGNATED_[k]; });
  }
  rest = rest.split(/[\d\s]/)[0];
  if (!rest || !pref) return { prefecture: pref, city: '' };
  var gun = rest.indexOf('郡'), shi = rest.indexOf('市', 1);
  if (gun >= 0 && (shi < 0 || gun < shi)) {
    var m2 = rest.slice(gun + 1).match(/^[^\d\s]+?[町村]/);
    return { prefecture: pref, city: m2 ? m2[0] : '' };
  }
  if (shi >= 0) return { prefecture: pref, city: rest.slice(0, shi + 1) };
  var ku = rest.indexOf('区', 1);
  if (pref === '東京都' && ku >= 0) return { prefecture: pref, city: rest.slice(0, ku + 1) };
  var m3 = rest.match(/^[^\d\s]+?[町村]/);
  return { prefecture: pref, city: m3 ? m3[0] : '' };
}

/** 「会社名（旧：…）【屋号】《対応エリア》」から会社名・屋号・対応エリアを取り出す */
function cleanCompany_(raw) {
  raw = String(raw || '').replace(/　/g, ' ').trim();
  var shop = (raw.match(/【([^】]*)】/) || [0, ''])[1].trim(), area = (raw.match(/《([^》]*)》/) || [0, ''])[1].trim();
  var name = raw.split(/[【《]/)[0].replace(/[（(][^）)]*旧[^）)]*[）)]|＊旧[^【《\s]*|\*旧[^【《\s]*/g, '').replace(/\s+/g, ' ').trim();
  return { name: name, shop: shop, service_area: area };
}

/** 加盟店CSV(列: [顧客番号,]会社名,住所)。途中で改行された行(名称・住所の分断)は結合する */
function parseFranchiseRaw_(text) {
  var rows = parseCsv_(text).map(function (r) { return r.map(function (c) { return c.trim(); }); }).filter(function (r) { return r.some(function (c) { return c; }); });
  if (!rows.length) return [];
  var hasNo = rows[0].indexOf('顧客番号') >= 0, merged = [], pending = '';
  var PREF_RE = /^(北海道|東京都|京都府|大阪府|.{2,3}県)/;
  rows.slice(1).forEach(function (r) {
    var no = '', rest = r;
    if (hasNo && r.length >= 2 && /^[A-Za-z]\d+$/.test(r[0])) { no = r[0]; rest = r.slice(1); }
    if (rest.length === 1) {
      var last = merged[merged.length - 1];
      if (last && PREF_RE.test(rest[0].normalize('NFKC')) && /^〒?\s*\d{3}-?\d{4}$/.test(last[2] || '')) last[2] = last[2] + ' ' + rest[0];
      else pending += rest[0];
      return;
    }
    var name = rest[0], addr = rest[1] || '', prev = merged[merged.length - 1];
    if (prev && (prev[1].split('【').length > prev[1].split('】').length) && name.indexOf('】') === 0 && !prev[2]) { prev[1] += name; prev[2] = addr; return; }
    if (pending) { name = pending + name; pending = ''; }
    merged.push([no, name, addr]);
  });
  var out = [];
  merged.forEach(function (m) {
    if (m[1].split('【').length > m[1].split('】').length && !m[2]) return;
    var c = cleanCompany_(m[1]), a = splitAddress_(m[2]);
    out.push({ name: c.name, shop: c.shop, service_area: c.service_area, customer_no: m[0], address: String(m[2]).normalize('NFKC').trim(), prefecture: a.prefecture, city: a.city });
  });
  return out;
}

/** 取り込み用に整形済みの一覧CSV(列: name,prefecture,city,address,url,active,shop,service_area,customer_no)を読む */
function parseFranchiseClean_(text) {
  var rows = parseCsv_(text), head = rows.shift() || [];
  return rows.filter(function (r) { return r.some(function (c) { return c; }); }).map(function (r) {
    var o = {}; head.forEach(function (h, i) { o[h.trim()] = (r[i] || '').trim(); }); return o;
  });
}

/** CSVの種類を判定して 加盟店のレコード配列を返す */
function parseFranchiseAny_(text) {
  var first = String(text).replace(/^﻿/, '').split(/\r?\n/)[0].replace(/\s/g, '');
  if (/^(会社名,|顧客番号,)/.test(first)) return { rows: parseFranchiseRaw_(text), kind: 'raw' };
  if (/^name,/.test(first)) return { rows: parseFranchiseClean_(text), kind: 'clean' };
  throw new Error('CSVの1行目は「会社名,住所」または「顧客番号,会社名,住所」にしてください。');
}

/** 加盟店一覧シートへ取り込む。名称+住所が同じ行は更新(URL・有効/停止は維持)、無ければ追加。戻り値: 追加・更新件数と、都道府県/市区町村を判定できなかった名称 */
function importFranchiseRows_(sh, recs) {
  var last = sh.getLastRow(), cur = last > 1 ? sh.getRange(2, 1, last - 1, 9).getDisplayValues() : [], index = {};
  cur.forEach(function (r, i) { index[r[0] + '|' + r[3]] = i; });
  var added = 0, updated = 0, unresolved = [];
  recs.forEach(function (r) {
    if (!r.name) return;
    if (!r.prefecture || !r.city) { unresolved.push(r.name); return; }
    var key = r.name + '|' + r.address, row = [r.name, r.prefecture, r.city, r.address, r.url || '', (r.active === '0' || r.active === '×') ? '×' : '', r.shop || '', r.service_area || '', r.customer_no || ''];
    if (index[key] !== undefined) {
      var old = cur[index[key]]; row[4] = row[4] || old[4]; row[5] = old[5];
      cur[index[key]] = row; updated++;
    } else { index[key] = cur.length; cur.push(row); added++; }
  });
  if (cur.length) sh.getRange(2, 1, cur.length, 9).setValues(cur);
  return { added: added, updated: updated, unresolved: unresolved };
}
