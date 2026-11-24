// Document coordinate map: visual A1-style addresses never enter the document text.
// All coordinates are recalculated from the rendered table structure; each cell
// also receives a session-stable identity kept separate from its current position.
const text=node=>String(node?.innerText??node?.textContent??'').replace(/\u00a0/g,' ').replace(/\u200b/g,'').trim()
const clean=s=>String(s||'').replace(/\s+/g,' ').slice(0,110)
export function columnLetters(zeroBased){
 let n=zeroBased+1,s=''
 while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}
 return s
}
export function mapTable(table,tableIndex=0){
 const occupied=new Set(),grid=new Map(),cells=[]
 const rows=Array.from(table.rows||[])
 for(const [r,row] of rows.entries()){
  let col=0
  for(const el of Array.from(row.cells||[])){
   while(occupied.has(r+':'+col))col++
   const hinted=el.getAttribute('data-hwp-col')
   const hint=hinted===null?NaN:Number(hinted)
   if(Number.isInteger(hint)&&hint>=0&&hint<=127)col=hint
   const width=Math.max(1,Math.min(128,Number(el.colSpan)||1))
   const height=Math.max(1,Math.min(100,Number(el.rowSpan)||1))
   const obj={
    el,table:tableIndex+1,r,c:col,row:r+1,column:col+1,
    width,height,current:text(el).slice(0,1000),
    cellId:'t'+tableIndex+'r'+r+'c'+col,
    address:'표'+(tableIndex+1)+'!'+columnLetters(col)+(r+1)
   }
   cells.push(obj)
   for(let rr=r;rr<r+height;rr++){
    for(let cc=col;cc<col+width;cc++){
     grid.set(rr+':'+cc,obj)
     if(rr>r)occupied.add(rr+':'+cc)
    }
   }
   col+=width
  }
 }
 return {tableIndex,title:'',table,rows:rows.length,
  columns:Math.max(0,...cells.map(x=>x.c+x.width)),cells,grid}
}
const tidy=s=>clean(s).replace(/[［\[\]］]/g,'')
function nearbyHeading(table){
 let prev=table.previousElementSibling,tries=0
 while(prev&&tries++<5){
  const tag=prev.tagName?.toLowerCase()
  if(['h1','h2','h3','h4','p','div'].includes(tag)&&!prev.querySelector?.('table')){
   const value=tidy(text(prev))
   if(value&&value.length<=75)return value
  }
  prev=prev.previousElementSibling
 }
 return ''
}
function titleOf(t){
 const all=t.cells.filter(x=>x.r===0&&x.current).map(x=>x.current)
 const headings=all.join(' / ')
 const near=nearbyHeading(t.table)
 if(near&&/표|계획|목표|사업|보고|회의|과제|실적|일정|예산|수익|신청|계약/.test(near))return near
 if(headings.includes('과제목표'))return '과제목표'
 if(headings.includes('세부내용')||headings.includes('증빙'))return '사업추진 목표'
 if(headings.includes('일정')||headings.includes('월'))return '추진 일정'
 if(headings.includes('사업비')||headings.includes('지원금'))return '사업예산'
 if(headings.includes('보고일')||headings.includes('담당자'))return '업무보고서'
 return tidy(headings).slice(0,75)||near||'표 '+(t.tableIndex+1)
}
function meaningAt(x,t){
 const {grid}=t
 let left=''
 for(let c=x.c-1;c>=0;c--){
  const v=grid.get(x.r+':'+c)
  if(v?.current&&v!==x){left=tidy(v.current);break}
 }
 if(!left)for(let r=x.r-1;r>=0;r--){
  const v=grid.get(r+':0')
  if(v?.current&&v.height>1&&v!==x){left=tidy(v.current);break}
 }
 let column=''
 for(let r=x.r-1;r>=0;r--){
  const v=grid.get(r+':'+x.c)
  if(v?.current&&v!==x){column=tidy(v.current);break}
 }
 if(!column&&x.r>0){
  const v=grid.get('0:'+x.c)
  if(v?.current&&v!==x)column=tidy(v.current)
 }
 const preceding=t.cells.filter(c=>c.r===x.r&&c.c<x.c&&c.current)
 const rowContext=preceding.map(c=>tidy(c.current)).slice(-2).join(' / ')
 let kind='narrative'
 const context=[left,column,t.title].join(' ')
 if(/작성자|담당자|성명|대표자|연락처|전화|이메일|주소|서명|날인|계좌|주민|생년/.test(context))kind='personal'
 else if(/작성일|보고일|날짜|일자|기간|년월일/.test(context))kind='date'
 else if(/금액|매출|비용|원가|단가|비율|예산|실적|수량|목표치|정량/.test(context))kind='numeric'
 else if(/결재|승인|확인란/.test(context))kind='approval'
 return {rowLabel:left||rowContext,columnHeader:column,kind}
}
function hasObject(el){
 return Boolean(el.querySelector('table,img,svg,input,textarea,select,canvas,iframe'))
}
export function analyzeDocumentTables(root){
 const tables=Array.from(root.querySelectorAll('table')).filter(el=>!el.parentElement?.closest('table')).slice(0,30)
 const mapped=tables.map((el,i)=>mapTable(el,i))
 for(const t of mapped){
  t.title=titleOf(t)
  for(const x of t.cells){
   const m=meaningAt(x,t)
   x.rowLabel=m.rowLabel;x.columnHeader=m.columnHeader;x.kind=m.kind
   x.label=[t.title,m.rowLabel,m.columnHeader].filter(Boolean).join(' / ').slice(0,195)
   x.editable=!x.current&&!hasObject(x.el) &&
     !(t.columns>=8 && x.r===0 && !m.rowLabel && !m.columnHeader)
  }
 }
 return {tables:mapped,allCells:mapped.flatMap(t=>t.cells),
  blankCells:mapped.flatMap(t=>t.cells.filter(c=>c.editable))}
}
export function annotateCoordinates(root,{show=false,highlight=false}={}){
 const map=analyzeDocumentTables(root)
 for(const c of map.allCells){
  c.el.dataset.cellAddress=c.address
  c.el.dataset.cellId=c.cellId
  c.el.dataset.aiBlank=c.editable?'true':'false'
  if(!c.el.dataset.stableCellId){
   const d=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():
     'cell-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)
   c.el.dataset.stableCellId=d
  }
 }
 root.classList.toggle('show-cell-addresses',show)
 root.classList.toggle('show-ai-blanks',highlight)
 return map
}
function chooseFocus(prompt,mapped){
 const p=String(prompt||'')
 const match=p.match(/(?:표|테이블)\s*([1-9]\d*)/)
 if(match)return Number(match[1])-1
 const names=mapped.map(t=>t.title)
 const hits=names.map((title,i)=>({i,score:title&&title.length>=3&&p.includes(title)?title.length:0}))
   .filter(x=>x.score>0).sort((a,b)=>b.score-a.score)
 return hits.length?hits[0].i:null
}
function isExplicitAll(prompt){return /모든|전체|전부|양식.*채워|빈칸.*채워|문서.*완성/.test(prompt)}
export function semanticSnapshot(root,{prompt='',maxTargets=180}={}){
 const map=analyzeDocumentTables(root)
 const groups=map.tables.map(t=>t.cells.filter(c=>c.editable))
 const focus=isExplicitAll(prompt)?null:chooseFocus(prompt,map.tables)
 const picked=[]
 if(focus!==null&&groups[focus]?.length)picked.push(...groups[focus].slice(0,maxTargets))
 else{
  const cursor=groups.map(()=>0)
  // Round-robin prevents a wide 31-column schedule from swallowing the prompt.
  while(picked.length<maxTargets){
   let progress=false
   for(let i=0;i<groups.length&&picked.length<maxTargets;i++){
    if(cursor[i]<groups[i].length){
     picked.push(groups[i][cursor[i]++]);progress=true
    }
   }
   if(!progress)break
  }
 }
 const targets=picked.map(c=>({
  cellId:c.cellId,address:c.address,stableId:c.el.dataset.stableCellId||'',
  label:c.label,tableTitle:map.tables[c.table-1].title,
  rowLabel:c.rowLabel,columnHeader:c.columnHeader,kind:c.kind,
  table:c.table,row:c.row,column:c.column,current:c.current,editable:true
 }))
 return {targets,elements:new Map(picked.map(c=>[c.cellId,c.el])),
  totalTables:map.tables.length,totalAvailable:map.blankCells.length,
  excluded:Math.max(0,map.blankCells.length-targets.length),focusTable:focus===null?null:focus+1}
}
export function splitSemanticBatches(targets,size=32){
 const batches=[]
 for(let i=0;i<targets.length;i+=size)batches.push(targets.slice(i,i+size))
 return batches
}
export function isSemanticFillIntent(prompt){
 const p=String(prompt||'')
 if(/(?:요약|분석|검사|설명|찾아|검색|교정|맞춤법|차이)/.test(p)&&!/(?:채워|작성|완성|입력|생성)/.test(p))return false
 return /(?:채워|채우|입력|기입|작성|완성|만들어|생성|제안|자동입력|자동\s*작성|기획)/.test(p)
}
