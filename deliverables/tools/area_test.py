import os,time,subprocess,uno
from com.sun.star.beans import PropertyValue
p=subprocess.Popen(['soffice','--headless','--invisible','--norestore','--accept=socket,host=localhost,port=2004;urp;','-env:UserInstallation=file:///tmp/lo_area_profile'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for _ in range(60):
    try:
        lc=uno.getComponentContext(); r=lc.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',lc)
        ctx=r.resolve('uno:socket,host=localhost,port=2004;urp;StarOffice.ComponentContext'); break
    except Exception: time.sleep(1)
desk=ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',ctx)
pv=PropertyValue(); pv.Name='Hidden'; pv.Value=True
doc=desk.loadComponentFromURL('file://'+os.path.abspath('out/formatted.xlsx'),'_blank',0,(pv,))
ta=doc.Sheets.getByName('ターゲットエリア'); sm=doc.Sheets.getByName('まとめ')
orig=[ta.getCellRangeByName(f'C{r}').getString() for r in range(6,12)]
def show(tag):
    doc.calculateAll(); print(tag,'|',sm.getCellRangeByName('E11').getString(),'|',sm.getCellRangeByName('E12').getString())
for names in(['埼玉県児玉郡'],['埼玉県児玉郡','本庄市'],['埼玉県児玉郡','本庄市','深谷市'],['A市','B市','C市','D市','E市','F市'],[]):
    for i in range(6): ta.getCellRangeByName(f'C{6+i}').setString(names[i] if i<len(names) else '')
    show(f'{len(names)}エリア入力')
doc.close(True)
try: desk.terminate()
except Exception: pass
