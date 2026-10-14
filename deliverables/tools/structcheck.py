import sys,zipfile,hashlib,re,collections,posixpath
from lxml import etree
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','xdr':'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing','a':'http://schemas.openxmlformats.org/drawingml/2006/main','c':'http://schemas.openxmlformats.org/drawingml/2006/chart'}
def info(p):
    z=zipfile.ZipFile(p); d={}
    d['names']=z.namelist()
    d['hash']={n:hashlib.md5(z.read(n)).hexdigest() for n in z.namelist()}
    dr=etree.fromstring(z.read('xl/drawings/drawing1.xml'))
    d['d1']={k:len(dr.xpath('//xdr:%s'%k,namespaces=ns)) for k in('sp','grpSp','cxnSp','pic','graphicFrame')}
    d['d1_top']=len(dr)
    d['pics']=sum(len(etree.fromstring(z.read(f'xl/drawings/drawing{i}.xml')).xpath('//xdr:pic',namespaces=ns)) for i in range(1,6))
    d['charts']=[n for n in z.namelist() if re.match(r'xl/charts/chart\d+\.xml',n)]
    d['media']=[n for n in z.namelist() if n.startswith('xl/media/')]
    wb=etree.fromstring(z.read('xl/workbook.xml'))
    d['pa']=sorted((x.get('localSheetId'),x.text) for x in wb.xpath('//m:definedName',namespaces=ns))
    d['sheets']=[s.get('name') for s in wb.xpath('//m:sheets/m:sheet',namespaces=ns)]
    s5=z.read('xl/worksheets/sheet5.xml').decode('utf8')
    m=re.search(r'<c r="AO6"[^>]*>.*?</c>',s5); d['AO6']=m.group(0) if m else None
    d['metadata']='xl/metadata.xml' in z.namelist()
    return d
def validity(p):
    z=zipfile.ZipFile(p); errs=[]
    names=z.namelist()
    if len(names)!=len(set(names)): errs.append('ZIP内に重複名')
    if z.testzip(): errs.append('ZIP破損')
    for n in names:
        if n.endswith(('.xml','.rels')) :
            try: etree.fromstring(z.read(n))
            except Exception as e: errs.append(f'XMLエラー {n}: {e}')
    ct=etree.fromstring(z.read('[Content_Types].xml')); cns={'t':'http://schemas.openxmlformats.org/package/2006/content-types'}
    defaults={d.get('Extension').lower() for d in ct.xpath('//t:Default',namespaces=cns)}
    overrides={o.get('PartName') for o in ct.xpath('//t:Override',namespaces=cns)}
    for n in names:
        if n=='[Content_Types].xml': continue
        ext=n.rsplit('.',1)[-1].lower()
        if '/'+n not in overrides and ext not in defaults: errs.append(f'Content_Typesに無い: {n}')
    for o in overrides:
        if o.lstrip('/') not in names: errs.append(f'Overrideの実体が無い: {o}')
    for n in names:
        if n.endswith('.rels'):
            base=posixpath.dirname(posixpath.dirname(n))
            for r in etree.fromstring(z.read(n)):
                if r.get('TargetMode')=='External': continue
                t=r.get('Target'); full=posixpath.normpath(posixpath.join(base,t)) if not t.startswith('/') else t.lstrip('/')
                if full not in names: errs.append(f'relsの参照先が無い: {n} -> {t}')
    # styles
    st=etree.fromstring(z.read('xl/styles.xml'))
    cnt={k:len(st.xpath(f'//m:{k}/*',namespaces=ns)) for k in('fonts','fills','borders','cellXfs')}
    for k,v in cnt.items():
        if int(st.xpath(f'//m:{k}/@count',namespaces=ns)[0])!=v: errs.append(f'styles {k} count不一致')
    nf=len(st.xpath('//m:numFmts/*',namespaces=ns))
    if int(st.xpath('//m:numFmts/@count',namespaces=ns)[0])!=nf: errs.append('numFmts count不一致')
    ids=[x.get('numFmtId') for x in st.xpath('//m:numFmts/m:numFmt',namespaces=ns)]
    if len(ids)!=len(set(ids)): errs.append('numFmtId重複')
    for x in st.xpath('//m:cellXfs/m:xf',namespaces=ns):
        for k,lim in(('fontId',cnt['fonts']),('fillId',cnt['fills']),('borderId',cnt['borders'])):
            if int(x.get(k))>=lim: errs.append(f'xfの{k}が範囲外')
    # sheets
    ORDER=['sheetPr','dimension','sheetViews','sheetFormatPr','cols','sheetData','sheetCalcPr','sheetProtection','protectedRanges','scenarios','autoFilter','sortState','dataConsolidate','customSheetViews','mergeCells','phoneticPr','conditionalFormatting','dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','customProperties','cellWatches','ignoredErrors','smartTags','drawing','legacyDrawing','legacyDrawingHF','drawingHF','picture','oleObjects','controls','webPublishItems','tableParts','extLst']
    sst=etree.fromstring(z.read('xl/sharedStrings.xml')); nsi=len(sst.findall('m:si',{'m':ns['m']}))
    for n in names:
        if re.match(r'xl/worksheets/sheet\d+\.xml$',n):
            root=etree.fromstring(z.read(n)); idx=[ORDER.index(etree.QName(c).localname) for c in root]
            if idx!=sorted(idx): errs.append(f'{n}: 要素の順序が不正')
            for c in root.iterfind('.//m:sheetData/m:row/m:c',{'m':ns['m']}):
                if int(c.get('s','0'))>=cnt['cellXfs']: errs.append(f'{n} {c.get("r")}: sが範囲外'); break
                if c.get('t')=='s' and int(c.find('m:v',{'m':ns['m']}).text)>=nsi: errs.append(f'{n} {c.get("r")}: sst範囲外'); break
    return errs
if __name__=='__main__':
    o=info('orig/orig.xlsx')
    for lab,p in(('整形版','out/formatted.xlsx'),('テンプレート版','out/template.xlsx')):
        n=info(p); print('=====',lab)
        print('シート順',n['sheets'])
        for k in('d1','d1_top','pics','charts','media','metadata','AO6'):
            print(f'  {k}:', '一致' if n[k]==o[k] else f'差分 {o[k]} -> {n[k]}', '' if n[k]!=o[k] else (o[k] if k in('d1','d1_top','pics','metadata') else ''))
        same=[x for x in o['hash'] if x.startswith(('xl/drawings','xl/charts','xl/media','xl/metadata','xl/calcChain','xl/printerSettings','xl/theme')) and n['hash'].get(x)!=o['hash'][x]]
        print('  drawings/charts/media/metadata/calcChain/printerSettings/theme 変更あり:',same or 'なし(バイト単位で同一)')
        print('  印刷範囲(元 %d個 → %d個)'%(len(o['pa']),len(n['pa'])))
        for x in n['pa']: print('    ',x)
        print('  妥当性チェック:',validity(p) or 'エラーなし')
