import re,sys,zipfile
from lxml import etree
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
z=zipfile.ZipFile(sys.argv[1])
names=["社名","全体フロー","研修詳細","店舗内装","ターゲットエリア","免許","目標設定","事業検討","簡易PL","PL（1年目）","PL（2年目以降）","決定事項"]
for i,n in enumerate(names,1):
    t=etree.fromstring(z.read(f'xl/worksheets/sheet{i}.xml'))
    g=lambda p:t.xpath(p,namespaces=ns)
    print(f"\n=== sheet{i} {n}")
    print(' dim',g('//m:dimension/@ref'), 'tab',etree.tostring(g('//m:sheetPr')[0]).decode()[:200] if g('//m:sheetPr') else None)
    sv=g('//m:sheetView')[0]; print(' view',dict(sv.attrib), [dict(c.attrib) for c in sv])
    cols=g('//m:cols/m:col'); 
    print(' cols',len(cols),[ (c.get('min'),c.get('max'),c.get('width'),c.get('hidden')) for c in cols][:12])
    fmt=g('//m:sheetFormatPr'); print(' fmt',dict(fmt[0].attrib) if fmt else None)
    cells=g('//m:sheetData//m:c'); nf=len(g('//m:sheetData//m:c[m:f]')); print(' cells',len(cells),'formulas',nf)
    print(' merges',len(g('//m:mergeCell')))
    for p in ['pageSetup','printOptions','pageMargins','headerFooter','sheetProtection']:
        e=g('//m:'+p); print(' ',p,[dict(x.attrib) for x in e] if e else None)
    print(' rowBreaks',[b.get('id') for b in g('//m:rowBreaks/m:brk')],'colBreaks',[b.get('id') for b in g('//m:colBreaks/m:brk')])
    print(' DV',[(d.get('sqref'),d.get('type'),(d.findtext('m:formula1',namespaces=ns))) for d in g('//m:dataValidation')])
    print(' CF',[(c.get('sqref'),len(c)) for c in g('//m:conditionalFormatting')])
    rows=g('//m:sheetData/m:row'); hs=[float(r.get('ht')) for r in rows if r.get('ht')]
    print(' rows',len(rows),'hidden rows',sum(1 for r in rows if r.get('hidden')),'ht range',(min(hs),max(hs)) if hs else None)
