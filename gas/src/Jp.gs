/** 日本語表記・数値整形(areasheet/jp.py の移植) */

var PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県',
  '埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県',
  '岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県',
  '佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

function prefCode_(name) { return PREFECTURES.indexOf(name) + 1; }

function normalizePrefecture_(name) {
  name = String(name || '').trim();
  if (PREFECTURES.indexOf(name) >= 0) return name;
  for (var i = 0; i < PREFECTURES.length; i++) {
    if (PREFECTURES[i] !== '北海道' && PREFECTURES[i].slice(0, -1) === name) return PREFECTURES[i];
  }
  throw new Error('都道府県名を解釈できません: ' + name);
}

/** 四捨五入(0から遠い方向へ。Pythonの ROUND_HALF_UP と同じ) */
function roundHalfUp_(x, nd) {
  nd = nd || 0;
  var s = x < 0 ? -1 : 1, a = Math.abs(x);
  return s * Number(Math.round(Number(a + 'e' + nd)) + 'e-' + nd);
}

function ceilTo_(x, unit) { return Math.ceil(x / unit) * unit; }

function commas_(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/** 桁区切りカンマ。nd 未指定時は小数の末尾0を落とす */
function num_(x, nd) {
  if (x === null || x === undefined || x === '') return '';
  x = Number(x);
  var neg = x < 0 ? '-' : '';
  var a = Math.abs(x);
  var body;
  if (nd !== undefined && nd !== null) {
    body = roundHalfUp_(a, nd).toFixed(nd);
  } else if (Number.isInteger(a)) {
    body = String(a);
  } else {
    body = a.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }
  var parts = body.split('.');
  return neg + commas_(parts[0]) + (parts[1] !== undefined ? '.' + parts[1] : '');
}

function cityKey_(name) { return String(name || '').replace(/[ 　]/g, ''); }

function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate_(iso) {
  var m = String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return String(iso);
  return Number(m[1]) + '/' + Number(m[2]) + '/' + Number(m[3]);
}
