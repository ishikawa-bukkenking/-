import sys,re
sys.path.insert(0,'/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/tools')
from build import *
from cfg_all import *
from openpyxl.utils import column_index_from_string as ci
roles=load_roles()
def first(name):
    cs=[c for c,k in roles[name].items() if k=='A'] or [c for c,k in roles[name].items() if k=='B']
    if not cs: return 'A1'
    def key(c): m=re.match(r'([A-Z]+)(\d+)',c); return (int(m.group(2)),ci(m.group(1)))
    return sorted(cs,key=key)[0]
fi={i:first(NAMES[i-1]) for i in range(1,13)}
C=cfgs(fi); 
for i in C: C[i]['selected']=(i==1)
out=sys.argv[1]
st=build(out,C,print_areas=PRINT_AREAS,active_tab=0)
print(fi); print(st)
