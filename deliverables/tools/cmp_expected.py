import json,csv,sys
r=json.load(open(sys.argv[1]))
exp=list(csv.DictReader(open('/root/.claude/uploads/db782ef1-e569-59dc-97e4-a77616c95c04/bf90b261-expected_formula_values.csv',encoding='utf-8-sig')))
bad=0
OVR={('決定事項','A2'):'株式会社〇〇'}   # ご指示で社名を変更したため、この1件の期待値だけ差し替え
for x in exp:
    c=r.get(x['シート'],{}).get(x['セル'])
    if c is None: bad+=1; print('missing',x['シート'],x['セル']); continue
    e=OVR.get((x['シート'],x['セル']),x['Excel保存時の計算値'])
    if e.startswith('#'):
        ok=(c['s']==e)
        if not ok: bad+=1; print('diff',x['シート'],x['セル'],e,c)
        continue
    try: ev=float(e); ok=abs(c['v']-ev)<=1e-6*max(1,abs(ev)) and c['e']==0
    except ValueError: ok=(e in c['s']) and c['e']==0
    if not ok: bad+=1; print('diff',x['シート'],x['セル'],e,c)
print('checked',len(exp),'mismatch',bad)
