import re,zipfile,csv,collections
from lxml import etree
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
z=zipfile.ZipFile('orig/orig.xlsx')
names=["社名","全体フロー","研修詳細","店舗内装","ターゲットエリア","免許","目標設定","事業検討","簡易PL","PL（1年目）","PL（2年目以降）","決定事項"]
# styles fills
st=etree.fromstring(z.read('xl/styles.xml'))
fills=[]
for f in st.xpath('//m:fills/m:fill',namespaces=ns):
    fg=f.xpath('m:patternFill/m:fgColor',namespaces=ns)
    fills.append((fg[0].get('rgb') or ('t'+str(fg[0].get('theme'))+str(fg[0].get('tint'))) ) if fg else None)
xfs=st.xpath('//m:cellXfs/m:xf',namespaces=ns)
xfill=[fills[int(x.get('fillId'))] for x in xfs]
ss=[ ''.join(si.itertext()) for si in etree.fromstring(z.read('xl/sharedStrings.xml')).xpath('//m:si',namespaces=ns)]
const=re.compile(r'(?<![A-Za-z$!\d.])(\d+\.?\d*%?)(?![\d:A-Za-z!(])')
tot=collections.Counter(); hard=[]; textnum=[]
for i,n in enumerate(names,1):
    t=etree.fromstring(z.read(f'xl/worksheets/sheet{i}.xml'))
    cnt=collections.Counter()
    for c in t.xpath('//m:sheetData//m:c',namespaces=ns):
        f=c.find('m:f',ns); v=c.find('m:v',ns); fill=xfill[int(c.get('s','0'))]
        if f is not None:
            cnt['f']+=1
            if fill in('FFCCFFFF',): cnt['f_blue']+=1
            ft=f.text or ''
            ft2=re.sub(r"'[^']*'!|[A-Za-z]+!",'',ft)
            ft2=re.sub(r'\$?[A-Z]{1,3}\$?\d+','',ft2)
            nums=[x for x in re.findall(r'\d+\.?\d*%?',ft2) if x not in('0','1')]
            if nums: hard.append((n,c.get('r'),'='+ft,nums))
        elif v is not None:
            if c.get('t')=='s':
                s=ss[int(v.text)]
                if re.fullmatch(r'\s*[-+]?[\d,]+\.?\d*%?\s*',s): textnum.append((n,c.get('r'),s))
                cnt['str']+=1
            else:
                cnt['num']+=1
                if fill=='FFCCFFFF': cnt['num_blue']+=1
    print(n,dict(cnt))
print('\nhardcoded const formulas',len(hard))
for h in hard: print(h)
print('\ntext numbers',textnum)
