"""記入例(入力セル・前提セルの値)を、別ファイル(260708)に合わせる。数式・ラベルは変更しない。"""
import sys,re,zipfile,copy
sys.path.insert(0,'/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/tools')
from lxml import etree
from openpyxl.utils import column_index_from_string as ci
SD='/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/'
N={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def q(t): return '{%s}%s'%(N['m'],t)
SKIP={('社名','C15')}   # 社名は「株式会社〇〇」(ご指示)のため合わせない
def sheet_parts(z):
    wb=etree.fromstring(z.read('xl/workbook.xml')); rels={r.get('Id'):r.get('Target') for r in etree.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    return {s.get('name'):'xl/'+rels[s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')] for s in wb.xpath('//m:sheets/m:sheet',namespaces=N)}
def val(z,root,sst,c):
    f=c.find('m:f',N); v=c.find('m:v',N)
    if f is not None or v is None: return None
    return sst[int(v.text)] if c.get('t')=='s' else ('n',v.text)
def run(base,src,out,roles):
    zb=zipfile.ZipFile(base); zs=zipfile.ZipFile(src)
    pb=sheet_parts(zb); ps=sheet_parts(zs)
    sstb=etree.fromstring(zb.read('xl/sharedStrings.xml')); sis_b=sstb.findall('m:si',N)
    sst_s=[''.join(t.text or '' for t in si.xpath('m:t|m:r/m:t',namespaces=N)) for si in etree.fromstring(zs.read('xl/sharedStrings.xml')).xpath('//m:si',namespaces=N)]
    sst_b=[''.join(t.text or '' for t in si.xpath('m:t|m:r/m:t',namespaces=N)) for si in sis_b]
    newparts={}; changes=[]; added_refs=0
    def sidx(text):
        nonlocal added_refs
        added_refs+=1
        for i,t in enumerate(sst_b):
            if t==text and not sis_b[i].findall('m:r',N): return i
        si=etree.SubElement(sstb,q('si')); etree.SubElement(si,q('t')).text=text
        sis_b.append(si); sst_b.append(text); return len(sst_b)-1
    for name,rl in roles.items():
        if name not in ps or name not in pb or name in('給与整合性','インセンティブ検討','能力判定'): continue
        rb=etree.fromstring(zb.read(pb[name])); rs=etree.fromstring(zs.read(ps[name]))
        cb={c.get('r'):c for c in rb.iterfind('.//m:sheetData/m:row/m:c',N)}
        cs={c.get('r'):c for c in rs.iterfind('.//m:sheetData/m:row/m:c',N)}
        rows={int(r.get('r')):r for r in rb.iterfind('.//m:sheetData/m:row',N)}
        for ref,role in rl.items():
            if role not in('A','B') or (name,ref) in SKIP: continue
            vb=val(zb,rb,sst_b,cb[ref]) if ref in cb else None
            vs=val(zs,rs,sst_s,cs[ref]) if ref in cs else None
            if vb==vs: continue
            if ref not in cb:   # セルが無い場合は作る(書式は取り込み元に合わせず、同じ行の左隣の書式を引き継ぐ)
                m=re.match(r'([A-Z]+)(\d+)',ref); r_=rows[int(m.group(2))]
                c=etree.Element(q('c')); c.set('r',ref)
                left=[x for x in r_ if ci(re.match(r'[A-Z]+',x.get('r')).group())<ci(m.group(1))]
                if left and left[-1].get('s'): c.set('s',left[-1].get('s'))
                pos=len(left); r_.insert(pos,c); cb[ref]=c
            c=cb[ref]
            for ch in list(c): 
                if etree.QName(ch).localname in('v','is'): c.remove(ch)
            c.attrib.pop('t',None)
            if vs is None: pass
            elif isinstance(vs,tuple):
                etree.SubElement(c,q('v')).text=vs[1]
            else:
                c.set('t','s'); etree.SubElement(c,q('v')).text=str(sidx(vs))
            changes.append((name,ref,vb if not isinstance(vb,tuple) else vb[1],vs if not isinstance(vs,tuple) else vs[1]))
        newparts[pb[name]]=etree.tostring(rb,xml_declaration=True,encoding='UTF-8',standalone=True)
    sstb.set('count',str(int(sstb.get('count'))+added_refs)); sstb.set('uniqueCount',str(len(sstb.findall('m:si',N))))
    newparts['xl/sharedStrings.xml']=etree.tostring(sstb,xml_declaration=True,encoding='UTF-8',standalone=True)
    zo=zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED)
    for i in zb.infolist():
        zi=zipfile.ZipInfo(i.filename,i.date_time); zi.compress_type=zipfile.ZIP_DEFLATED; zo.writestr(zi,newparts.get(i.filename,zb.read(i.filename)))
    zo.close(); return changes
if __name__=='__main__':
    import pickle
    from build import load_roles   # build は orig_plus を参照するが、役割表だけを使う
    ch=run(SD+'orig_plus_base.xlsx',SD+'new/new.xlsx',SD+'orig_plus.xlsx',load_roles())
    pickle.dump(ch,open(SD+'sync_changes.pkl','wb'))
    print(len(ch))
    for c in ch: print(c)
