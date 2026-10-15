import sys,pickle
SD='/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/'
sys.path.insert(0,SD+'tools')
import verify
ch=pickle.load(open(SD+'sync_changes.pkl','rb')); allowed={('社名','C15')}|{(a,b) for a,b,c,d in ch}
print('### 元(260804) vs 整形版(許容=記入例を合わせた%dセル+社名)'%len(ch))
verify.compare(SD+'orig/orig.xlsx',SD+'out/formatted.xlsx',expect_cleared=allowed)
za,wa,sa=verify.sheets(SD+'new/new.xlsx'); zb,wb,sb=verify.sheets(SD+'out/formatted.xlsx')
only804={('事業検討',c) for c in('W37','W38','W39','Q39','S39','E52')}|{('社名','C15')}
diff=[]; fd=[]
for n in sa:
    if n in('全体フロー','研修詳細'): continue
    da=verify.cells(*sa[n])[1]; db=verify.cells(*sb[n])[1]
    for k in set(da)|set(db):
        a=da.get(k,(None,None)); b=db.get(k,(None,None))
        if a[0]!=b[0]: fd.append((n,k))
        if a[0] is None and b[0] is None and a[1]!=b[1] and (n,k) not in only804: diff.append((n,k,a[1],b[1]))
print('### 260708 vs 整形版: 定数差分',len(diff),diff[:5],'| 数式差分',sorted(fd))
print('### 整形版 vs テンプレート版')
saved,cleared=pickle.load(open(SD+'out/saved.pkl','rb'))
names=["社名","全体フロー","研修詳細","店舗内装","ターゲットエリア","免許","目標設定","事業検討","簡易PL","PL（1年目）","PL（2年目以降）","決定事項","給与整合性","インセンティブ検討","能力判定"]
verify.compare(SD+'out/formatted.xlsx',SD+'out/template.xlsx',expect_cleared={(names[i-1],ref) for (i,ref) in saved})
print('空にした/置換したセル',len(saved))
