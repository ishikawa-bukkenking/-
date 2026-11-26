// 元のスプレッドシート(エリア調査シート)の「会社」「エリア」から、こちらにまだない会社・エリアを取り込む。
// 旧ツール(Apps Script)や、移行のあとに旧ツールで作られた調査が、このツールの「会社とエリアの一覧」に出ないのを防ぐため。
//   ・こちらにないID(会社ID・エリアID)だけを足す。すでにあるものは変えない。
//   ・いちど取り込んだIDは、記録しておく(あとでこちらで消しても、元のシートから復活させない)。
//   ・画像(drive:…)の参照は、そのまま写す(旧ツールのDriveの画像は、こちらでは開けないことがある)。
// Mirror(sheetsMirror.js)と同じサービスアカウントを使う(読み取りだけ)。
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const TABS = { company: ['会社', 3], area: ['エリア', 10] };

async function readTab(mirror, tab, cols) {
  const last = String.fromCharCode(64 + cols), range = encodeURIComponent("'" + tab + "'!A2:" + last);
  const j = await mirror.call('GET', API + '/' + mirror.sheetId + '/values/' + range + '?valueRenderOption=FORMATTED_VALUE');
  return (j.values || []).map(r => Array.from({ length: cols }, (_, i) => (r[i] === undefined || r[i] === null ? '' : String(r[i])))).filter(r => r[0].trim());
}

/** haveCompany / haveArea: こちらにある ID の Set。seen: 取り込み済み(記録)の ID の Set。→ { companies: 行[], areas: 行[] }(足すもの) */
function pickMissing(srcCompanies, srcAreas, haveCompany, haveArea, seen) {
  const areas = srcAreas.filter(r => !haveArea.has(r[0].trim()) && !seen.has(r[0].trim()));
  const companies = srcCompanies.filter(r => !haveCompany.has(r[0].trim()) && !seen.has(r[0].trim()));
  return { companies, areas };
}

/** deps: { mirror, haveIds():{companies:Set, areas:Set}, seenIds():Set, importAll(data):res, markSeen(ids[]), log } */
async function pullMissing(deps) {
  const m = deps.mirror; if (!m.enabled()) return { companies: 0, areas: 0 };
  const [srcC, srcA] = await Promise.all([readTab(m, TABS.company[0], TABS.company[1]), readTab(m, TABS.area[0], TABS.area[1])]);
  const have = deps.haveIds(), pick = pickMissing(srcC, srcA, have.companies, have.areas, deps.seenIds());
  if (!pick.companies.length && !pick.areas.length) return { companies: 0, areas: 0 };
  const res = deps.importAll({ format: 'area-sheet-export', version: 1, sheets: { '会社': pick.companies, 'エリア': pick.areas }, files: {}, settings: {}, props: {} });
  deps.markSeen(pick.companies.map(r => r[0].trim()).concat(pick.areas.map(r => r[0].trim())));
  return { companies: res.companies, areas: res.areas };
}
module.exports = { pullMissing, pickMissing, readTab };
