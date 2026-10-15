"""別ファイル(260708)から指定シートを、元ファイルへそのまま取り込む(値・数式・入力規則・条件付き書式・結合は変更しない)。
書式番号・文字列番号だけを取り込み先に合わせて付け替える。"""
import sys,copy,zipfile,re
sys.path.insert(0,'/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/tools')
from lxml import etree
from fmt import Styles,N,NS,q
REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG='http://schemas.openxmlformats.org/package/2006/relationships'
SD='/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/'
# 取り込むシート: (名前, 取り込み元パーツ番号, 取り込み先パーツ番号, sheetId, rId)
IMPORT=[('給与整合性',12,13,43,'rId201'),('インセンティブ検討',13,14,44,'rId202'),('能力判定',14,15,45,'rId203')]
PRINT_AREAS_NEW={'給与整合性':'$A$1:$P$28','能力判定':'$A$1:$CM$62','インセンティブ検討':'$A$1:$BY$18'}
BEFORE='決定事項'   # この前に挿入(元ファイルの並びと同じ)

def build(src_path,dst_path,out_path):
    zs=zipfile.ZipFile(src_path); zd=zipfile.ZipFile(dst_path)
    parts={n:zd.read(n) for n in zd.namelist()}; order=zd.namelist()[:]
    st=Styles(parts['xl/styles.xml'])
    sroot=etree.fromstring(zs.read('xl/styles.xml'))
    sfonts=sroot.find('m:fonts',N); sfills=sroot.find('m:fills',N); sbord=sroot.find('m:borders',N); sxfs=sroot.find('m:cellXfs',N)
    sfmt={int(n.get('numFmtId')):n.get('formatCode') for n in sroot.find('m:numFmts',N)} if sroot.find('m:numFmts',N) is not None else {}
    sdxfs=sroot.find('m:dxfs',N)
    xcache={}
    def imp(kind_parent,src_el):
        el=copy.deepcopy(src_el); return st._add(kind_parent,el,etree.tostring(el))
    def import_xf(si):
        if si in xcache: return xcache[si]
        x=copy.deepcopy(sxfs[si])
        x.set('fontId',str(imp(st.fonts,sfonts[int(x.get('fontId'))])))
        x.set('fillId',str(imp(st.fills,sfills[int(x.get('fillId'))])))
        x.set('borderId',str(imp(st.borders,sbord[int(x.get('borderId'))])))
        nid=int(x.get('numFmtId'))
        if nid>=164: x.set('numFmtId',str(st.numfmt(sfmt[nid])))
        x.set('xfId','0')
        xcache[si]=st._add(st.xfs,x,etree.tostring(x)); return xcache[si]
    dcache={}
    dst_dxfs=st.root.find('m:dxfs',N)
    def import_dxf(di):
        if di in dcache: return dcache[di]
        el=copy.deepcopy(sdxfs[di]); k=etree.tostring(el)
        for i,d in enumerate(dst_dxfs):
            if etree.tostring(d)==k: dcache[di]=i; return i
        dst_dxfs.append(el); dst_dxfs.set('count',str(len(dst_dxfs))); dcache[di]=len(dst_dxfs)-1; return dcache[di]
    # 文字列表
    ssrc=etree.fromstring(zs.read('xl/sharedStrings.xml')); ssi=ssrc.findall('m:si',N)
    sdst=etree.fromstring(parts['xl/sharedStrings.xml']); scache={}; added_refs=0
    def import_str(i):
        nonlocal added_refs
        added_refs+=1
        if i in scache: return scache[i]
        sdst.append(copy.deepcopy(ssi[i])); scache[i]=len(sdst.findall('m:si',N))-1; return scache[i]
    # ワークブック
    swb=etree.fromstring(zs.read('xl/workbook.xml')); srels={r.get('Id'):r.get('Target') for r in etree.fromstring(zs.read('xl/_rels/workbook.xml.rels'))}
    sname2part={s.get('name'):srels[s.get('{%s}id'%REL)] for s in swb.xpath('//m:sheets/m:sheet',namespaces=N)}
    wb=etree.fromstring(parts['xl/workbook.xml']); sheets=wb.find('m:sheets',N)
    names=[s.get('name') for s in sheets]; pos=names.index(BEFORE)
    ct=parts['[Content_Types].xml'].decode('utf8'); rels=etree.fromstring(parts['xl/_rels/workbook.xml.rels'])
    for k,(name,sp,dp,sid,rid) in enumerate(IMPORT):
        root=etree.fromstring(zs.read('xl/'+sname2part[name]))
        assert sname2part[name]==f'worksheets/sheet{sp}.xml',sname2part[name]
        # 列・行・セルの書式番号、文字列番号
        for col in root.iterfind('.//m:cols/m:col',N):
            if col.get('style') is not None: col.set('style',str(import_xf(int(col.get('style')))))
        for row in root.iterfind('.//m:sheetData/m:row',N):
            if row.get('s') is not None: row.set('s',str(import_xf(int(row.get('s')))))
            for c in row:
                if c.get('s') is not None: c.set('s',str(import_xf(int(c.get('s')))))
                if c.get('t')=='s':
                    v=c.find('m:v',N); v.text=str(import_str(int(v.text)))
        for rule in root.iterfind('.//m:conditionalFormatting/m:cfRule',N):
            if rule.get('dxfId') is not None: rule.set('dxfId',str(import_dxf(int(rule.get('dxfId')))))
        # 印刷設定ファイル(printerSettings)の付け替え
        ps=root.find('m:pageSetup',N)
        if ps is not None and ps.get('{%s}id'%REL):
            old=etree.fromstring(zs.read(f'xl/worksheets/_rels/sheet{sp}.xml.rels'))
            tgt=[r.get('Target') for r in old if r.get('Id')==ps.get('{%s}id'%REL)][0]
            data=zs.read('xl/printerSettings/'+tgt.split('/')[-1]); newn=f'xl/printerSettings/printerSettings{dp}.bin'
            parts[newn]=data; order.append(newn)
            parts[f'xl/worksheets/_rels/sheet{dp}.xml.rels']=(f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="{PKG}"><Relationship Id="rId1" Type="{REL}/printerSettings" Target="../printerSettings/printerSettings{dp}.bin"/></Relationships>').encode('utf8')
            order.append(f'xl/worksheets/_rels/sheet{dp}.xml.rels'); ps.set('{%s}id'%REL,'rId1')
        for bad in('legacyDrawing','drawing','picture','extLst'):
            assert root.find('m:'+bad,N) is None,bad
        for sv in root.iterfind('.//m:sheetView',N): sv.attrib.pop('tabSelected',None)
        parts[f'xl/worksheets/sheet{dp}.xml']=etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True); order.append(f'xl/worksheets/sheet{dp}.xml')
        ct=ct.replace('</Types>',f'<Override PartName="/xl/worksheets/sheet{dp}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        r_=etree.SubElement(rels,'{%s}Relationship'%PKG); r_.set('Id',rid); r_.set('Type',REL+'/worksheet'); r_.set('Target',f'worksheets/sheet{dp}.xml')
        el=etree.Element(q('sheet')); el.set('name',name); el.set('sheetId',str(sid)); el.set('{%s}id'%REL,rid); sheets.insert(pos+k,el)
    # 定義済み名(印刷範囲): 挿入位置以降の localSheetId をずらし、新シート分を追加
    dns=wb.find('m:definedNames',N)
    for dn in dns.findall('m:definedName',N):
        if int(dn.get('localSheetId'))>=pos: dn.set('localSheetId',str(int(dn.get('localSheetId'))+len(IMPORT)))
    for k,(name,*_) in enumerate(IMPORT):
        dn=etree.SubElement(dns,q('definedName')); dn.set('name','_xlnm.Print_Area'); dn.set('localSheetId',str(pos+k)); dn.text=f'{name}!{PRINT_AREAS_NEW[name]}'
    # 書き戻し
    sdst.set('count',str(int(sdst.get('count'))+added_refs)); sdst.set('uniqueCount',str(len(sdst.findall('m:si',N))))
    parts['xl/sharedStrings.xml']=etree.tostring(sdst,xml_declaration=True,encoding='UTF-8',standalone=True)
    parts['xl/styles.xml']=st.tostring()
    parts['xl/workbook.xml']=etree.tostring(wb,xml_declaration=True,encoding='UTF-8',standalone=True)
    parts['xl/_rels/workbook.xml.rels']=etree.tostring(rels,xml_declaration=True,encoding='UTF-8',standalone=True)
    parts['[Content_Types].xml']=ct.encode('utf8')
    titles=[s.get('name') for s in sheets]; pa=[d.text.split('!')[0]+'!Print_Area' for d in dns.findall('m:definedName',N)]
    esc=lambda t:t.replace('&','&amp;')
    parts['docProps/app.xml']=('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="4" baseType="variant"><vt:variant><vt:lpstr>ワークシート</vt:lpstr></vt:variant><vt:variant><vt:i4>%d</vt:i4></vt:variant><vt:variant><vt:lpstr>名前付き一覧</vt:lpstr></vt:variant><vt:variant><vt:i4>%d</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="%d" baseType="lpstr">%s</vt:vector></TitlesOfParts><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>'
      %(len(titles),len(pa),len(titles)+len(pa),''.join('<vt:lpstr>%s</vt:lpstr>'%esc(t) for t in titles+pa))).encode('utf8')
    zo=zipfile.ZipFile(out_path,'w',zipfile.ZIP_DEFLATED)
    for n in order:
        zi=zipfile.ZipInfo(n,(2026,10,15,0,0,0)); zi.compress_type=zipfile.ZIP_DEFLATED; zo.writestr(zi,parts[n])
    zo.close()
if __name__=='__main__':
    build(SD+'new/new.xlsx',SD+'orig/orig.xlsx',SD+'orig_plus.xlsx'); print('ok')
