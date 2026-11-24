// HWPX AI table target selection based on logical, merged-aware grid coordinates.
const read=node=>String(node?.innerText??node?.textContent??'').replace(/\u00a0/g,' ').trim()
const norm=s=>String(s||'').replace(/[\s:：*]+/g,'').toLowerCase()
function layout(table){
 const occupied=new Set(),entries=[],grid=new Map()
 for(const [r,row] of Array.from(table.rows).entries()){
  let col=0
  for(const cell of Array.from(row.cells)){
   while(occupied.has(r+':'+col))col++
   if(cell.hasAttribute('data-hwp-col')){
    const n=Number(cell.dataset.hwpCol)
    if(Number.isInteger(n)&&n>=0&&n<=128)col=n
   }
   const width=Math.max(1,Math.min(128,cell.colSpan||1)),height=Math.max(1,Math.min(80,cell.rowSpan||1))
   const obj={cell,row:r,col,width,height,text:read(cell)}
   entries.push(obj)
   for(let rr=r;rr<r+height;rr++)for(let cc=col;cc<col+width;cc++){
    grid.set(rr+':'+cc,obj);if(rr>r)occupied.add(rr+':'+cc)
   }
   col+=width
  }
 }
 return {entries,grid,columns:Math.max(0,...entries.map(x=>x.col+x.width))}
}
function tableName(table,index){
 const h=Array.from(table.rows[0]?.cells||[]).map(read).join(' / ')
 if(h.includes('과제목표'))return '과제목표'
 if(h.includes('세부내용')&&h.includes('증빙'))return '사업추진 목표'
 if(h.includes('추진')&&h.includes('일정'))return '추진 일정'
 if(h.includes('수익')||h.includes('Revenue'))return '수익 모델'
 if(h.includes('사업비')||h.includes('지원금'))return '사업예산'
 return '표 '+(index+1)
}
function focusedTable(prompt){
 const text=String(prompt||'')
 const direct=text.match(/(?:표|테이블)\s*([1-9]\d*)/i)
 if(direct)return Number(direct[1])-1
 if(/첫\s*번째.*표|과제목표/.test(text))return 0
 if(/필수목표|자율목표|성과지표|사업추진 목표/.test(text))return 1
 if(/추진일정|월별 일정/.test(text))return 2
 if(/수익 모델|예상 단가|비즈니스 모델/.test(text))return 3
 if(/사업예산|지원금|자체부담금|인건비/.test(text))return 4
 return null
}
export function captureTableTargets(root,preferredCell=null,{prompt='',maxTargets=100}={}){
 const tables=Array.from(root.querySelectorAll('table')).slice(0,20)
 const groups=[]
 for(const [i,table] of tables.entries()){
  const {entries,grid,columns}=layout(table),title=tableName(table,i),schedule=columns>=15
  const group=[]
  for(const item of entries){
   if(item.text&&item.cell!==preferredCell)continue
   if(schedule&&focusedTable(prompt)!==i&&item.col>=2)continue
   const first=grid.get('0:'+item.col),second=grid.get('1:'+item.col)
   const header=second?.row===1&&second.text?second.text:first?.text||''
   let rowLabel=''
   for(let c=item.col-1;c>=0;c--){
    const left=grid.get(item.row+':'+c)
    if(left?.text){rowLabel=left.text;break}
   }
   const t={cellId:'t'+i+'r'+item.row+'c'+item.col,
    label:title+' / '+(rowLabel||'빈 행')+' / '+(header||'열 '+(item.col+1)),
    tableTitle:title,rowLabel,columnHeader:header,
    table:i+1,row:item.row+1,column:item.col+1,current:item.text.slice(0,1000),editable:true}
   group.push({t,el:item.cell})
  }
  groups.push(group)
 }
 const picked=[],focus=focusedTable(prompt)
 if(focus!==null&&groups[focus])picked.push(...groups[focus].slice(0,maxTargets))
 else{
  const cursors=groups.map(()=>0)
  while(picked.length<maxTargets){
   let progress=false
   groups.forEach((g,i)=>{if(picked.length<maxTargets&&cursors[i]<g.length){picked.push(g[cursors[i]++]);progress=true}})
   if(!progress)break
  }
 }
 return {targets:picked.map(x=>x.t),elements:new Map(picked.map(x=>[x.t.cellId,x.el])),
  totalTables:tables.length,totalAvailable:groups.reduce((n,g)=>n+g.length,0)}
}
export function validateTableEdits(snapshot,proposals,{overwrite=false}={}){
 if(!snapshot||!Array.isArray(proposals))return []
 const map=new Map(snapshot.targets.map(t=>[t.cellId,t])),seen=new Set(),valid=[]
 for(const p of proposals.slice(0,100)){
  const id=String(p?.cellId||''),t=map.get(id),el=snapshot.elements.get(id)
  const value=typeof p?.value==='string'?p.value.trim():''
  if(!t||!el?.isConnected||seen.has(id)||!value||value.length>1000)continue
  if(read(el)!==t.current||t.current&&!overwrite||value===t.current||el.querySelector('table'))continue
  seen.add(id);valid.push({cellId:id,label:t.label,before:t.current,value,element:el,source:p.source||'AI 제안'})
 }
 return valid
}
function explicitCoordinates(prompt){
 const regex=/(?:^|\n)\s*표\s*([1-9]\d*)\s*[,， ]*\s*([1-9]\d*)\s*행\s*[,， ]*\s*([1-9]\d*)\s*열\s*[:：=]\s*([^\r\n]+)/g
 return Array.from(String(prompt||'').matchAll(regex),([,table,row,column,value])=>({table:+table,row:+row,column:+column,value:value.trim()}))
}
export function inferTableValues(snapshot,prompt,{today=''}={}){
 if(!snapshot)return []
 const byCoordinate=new Map(snapshot.targets.map(t=>[[t.table,t.row,t.column].join(':'),t]))
 const output=[]
 for(const a of explicitCoordinates(prompt)){
  const t=byCoordinate.get([a.table,a.row,a.column].join(':'))
  if(t&&!t.current&&a.value&&a.value.length<=1000)output.push({cellId:t.cellId,value:a.value,source:'지정 좌표'})
 }
 // Existing two-column "작성자: ..." forms remain supported.
 const matches=Array.from(String(prompt||'').matchAll(/(제목|작성자|담당자|작성일|날짜|성명)\s*(?:은|는|:|：|=)\s*/g))
 const values=new Map()
 for(let i=0;i<matches.length;i++){
  const m=matches[i],end=i+1<matches.length?matches[i+1].index:prompt.length
  const v=prompt.slice(m.index+m[0].length,end).split(/[,，;\r\n]/)[0].trim()
  if(v&&!/^(채워|입력|작성|기입)/.test(v))values.set(m[1],v==='오늘'?today:v)
 }
 const used=new Set(output.map(x=>x.cellId))
 for(const t of snapshot.targets){
  if(t.current||used.has(t.cellId))continue
  const label=norm(t.rowLabel)
  const keys=label.includes('작성자')?['작성자','담당자']:
    label.includes('담당자')?['담당자','작성자']:
    label.includes('작성일')||label.includes('날짜')?['작성일','날짜']:
    label.includes('제목')?['제목']:
    label.includes('성명')?['성명']:[]
  const value=keys.map(k=>values.get(k)).find(Boolean)
  if(value&&value.length<=1000)output.push({cellId:t.cellId,value,source:'지정 항목'})
 }
 return output
}
export function applyTableEdits(edits){
 let count=0
 for(const e of edits){
  if(!e.element?.isConnected||read(e.element)!==e.before||e.element.querySelector('table'))continue
  e.element.textContent=e.value
  count++
 }
 return count
}
export function matchingFormFields(root){
 const snapshot=captureTableTargets(root)
 return {snapshot,fields:snapshot.targets.filter(t=>!t.current)}
}
