# 検証: 「260708(取り込み元)+ 目標設定の4つの数式を260804版に置換 + 社名を株式会社〇〇」を LibreOffice で再計算した結果と、整形版の再計算結果を全数式で比較
import os,time,subprocess,uno,json,sys
from com.sun.star.beans import PropertyValue
SD='/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/'
op=json.load(open(SD+'orig_plus.json'))
p=subprocess.Popen(['soffice','--headless','--invisible','--norestore','--accept=socket,host=localhost,port=2005;urp;','-env:UserInstallation=file:///tmp/lo_vc_profile'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for _ in range(60):
    try:
        lc=uno.getComponentContext(); r=lc.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',lc)
        ctx=r.resolve('uno:socket,host=localhost,port=2005;urp;StarOffice.ComponentContext'); break
    except Exception: time.sleep(1)
desk=ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',ctx)
pv=PropertyValue(); pv.Name='Hidden'; pv.Value=True
doc=desk.loadComponentFromURL('file://'+SD+'new/new.xlsx','_blank',0,(pv,))
sh=doc.Sheets.getByName('目標設定')
for c in('AB24','AB25','AB26','G25'): sh.getCellRangeByName(c).setFormula(op['目標設定'][c]['f'])
doc.Sheets.getByName('社名').getCellRangeByName('C15').setString('株式会社〇〇')
doc.calculateAll(); res={}
for s in doc.Sheets:
    if s.Name in('全体フロー','研修詳細'): continue
    q=s.createCursor(); q.gotoEndOfUsedArea(False)
    rng=s.getCellRangeByPosition(0,0,q.RangeAddress.EndColumn,q.RangeAddress.EndRow); fa=rng.getFormulaArray(); da=rng.getDataArray(); d={}
    for r_,row in enumerate(fa):
        for c_,f in enumerate(row):
            if isinstance(f,str) and f.startswith(('=','{=')):
                cell=s.getCellByPosition(c_,r_); col='';n=c_+1
                while n: n,m=divmod(n-1,26); col=chr(65+m)+col
                d[f'{col}{r_+1}']={'v':cell.getValue(),'s':cell.getString(),'e':cell.getError(),'t':int(cell.FormulaResultType2),'raw':da[r_][c_],'f':cell.getFormula()}
    res[s.Name]=d
json.dump(res,open(SD+'out/patched260708.json','w'),ensure_ascii=False); doc.close(True)
try: desk.terminate()
except Exception: pass
