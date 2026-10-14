import sys,re,math,zipfile,json,subprocess,copy,pickle
sys.path.insert(0,'/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/tools')
from build import *
from cfg_all import *
from sheetset import put,E,FOOTER
from openpyxl.utils import column_index_from_string as ci
SD='/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/'
roles=load_roles()
KEEP0={'PL（1年目）','PL（2年目以降）'}           # Q10: PLの入力欄は0のまま
CHECKS={('目標設定','D38'),('目標設定','K38'),('目標設定','U38')}   # Q9: □(未選択)
REL_NS='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
def first_input():
    def first(name):
        cs=[c for c,k in roles[name].items() if k=='A'] or [c for c,k in roles[name].items() if k=='B']
        if not cs: return 'A1'
        def key(c): m=re.match(r'([A-Z]+)(\d+)',c); return (int(m.group(2)),ci(m.group(1)))
        return sorted(cs,key=key)[0]
    return {i:first(NAMES[i-1]) for i in range(1,13)}

def build_formatted(out,unlock=False):
    C=cfgs(first_input())
    for i in C: C[i]['selected']=(i==1)
    return build(out,C,print_areas=PRINT_AREAS,active_tab=0,unlock=unlock)

# ---------- 使い方シート ----------
def make_usage(st,constants):
    f=lambda **k: k
    def font(sz=10,b=False,color='000000'):
        el=etree.fromstring('<font xmlns="%s">%s<sz val="%g"/><color rgb="FF%s"/><name val="%s"/><family val="3"/><charset val="128"/></font>'%(NS,'<b/>' if b else '',sz,color,FONT_NAME))
        return st._add(st.fonts,el,etree.tostring(el))
    def border(all_=True):
        if not all_: return 0
        s=''.join('<%s style="thin"><color rgb="FF%s"/></%s>'%(t,PAL['LINE'],t) for t in('left','right','top','bottom'))
        el=etree.fromstring('<border xmlns="%s">%s<diagonal/></border>'%(NS,s)); return st._add(st.borders,el,etree.tostring(el))
    def xf(font_,fill=None,bd=False,h='left',wrap=True,v='center'):
        el=etree.fromstring('<xf xmlns="%s" numFmtId="0" fontId="%d" fillId="%d" borderId="%d" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="%s" vertical="%s" wrapText="%d"/></xf>'%(NS,font_,st.fill(fill) if fill else 0,border(bd),h,v,1 if wrap else 0))
        return st._add(st.xfs,el,etree.tostring(el))
    S=dict(title=xf(font(16,True,PAL['BRAND']),wrap=False),
       h2=xf(font(12,True,PAL['BRAND']),wrap=False),
       head=xf(font(10,True,'FFFFFF'),PAL['BRAND'],True,'center'),
       cell=xf(font(10),None,True,'left'),
       cellc=xf(font(10),None,True,'center'),
       note=xf(font(10),None,False,'left'),
       in_=xf(font(10,False,PAL['INPUT_FONT']),PAL['INPUT_FILL'],True,'center'),
       as_=xf(font(10,False,PAL['INPUT_FONT']),PAL['ASSUME_FILL'],True,'center'),
       calc=xf(font(10),None,True,'center'),
       work=xf(font(10,False,PAL['WORK_FONT']),PAL['WORK_FILL'],True,'center'),
       headc=xf(font(10,True,'FFFFFF'),PAL['BRAND'],True,'center'),
       memo=xf(font(10),PAL['NOTE_FILL'],True,'center'))
    rows=[]   # (row番号, [(col, text, style)], height or None)
    merges=[]
    r=[1]
    def add(cells,ht=None):
        rows.append((r[0],cells,ht)); r[0]+=1
    def blank(): r[0]+=1
    def para(text,style='note',cols=('B','F'),chars=100):
        n=max(1,math.ceil(sum(2 if ord(ch)>255 else 1 for ch in text)/ (chars*1.0)))
        merges.append('%s%d:%s%d'%(cols[0],r[0],cols[1],r[0])); add([(cols[0],text,S[style])],ht=15*n+2)
    add([('B','事業計画書(不動産仲介 新規出店)テンプレート  使い方',S['title'])],ht=28); blank()
    para('このファイルは、他社の新規出店用に使い回せる事業計画書のテンプレートです。「会社ごとの入力」は空欄、「前提(想定値)」は初期値入りになっています。水色の入力欄だけ書き換えれば、他のシートに自動で計算結果が反映されます。')
    blank()
    add([('B','1. 色の見かた',S['h2'])],ht=20)
    add([('B','見本',S['head']),('C','意味',S['head']),('D','どうするか',S['head'])])
    for sw,lab,txt,how in((S['in_'],'1,000','入力セル(会社ごとに入力)','書き込んでください。ロックが外れている唯一の場所です(前提セルも同様)'),
        (S['as_'],'1,000','前提(想定値)','初期値のまま使えます。会社の実情に合わせて変えてもかまいません'),
        (S['calc'],'1,000','自動計算(数式)','入力しないでください(シート保護で書き換えできません)'),
        (S['work'],'1,000','触らない領域(計算用の作業領域)','PL・簡易PLの右側、ターゲットエリアの右端。印刷範囲の外にあります'),
        (S['headc'],'見出し','見出し(緑)','項目名です'),
        (S['memo'],'注記','黄色の注記','補足メモです')):
        add([('B',lab,sw),('C',txt,S['cell']),('D',how,S['cell'])],ht=32)
    blank()
    add([('B','2. シートの一覧と入力する順番',S['h2'])],ht=20)
    add([('B','順',S['head']),('C','シート',S['head']),('D','何をするか',S['head']),('E','入力するところ',S['head']),('F','種類',S['head'])])
    sheets=[('―','まとめ','入力内容のまとめとグラフ(黒字化のタイミング、損益分岐点、簡易P&L、月次推移)。各シートから自動で集計されます','―(入力不要。先に各シートへ入力)','確認'),
      ('1','社名','会社名を入れます(決定事項の表題にも出ます)','C15','入力'),
      ('2','ターゲットエリア','出店エリアの市区町村と世帯数、種別ごとの物件数・金額(万円)を入れます','水色セル(C6:K7、各エリア表の物件数・金額)。CPC(170円)は前提値','入力'),
      ('3','免許','免許の有無を選びます(有り/無し)。免許費用は前提値','D3(プルダウン)','入力'),
      ('4','目標設定','人員の給与、年間の営業利益目標、対応する事業(□を■にする)を入れます','E列(給与)、B21(目標)、□/■(プルダウン)','入力'),
      ('5','事業検討','確定件数、採用費、店舗賃料、減価償却の区分、店舗改装費・看板費などを入れます','F11、C43、C46、C48(プルダウン)、L54、L55、D26:D29','入力'),
      ('6','店舗内装','店舗に必要な面積の説明資料です(入力なし。面積は前提値)','―','入力系(参考)'),
      ('7','簡易PL','1年目・2年目の損益のまとめとグラフです。件数は前提値','D7:D9、I7(前提値)','確認'),
      ('8','PL(1年目) / PL(2年目以降)','月ごとの損益計算です。自動計算が中心です','水色の入力欄(初期値0:支払利息、支払元本など)','確認'),
      ('9','決定事項','署名・捺印する決定事項確認書です。内容は自動表示。A4・1ページで印刷','―(印刷して署名)','提出・印刷'),
      ('―','全体フロー / 研修詳細','加盟から営業開始までの流れと研修内容の説明資料です(入力なし)','―','提出・印刷')]
    for s_ in sheets: add([('B',s_[0],S['cellc']),('C',s_[1],S['cell']),('D',s_[2],S['cell']),('E',s_[3],S['cell']),('F',s_[4],S['cellc'])],ht=32)
    blank()
    add([('B','3. 入力するときの注意',S['h2'])],ht=20)
    for t in('・シート保護がかかっています(パスワードなし)。水色・グレーの入力セル以外は書き換えできません。解除は「校閲」→「シート保護の解除」です。',
             '・プルダウンのあるセル(免許!D3、目標設定の□/■、事業検討!C48)は、一覧から選びます。',
             '・数字は半角で入れます。金額は円、ターゲットエリアの「金額」は万円、世帯数は世帯です。',
             '・入力が空のうちは、割り算を含む一部の数式が「#DIV/0!」を表示することがあります。入力を進めると消えます。数式はそのままにしてあります。',
             '・用紙はA3のシート(全体フロー、研修詳細、店舗内装、事業検討、簡易PL、PL)とA4のシートが混在しています。印刷時は各シートの設定(横幅1ページ)のままお使いください。',
             '・Excelで共有する場合は、このシート(使い方)を残したままで問題ありません。不要なら削除できます(他のシートに影響しません)。'):
        para(t)
    blank()
    add([('B','4. 数式に直書きされている前提(定数)',S['h2'])],ht=20)
    para('次の数式には定数が直接書き込まれています。数式は変更していません。定数を変えたい場合は、数式そのものを修正する必要があります。',chars=100)
    add([('B','No',S['head']),('C','シート',S['head']),('D','セル(例)',S['head']),('E','数式(例)',S['head']),('F','セル数',S['head'])])
    for i,(sh,cells,fm,n) in enumerate(constants,1):
        add([('B',str(i),S['cellc']),('C',sh,S['cell']),('D',cells,S['cell']),('E',fm,S['cell']),('F',str(n),S['cellc'])],ht=32 if (len(fm)>40 or len(cells)>30) else 18)
    # --- XML ---
    sd=etree.Element(q('sheetData'))
    for rn,cells,ht in rows:
        row=etree.SubElement(sd,q('row')); row.set('r',str(rn))
        if ht: row.set('ht',str(ht)); row.set('customHeight','1')
        for col,text,sty in cells:
            c=etree.SubElement(row,q('c')); c.set('r',f'{col}{rn}'); c.set('s',str(sty)); c.set('t','inlineStr')
            is_=etree.SubElement(c,q('is')); t=etree.SubElement(is_,q('t')); t.text=text
            if text!=text.strip(): t.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
    ws=etree.Element(q('worksheet'),nsmap={None:NS,'r':REL_NS})
    sp=etree.SubElement(ws,q('sheetPr')); etree.SubElement(sp,q('tabColor')).set('rgb','FF404040'); etree.SubElement(sp,q('pageSetUpPr')).set('fitToPage','1')
    etree.SubElement(ws,q('dimension')).set('ref','B1:F%d'%(r[0]))
    svs=etree.SubElement(ws,q('sheetViews')); sv=etree.SubElement(svs,q('sheetView')); sv.set('showGridLines','0'); sv.set('tabSelected','1'); sv.set('zoomScale','100'); sv.set('zoomScaleNormal','100'); sv.set('workbookViewId','0')
    etree.SubElement(sv,q('selection')).attrib.update({'activeCell':'B1','sqref':'B1'})
    etree.SubElement(ws,q('sheetFormatPr')).set('defaultRowHeight','18')
    cols=etree.SubElement(ws,q('cols'))
    for a,b,w in((1,1,2.5),(2,2,16),(3,3,24),(4,4,40),(5,5,46),(6,6,14)):
        c=etree.SubElement(cols,q('col')); c.set('min',str(a)); c.set('max',str(b)); c.set('width',str(w)); c.set('customWidth','1')
    ws.append(sd)
    sp_=etree.SubElement(ws,q('sheetProtection')); sp_.set('sheet','1'); sp_.set('formatColumns','0'); sp_.set('formatRows','0')
    mc=etree.SubElement(ws,q('mergeCells')); mc.set('count',str(len(merges)))
    for m in merges: etree.SubElement(mc,q('mergeCell')).set('ref',m)
    etree.SubElement(ws,q('printOptions')).set('horizontalCentered','1')
    pm=etree.SubElement(ws,q('pageMargins')); pm.attrib.update({'left':'0.4','right':'0.4','top':'0.6','bottom':'0.6','header':'0.3','footer':'0.3'})
    ps=etree.SubElement(ws,q('pageSetup')); ps.attrib.update({'paperSize':'9','orientation':'portrait','fitToWidth':'1','fitToHeight':'0'})
    hf=etree.SubElement(ws,q('headerFooter')); etree.SubElement(hf,q('oddFooter')).text=FOOTER
    return etree.tostring(ws,xml_declaration=True,encoding='UTF-8',standalone=True),r[0]-1

def lo_to_excel(f):
    f=f.replace(';',',')
    f=re.sub(r"\$?('[^']+'|[^.\s,()=+\-*/<>&$']+)\.(?=\$?[A-Z]{1,3}\$?\d)",lambda m:m.group(1)+'!',f)
    return f
def constants_list():
    """数式内の直書き定数(共有数式の展開後を含む全数式)。LibreOfficeで展開した数式文字列から抽出"""
    import collections
    r=json.load(open(SD+'orig/recalc.json')); grp=collections.OrderedDict()
    for sh,d in r.items():
        for c,v in d.items():
            f=v['f']
            body=re.sub(r"'[^']*'\.|[^\s=(,;+\-*/<>&$']+\.(?=\$?[A-Z]{1,3}\$?\d)",'',f)
            body=re.sub(r'\$?[A-Z]{1,3}\$?\d+','',body)
            nums=[x for x in re.findall(r'\d+\.?\d*%?',body) if x not in('0','1')]
            if not nums: continue
            norm=re.sub(r'(\$?[A-Z]{1,3}\$?)\d+',r'\1#',f); norm=re.sub(r'\$?[A-Z]{1,3}(?=#)','~',norm)
            grp.setdefault((sh,norm),[f,[]])[1].append(c)
    return [(sh,', '.join(cs[:4])+(' …' if len(cs)>4 else ''),lo_to_excel(f),len(cs)) for (sh,norm),(f,cs) in grp.items()]

def assemble(formatted_unlocked,pre_out):
    """整形版(ロック解除付き)から、入力を空にし、保護・使い方を加えたテンプレート(キャッシュ値更新前)を作る"""
    zin=zipfile.ZipFile(formatted_unlocked); parts={n:zin.read(n) for n in zin.namelist()}
    order=[i.filename for i in zin.infolist()]
    saved={}   # (シート番号,セル)->(t,v)
    cleared=[] # 変更レポート用
    SST=etree.fromstring(parts['xl/sharedStrings.xml'])
    sis=SST.findall('m:si',N)
    # 1) 入力を空にする
    for i,name in enumerate(NAMES,1):
        path=f'xl/worksheets/sheet{i}.xml'; root=etree.fromstring(parts[path])
        for c in root.iterfind('.//m:sheetData/m:row/m:c',N):
            ref=c.get('r'); 
            if roles[name].get(ref)!='A' or c.find('m:f',N) is not None: continue
            v=c.find('m:v',N)
            if v is None: continue
            if (name,ref) in CHECKS:
                saved[(i,ref)]=(c.get('t'),v.text); c.set('t','s'); v.text='__CHECK__'; cleared.append((name,ref,'□')); continue
            if name in KEEP0 and c.get('t') is None and float(v.text)==0: continue
            saved[(i,ref)]=(c.get('t'),v.text)
            cleared.append((name,ref,sis[int(v.text)].xpath('string(.)') if c.get('t')=='s' else v.text))
            c.remove(v); c.attrib.pop('t',None)
        # 保護(パスワードなし)。結合やデータ入力規則より前に置く
        sp=E('sheetProtection',sheet=1,formatColumns=0,formatRows=0)
        put(root,sp)
        if i==1:
            sv=root.find('m:sheetViews/m:sheetView',N); sv.attrib.pop('tabSelected',None)
        parts[path]=etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
    # 2) 文字列表: 使われなくなった文字列を空にし、「□」を追加
    used=set(); refs=0
    for i in range(1,13):
        root=etree.fromstring(parts[f'xl/worksheets/sheet{i}.xml'])
        for c in root.iterfind('.//m:sheetData/m:row/m:c',N):
            if c.get('t')=='s':
                v=c.find('m:v',N); refs+=1
                if v.text!='__CHECK__': used.add(int(v.text))
    new_idx=len(sis)
    for k,si in enumerate(sis):
        if k not in used:
            for ch in list(si): si.remove(ch)
            etree.SubElement(si,q('t'))
    el=etree.SubElement(SST,q('si')); etree.SubElement(el,q('t')).text='□'
    SST.set('count',str(refs)); SST.set('uniqueCount',str(len(SST.findall('m:si',N))))
    parts['xl/sharedStrings.xml']=etree.tostring(SST,xml_declaration=True,encoding='UTF-8',standalone=True)
    for i in range(1,13):
        p=f'xl/worksheets/sheet{i}.xml'; s=parts[p].decode('utf8').replace('<v>__CHECK__</v>','<v>%d</v>'%new_idx); parts[p]=s.encode('utf8')
    # 3) 使い方シート
    st=Styles(parts['xl/styles.xml'])
    consts=constants_list()
    usage,last=make_usage(st,consts)
    parts['xl/styles.xml']=st.tostring(); parts['xl/worksheets/sheet13.xml']=usage; order.append('xl/worksheets/sheet13.xml')
    wb=etree.fromstring(parts['xl/workbook.xml'])
    sheets=wb.find('m:sheets',N); ns_r='{%s}id'%REL_NS
    el=etree.Element(q('sheet')); el.set('name','使い方'); el.set('sheetId','41'); el.set(ns_r,'rId101'); sheets.insert(0,el)
    for dn in wb.findall('m:definedNames/m:definedName',N): dn.set('localSheetId',str(int(dn.get('localSheetId'))+1))
    dn=etree.SubElement(wb.find('m:definedNames',N),q('definedName')); dn.set('name','_xlnm.Print_Area'); dn.set('localSheetId','0'); dn.text='使い方!$A$1:$F$%d'%last
    wb.find('m:bookViews/m:workbookView',N).set('activeTab','0')
    cp=wb.find('m:calcPr',N); cp.set('fullCalcOnLoad','1')
    parts['xl/workbook.xml']=etree.tostring(wb,xml_declaration=True,encoding='UTF-8',standalone=True)
    rels=etree.fromstring(parts['xl/_rels/workbook.xml.rels'])
    r_=etree.SubElement(rels,'{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'); r_.set('Id','rId101'); r_.set('Type',REL_NS+'/worksheet'); r_.set('Target','worksheets/sheet13.xml')
    parts['xl/_rels/workbook.xml.rels']=etree.tostring(rels,xml_declaration=True,encoding='UTF-8',standalone=True)
    ct=parts['[Content_Types].xml'].decode('utf8')
    ct=ct.replace('</Types>','<Override PartName="/xl/worksheets/sheet13.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
    parts['[Content_Types].xml']=ct.encode('utf8')
    # app.xml(シート名・名前の一覧)
    dns=[d.text for d in wb.findall('m:definedNames/m:definedName',N)]
    titles=['使い方']+NAMES
    pa=[]
    for d in wb.findall('m:definedNames/m:definedName',N):
        shname=d.text.split('!')[0]; pa.append(shname+'!Print_Area')
    app=('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="4" baseType="variant"><vt:variant><vt:lpstr>ワークシート</vt:lpstr></vt:variant><vt:variant><vt:i4>%d</vt:i4></vt:variant><vt:variant><vt:lpstr>名前付き一覧</vt:lpstr></vt:variant><vt:variant><vt:i4>%d</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="%d" baseType="lpstr">%s</vt:vector></TitlesOfParts><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>')%(len(titles),len(pa),len(titles)+len(pa),''.join('<vt:lpstr>%s</vt:lpstr>'%t.replace('&','&amp;') for t in titles+pa))
    parts['docProps/app.xml']=app.encode('utf8')
    zout=zipfile.ZipFile(pre_out,'w',zipfile.ZIP_DEFLATED)
    for n in order: 
        zi=zipfile.ZipInfo(n,(2026,10,14,0,0,0)); zi.compress_type=zipfile.ZIP_DEFLATED; zout.writestr(zi,parts[n])
    zout.close()
    return saved,cleared

def inject_cache(zin_path,recalc_json,out):
    """数式セルの保存済み計算値を、LibreOfficeの再計算結果で入れ直す(数式は変更しない)"""
    rc=json.load(open(recalc_json)); zin=zipfile.ZipFile(zin_path)
    wb=etree.fromstring(zin.read('xl/workbook.xml'))
    rels={r.get('Id'):r.get('Target') for r in etree.fromstring(zin.read('xl/_rels/workbook.xml.rels'))}
    new={}; n=0
    for s in wb.xpath('//m:sheets/m:sheet',namespaces=N):
        name=s.get('name'); path='xl/'+rels[s.get('{%s}id'%REL_NS)]
        if name not in rc: continue
        root=etree.fromstring(zin.read(path))
        for c in root.iterfind('.//m:sheetData/m:row/m:c',N):
            f=c.find('m:f',N)
            if f is None: continue
            r=rc[name].get(c.get('r'))
            if r is None: continue
            v=c.find('m:v',N)
            if v is None: v=etree.SubElement(c,q('v'))
            if r['e']!=0:
                c.set('t','e'); v.text=r['s'] if r['s'].startswith('#') else '#VALUE!'
            elif isinstance(r['raw'],str):
                c.set('t','str'); v.text=r['raw']
            else:
                c.attrib.pop('t',None); v.text=repr(float(r['raw'])) if r['raw']!=int(r['raw']) else str(int(r['raw']))
            n+=1
        new[path]=etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
    zout=zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED)
    for info in zin.infolist():
        zi=zipfile.ZipInfo(info.filename,info.date_time); zi.compress_type=zipfile.ZIP_DEFLATED
        zout.writestr(zi,new.get(info.filename,zin.read(info.filename)))
    zout.close(); return n
if __name__=='__main__':
    out_dir=sys.argv[1]
    st=build_formatted(out_dir+'/formatted.xlsx',unlock=False); print('整形版',st)
    build_formatted(out_dir+'/formatted_unlocked.xlsx',unlock=True)
    saved,cleared=assemble(out_dir+'/formatted_unlocked.xlsx',out_dir+'/template_pre.xlsx')
    pickle.dump((saved,cleared),open(out_dir+'/saved.pkl','wb'))
    print('空にしたセル',len(cleared))
