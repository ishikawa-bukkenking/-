import sys,zipfile,re
from lxml import etree
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
z=zipfile.ZipFile('new/new.xlsx')
ss=[ ''.join(si.itertext()) for si in etree.fromstring(z.read('xl/sharedStrings.xml')).xpath('//m:si',namespaces=ns)]
i=int(sys.argv[1]); r0=int(sys.argv[2]); r1=int(sys.argv[3])
t=etree.fromstring(z.read(f'xl/worksheets/sheet{i}.xml'))
for row in t.xpath('//m:sheetData/m:row',namespaces=ns):
    rn=int(row.get('r'))
    if not(r0<=rn<=r1): continue
    out=[]
    for c in row:
        v=c.find('m:v',ns); f=c.find('m:f',ns)
        if f is not None: out.append(f"{c.get('r')}=[{(f.text or '')[:28]}]")
        elif v is not None:
            s=ss[int(v.text)] if c.get('t')=='s' else v.text
            out.append(f"{c.get('r')}:{s[:22]!r}".replace('\n','/'))
    if out: print(' | '.join(out))
