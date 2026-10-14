import sys,zipfile,re,collections
from lxml import etree
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def sheets(path):
    z=zipfile.ZipFile(path); wb=etree.fromstring(z.read('xl/workbook.xml'))
    rels=etree.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rid={r.get('Id'):r.get('Target') for r in rels}
    sst=[''.join(t.text or '' for t in si.xpath('m:t|m:r/m:t',namespaces=ns)) for si in etree.fromstring(z.read('xl/sharedStrings.xml')).xpath('//m:si',namespaces=ns)]
    out=collections.OrderedDict()
    for s in wb.xpath('//m:sheets/m:sheet',namespaces=ns):
        t=rid[s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
        out[s.get('name')]=(z,'xl/'+t.lstrip('/').replace('xl/',''),sst)
    return z,wb,out
def cells(z,path,sst):
    root=etree.fromstring(z.read(path)); d={}
    for c in root.iterfind('.//m:sheetData/m:row/m:c',ns):
        f=c.find('m:f',ns); v=c.find('m:v',ns)
        fv=None
        if f is not None: fv=(f.text,tuple(sorted(f.attrib.items())))
        val=None
        if v is not None: val=sst[int(v.text)] if c.get('t')=='s' else (c.get('t'),v.text)
        d[c.get('r')]=(fv,val)
    return root,d
def struct(root,z,path):
    g=lambda p:[etree.tostring(x,method='c14n') for x in root.xpath(p,namespaces=ns)]
    return dict(merges=sorted(root.xpath('//m:mergeCell/@ref',namespaces=ns)),
      dv=g('//m:dataValidations'),cf=g('//m:conditionalFormatting'),
      drawing=[e.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id') for e in root.xpath('//m:drawing',namespaces=ns)])
def compare(a,b,expect_cleared=None):
    za,wa,sa=sheets(a); zb,wb_,sb=sheets(b)
    names_a=list(sa); names_b=[n for n in sb if n in sa]
    print('シート順(元):',names_a); print('シート順(新・既存分のみ):',names_b,'一致' if names_a==names_b else '不一致!')
    tot=dict(f_diff=0,v_diff=0,cells=0,formulas=0,merge_diff=0,dv_diff=0,cf_diff=0,dr_diff=0)
    for n in names_a:
        ra,da=cells(*sa[n]); rb,db=cells(sb[n][0],sb[n][1],sb[n][2])
        sta,stb=struct(ra,*sa[n][:2]),struct(rb,*sb[n][:2])
        for k,t in(('merges','merge_diff'),('dv','dv_diff'),('cf','cf_diff'),('drawing','dr_diff')):
            if sta[k]!=stb[k]: tot[t]+=1; print('構造差分',n,k)
        if set(da)!=set(db): print('セル集合の差',n,len(set(da)^set(db)))
        for ref,(fa,va) in da.items():
            fb,vb=db.get(ref,(None,None)); tot['cells']+=1
            if fa is not None: tot['formulas']+=1
            if fa!=fb: tot['f_diff']+=1; print('数式差分',n,ref,fa,fb)
            if fa is None and va!=vb:
                if expect_cleared and (n,ref) in expect_cleared: continue
                tot['v_diff']+=1
                if tot['v_diff']<10: print('値差分',n,ref,va,vb)
    print(tot); return tot
if __name__=='__main__': compare(sys.argv[1],sys.argv[2])
