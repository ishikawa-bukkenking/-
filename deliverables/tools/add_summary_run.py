import sys,json,subprocess
sys.path.insert(0,'/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/tools')
import summary
SD='/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/'
def run(src,dst,position,protect,select):
    tmp=dst+'.tmp.xlsx'
    summary.add_summary(src,tmp,position,protect,None,select)
    subprocess.run(['python3','-I',SD+'tools/recalc.py',tmp,dst+'.rc.json'],check=True)
    vals=json.load(open(dst+'.rc.json'))[summary.SHEET]
    return summary.add_summary(src,dst,position,protect,vals,select),vals
if __name__=='__main__':
    print(run(*sys.argv[1:3],int(sys.argv[3]),sys.argv[4]=='1',sys.argv[5]=='1')[0])
