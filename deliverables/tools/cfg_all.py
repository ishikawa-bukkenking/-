from fmt import PAL
IN='5B9BD5'; CALC='A6A6A6'; OUT=PAL['BRAND']
def cfgs(first_input):
    c={}
    c[1]=dict(tab=IN,zoom=100,select='C15',orient='portrait',fit=(1,1))
    c[2]=dict(tab=OUT,zoom=75,select='A1',orient='landscape',fit=(1,1),only_valued=True,margins=dict(left=0.3,right=0.3,top=0.5,bottom=0.5,header=0.2,footer=0.2))
    c[3]=dict(tab=OUT,zoom=75,select='A1',orient='landscape',fit=(1,1),margins=dict(left=0.3,right=0.3,top=0.5,bottom=0.5,header=0.2,footer=0.2))
    c[4]=dict(tab=IN,zoom=100,select=first_input[4],orient='portrait',fit=(1,1))
    c[5]=dict(tab=IN,zoom=100,select='C6',orient='portrait',fit=(1,0),work=('BB1:CB102',),breaks=[52])
    c[6]=dict(tab=IN,zoom=100,select='D3',orient='landscape',fit=(1,1))
    c[7]=dict(tab=IN,zoom=100,select=first_input[7],orient='portrait',fit=(1,1))
    c[8]=dict(tab=IN,zoom=100,select='F11',orient='portrait',fit=(1,1),align={'E52':{'shrinkToFit':None,'horizontal':'left','wrapText':None},'S39':{'shrinkToFit':None,'horizontal':'left','wrapText':None}})
    c[9]=dict(tab=CALC,zoom=85,select=first_input[9],orient='portrait',fit=(1,1),work=('AL1:BI16',))
    for k in(10,11): c[k]=dict(tab=CALC,zoom=100,select=first_input[k],orient='landscape',fit=(1,1),freeze='D2',work=('W1:AI77',))
    c[12]=dict(tab=OUT,zoom=100,select='A1',orient='portrait',fit=(1,1))
    return c
PRINT_AREAS={1:'A1:I18',2:'A1:GO66',4:'A1:AB66',5:'A1:BA102'}
