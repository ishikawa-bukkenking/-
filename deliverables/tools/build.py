import sys,zipfile,pickle,io
sys.path.insert(0,'/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/tools')
from lxml import etree
from fmt import *
from sheetset import apply_settings
SRC='/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/orig/orig.xlsx'
NAMES=["社名","全体フロー","研修詳細","店舗内装","ターゲットエリア","免許","目標設定","事業検討","簡易PL","PL（1年目）","PL（2年目以降）","決定事項"]
def load_roles():
    rows=pickle.load(open('/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/rows.pkl','rb'))
    roles={n:{} for n in NAMES}
    for sh,c,val,k,*_ in rows:
        if k.startswith('A'): roles[sh][c]='A'
        elif k.startswith('B'): roles[sh][c]='B'
        elif k=='要確認': roles[sh][c]='A'
    # ご回答による変更: Q5 採用費=A、Q8 簡易PL件数=B(残す)
    roles['事業検討']['C43']='A'
    for c in('D7','D8','D9','I7'): roles['簡易PL'][c]='B'
    return roles
def build(out,jobs,print_areas=None,active_tab=None,unlock=False,extra_parts=None):
    """jobs: {sheet番号(1始まり): cfg}"""
    zin=zipfile.ZipFile(SRC)
    SST=[''.join(t.text or '' for t in si.xpath('m:t|m:r/m:t',namespaces=N)) for si in etree.fromstring(zin.read('xl/sharedStrings.xml')).xpath('//m:si',namespaces=N)]
    st=Styles(zin.read('xl/styles.xml')); roles=load_roles(); newparts={}; stats={}
    for i,cfg in jobs.items():
        name=NAMES[i-1]; path=f'xl/worksheets/sheet{i}.xml'
        root=etree.fromstring(zin.read(path))
        if not cfg.get('skip_cells'):
            sf=SheetFmt(st,name,root,roles[name],work_ranges=cfg.get('work',()),sst=SST,align_override=cfg.get('align',{}),unlock=unlock,only_valued=cfg.get('only_valued',False))
            stats[name]=dict(sf.run())
        sv=root.find('m:sheetViews/m:sheetView',N)
        if cfg.get('selected') is True: sv.set('tabSelected','1')
        elif cfg.get('selected') is False: sv.attrib.pop('tabSelected',None)
        apply_settings(root,cfg)
        newparts[path]=etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
    newparts['xl/styles.xml']=st.tostring()
    # 文字列内のリッチテキスト(一部の文字だけ別フォント)も BIZ UDPゴシック・9pt以上にそろえる(文字そのものは変えない)
    sx=etree.fromstring(zin.read('xl/sharedStrings.xml'))
    for rpr in sx.xpath('//m:r/m:rPr',namespaces=N):
        rf=rpr.find('m:rFont',N)
        if rf is not None: rf.set('val',FONT_NAME)
        for sc in rpr.findall('m:scheme',N): rpr.remove(sc)
        sz=rpr.find('m:sz',N)
        if sz is not None and float(sz.get('val'))<MIN_PT: sz.set('val','%g'%MIN_PT)
    newparts['xl/sharedStrings.xml']=etree.tostring(sx,xml_declaration=True,encoding='UTF-8',standalone=True)
    if print_areas or active_tab is not None:
        wb=etree.fromstring(zin.read('xl/workbook.xml'))
        if print_areas:
            dn=wb.find('m:definedNames',N)
            for sheetno,area in print_areas.items():
                name=NAMES[sheetno-1]; qn="'%s'"%name if any(ch in name for ch in '（）() ') else name
                el=etree.SubElement(dn,q('definedName')); el.set('name','_xlnm.Print_Area'); el.set('localSheetId',str(sheetno-1))
                a,b=area.split(':'); import re as _re
                f=lambda x:'$%s$%s'%_re.match(r'([A-Z]+)(\d+)',x).groups()
                el.text='%s!%s:%s'%(qn,f(a),f(b))
        if active_tab is not None: wb.find('m:bookViews/m:workbookView',N).set('activeTab',str(active_tab))
        newparts['xl/workbook.xml']=etree.tostring(wb,xml_declaration=True,encoding='UTF-8',standalone=True)
    zout=zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED)
    for info in zin.infolist():
        data=newparts.get(info.filename,zin.read(info.filename))
        zi=zipfile.ZipInfo(info.filename,info.date_time); zi.compress_type=zipfile.ZIP_DEFLATED; zi.external_attr=info.external_attr
        zout.writestr(zi,data)
    zout.close(); return stats
if __name__=='__main__':
    cfg8=dict(tab=PAL['INPUT_FILL'] if False else '5B9BD5',zoom=100,grid=False,select='F11',orient='portrait',fit=(1,1),align={'E52':{'shrinkToFit':None,'horizontal':'left','wrapText':None},'S39':{'shrinkToFit':None,'horizontal':'left','wrapText':None}})
    print(build(sys.argv[1],{8:cfg8}))
