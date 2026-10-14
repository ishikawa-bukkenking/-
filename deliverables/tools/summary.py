"""「まとめ」シート(入力内容のまとめ+グラフ)を、既存シートを一切変更せずに追加する。
すべて既存シートを参照する数式で、入力は不要。"""
import sys,re,copy,zipfile,json
sys.path.insert(0,'/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/tools')
from lxml import etree
from fmt import *
from openpyxl.utils import get_column_letter as gl
from sheetset import FOOTER
SHEET='まとめ'
PL1="'PL（1年目）'"; PL2="'PL（2年目以降）'"
MCOLS=['D','E','F','G','H','I','K','L','M','N','O','P']
REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
Y='#,##0"円";[Red]-#,##0"円";"―"'
FMT=dict(yen=Y,cnt='#,##0"件";[Red]-#,##0"件";"―"',nin='#,##0"名";[Red]-#,##0"名";"―"',set='#,##0"世帯";[Red]-#,##0"世帯";"―"',
         buk='#,##0"物件";[Red]-#,##0"物件";"―"',pct='0%;-0%;"―"',num='#,##0;[Red]-#,##0;"―"',mon='0"ヶ月"',date='yyyy/m/d',man='#,##0.0;[Red]-#,##0.0;"―"',gen='General')

def build_cells():
    """(cells, merges, heights, last_row, regions) を返す。cells: ref -> (kind, content, style, fmt)"""
    C={}; M=[]; H={}
    def put(ref,kind,content,style,fmt='gen'): C[ref]=(kind,content,style,fmt)
    def merge(a,b): M.append(f'{a}:{b}')
    def band(r,text,style='sec',ht=22):
        put(f'B{r}','s',text,style); merge(f'B{r}',f'M{r}'); H[r]=ht
        for c in 'CDEFGHIJKLM': put(f'{c}{r}','e','',style)
    r=1
    # --- タイトル帯 ---
    for rr in(1,2,3):
        for c in 'BCDEFGHIJKLM': put(f'{c}{rr}','e','','band')
    put('B1','s','物件王','band_sm'); put('B2','s','事業計画サマリー  Business Plan Summary','band_title'); H[1]=18; H[2]=30; H[3]=6
    put('B5','f','IFERROR(IF(社名!C15="","(社名を入力してください)",社名!C15&" 様"),"―")','company'); merge('B5','M5'); H[5]=34
    put('B6','f','"事業計画検討書   作成日 "&TEXT(TODAY(),"yyyy/m/d")','date'); merge('B6','M6'); H[6]=18
    # --- 01 入力内容のまとめ ---
    r=8; band(r,'01  入力内容のまとめ')
    left=[('会社名','f','IFERROR(IF(社名!C15="","―",社名!C15),"―")','gen'),
          ('免許の有無','f','IFERROR(IF(免許!D3="","―",免許!D3),"―")','gen'),
          ('対象エリア①','f','IFERROR(IF(ターゲットエリア!C6="","―",ターゲットエリア!C6),"―")','gen'),
          ('対象エリア②','f','IFERROR(IF(ターゲットエリア!C7="","―",ターゲットエリア!C7),"―")','gen'),
          ('世帯数 合計','f','IFERROR(ターゲットエリア!K12,0)','set'),
          ('予測物件数(エリア)','f','IFERROR(事業検討!D4,0)','buk'),
          ('手数料/件','f','IFERROR(事業検討!E4,0)','yen'),
          ('クリック単価(CPC)','f','IFERROR(ターゲットエリア!AV3,0)','yen')]
    right=[('目標契約件数/月','f','IFERROR(事業検討!C11,0)','cnt'),
           ('年間営業利益の目標','f','IFERROR(目標設定!B21,0)','yen'),
           ('営業人数 / メンバー合計','f','IFERROR(事業検討!P7&"名 / "&事業検討!P12&"名","―")','gen'),
           ('店舗賃料/月','f','IFERROR(事業検討!C46,0)','yen'),
           ('店舗形態','f','IFERROR(IF(事業検討!C48="","―",事業検討!C48),"―")','gen'),
           ('物件王 加盟金','f','IFERROR(事業検討!L51,0)','yen'),
           ('店舗組成費 合計(税込)','f','IFERROR(事業検討!L58,0)','yen'),
           ('対応事業','f','IFERROR(IF(事業検討!B36&事業検討!B37&事業検討!B38="","―",TRIM(IF(事業検討!B36<>"",事業検討!B36&" ","")&IF(事業検討!B37<>"",事業検討!B37&" ","")&IF(事業検討!B38<>"",事業検討!B38,""))),"―")','gen')]
    for i,(l,k,f,fm) in enumerate(left):
        rr=r+1+i; H[rr]=20
        put(f'B{rr}','s',l,'lbl'); put(f'C{rr}','e','','lbl'); put(f'D{rr}','e','','lbl'); merge(f'B{rr}',f'D{rr}')
        put(f'E{rr}',k,f,'val_r',fm); put(f'F{rr}','e','','val_r'); put(f'G{rr}','e','','val_r'); merge(f'E{rr}',f'G{rr}')
    for i,(l,k,f,fm) in enumerate(right):
        rr=r+1+i
        put(f'H{rr}','s',l,'lbl'); put(f'I{rr}','e','','lbl'); put(f'J{rr}','e','','lbl'); merge(f'H{rr}',f'J{rr}')
        put(f'K{rr}',k,f,'val_r',fm); put(f'L{rr}','e','','val_r'); put(f'M{rr}','e','','val_r'); merge(f'K{rr}',f'M{rr}')
    r=r+1+len(left)   # 17
    r+=1
    # --- 02 黒字化のタイミング ---
    band(r,'02  黒字化のタイミング(月次24ヶ月)'); r02=r
    r+=1
    put(f'B{r}','s','累計の営業損益が初めてプラスになる月','tile_lbl'); merge(f'B{r}',f'G{r}')
    put(f'H{r}','s','24ヶ月目までの累計営業損益','tile_lbl'); merge(f'H{r}',f'M{r}'); H[r]=18
    for c in 'CDEFGIJKLM': put(f'{c}{r}','e','','tile_lbl')
    r+=1; H[r]=34
    put(f'B{r}','f',None,'tile_val','mon'); merge(f'B{r}',f'G{r}')   # 後で黒字転換月の式を入れる
    put(f'H{r}','f',None,'tile_val','yen'); merge(f'H{r}',f'M{r}')
    for c in 'CDEFGIJKLM': put(f'{c}{r}','e','','tile_val')
    tile02=r
    r+=1; H[r]=6
    r+=1; chart1_top=r; 
    for k in range(14): H[r+k]=18
    r+=14
    put(f'B{r}','s','緑=累計が黒字の月、赤=赤字の月。累計は「簡易PL」のグラフ(黒字転換イメージ)と同じ集計で、月ごとの売上総利益から販売管理費を引いて合計したものです(開業時の初期費用=店舗組成費は含みません)。','note'); merge(f'B{r}',f'M{r}'); H[r]=28
    r+=2
    # --- 03 損益分岐点と必要契約数 ---
    band(r,'03  損益分岐点と必要契約数'); sec03=r
    r+=1
    tiles1=[('人件費/年','IFERROR(目標設定!M7,0)','yen'),('その他費用/年','IFERROR(目標設定!S7,0)','yen'),('損益分岐点/年','IFERROR(目標設定!Y7,0)','yen')]
    tiles2=[('損益分岐点 必要契約数/年','IFERROR(目標設定!R16,0)','cnt'),('同 必要契約数/月','IFERROR(目標設定!Y16,0)','cnt'),('目標契約件数/年','IFERROR(目標設定!P25,0)','cnt')]
    for row_t in(tiles1,tiles2):
        H[r]=18; H[r+1]=34
        for j,(l,f,fm) in enumerate(row_t):
            c0=['B','F','J'][j]; c1=['E','I','M'][j]
            cols=[chr(x) for x in range(ord(c0),ord(c1)+1)]
            put(f'{c0}{r}','s',l,'tile_lbl'); put(f'{c0}{r+1}','f',f,'tile_val',fm)
            for c in cols[1:]: put(f'{c}{r}','e','','tile_lbl'); put(f'{c}{r+1}','e','','tile_val')
            merge(f'{c0}{r}',f'{c1}{r}'); merge(f'{c0}{r+1}',f'{c1}{r+1}')
        r+=2; H[r]=6; r+=1
    put(f'B{r}','f','IFERROR("目標契約件数の種別内訳(年間):  土地 "&目標設定!AB24&"件 / 中古 "&目標設定!AB25&"件 / 新築建売 "&目標設定!AB26&"件","―")','note'); merge(f'B{r}',f'M{r}'); H[r]=20
    r+=2
    # --- 04 簡易P&L ---
    band(r,'04  簡易P&L(1年目・2年目)'); r+=1
    put(f'B{r}','s','1年目(稼働約半年)','sub'); merge(f'B{r}',f'G{r}'); put(f'H{r}','s','2年目','sub'); merge(f'H{r}',f'M{r}')
    for c in 'CDEFGIJKLM': put(f'{c}{r}','e','','sub')
    H[r]=20; r+=1
    for (c0,labs) in(('B',('科目','件数','金額')),('H',('科目','件数','金額'))):
        cs=[chr(ord(c0)+i) for i in range(6)]
        put(f'{cs[0]}{r}','s',labs[0],'th'); put(f'{cs[1]}{r}','e','','th'); merge(f'{cs[0]}{r}',f'{cs[1]}{r}')
        put(f'{cs[2]}{r}','s',labs[1],'th'); put(f'{cs[3]}{r}','s',labs[2],'th'); put(f'{cs[4]}{r}','e','','th'); put(f'{cs[5]}{r}','e','','th'); merge(f'{cs[3]}{r}',f'{cs[5]}{r}')
    H[r]=20; r+=1
    items=[('仲介手数料',6),('リフォーム',7),('自社請負',8),('他社紹介',9)]
    for i,(nm,sr) in enumerate(items):
        for (c0,cc,ac) in(('B','D','E'),('H','I','J')):
            cs=[chr(ord(c0)+k) for k in range(6)]
            put(f'{cs[0]}{r}','s',nm,'td'); put(f'{cs[1]}{r}','e','','td'); merge(f'{cs[0]}{r}',f'{cs[1]}{r}')
            put(f'{cs[2]}{r}','f',f'IFERROR(簡易PL!{cc}{sr},0)','td_r','cnt')
            put(f'{cs[3]}{r}','f',f'IFERROR(簡易PL!{ac}{sr},0)','td_r','yen'); put(f'{cs[4]}{r}','e','','td_r'); put(f'{cs[5]}{r}','e','','td_r'); merge(f'{cs[3]}{r}',f'{cs[5]}{r}')
        H[r]=20; r+=1
    for nm,sr,st_ in(('売上高 合計',10,'tot'),('販売管理費 合計',12,'tot'),('営業損益',15,'profit')):
        for (c0,ac) in(('B','E'),('H','J')):
            cs=[chr(ord(c0)+k) for k in range(6)]
            put(f'{cs[0]}{r}','s',nm,st_+'_l'); put(f'{cs[1]}{r}','e','',st_+'_l'); put(f'{cs[2]}{r}','e','',st_+'_l'); merge(f'{cs[0]}{r}',f'{cs[2]}{r}')
            put(f'{cs[3]}{r}','f',f'IFERROR(簡易PL!{ac}{sr},0)',st_+'_r','yen'); put(f'{cs[4]}{r}','e','',st_+'_r'); put(f'{cs[5]}{r}','e','',st_+'_r'); merge(f'{cs[3]}{r}',f'{cs[5]}{r}')
        H[r]=22; r+=1
    r+=1
    # --- 05 月次推移 ---
    band(r,'05  月次推移(24ヶ月)'); sec05=r; r+=1
    hdr=[('月','B','B'),('売上高','C','D'),('売上総利益','E','F'),('販売管理費','G','H'),('営業損益','I','J'),('累計営業損益','K','M')]
    for t,a,b in hdr:
        put(f'{a}{r}','s',t,'th')
        for x in range(ord(a)+1,ord(b)+1): put(f'{chr(x)}{r}','e','','th')
        if a!=b: merge(f'{a}{r}',f'{b}{r}')
    H[r]=20; r+=1
    t0=r
    for m in range(1,25):
        sh=PL1 if m<=12 else PL2; col=MCOLS[(m-1)%12]; rr=r+m-1
        put(f'B{rr}','n',m,'td_c','mon')
        sc=gl(37+m)   # 簡易PLの作業領域(AL〜BI列)= 簡易PLのグラフと同じ集計
        put(f'C{rr}','f',f'IFERROR({sh}!{col}2,0)','td_r','yen'); put(f'D{rr}','e','','td_r'); merge(f'C{rr}',f'D{rr}')
        put(f'E{rr}','f',f'IFERROR(簡易PL!{sc}6,0)','td_r','yen'); put(f'F{rr}','e','','td_r'); merge(f'E{rr}',f'F{rr}')
        put(f'G{rr}','f',f'IFERROR(簡易PL!{sc}7,0)','td_r','yen'); put(f'H{rr}','e','','td_r'); merge(f'G{rr}',f'H{rr}')
        put(f'I{rr}','f',f'E{rr}-G{rr}','td_r','yen'); put(f'J{rr}','e','','td_r'); merge(f'I{rr}',f'J{rr}')
        put(f'K{rr}','f',(f'I{rr}' if m==1 else f'K{rr-1}+I{rr}'),'td_rb','yen'); put(f'L{rr}','e','','td_rb'); put(f'M{rr}','e','','td_rb'); merge(f'K{rr}',f'M{rr}')
        H[rr]=18
    t1=r+23
    r=t1+2
    # --- 06 建築事業の利益イメージ ---
    band(r,'06  建築事業の利益イメージ'); r+=1
    hd=[('事業','B','C'),('単価','D','E'),('利益率','F','G'),('不動産分配利益率','H','I'),('年間受注頻度','J','K'),('年間利益','L','M')]
    for t,a,b in hd:
        put(f'{a}{r}','s',t,'th'); put(f'{b}{r}','e','','th'); merge(f'{a}{r}',f'{b}{r}')
    H[r]=20; r+=1
    r06=r
    for i,sr in enumerate((36,37,38)):
        rr=r+i; H[rr]=20
        put(f'B{rr}','f',f'IFERROR(IF(事業検討!B{sr}="","―",事業検討!B{sr}),"―")','td'); put(f'C{rr}','e','','td'); merge(f'B{rr}',f'C{rr}')
        for (a,b,ref,fm) in(('D','E',f'事業検討!S{sr}','yen'),('F','G',f'事業検討!T{sr}','pct'),('H','I',f'事業検討!U{sr}','pct'),('J','K',f'事業検討!C{sr}','cnt'),('L','M',f'事業検討!F{sr}','yen')):
            put(f'{a}{rr}','f',f'IFERROR({ref},0)','td_r',fm); put(f'{b}{rr}','e','','td_r'); merge(f'{a}{rr}',f'{b}{rr}')
    rr=r+3; H[rr]=22
    put(f'B{rr}','s','年間利益 合計','tot_l')
    for c in 'CDEFGHIJK': put(f'{c}{rr}','e','','tot_l')
    merge(f'B{rr}',f'K{rr}')
    put(f'L{rr}','f',f'SUM(L{r}:L{r+2})','tot_r','yen'); put(f'M{rr}','e','','tot_r'); merge(f'L{rr}',f'M{rr}')
    r=rr+2
    put(f'B{r}','s','このシートは「社名」「ターゲットエリア」「免許」「目標設定」「事業検討」「簡易PL」「PL」の内容を自動で集計したものです。数式で連動しているため、入力は不要です(入力は各シートの水色セルへ)。数値は事業計画上の想定であり、成果を保証するものではありません。','note'); merge(f'B{r}',f'M{r}'); H[r]=42
    last=r
    # 作業領域(グラフ用)
    put(f'O{t0-1}','s','月','work_h'); put(f'P{t0-1}','s','黒字(万円)','work_h'); put(f'Q{t0-1}','s','赤字(万円)','work_h'); put(f'U{t0-1}','s','黒字転換フラグ','work_h')
    for m in range(1,25):
        rr=t0+m-1
        put(f'O{rr}','f',f'B{rr}','work','gen')
        put(f'P{rr}','f',f'MAX(K{rr},0)/10000','work','man'); put(f'Q{rr}','f',f'MIN(K{rr},0)/10000','work','man')
        put(f'U{rr}','f',f'IF(K{rr}>0,1,0)','work','gen')
    # 黒字転換月・24ヶ月累計
    C[f'B{tile02}']=('f',f'IFERROR(INDEX(B{t0}:B{t1},MATCH(1,U{t0}:U{t1},0)),"―")','tile_val','mon')
    C[f'H{tile02}']=('f',f'K{t1}','tile_val','yen')
    regions=dict(chart1=(chart1_top,chart1_top+13),t0=t0,t1=t1,sec03=sec03,sec05=sec05)
    return C,M,H,last,regions

def styles(st):
    def font(sz=10,b=False,color='000000'):
        el=etree.fromstring('<font xmlns="%s">%s<sz val="%g"/><color rgb="FF%s"/><name val="%s"/><family val="3"/><charset val="128"/></font>'%(NS,'<b/>' if b else '',sz,color,FONT_NAME))
        return st._add(st.fonts,el,etree.tostring(el))
    def border(sides=(),color=PAL['LINE'],style='thin'):
        s=''.join('<%s style="%s"><color rgb="FF%s"/></%s>'%(t,style,color,t) if t in sides else '<%s/>'%t for t in('left','right','top','bottom'))
        el=etree.fromstring('<border xmlns="%s">%s<diagonal/></border>'%(NS,s)); return st._add(st.borders,el,etree.tostring(el))
    def xf(f,fill=None,bd=(),h='left',v='center',wrap=False,indent=0,nf=0,locked=True,bcolor=PAL['LINE']):
        al='<alignment horizontal="%s" vertical="%s" wrapText="%d"%s/>'%(h,v,1 if wrap else 0,' indent="%d"'%indent if indent else '')
        el=etree.fromstring('<xf xmlns="%s" numFmtId="%d" fontId="%d" fillId="%d" borderId="%d" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">%s</xf>'%(NS,nf,f,st.fill(fill) if fill else 0,border(bd,bcolor),al))
        return st._add(st.xfs,el,etree.tostring(el))
    B=PAL['BRAND']; allb=('left','right','top','bottom'); GRAY='595959'
    S={}
    S['band']=xf(font(10,False,'FFFFFF'),B); S['band_sm']=xf(font(10,False,'FFFFFF'),B,indent=1); S['band_title']=xf(font(20,True,'FFFFFF'),B,indent=1)
    S['company']=xf(font(20,True,'1A1A1A'),None,h='center'); S['date']=xf(font(10,False,GRAY),None,h='center')
    S['sec']=xf(font(12,True,'FFFFFF'),B,indent=1)
    S['lbl']=xf(font(10,False,GRAY),'F5F8F8',('bottom',),indent=1,bcolor='D0D7D7'); S['val_r']=xf(font(10,True,'1A1A1A'),None,('bottom',),h='right',bcolor='D0D7D7')
    S['tile_lbl']=xf(font(9,False,GRAY),'F5F8F8',('left','right','top'),h='center',bcolor='D0D7D7'); S['tile_val']=xf(font(18,True,B),'F5F8F8',('left','right','bottom'),h='center',bcolor='D0D7D7')
    S['sub']=xf(font(10,True,B),None,('bottom',),indent=0,bcolor=B)
    S['th']=xf(font(10,True,'FFFFFF'),B,allb,h='center'); S['td']=xf(font(10),None,allb,indent=1); S['td_r']=xf(font(10),None,allb,h='right'); S['td_c']=xf(font(10),None,allb,h='center'); S['td_rb']=xf(font(10,True),None,allb,h='right')
    S['tot_l']=xf(font(10,True),PAL['TINT'],allb,indent=1); S['tot_r']=xf(font(10,True),PAL['TINT'],allb,h='right')
    S['profit_l']=xf(font(11,True),PAL['NOTE_FILL'],allb,indent=1); S['profit_r']=xf(font(11,True),PAL['NOTE_FILL'],allb,h='right')
    S['note']=xf(font(9,False,GRAY),None,wrap=True,v='top')
    S['work']=xf(font(9,False,PAL['WORK_FONT']),PAL['WORK_FILL'],allb,h='right'); S['work_h']=xf(font(9,False,PAL['WORK_FONT']),PAL['WORK_FILL'],allb,h='center')
    S['e']=0
    return S

def sheet_xml(st,vals,protect):
    C,M,H,last,reg=build_cells(); S=styles(st)
    # 表示形式ごとのxfを作る(スタイル×表示形式)
    xcache={}
    def style_for(key,fmt):
        k=(key,fmt)
        if k in xcache: return xcache[k]
        base=S[key]
        if fmt=='gen' or key=='e': xcache[k]=base; return base
        x=copy.deepcopy(st.xfs[base]); x.set('numFmtId',str(st.numfmt(FMT[fmt]))); x.set('applyNumberFormat','1')
        xcache[k]=st._add(st.xfs,x,etree.tostring(x)); return xcache[k]
    rows=collections.defaultdict(dict)
    for ref,(kind,content,sty,fmt) in C.items():
        m=re.match(r'([A-Z]+)(\d+)',ref); rows[int(m.group(2))][ci(m.group(1))]=(ref,kind,content,sty,fmt)
    ws=etree.Element(q('worksheet'),nsmap={None:NS,'r':REL})
    sp=etree.SubElement(ws,q('sheetPr')); etree.SubElement(sp,q('tabColor')).set('rgb','FF'+PAL['BRAND']); etree.SubElement(sp,q('pageSetUpPr')).set('fitToPage','1')
    etree.SubElement(ws,q('dimension')).set('ref','A1:U%d'%last)
    svs=etree.SubElement(ws,q('sheetViews')); sv=etree.SubElement(svs,q('sheetView')); sv.attrib.update({'showGridLines':'0','zoomScale':'100','zoomScaleNormal':'100','workbookViewId':'0'})
    etree.SubElement(sv,q('selection')).attrib.update({'activeCell':'A1','sqref':'A1'})
    fp=etree.SubElement(ws,q('sheetFormatPr')); fp.set('defaultRowHeight','18'); fp.set('customHeight','1')
    cols=etree.SubElement(ws,q('cols'))
    for a,b,w in((1,1,1.5),(2,13,8.6),(14,14,2.5),(15,21,11)):
        c=etree.SubElement(cols,q('col')); c.attrib.update({'min':str(a),'max':str(b),'width':str(w),'customWidth':'1'})
    sd=etree.SubElement(ws,q('sheetData'))
    for rn in range(1,last+1):
        if rn not in rows and rn not in H: continue
        row=etree.SubElement(sd,q('row')); row.set('r',str(rn))
        if rn in H: row.set('ht',str(H[rn])); row.set('customHeight','1')
        for cn in sorted(rows.get(rn,{})):
            ref,kind,content,sty,fmt=rows[rn][cn]
            c=etree.SubElement(row,q('c')); c.set('r',ref); c.set('s',str(style_for(sty,fmt)))
            if kind=='s':
                c.set('t','inlineStr'); is_=etree.SubElement(c,q('is')); etree.SubElement(is_,q('t')).text=content
            elif kind=='n':
                etree.SubElement(c,q('v')).text=str(content)
            elif kind=='f':
                etree.SubElement(c,q('f')).text=content
                v=vals.get(ref) if vals else None
                if v is not None:
                    if v['e']!=0: c.set('t','e'); etree.SubElement(c,q('v')).text=v['s'] if v['s'].startswith('#') else '#VALUE!'
                    elif isinstance(v['raw'],str): c.set('t','str'); etree.SubElement(c,q('v')).text=v['raw']
                    else: etree.SubElement(c,q('v')).text=repr(float(v['raw'])) if v['raw']!=int(v['raw']) else str(int(v['raw']))
    if protect:
        sp_=etree.SubElement(ws,q('sheetProtection')); sp_.attrib.update({'sheet':'1','formatColumns':'0','formatRows':'0'})
    mc=etree.SubElement(ws,q('mergeCells')); mc.set('count',str(len(M)))
    for m in M: etree.SubElement(mc,q('mergeCell')).set('ref',m)
    etree.SubElement(ws,q('printOptions')).set('horizontalCentered','1')
    pm=etree.SubElement(ws,q('pageMargins')); pm.attrib.update({'left':'0.4','right':'0.4','top':'0.5','bottom':'0.6','header':'0.3','footer':'0.3'})
    ps=etree.SubElement(ws,q('pageSetup')); ps.attrib.update({'paperSize':'9','orientation':'portrait','fitToWidth':'1','fitToHeight':'0'})
    hf=etree.SubElement(ws,q('headerFooter')); etree.SubElement(hf,q('oddFooter')).text=FOOTER
    rb=etree.SubElement(ws,q('rowBreaks')); 
    breaks=[reg['sec03']-1,reg['sec05']-1]   # 03の直前、05の直前で改ページ
    rb.attrib.update({'count':str(len(breaks)),'manualBreakCount':str(len(breaks))})
    for b in breaks: etree.SubElement(rb,q('brk')).attrib.update({'id':str(b),'max':'16383','man':'1'})
    etree.SubElement(ws,q('drawing')).set('{%s}id'%REL,'rId1')
    return etree.tostring(ws,xml_declaration=True,encoding='UTF-8',standalone=True),last,reg
import collections


# ---------------- グラフ ----------------
CNS='http://schemas.openxmlformats.org/drawingml/2006/chart'
def _txpr(sz=900,color='595959',b=0):
    return ('<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="%d" b="%d"><a:solidFill><a:srgbClr val="%s"/></a:solidFill><a:latin typeface="%s"/><a:ea typeface="%s"/></a:defRPr></a:pPr><a:endParaRPr lang="ja-JP"/></a:p></c:txPr>'%(sz,b,color,FONT_NAME,FONT_NAME))
def _cache(vals,fmt='General'):
    if vals is None: return ''
    pts=''.join('<c:pt idx="%d"><c:v>%s</c:v></c:pt>'%(i,repr(float(v)) if v!=int(v) else int(v)) for i,v in enumerate(vals))
    return '<c:numCache><c:formatCode>%s</c:formatCode><c:ptCount val="%d"/>%s</c:numCache>'%(fmt,len(vals),pts)
def _ser(idx,name,cat_ref,val_ref,color,kind,cat_vals,val_vals):
    fill='<c:spPr><a:solidFill><a:srgbClr val="%s"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/>'%color if kind=='bar' else \
         '<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="%s"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="%s"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>'%(color,color)
    return ('<c:ser><c:idx val="%d"/><c:order val="%d"/><c:tx><c:v>%s</c:v></c:tx>%s<c:cat><c:numRef><c:f>%s</c:f>%s</c:numRef></c:cat><c:val><c:numRef><c:f>%s</c:f>%s</c:numRef></c:val>%s</c:ser>'
            %(idx,idx,name,fill,cat_ref,_cache(cat_vals),val_ref,_cache(val_vals,'#,##0'),'<c:smooth val="0"/>' if kind=='line' else ''))
def chart_xml(title,bars,lines,stacked,cat_ref,cat_vals,valsget):
    """bars/lines: [(name,ref,color)]"""
    ser=''; i=0
    for n,ref,col in bars: ser+=_ser(i,n,cat_ref,ref,col,'bar',cat_vals,valsget(ref)); i+=1
    bar=('<c:barChart><c:barDir val="col"/><c:grouping val="%s"/><c:varyColors val="0"/>%s<c:gapWidth val="%d"/>%s<c:axId val="111111111"/><c:axId val="222222222"/></c:barChart>'
         %('stacked' if stacked else 'clustered',ser,40 if stacked else 60,'<c:overlap val="100"/>' if stacked else '<c:overlap val="-10"/>'))
    ln=''
    if lines:
        ls=''
        for n,ref,col in lines: ls+=_ser(i,n,cat_ref,ref,col,'line',cat_vals,valsget(ref)); i+=1
        ln='<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>%s<c:marker val="1"/><c:axId val="111111111"/><c:axId val="222222222"/></c:lineChart>'%ls
    grid='<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E0E6E6"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>'
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="%s" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="%s"><c:date1904 val="0"/><c:lang val="ja-JP"/><c:roundedCorners val="0"/><c:chart>'
            '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr><a:r><a:rPr lang="ja-JP" sz="1100" b="1"><a:solidFill><a:srgbClr val="%s"/></a:solidFill><a:latin typeface="%s"/><a:ea typeface="%s"/></a:rPr><a:t>%s</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>'
            '<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>%s%s'
            '<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="800" b="0"/></a:pPr><a:r><a:rPr lang="ja-JP" sz="800" b="0"><a:solidFill><a:srgbClr val="595959"/></a:solidFill><a:latin typeface="%s"/><a:ea typeface="%s"/></a:rPr><a:t>月</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="A6A6A6"/></a:solidFill></a:ln></c:spPr>%s<c:crossAx val="222222222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>'
            '<c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>%s<c:title><c:tx><c:rich><a:bodyPr rot="-5400000" vert="horz"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="800" b="0"/></a:pPr><a:r><a:rPr lang="ja-JP" sz="800" b="0"><a:solidFill><a:srgbClr val="595959"/></a:solidFill><a:latin typeface="%s"/><a:ea typeface="%s"/></a:rPr><a:t>万円</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>%s<c:crossAx val="111111111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>'
            '<c:spPr><a:noFill/></c:spPr></c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/>%s</c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>'
            '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D0D7D7"/></a:solidFill></a:ln></c:spPr>%s</c:chartSpace>'
            )%(CNS,REL,PAL['BRAND'],FONT_NAME,FONT_NAME,title,bar,ln,FONT_NAME,FONT_NAME,_txpr(800),grid,FONT_NAME,FONT_NAME,_txpr(800),_txpr(900),_txpr(900))

def drawing_xml(reg):
    def anchor(i,top,bot,name):
        return ('<xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>%d</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>13</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>%d</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
                '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="%d" name="%s"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="%s"><c:chart xmlns:c="%s" xmlns:r="%s" r:id="rId%d"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>'
                %(top-1,bot,i+1,name,CNS,CNS,REL,i))
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
            +anchor(1,reg['chart1'][0],reg['chart1'][1],'グラフ 黒字化')+'</xdr:wsDr>').encode('utf8')

def make_charts(reg,vals):
    t0,t1=reg['t0'],reg['t1']
    cat=f"{SHEET}!$B${t0}:$B${t1}"; catv=list(range(1,25))
    def get(ref):
        if vals is None: return None
        m=re.match(r".*!\$([A-Z]+)\$(\d+):\$([A-Z]+)\$(\d+)",ref); col=m.group(1)
        out=[]
        for r in range(int(m.group(2)),int(m.group(4))+1):
            v=vals.get(f'{col}{r}'); out.append(float(v['raw']) if v and v['e']==0 and not isinstance(v['raw'],str) else 0.0)
        return out
    rng=lambda c: f"{SHEET}!${c}${t0}:${c}${t1}"
    c1=chart_xml('営業損益の累計(万円)',[('黒字',rng('P'),PAL['BRAND']),('赤字',rng('Q'),'D9534F')],[],True,cat,catv if vals else None,get)
    return c1.encode('utf8')

# ---------------- ブックへの組み込み ----------------
def add_summary(zin_path,out_path,position,protect,vals=None,select=False):
    zin=zipfile.ZipFile(zin_path); parts={n:zin.read(n) for n in zin.namelist()}; order=zin.namelist()[:]
    st=Styles(parts['xl/styles.xml'])
    sx,last,reg=sheet_xml(st,vals,protect)
    parts['xl/styles.xml']=st.tostring()
    c1=make_charts(reg,vals)
    new={'xl/worksheets/sheet14.xml':sx,'xl/drawings/drawing6.xml':drawing_xml(reg),'xl/charts/chart2.xml':c1,
         'xl/worksheets/_rels/sheet14.xml.rels':('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="%s/drawing" Target="../drawings/drawing6.xml"/></Relationships>'%REL).encode('utf8'),
         'xl/drawings/_rels/drawing6.xml.rels':('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="%s/chart" Target="../charts/chart2.xml"/></Relationships>'%REL).encode('utf8')}
    for k,v in new.items(): parts[k]=v; order.append(k)
    wb=etree.fromstring(parts['xl/workbook.xml']); sheets=wb.find('m:sheets',N)
    el=etree.Element(q('sheet')); el.set('name',SHEET); el.set('sheetId','42'); el.set('{%s}id'%REL,'rId102'); sheets.insert(position,el)
    for dn in wb.findall('m:definedNames/m:definedName',N):
        if int(dn.get('localSheetId'))>=position: dn.set('localSheetId',str(int(dn.get('localSheetId'))+1))
    dn=etree.SubElement(wb.find('m:definedNames',N),q('definedName')); dn.set('name','_xlnm.Print_Area'); dn.set('localSheetId',str(position)); dn.text=f"{SHEET}!$A$1:$N${last}"
    if select:
        wb.find('m:bookViews/m:workbookView',N).set('activeTab',str(position))
        for n in list(parts):
            if re.match(r'xl/worksheets/sheet\d+\.xml$',n) and n!='xl/worksheets/sheet14.xml':
                t=parts[n]
                if b'tabSelected="1"' in t[:3000]: parts[n]=t.replace(b' tabSelected="1"',b'',1)
        s14=parts['xl/worksheets/sheet14.xml'].replace(b'<sheetView ',b'<sheetView tabSelected="1" ',1); parts['xl/worksheets/sheet14.xml']=s14
    parts['xl/workbook.xml']=etree.tostring(wb,xml_declaration=True,encoding='UTF-8',standalone=True)
    rels=etree.fromstring(parts['xl/_rels/workbook.xml.rels'])
    r_=etree.SubElement(rels,'{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'); r_.set('Id','rId102'); r_.set('Type',REL+'/worksheet'); r_.set('Target','worksheets/sheet14.xml')
    parts['xl/_rels/workbook.xml.rels']=etree.tostring(rels,xml_declaration=True,encoding='UTF-8',standalone=True)
    ct=parts['[Content_Types].xml'].decode('utf8')
    add=('<Override PartName="/xl/worksheets/sheet14.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
         '<Override PartName="/xl/drawings/drawing6.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
         '<Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>')
    parts['[Content_Types].xml']=ct.replace('</Types>',add+'</Types>').encode('utf8')
    # app.xml(シート名一覧)
    titles=[s.get('name') for s in sheets]; pa=[d.text.split('!')[0]+'!Print_Area' for d in wb.findall('m:definedNames/m:definedName',N)]
    esc=lambda t:t.replace('&','&amp;')
    parts['docProps/app.xml']=('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="4" baseType="variant"><vt:variant><vt:lpstr>ワークシート</vt:lpstr></vt:variant><vt:variant><vt:i4>%d</vt:i4></vt:variant><vt:variant><vt:lpstr>名前付き一覧</vt:lpstr></vt:variant><vt:variant><vt:i4>%d</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="%d" baseType="lpstr">%s</vt:vector></TitlesOfParts><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>'
        %(len(titles),len(pa),len(titles)+len(pa),''.join('<vt:lpstr>%s</vt:lpstr>'%esc(t) for t in titles+pa))).encode('utf8')
    zout=zipfile.ZipFile(out_path,'w',zipfile.ZIP_DEFLATED)
    for n in order:
        zi=zipfile.ZipInfo(n,(2026,10,14,0,0,0)); zi.compress_type=zipfile.ZIP_DEFLATED; zout.writestr(zi,parts[n])
    zout.close(); return last,reg
