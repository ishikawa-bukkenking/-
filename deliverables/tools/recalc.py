# usage: recalc.py in.xlsx out.json  -- LibreOfficeで強制再計算し、全数式セルの計算結果を書き出す
import sys,json,subprocess,time,os,uno
from com.sun.star.beans import PropertyValue
inp=os.path.abspath(sys.argv[1]); out=sys.argv[2]
p=subprocess.Popen(['soffice','--headless','--invisible','--norestore','--accept=socket,host=localhost,port=2002;urp;','-env:UserInstallation=file:///tmp/lo_recalc_profile'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
ctx=None
for _ in range(60):
    try:
        lc=uno.getComponentContext(); r=lc.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',lc)
        ctx=r.resolve('uno:socket,host=localhost,port=2002;urp;StarOffice.ComponentContext'); break
    except Exception: time.sleep(1)
desk=ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',ctx)
pv=PropertyValue(); pv.Name='Hidden'; pv.Value=True
doc=desk.loadComponentFromURL('file://'+inp,'_blank',0,(pv,))
doc.calculateAll()
res={}
from com.sun.star.table.CellContentType import FORMULA
for sh in doc.Sheets:
    q=sh.createCursor(); q.gotoEndOfUsedArea(False)
    maxc=q.RangeAddress.EndColumn; maxr=q.RangeAddress.EndRow
    if sh.Name in('全体フロー','研修詳細'): continue
    d={}
    rng=sh.getCellRangeByPosition(0,0,maxc,maxr)
    fa=rng.getFormulaArray(); da=rng.getDataArray()
    for r_,row in enumerate(fa):
        for c_,f in enumerate(row):
            if isinstance(f,str) and f.startswith(('=','{=')):
                cell=sh.getCellByPosition(c_,r_)
                col='';n=c_+1
                while n: n,m=divmod(n-1,26); col=chr(65+m)+col
                err=cell.getError()
                d[f'{col}{r_+1}']={'v':cell.getValue(),'s':cell.getString(),'e':err,'t':int(cell.FormulaResultType2),'raw':da[r_][c_],'f':cell.getFormula()}
    res[sh.Name]=d
json.dump(res,open(out,'w'),ensure_ascii=False)
doc.close(True)
try: desk.terminate()
except Exception: pass
p.wait(timeout=30)
