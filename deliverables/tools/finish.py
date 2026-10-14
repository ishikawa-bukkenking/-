import sys,pickle,json,zipfile,subprocess
sys.path.insert(0,'/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/tools')
from make_template import *
D=sys.argv[1]
def recalc(x,j): subprocess.run(['python3','-I',SD+'tools/recalc.py',x,j],check=True)
import add_summary_run, shutil
# 「まとめ」シートを追加(整形版=先頭、テンプレート版=「使い方」の次)
add_summary_run.run(D+'/formatted.xlsx',D+'/formatted_s.xlsx',0,False,True); shutil.copy(D+'/formatted_s.xlsx',D+'/formatted.xlsx')
add_summary_run.run(D+'/template_pre.xlsx',D+'/template_pre2.xlsx',1,True,False)
recalc(D+'/template_pre2.xlsx',D+'/template_pre.json')
n=inject_cache(D+'/template_pre2.xlsx',D+'/template_pre.json',D+'/template.xlsx'); print('キャッシュ値を更新した数式セル',n)
# 整形版にも検証用の再計算
recalc(D+'/formatted.xlsx',D+'/formatted.json')
# 復元版(三ツ星の入力を全部戻す)
saved,cleared=pickle.load(open(D+'/saved.pkl','rb'))
zt=zipfile.ZipFile(D+'/template.xlsx'); zf=zipfile.ZipFile(D+'/formatted.xlsx')
parts={n_:zt.read(n_) for n_ in zt.namelist()}
parts['xl/sharedStrings.xml']=zf.read('xl/sharedStrings.xml')
for i in range(1,13):
    p=f'xl/worksheets/sheet{i}.xml'; root=etree.fromstring(parts[p])
    for c in root.iterfind('.//m:sheetData/m:row/m:c',N):
        k=(i,c.get('r'))
        if k in saved:
            t,v=saved[k]; vv=c.find('m:v',N)
            if vv is None: vv=etree.SubElement(c,q('v'))
            vv.text=v
            if t: c.set('t',t)
            else: c.attrib.pop('t',None)
    parts[p]=etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
zo=zipfile.ZipFile(D+'/restored.xlsx','w',zipfile.ZIP_DEFLATED)
for n_ in zt.namelist(): zo.writestr(n_,parts[n_])
zo.close()
recalc(D+'/restored.xlsx',D+'/restored.json'); recalc(D+'/template.xlsx',D+'/template.json')
print('done')
