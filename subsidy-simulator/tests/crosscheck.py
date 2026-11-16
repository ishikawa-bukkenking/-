"""独立した計算(Python・整数演算)で、ランダム条件を作り、calc.js と突き合わせる。
使い方: python3 subsidy-simulator/tests/crosscheck.py
"""
import json, random, subprocess, pathlib, sys
here = pathlib.Path(__file__).resolve().parent
P = json.load(open(here.parent / "params.json", encoding="utf-8"))
V = lambda x: x["value"]

def expected(case):
    """整数(パーセント・円)だけで計算する。"""
    course = P["courses"][case["course"]]
    size, fmt, hrs = case["size"], case["format"], case["hours"]
    out = {}
    if hrs < 10 or (fmt != "elearning" and case["attend"] < 80):
        return {"base": 0, "bonus_total": 0}
    for phase in ("base", "bonus"):
        tot = 0
        for g, n in (("regular", case["regular"]), ("fixedTerm", case["fixedTerm"])):
            if n == 0: continue
            pct = round(V(course["expenseRate"][size][g][phase]) * 100)
            exp = case["expense"] * pct // 100
            if fmt == "elearning":
                lim = V(course["elearningLimit"][size])
            else:
                lim = next(V(t[size]) for t in course["expenseLimit"]
                           if hrs >= t["minHours"] and (t["maxHours"] is None or hrs < t["maxHours"]))
            exp = min(exp, lim)
            unit = V(course["wageUnit"][size][phase])
            # 受講した所定内時間(百分率の積。整数のまま)
            wh_x10000 = hrs * case["sched"] * case["attend"]
            capx = V(P["common"]["wageHoursCap"]) * 10000
            wage = 0 if fmt == "elearning" else unit * min(wh_x10000, capx) // 10000
            tot += (exp + wage) * n
        out[phase] = min(tot, V(course["annualCap"]))
    return {"base": out["base"], "bonus_total": out["bonus"]}

random.seed(20261116)
cases = []
for i in range(20):
    cases.append({
        "course": random.choice(["jinzai", "jinzai", "reskilling"]),
        "size": random.choice(["small", "small", "large"]),
        "regular": random.randint(0, 40), "fixedTerm": random.randint(0, 40),
        "format": random.choice(["classroom", "classroom", "elearning"]),
        "hours": random.choice([8, 10, 12, 30, 45, 99, 100, 150, 199, 200, 400, 1300]),
        "sched": random.choice([100, 100, 80, 50, 25]),
        "attend": random.choice([100, 100, 90, 80, 79]),
        "expense": random.randint(0, 120) * 10000,
    })
    if cases[-1]["regular"] + cases[-1]["fixedTerm"] == 0: cases[-1]["regular"] = 1
    if cases[-1]["hours"] == 0: cases[-1]["hours"] = 1

js = r"""
const fs=require('fs');const C=require(process.argv[1]+'/calc.js');
const P=JSON.parse(fs.readFileSync(process.argv[1]+'/params.json','utf8'));
const cases=JSON.parse(fs.readFileSync(0,'utf8'));
console.log(JSON.stringify(cases.map(c=>{const r=C.calculate(P,{course:c.course,size:c.size,regular:c.regular,fixedTerm:c.fixedTerm,
 format:c.format,hours:c.hours,scheduledPercent:c.sched,attendancePercent:c.attend,expensePerPerson:c.expense});
 return {base:r.base.total,bonus_total:r.withBonus.total};})));
"""
res = subprocess.run(["node", "-e", js, str(here.parent)], input=json.dumps(cases), capture_output=True, text=True, check=True)
got = json.loads(res.stdout)
bad = 0
for c, g in zip(cases, got):
    e = expected(c)
    if e != g:
        bad += 1; print("NG", c, "期待", e, "実際", g)
print(f"{len(cases)-bad} / {len(cases)} 条件が一致")
sys.exit(1 if bad else 0)
