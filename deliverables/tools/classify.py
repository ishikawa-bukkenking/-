import csv,re,zipfile,collections,os
from lxml import etree
import openpyxl
from openpyxl.styles import Font,PatternFill,Alignment
from openpyxl.utils import column_index_from_string as ci, get_column_letter as gl
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
z=zipfile.ZipFile('orig/orig.xlsx')
names=["社名","全体フロー","研修詳細","店舗内装","ターゲットエリア","免許","目標設定","事業検討","簡易PL","PL（1年目）","PL（2年目以降）","決定事項"]
ss=[]
for si in etree.fromstring(z.read('xl/sharedStrings.xml')).xpath('//m:si',namespaces=ns):
    ss.append(''.join(t.text or '' for t in si.xpath('m:t|m:r/m:t',namespaces=ns)))
st=etree.fromstring(z.read('xl/styles.xml'))
fills=[]
for f in st.xpath('//m:fills/m:fill',namespaces=ns):
    fg=f.xpath('m:patternFill/m:fgColor',namespaces=ns); fills.append(fg[0].get('rgb') if fg else None)
xfill=[fills[int(x.get('fillId'))] for x in st.xpath('//m:cellXfs/m:xf',namespaces=ns)]
grid={};blank_blue=collections.defaultdict(list)
from openpyxl.utils import range_boundaries
def mchild(t):
    ch=set()
    for m in t.xpath('//m:mergeCell/@ref',namespaces=ns):
        c1,r1,c2,r2=range_boundaries(m)
        for r in range(r1,r2+1):
            for c in range(c1,c2+1):
                if (r,c)!=(r1,c1): ch.add(f'{gl(c)}{r}')
    return ch
for i,n in enumerate(names,1):
    t=etree.fromstring(z.read(f'xl/worksheets/sheet{i}.xml')); g={}; kids=mchild(t)
    for c in t.xpath('//m:sheetData//m:c',namespaces=ns):
        v=c.find('m:v',ns); f=c.find('m:f',ns)
        if f is None and v is not None and c.get('t')=='s': g[c.get('r')]=('s',ss[int(v.text)])
        elif f is None and v is not None: g[c.get('r')]=('n',v.text)
        elif f is not None: g[c.get('r')]=('f','')
        elif xfill[int(c.get('s','0'))]=='FFCCFFFF' and n not in names[9:11] and c.get('r') not in kids: blank_blue[n].append(c.get('r'))
    grid[n]=g
def label(n,cell):
    m=re.match(r'([A-Z]+)(\d+)',cell);c=ci(m.group(1));r=int(m.group(2));g=grid[n]
    for cc in range(c-1,0,-1):
        v=g.get(f'{gl(cc)}{r}')
        if v and v[0]=='s' and v[1].strip(): return re.sub(r'\s+',' ',v[1])[:24]
    for rr in range(r-1,0,-1):
        v=g.get(f'{gl(c)}{rr}')
        if v and v[0]=='s' and v[1].strip(): return re.sub(r'\s+',' ',v[1])[:24]
    return ''
inv=list(csv.DictReader(open('/root/.claude/uploads/db782ef1-e569-59dc-97e4-a77616c95c04/2577c79b-inventory_constants.csv',encoding='utf-8-sig')))
A,B,C='A 会社固有→空にする','B 想定値→残す','C ラベル→残す'
Bjk={('ターゲットエリア','AV3'):'CPC。ご指示どおり想定値',
 ('事業検討','C17'):'会員登録歩留り',('事業検討','C18'):'来店率',('事業検討','C19'):'契約率',('事業検討','G30'):'CVR',
 ('事業検討','L18'):'消耗品費(過去事例)',('事業検討','L21'):'事務用品費(過去事例)',('事業検討','L24'):'諸会費(宅建協会年会費)',
 ('事業検討','L28'):'水道光熱費(過去事例)',('事業検討','L31'):'リース料(過去事例)',('事業検討','L37'):'雑費(過去事例)',
 ('事業検討','L42'):'研修費',('事業検討','L43'):'PPCコンサル',('事業検討','L44'):'SVコンサル',('事業検討','L46'):'会費/月',
 ('事業検討','L51'):'物件王 加盟金',('事業検討','C44'):'接待交際費/月 単価',('事業検討','C45'):'保険料/月 単価',
 ('事業検討','D54'):'インセ足切り係数',('事業検討','D58'):'インセ率',('事業検討','O63'):'仮PPC20万/月'}
for c in ['S36','T36','U36','S37','T37','U37','S38','U38','Y37','Y38','Y39','AA37','AA38','AA39','Y43','Z43','Y44','Z44']: Bjk[('事業検討',c)]='建築シナジー 単価・利益率・受注頻度'
Ajk={('ターゲットエリア','C6'):'対象エリア名',('ターゲットエリア','C7'):'対象エリア名',('ターゲットエリア','K6'):'世帯数',('ターゲットエリア','K7'):'世帯数',('社名','C15'):'社名',('免許','D3'):'免許の有無(入力規則あり)',('目標設定','E8'):'人員給与',('目標設定','E11'):'人員給与',('目標設定','B21'):'年間営業利益目標',
 ('目標設定','D38'):'対応事業チェック(入力規則□/■)',('目標設定','K38'):'対応事業チェック(入力規則□/■)',('目標設定','U38'):'対応事業チェック(入力規則□/■)',
 ('事業検討','F11'):'確定件数/月',('事業検討','C46'):'店舗賃料/月',('事業検討','C48'):'改装/新築(入力規則)',('事業検討','L55'):'看板設置費用',
 ('簡易PL','D7'):'1年目 リフォーム件数(手入力)',('簡易PL','D8'):'1年目 自社請負件数(手入力)',('簡易PL','D9'):'1年目 他社紹介件数(手入力)',('簡易PL','I7'):'2年目 リフォーム件数(手入力)'}
for c in ['D26','D27','D28','D29']: Ajk[('事業検討',c)]='広告費 その他枠(サンプルでは0)'
for c in ['K17','Q17','K18','Q18','K19','Q19','K23','Q23','K24','Q24','K25','Q25','K26','Q26','K81','K87','K93','K99']: Ajk[('ターゲットエリア',c)]='市区町村別 物件数/金額(万円)'
for c in ['W37','W38','W39','S39','E52']: Cjk=None
Q=[]
rows=[]
def add(n,c,val,k,act,why,q=''): rows.append([n,c,val,k,act,why,q])
done=set()
for x in inv:
    n,c,v=x['シート'],x['セル'],x['値']; done.add((n,c)); lab=label(n,c)
    short=v if len(v)<=40 else v[:40]+'…'; short=short.replace('\n',' ')
    key=(n,c)
    if key in Ajk: add(n,c,short,A,'空にする' if not c.startswith(('D38','K38','U38')) else '□(未選択)にする案',Ajk[key],'Q9' if c in('D38','K38','U38') else ('Q8' if n=='簡易PL' else ''))
    elif key in Bjk: add(n,c,short,B,'残す(「前提」の見た目に)',Bjk[key],'Q4' if c in('L51','L46','L42','L43','L44') or Bjk[key].startswith('建築') else '')
    elif n=='事業検討' and c=='C43': add(n,c,short,'要確認','(保留)','採用費/年 168。想定年収×35%の概算','Q5')
    elif n=='店舗内装' and x['種別']=='数値': add(n,c,short,B,'残す','標準レイアウトの必要面積(㎡)','Q6')
    elif n=='免許' and c.startswith('D') and x['種別']=='数値': add(n,c,short,B,'残す','免許・協会関連の費用。都道府県で異なる可能性','Q7')
    elif n in names[9:11] and x['種別']=='数値': add(n,c,short,A,'0のまま','PLの入力欄。サンプルでも0(空にしても結果は同じ)','Q10')
    elif n=='PL（1年目）' or n=='PL（2年目以降）': add(n,c,short,C,'残す','勘定科目ラベル(水色は装飾)')
    elif n=='研修詳細' and x['判定(仮)']=='入力候補': add(n,c,short,C,'残す','研修カリキュラム本文。水色は装飾(機械判定の誤り)','Q11')
    elif n=='目標設定' and c in('G24','P24'): add(n,c,short,C,'残す','見出し(緑は装飾)')
    elif n=='簡易PL' and c.endswith('8') and c[:2] in('AL','AM','AN','AO','AP','AQ','AR','AS','AT','AU','AV','AW','AX','AY','AZ','BA','BB','BC','BD','BE','BF','BG','BH','BI'): add(n,c,short,C,'残す','作業領域の月番号(1〜24)')
    elif n=='事業検討' and c in('W37','W38','W39','S39','E52'): add(n,c,short,C,'残す','黄色の注記・ラベル(機械判定の誤り)')
    elif x['判定(仮)']=='入力候補': add(n,c,short,'要確認','(保留)',lab,'?')
    else: add(n,c,short,C,'残す',lab if lab else '見出し・ラベル')
for n,cs in blank_blue.items():
    for c in cs:
        if (n,c) in done: continue
        add(n,c,'(空欄)',A,'空のまま','元から空の水色入力欄 → 入力欄として扱う','Q?'.replace('Q?',''))
print(collections.Counter(r[3] for r in rows)); print({n:len(c) for n,c in blank_blue.items()})
for r in rows:
    if r[3]=='要確認': print(r)
import pickle;pickle.dump(rows,open('rows.pkl','wb'))
