import json,sys
a=json.load(open(sys.argv[1])); b=json.load(open(sys.argv[2])); bad=0; n=0
for sh in b:
    for c,v in b[sh].items():
        n+=1; w=a.get(sh,{}).get(c)
        if w is None: bad+=1; print('欠',sh,c); continue
        ok=(v['e']==w['e']) and (v['s']==w['s'] if v['e'] else (abs(v['v']-w['v'])<=1e-6*max(1,abs(v['v'])) and (v['raw']==w['raw'] or not isinstance(v['raw'],str))))
        if not ok: bad+=1; print('差',sh,c,v,w) if bad<10 else None
print(sys.argv[1].split('/')[-1],'vs',sys.argv[2].split('/')[-1],':',n,'件中 不一致',bad)
