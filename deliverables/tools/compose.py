from PIL import Image,ImageDraw,ImageFont
import os
S='/tmp/claude-0/-home-user--/db782ef1-e569-59dc-97e4-a77616c95c04/scratchpad/img/'
O='/home/user/-/deliverables/report/img/'; os.makedirs(O,exist_ok=True)
f=ImageFont.truetype('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',30)
names=["社名","全体フロー","研修詳細","店舗内装","ターゲットエリア","免許","目標設定","事業検討","簡易PL","PL（1年目）","PL（2年目以降）","決定事項"]
before=[(1,2),(3,4),(5,6),(7,8),(9,12),(13,14),(15,16),(17,18),(19,20),(21,24),(25,28),(29,32)]
after=[(1,1),(2,2),(3,3),(4,4),(5,6),(7,7),(8,8),(9,9),(10,10),(11,11),(12,12),(13,13)]
def grid(pref,rng,four):
    ims=[Image.open(S+f'{pref}-{i:02d}.png').convert('RGB') for i in range(rng[0],rng[1]+1)]
    if four and len(ims)==4:
        w,h=ims[0].width,ims[0].height; M=Image.new('RGB',(w*2+10,h*2+10),(200,200,200))
        for k,im in enumerate(ims): M.paste(im,((k//2)*(w+10),(k%2)*(h+10)))
        return M
    h=max(i.height for i in ims); w=sum(i.width for i in ims)+10*(len(ims)-1); M=Image.new('RGB',(w,h),(200,200,200)); x=0
    for i in ims: M.paste(i,(x,0)); x+=i.width+10
    return M
for k,n in enumerate(names):
    four=(before[k][1]-before[k][0]==3)
    b=grid('b',before[k],four); a=grid('a',after[k],False)
    H=max(b.height,a.height); W=b.width+a.width+60
    M=Image.new('RGB',(W,H+60),'white'); d=ImageDraw.Draw(M)
    d.text((10,12),'変更前(元ファイル / PDF化・%dページ)'%(before[k][1]-before[k][0]+1),fill='black',font=f); d.text((b.width+60,12),'変更後(整形版 / PDF化・%dページ)'%(after[k][1]-after[k][0]+1),fill='black',font=f)
    M.paste(b,(0,60)); M.paste(a,(b.width+60,60))
    s=min(1.0,2600/M.width); M=M.resize((int(M.width*s),int(M.height*s))); M.save(O+f'{k+1:02d}_{n}.png')
print('ok')
