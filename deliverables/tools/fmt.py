"""見た目だけを整えるツール。<sheetData>内の値・数式(<v><f>)には触れず、セルの s 属性(書式番号)の付け替えと
styles.xml への書式追加、各シートの表示・印刷設定のみを書き換える。"""
import copy,re,zipfile,pickle,sys,collections
from lxml import etree
from openpyxl.utils import range_boundaries,get_column_letter as gl,column_index_from_string as ci

NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
N={'m':NS}
def q(t): return '{%s}%s'%(NS,t)

# ---- 配色(ここを1か所変えれば全体が変わる) ----
PAL=dict(BRAND='07968C',      # 基調色(物件王HPのメインカラー)
         HEAD_FONT='FFFFFF',
         TINT='E0F2F0',       # 小計・合計の薄い背景
         INPUT_FILL='DDEBF7', # 入力セル(薄い水色)
         INPUT_FONT='0033CC', # 入力セルの文字(青)
         ASSUME_FILL='F2F2F2',# 前提(想定値)
         WORK_FILL='EDEDED', WORK_FONT='A6A6A6',
         LINE='7F7F7F', NOTE_FILL='FFF2CC', RED='C00000', TEXT='000000')
FONT_NAME='BIZ UDPゴシック'; MIN_PT=9

class Styles:
    def __init__(s,xml):
        s.root=etree.fromstring(xml)
        g=lambda t: s.root.find('m:'+t,N)
        s.fonts,s.fills,s.borders,s.xfs=g('fonts'),g('fills'),g('borders'),g('cellXfs')
        s.numFmts=g('numFmts')
        s.fmtcode={int(n.get('numFmtId')):n.get('formatCode') for n in s.numFmts}
        s.code2id={v:k for k,v in s.fmtcode.items()}
        s.cache={}; s.orig_xfs=len(s.xfs)
    def _add(s,parent,el,key):
        k=(parent.tag,key)
        if k in s.cache: return s.cache[k]
        parent.append(el); parent.set('count',str(len(parent))); s.cache[k]=len(parent)-1; return s.cache[k]
    def font(s,i,size_min=MIN_PT,color=None,bold=None,force_size=None):
        f=copy.deepcopy(s.fonts[i])
        for sc in f.findall('m:scheme',N): f.remove(sc)
        nm=f.find('m:name',N); nm.set('val',FONT_NAME)
        sz=f.find('m:sz',N); cur=float(sz.get('val'))
        sz.set('val',str(force_size if force_size else max(cur,size_min)).rstrip('0').rstrip('.') if False else (('%g'%(force_size if force_size else max(cur,size_min)))))
        if color:
            c=f.find('m:color',N)
            if c is None:
                c=etree.Element(q('color')); sz.addnext(c)
            for a in list(c.attrib): del c.attrib[a]
            c.set('rgb','FF'+color)
        if bold is not None:
            b=f.find('m:b',N)
            if bold and b is None: f.insert(0,etree.Element(q('b')))
            if not bold and b is not None: f.remove(b)
        return s._add(s.fonts,f,etree.tostring(f))
    def fill(s,rgb):
        if rgb is None: return 0
        f=etree.fromstring('<fill xmlns="%s"><patternFill patternType="solid"><fgColor rgb="FF%s"/><bgColor indexed="64"/></patternFill></fill>'%(NS,rgb))
        return s._add(s.fills,f,rgb)
    def border(s,i,sides_force=None,thin_color=PAL['LINE'],edge=None):
        """既存の罫線を「細線・同一色」に正規化。sides_force: 全辺を必ず細線にする。edge: 結合セルの欠け補正で足す辺"""
        b=copy.deepcopy(s.borders[i])
        for side in('left','right','top','bottom'):
            e=b.find('m:'+side,N)
            if e is None:
                e=etree.SubElement(b,q(side))
            has=e.get('style') is not None
            if (sides_force and side in sides_force) or (edge and side in edge): 
                has=True
            if has:
                st=e.get('style') or 'thin'
                if st in('medium','thick','double','mediumDashed','mediumDashDot','mediumDashDotDot','slantDashDot'): st='thin'
                e.set('style',st)
                for c in e.findall('m:color',N): e.remove(c)
                etree.SubElement(e,q('color')).set('rgb','FF'+thin_color)
        # 子要素の順序: left,right,top,bottom,diagonal
        order=['left','right','top','bottom','diagonal']
        kids=sorted(list(b),key=lambda x: order.index(etree.QName(x).localname) if etree.QName(x).localname in order else 9)
        for k in list(b): b.remove(k)
        for k in kids: b.append(k)
        return s._add(s.borders,b,etree.tostring(b))
    def side(s,i,side):
        e=s.borders[i].find('m:'+side,N); return e is not None and e.get('style') is not None
    def numfmt(s,code):
        if code in s.code2id: return s.code2id[code]
        nid=max(max(s.fmtcode),163)+1
        el=etree.SubElement(s.numFmts,q('numFmt')); el.set('numFmtId',str(nid)); el.set('formatCode',code)
        s.numFmts.set('count',str(len(s.numFmts))); s.fmtcode[nid]=code; s.code2id[code]=nid; return nid
    def xf(s,orig,**o):
        """元の xf を複製して差し替えた新しい xf の番号を返す"""
        x=copy.deepcopy(s.xfs[orig])
        for k in('fontId','fillId','borderId','numFmtId'):
            if k in o: x.set(k,str(o[k])); x.set('apply'+k[0].upper()+k[1:-2],'1')
        al=x.find('m:alignment',N)
        if o.get('align'):
            if al is None: al=etree.SubElement(x,q('alignment'))
            for k,v in o['align'].items():
                if v is None: al.attrib.pop(k,None)
                else: al.set(k,v)
            x.set('applyAlignment','1')
        if 'locked' in o:
            p=x.find('m:protection',N)
            if p is None: p=etree.SubElement(x,q('protection'))
            p.set('locked','1' if o['locked'] else '0'); x.set('applyProtection','1')
        # 子要素の順序: alignment, protection
        kids=sorted(list(x),key=lambda e:['alignment','protection'].index(etree.QName(e).localname))
        for k in list(x): x.remove(k)
        for k in kids: x.append(k)
        key=etree.tostring(x)
        return s._add(s.xfs,x,key)
    def tostring(s): return etree.tostring(s.root,xml_declaration=True,encoding='UTF-8',standalone=True)

# ---- 表示形式の正規化(値は変えず、見え方だけ) ----
def _strip(code):
    return re.sub(r'"[^"]*"|\\.|\[[^\]]*\]|_.|\*.','',code)
def norm_fmt(code,is_float_noise=False):
    """コードから、ゼロを「-」で表示する形へ。日付・文字列・既に3区分以上のものは触らない。"""
    if code in('General',None,''): return None
    plain=_strip(code)
    if '@' in plain or re.search(r'[ymdhsAP]',plain.replace('E','')) and not re.search(r'[#0]',plain): return code
    if re.search(r'(?<![#0])[ymdhs]',plain.lower()) and not re.search(r'[#0]',plain): return code
    secs=code.split(';')
    if len(secs)>=3: return code
    if len(secs)==1: pos=secs[0]; neg='-'+pos
    else: pos,neg=secs[0],secs[1]
    return '%s;%s;"-"'%(pos,neg)

BUILTIN={0:'General',1:'0',2:'0.00',3:'#,##0',4:'#,##0.00',9:'0%',10:'0.00%',37:'#,##0;(#,##0)',38:'#,##0;[Red](#,##0)',39:'#,##0.00;(#,##0.00)',40:'#,##0.00;[Red](#,##0.00)'}
def fmt_for(st,numFmtId,value=None):
    code=st.fmtcode.get(numFmtId) or BUILTIN.get(numFmtId)
    if code is None: return None   # 日付など組込みは触らない
    if code=='General':
        if value is None: return None
        try: v=float(value)
        except: return None
        if abs(v-round(v))<1e-6: return '#,##0;-#,##0;"-"'
        return '#,##0.0;-#,##0.0;"-"'
    if numFmtId in(14,15,16,17,18,19,20,21,22,45,46,47,49): return None
    n=norm_fmt(code)
    if n is None or n==code: return None
    return n

def cell_ref(c): return c.get('r')
def split(ref):
    m=re.match(r'([A-Z]+)(\d+)',ref); return ci(m.group(1)),int(m.group(2))

class SheetFmt:
    def __init__(s,st,name,root,roles,work_ranges=(),keep_size=False,keep_fonts=False,sst=None,align_override=None,total_labels=('合計','小計'),unlock=False,only_valued=False):
        s.st,s.name,s.root,s.roles=st,name,root,roles
        s.sst=sst or []; s.align_override=align_override or {}; s.total_labels=total_labels; s.unlock=unlock; s.only_valued=only_valued
        s.work=[range_boundaries(r) for r in work_ranges]; s.keep_size=keep_size
        s.stats=collections.Counter(); s.changed_cells=[]   # 変更レポート用
    def in_work(s,c,r):
        return any(a<=c<=b2 and t<=r<=d for a,t,b2,d in s.work)
    def run(s,sizes_only_font=False):
        st=s.st; root=s.root
        # セルの索引
        s.cells={c.get('r'):c for c in root.iterfind('.//m:sheetData/m:row/m:c',N)}
        merges=[range_boundaries(m) for m in root.xpath('m:mergeCells/m:mergeCell/@ref',namespaces=N)]
        edge_need={}   # ref -> set(sides)
        for c1,r1,c2,r2 in merges:
            sides=set()
            def hasside(ref,side):
                c=s.cells.get(ref)
                return c is not None and st.side(int(st.xfs[int(c.get('s','0'))].get('borderId')),side)
            top=any(hasside(f'{gl(c)}{r1}','top') for c in range(c1,c2+1))
            bot=any(hasside(f'{gl(c)}{r2}','bottom') for c in range(c1,c2+1))
            lef=any(hasside(f'{gl(c1)}{r}','left') for r in range(r1,r2+1))
            rig=any(hasside(f'{gl(c2)}{r}','right') for r in range(r1,r2+1))
            for r in range(r1,r2+1):
                for c in range(c1,c2+1):
                    e=set()
                    if r==r1 and top: e.add('top')
                    if r==r2 and bot: e.add('bottom')
                    if c==c1 and lef: e.add('left')
                    if c==c2 and rig: e.add('right')
                    if e: edge_need[f'{gl(c)}{r}']=e
        # 結合の左上セルの役割(入力など)を子セルへ
        parent={}
        for c1,r1,c2,r2 in merges:
            for r in range(r1,r2+1):
                for c in range(c1,c2+1):
                    if (r,c)!=(r1,c1): parent[f'{gl(c)}{r}']=f'{gl(c1)}{r1}'
        # 見出しの種類(灰色セルの縦の並びで判定)・小計行・節タイトルの判定
        mrange={}
        for c1,r1,c2,r2 in merges:
            for r in range(r1,r2+1):
                for c in range(c1,c2+1): mrange[(c,r)]=(c1,r1,c2,r2)
        def is_gray(ref):
            cc=s.cells.get(ref)
            if cc is None: return False
            xf=st.xfs[int(cc.get('s','0'))]; fe=st.fills[int(xf.get('fillId'))].find('m:patternFill',N)
            fg=fe.find('m:fgColor',N) if fe is not None else None
            return fe is not None and fe.get('patternType')=='solid' and fg is not None and ((fg.get('theme')=='0' and float(fg.get('tint','0'))<0) or fg.get('rgb') in('FFD9D9D9','FFF2F2F2'))
        def text_of(cell):
            v=cell.find('m:v',N)
            if v is not None and cell.get('t')=='s' and cell.find('m:f',N) is None: return s.sst[int(v.text)]
            return None
        extra={}
        for ref,cell in s.cells.items():
            c,r=split(ref); e={}
            if is_gray(ref):
                c1,r1,c2,r2=mrange.get((c,r),(c,r,c,r))
                up=is_gray(f'{gl(c1)}{r1-1}') if r1>1 else False
                dn=is_gray(f'{gl(c1)}{r2+1}')
                e['head']='row' if (up or dn) else 'col'
            t=text_of(cell)
            if t:
                tt=t.strip()
                if tt.startswith(('【','[','［')): e['section']=1
                if tt in s.total_labels or tt.replace('（','(').replace('）',')') in('合計(税込)','小計'):
                    c1,r1,c2,r2=mrange.get((c,r),(c,r,c,r))
                    cols=[]; k=c2+1
                    while k<=c2+4:
                        nx=s.cells.get(f'{gl(k)}{r1}'); cols.append(k)
                        if nx is not None and nx.find('m:f',N) is not None: break
                        k+=1
                    for cc_ in range(c1,k+1):
                        extra.setdefault(f'{gl(cc_)}{r1}',{})['total']=1
                    e['total']=1
            if ref in s.align_override: e['align']=tuple(sorted(s.align_override[ref].items()))
            if e: extra.setdefault(ref,{}).update(e)
        s.extra=extra
        cache={}
        for ref,cell in s.cells.items():
            if s.only_valued and cell.find('m:v',N) is None and cell.find('m:f',N) is None: continue
            orig=int(cell.get('s','0')); xf=st.xfs[orig]
            c,r=split(ref)
            f=cell.find('m:f',N); v=cell.find('m:v',N)
            is_formula=f is not None
            base=parent.get(ref,ref)
            role=s.roles.get(base) if not is_formula else None  # 'A','B' or None
            if s.in_work(c,r): kind='work'
            elif is_formula: kind='calc'
            elif role=='A': kind='input'
            elif role=='B': kind='assume'
            else: kind='label'
            # 数式セルの色(元が水色なら無し)
            val=None
            if v is not None and cell.get('t') not in('s','str','e','b'): val=v.text
            ex=s.extra.get(ref,{}); key=(orig,kind,ref in edge_need and tuple(sorted(edge_need[ref])), val is not None and fmt_for(st,int(xf.get('numFmtId')),val), tuple(sorted(ex.items())))
            if key not in cache:
                cache[key]=s.make_xf(orig,kind,edge_need.get(ref),val,ex)
            new=cache[key]
            if new!=orig:
                cell.set('s',str(new)); s.stats[kind]+=1
        return s.stats
    def make_xf(s,orig,kind,edge,val,ex=None):
        ex=ex or {}
        st=s.st; xf=st.xfs[orig]
        font_i=int(xf.get('fontId')); fill_i=int(xf.get('fillId')); bord_i=int(xf.get('borderId')); nf=int(xf.get('numFmtId'))
        fnt=st.fonts[font_i]
        col=fnt.find('m:color',N)
        is_red= col is not None and col.get('rgb') in('FFFF0000','FFC00000')
        is_bold= fnt.find('m:b',N) is not None
        fillel=st.fills[fill_i].find('m:patternFill',N)
        fg=fillel.find('m:fgColor',N) if fillel is not None else None
        solid=fillel is not None and fillel.get('patternType')=='solid' and fg is not None
        rgb=fg.get('rgb') if solid else None
        theme=fg.get('theme') if solid else None
        tint=float(fg.get('tint','0')) if solid else 0.0
        white_font= col is not None and (col.get('rgb') in('FFFFFFFF',) or (col.get('theme')=='0' and float(col.get('tint','0'))==0))
        o={}
        newfill=None; fcolor=PAL['TEXT']; bold=None
        sides=None
        if kind=='input': newfill=PAL['INPUT_FILL']; fcolor=PAL['INPUT_FONT']; sides=('left','right','top','bottom')
        elif kind=='assume': newfill=PAL['ASSUME_FILL']; fcolor=PAL['INPUT_FONT']; sides=('left','right','top','bottom')
        elif kind=='work': newfill=PAL['WORK_FILL']; fcolor=PAL['WORK_FONT']
        else:
            # ラベル・数式: 元の塗りの意味を基調色に寄せる
            if not solid or rgb=='FFFFFFFF' or (theme in('0','1') and tint==0 and not white_font and theme=='0'): newfill=None
            elif white_font:                                   # 濃い見出し(黒・濃色+白文字)
                newfill=PAL['BRAND']; fcolor=PAL['HEAD_FONT']; bold=True
            elif rgb=='FFCCFFFF':                              # 水色=入力、の混同を避ける
                newfill=PAL['TINT'] if kind=='label' else None
                if kind=='label': bold=None
            elif rgb=='FFFFFF00': newfill=PAL['NOTE_FILL']
            elif (theme=='0' and tint<0) or rgb in('FFD9D9D9','FFF2F2F2'):   # 灰色の見出し
                if ex.get('head')=='row': newfill=PAL['TINT']; fcolor=PAL['BRAND']; bold=True
                else: newfill=PAL['BRAND']; fcolor=PAL['HEAD_FONT']; bold=True
            elif theme=='1': newfill=PAL['BRAND']; fcolor=PAL['HEAD_FONT']; bold=True
            else: newfill=PAL['TINT']
            if white_font and newfill is None: fcolor='FFFFFF'
            if is_red and newfill in(None,PAL['TINT'],PAL['NOTE_FILL']) and fcolor==PAL['TEXT']: fcolor=PAL['RED']
            if is_bold and bold is None: bold=True
        if ex.get('total') and kind in('label','calc') and newfill is None: newfill=PAL['TINT']; bold=True
        if ex.get('section'): fcolor=PAL['BRAND']; bold=True
        fi=st.font(font_i,color=fcolor,bold=bold,force_size=None)
        o['fontId']=fi
        o['fillId']=st.fill(newfill)
        if ex.get('align'): o['align']=dict(ex['align'])
        if s.unlock and kind in('input','assume'): o['locked']=False
        o['borderId']=st.border(bord_i,sides_force=sides,edge=edge)
        newcode=fmt_for(st,nf,val) if kind!='label' or val is not None else None
        if newcode: o['numFmtId']=st.numfmt(newcode)
        return st.xf(orig,**{k:v for k,v in o.items()})
