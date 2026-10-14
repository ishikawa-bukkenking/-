import re
from lxml import etree
from fmt import N,NS,q,PAL
ORDER=['sheetPr','dimension','sheetViews','sheetFormatPr','cols','sheetData','sheetCalcPr','sheetProtection','protectedRanges','scenarios','autoFilter','sortState','dataConsolidate','customSheetViews','mergeCells','phoneticPr','conditionalFormatting','dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','customProperties','cellWatches','ignoredErrors','smartTags','drawing','legacyDrawing','legacyDrawingHF','drawingHF','picture','oleObjects','controls','webPublishItems','tableParts','extLst']
def put(root,el):
    tag=etree.QName(el).localname
    old=root.find('m:'+tag,N)
    if old is not None: root.replace(old,el); return el
    idx=ORDER.index(tag)
    for ch in root:
        n=etree.QName(ch).localname
        if n in ORDER and ORDER.index(n)>idx: ch.addprevious(el); return el
    root.append(el); return el
def E(tag,**a):
    e=etree.Element(q(tag))
    for k,v in a.items(): e.set(k,str(v))
    return e
FOOTER='&L&"BIZ UDPゴシック,標準"&9&A&R&"BIZ UDPゴシック,標準"&9&P / &N'
def apply_settings(root,cfg):
    """cfg: tab(色), zoom, grid(bool), select(セル), freeze(例 'C3'), margins(dict), fit(w,h), orient, hcenter, breaks(rows)"""
    # sheetPr
    sp=root.find('m:sheetPr',N)
    if sp is None: sp=put(root,E('sheetPr'))
    for t in sp.findall('m:tabColor',N): sp.remove(t)
    tc=E('tabColor',rgb='FF'+cfg['tab']); sp.insert(0,tc)
    psp=sp.find('m:pageSetUpPr',N)
    if psp is None: psp=etree.SubElement(sp,q('pageSetUpPr'))
    psp.set('fitToPage','1')
    # sheetView
    sv=root.find('m:sheetViews/m:sheetView',N)
    for a in('topLeftCell','showZeros'): sv.attrib.pop(a,None)
    sv.set('showGridLines','1' if cfg.get('grid') else '0')
    sv.set('zoomScale',str(cfg['zoom'])); sv.set('zoomScaleNormal',str(cfg['zoom']))
    for ch in list(sv): sv.remove(ch)
    sel=cfg['select']
    if cfg.get('freeze'):
        fz=cfg['freeze']; m=re.match(r'([A-Z]+)(\d+)',fz)
        from openpyxl.utils import column_index_from_string as ci
        xs=ci(m.group(1))-1; ys=int(m.group(2))-1
        pane=E('pane',topLeftCell=fz,activePane='bottomRight' if xs and ys else ('bottomLeft' if ys else 'topRight'),state='frozen')
        if xs: pane.set('xSplit',str(xs))
        if ys: pane.set('ySplit',str(ys))
        sv.append(pane)
        ap=pane.get('activePane')
        sv.append(E('selection',pane=ap,activeCell=sel,sqref=sel))
    else:
        sv.append(E('selection',activeCell=sel,sqref=sel))
    # 印刷
    put(root,E('printOptions',horizontalCentered='1'))
    m=cfg.get('margins',dict(left=0.4,right=0.4,top=0.6,bottom=0.6,header=0.3,footer=0.3))
    put(root,E('pageMargins',**{k:'%g'%v for k,v in m.items()}))
    ps=root.find('m:pageSetup',N)
    ps.set('orientation',cfg['orient']); ps.set('fitToWidth',str(cfg['fit'][0])); ps.set('fitToHeight',str(cfg['fit'][1]))
    ps.set('paperSize',cfg.get('paper',ps.get('paperSize')))
    hf=E('headerFooter'); f=etree.SubElement(hf,q('oddFooter')); f.text=FOOTER
    put(root,hf)
    rb=root.find('m:rowBreaks',N)
    if rb is not None: root.remove(rb)
    if cfg.get('breaks'):
        rb=E('rowBreaks',count=len(cfg['breaks']),manualBreakCount=len(cfg['breaks']))
        for b in cfg['breaks']: rb.append(E('brk',id=b,max=16383,man=1))
        put(root,rb)
