"""取り込んだ3シート(給与整合性・インセンティブ検討・能力判定)の入力分類: A=会社(人)ごとの入力 / B=前提(初期値を残す) / C=ラベル"""
import re,zipfile
from lxml import etree
from openpyxl.utils import range_boundaries,get_column_letter as gl
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
SD='/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/'
PARTS={'給与整合性':13,'インセンティブ検討':14,'能力判定':15}
def cells_in(rng):
    out=[]
    for part in rng.split():
        c1,r1,c2,r2=range_boundaries(part)
        for r in range(r1,r2+1):
            for c in range(c1,c2+1): out.append(f'{gl(c)}{r}')
    return out
def new_roles(path=SD+'orig_plus.xlsx'):
    z=zipfile.ZipFile(path); roles={}; rows=[]
    ss=[''.join(t.text or '' for t in si.xpath('m:t|m:r/m:t',namespaces=NS)) for si in etree.fromstring(z.read('xl/sharedStrings.xml')).xpath('//m:si',namespaces=NS)]
    A={'給与整合性':[],'インセンティブ検討':[],'能力判定':[]}; B={k:[] for k in A}
    A['給与整合性']=cells_in('F5:F10 H5:H10 F22:F27 H22:H27')
    B['給与整合性']=cells_in('F15:I15 V21:V26 Z5:Z8 M22 L25 S5:S17')
    A['インセンティブ検討']=cells_in('L2 L3 T9:T14 AB9:AB14 BE9:BE14')
    B['インセンティブ検討']=cells_in('L5 L6 AT3 BD3 BM3')
    t=etree.fromstring(z.read('xl/worksheets/sheet15.xml'))
    dv=[]
    for d in t.xpath('//m:dataValidation',namespaces=NS): dv+=cells_in(d.get('sqref'))
    A['能力判定']=cells_in('E6 AK4 BE4 BY4')+dv
    B['能力判定']=cells_in('DH39 DH52 DI43 DI56 DK39:DK43 DK52:DK56')
    for n in PARTS:
        roles[n]={}
        for c in B[n]: roles[n][c]='B'
        for c in A[n]: roles[n][c]='A'
        # 報告用: 値のある定数セルの一覧
        root=etree.fromstring(z.read(f'xl/worksheets/sheet{PARTS[n]}.xml'))
        for c in root.iterfind('.//m:sheetData/m:row/m:c',NS):
            if c.find('m:f',NS) is not None: continue
            v=c.find('m:v',NS)
            if v is None: continue
            val=ss[int(v.text)] if c.get('t')=='s' else v.text
            if val=='　' : continue
            k=roles[n].get(c.get('r'))
            cls={'A':'A 会社固有→空にする','B':'B 想定値→残す'}.get(k,'C ラベル→残す')
            rows.append([n,c.get('r'),(val if len(val)<=40 else val[:40]+'…').replace('\n',' '),cls])
    return roles,rows,A,B
if __name__=='__main__':
    r,rows,A,B=new_roles()
    import collections; print({n:(len(A[n]),len(B[n])) for n in A}); print(collections.Counter((x[0],x[3]) for x in rows))
