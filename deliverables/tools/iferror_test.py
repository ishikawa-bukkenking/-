import sys,os,time,subprocess,uno,pickle,json
from com.sun.star.beans import PropertyValue
rows,roots=pickle.load(open('out/errrows.pkl','rb'))
p=subprocess.Popen(['soffice','--headless','--invisible','--norestore','--accept=socket,host=localhost,port=2003;urp;','-env:UserInstallation=file:///tmp/lo_iferr_profile'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for _ in range(60):
    try:
        lc=uno.getComponentContext(); r=lc.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',lc)
        ctx=r.resolve('uno:socket,host=localhost,port=2003;urp;StarOffice.ComponentContext'); break
    except Exception: time.sleep(1)
desk=ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',ctx)
pv=PropertyValue(); pv.Name='Hidden'; pv.Value=True
doc=desk.loadComponentFromURL('file://'+os.path.abspath('out/template.xlsx'),'_blank',0,(pv,))
doc.calculateAll()
def count(lst=None):
    n=0
    for sh in doc.Sheets:
        if sh.Name in('全体フロー','研修詳細','使い方'): continue
        q=sh.createCursor(); q.gotoEndOfUsedArea(False)
        rng=sh.getCellRangeByPosition(0,0,q.RangeAddress.EndColumn,q.RangeAddress.EndRow)
        for r_,row in enumerate(rng.getFormulaArray()):
            for c_,f in enumerate(row):
                if isinstance(f,str) and f.startswith(('=','{=')) and sh.getCellByPosition(c_,r_).getError()!=0:
                    n+=1
                    if lst is not None: lst.append((sh.Name,c_,r_,f))
    return n
print('before',count())
for sh,c in roots:
    cell=doc.Sheets.getByName(sh).getCellRangeByName(c); f=cell.getFormula(); cell.setFormula('=IFERROR('+f[1:]+';0)')
doc.calculateAll(); L=[]; print('after IFERROR on',len(roots),'roots:',count(L))
from openpyxl.utils import get_column_letter as gl
for a in L: print(a[0],gl(a[1]+1)+str(a[2]+1),a[3][:90])
doc.close(True)
try: desk.terminate()
except Exception: pass
