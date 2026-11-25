const content=n=>String(n?.innerText??n?.textContent??'').trim()
const empty=v=>!v||/^(?:[-–—]+|\(\s*\)|\[\s*\]|미입력|미정|작성\s*필요)$/i.test(v)
export function inspectDocument(root){
 const issues=[],seen=new Set()
 const add=(kind,location,detail)=>{const key=[kind,location,detail].join('|');if(!seen.has(key)){seen.add(key);issues.push({kind,location,detail})}}
 for(const [ti,table] of [...root.querySelectorAll('table')].entries())for(const [ri,row] of [...table.rows].entries()){
  const cells=[...row.cells]
  for(let i=0;i+1<cells.length;i+=2){
   const label=content(cells[i]),value=content(cells[i+1]);if(!label||label.length>80)continue
   // Header labels are not form fields.
   if(cells[i].tagName==='TH'&&cells[i+1].tagName==='TH')continue
   const where='표 '+(ti+1)+' · '+label+' ('+(ri+1)+'행)'
   if(empty(value)){const kind=/서명|날인|결재|인감/.test(label)?'서명':/금액|대금|비용|예산|계약금/.test(label)?'금액':/날짜|일자|작성일|체결일|시작일|종료일|기한/.test(label)?'날짜':'빈 항목';add(kind,where,'내용이 비어 있거나 확인이 필요합니다.');continue}
   if(/금액|대금|비용|예산|계약금|금전|금원/.test(label)){
    if(/예시|미정|확인|추후|임의|협의|\[|\?/.test(value)||!/[0-9영일이삼사오육칠팔구십백천만억]/.test(value))add('금액',where,'금액과 산출 근거를 확인하세요.')
   }
   if(/날짜|일자|작성일|체결일|시작일|종료일|기한/.test(label)){
    const matches=[...value.matchAll(/(\d{4})\s*[.\/-년]\s*(\d{1,2})\s*[.\/-월]\s*(\d{1,2})/g)]
    const valid=m=>{let y=+m[1],mo=+m[2],d=+m[3],dt=new Date(Date.UTC(y,mo-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d}
    if(/예시|미정|확인|추후|\[|\?/.test(value)||!matches.length||matches.some(m=>!valid(m)))add('날짜',where,'날짜와 기간을 확인하세요.')
   }
   if(/서명|날인|결재|인감/.test(label)&&/서명란|날인란|미서명|미날인|\[|\(인\)/.test(value))add('서명',where,'서명 또는 날인 여부를 확인하세요.')
  }
 }
 const body=content(root)
 for(const line of body.split(/\n/))if(/(?:서명|날인)\s*[:：]\s*(?:\(인\)|\[.*?\]|[-_\s]*)$/.test(line.trim()))add('서명','본문','서명 또는 날인 여부를 확인하세요.')
 if(body.length<10)add('본문','문서','본문이 거의 비어 있습니다.')
 return {issues,tables:root.querySelectorAll('table').length,length:body.length}
}
export function compareDocumentText(before,after){
 const lines=s=>String(s||'').replace(/\r\n?/g,'\n').split(/\n/).map(x=>x.trim()).filter(Boolean)
 const a=lines(before).slice(0,500),b=lines(after).slice(0,500),dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1))
 for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i][j]=a[i]===b[j]?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1])
 const changes=[];let i=0,j=0
 while(i<a.length||j<b.length){if(i<a.length&&j<b.length&&a[i]===b[j]){i++;j++;continue}if(j<b.length&&(i===a.length||dp[i][j+1]>dp[i+1][j]))changes.push({kind:'추가',text:b[j++]});else changes.push({kind:'삭제',text:a[i++]})}
 return {changes:changes.slice(0,100),truncated:changes.length>100||lines(before).length>500||lines(after).length>500}
}
