// MiloSoft six-field work report. This module never changes the DOM itself.
// A named-field map (rather than model-produced cell addresses) is the source of truth.
export const REPORT_FIELDS=[
  {key:'date',title:'보고일',aliases:['보고일','보고일자','보고날짜']},
  {key:'department',title:'부서',aliases:['부서','부서명']},
  {key:'assignee',title:'담당자',aliases:['담당자','담당자명']},
  {key:'work',title:'업무 내용',aliases:['업무내용','업무내역']},
  {key:'progress',title:'진행 현황',aliases:['진행현황','진행상황']},
  {key:'plan',title:'향후 계획',aliases:['향후계획','추후계획']}
]
const read=node=>String(node?.innerText??node?.textContent??'').replace(/\u00a0/g,' ').trim()
const normalize=s=>String(s||'').replace(/[\s:：*·]+/g,'').replace(/^[•\-]+|[•\-]+$/g,'')
const fieldsByLabel=new Map(REPORT_FIELDS.flatMap(f=>f.aliases.map(label=>[label,f])))
function fieldName(text){return fieldsByLabel.get(normalize(text))||null}
// In the report template each labelled row has a left label and a right value.
// Preserve the existing table element, cell bindings, colspans and CSS.
export function captureBusinessReport(root){
 const tables=Array.from(root.querySelectorAll('table'))
 for(const [tableIndex,table] of tables.entries()){
  const found=new Map()
  for(const [rowIndex,row] of Array.from(table.rows).entries()){
   const cells=Array.from(row.cells)
   if(cells.length!==2)continue
   const field=fieldName(read(cells[0]))
   if(!field||found.has(field.key)||cells[1].querySelector('table'))continue
   const targetCell=cells[1]
   let col=Number(targetCell.dataset.hwpCol)
   if(!targetCell.hasAttribute('data-hwp-col')||!Number.isInteger(col)||col<0){
     col=Math.max(1,Number(cells[0].colSpan)||1)
   }
   const target={
     cellId:'t'+tableIndex+'r'+rowIndex+'c'+col,
     fieldKey:field.key,label:field.title,tableTitle:'업무보고서',
     rowLabel:field.title,columnHeader:'내용',
     table:tableIndex+1,row:rowIndex+1,column:col+1,
     current:read(targetCell).slice(0,1000),editable:true
   }
   found.set(field.key,{target,element:targetCell})
  }
  if(found.size!==REPORT_FIELDS.length)continue
  const values=REPORT_FIELDS.map(f=>found.get(f.key))
  const empty=values.filter(x=>!x.target.current)
  return {
   recognized:true,
   title:'업무보고서',
   fields:values.map(x=>x.target),
   targets:empty.map(x=>x.target),
   elements:new Map(empty.map(x=>[x.target.cellId,x.element])),
   tableIndex,
   emptyCount:empty.length,
   totalTables:tables.length
  }
 }
 return null
}
export function isReportFillRequest(prompt){
 const p=String(prompt||'')
 if(/(?:요약|교정|맞춤법|검사|찾아|검색|설명해)/.test(p) && !/(?:채워|입력|작성해|완성해|기입)/.test(p))return false
 return /(?:작성|채우|채워|입력|기입|완성|반영|만들어|정리해|보고일|부서|담당자|업무\s*내용|진행\s*현황|향후\s*계획)/.test(p)
}
function sentence(raw){
 return String(raw||'').replace(/^[\s"“‘,:，]+|[\s"”’,:，。.!]+$/g,'').trim()
}
function segmentAfter(prompt,regex){
 const m=regex.exec(prompt)
 if(!m)return ''
 const tail=prompt.slice(m.index+m[0].length)
 let value=tail.split(/[.。\n\r]/)[0]
 // Separate adjacent natural language report clauses even without punctuation.
 value=value.split(/[,，;]\s*(?=(?:현재|앞으로|향후|진행\s*현황|업무\s*내용|보고일|부서|담당자))/)[0]
 value=value.split(/\s+(?=(?:현재\s|앞으로\s|향후\s*계획|진행\s*현황|업무\s*내용))/)[0]
 return sentence(value)
}
const bad=/^(?:없음|모름|미정|빈칸|미입력|자동|작성|채워|넣어|알아서|입력해)/i
function nameOf(prompt,kind){
 const regex=kind==='department'
  ? /(?:부서(?:명)?|소속)(?:은|는|:|：|=)?\s*([가-힣A-Za-z0-9_-]{2,24})/
  : /(?:담당자(?:명)?|작성자)(?:은|는|:|：|=)?\s*([가-힣A-Za-z]{2,20})/
 let m=regex.exec(prompt)
 if(!m&&kind==='department')m=/([가-힣A-Za-z0-9_-]{2,24}(?:팀|부|실|센터))\s*(?:의\s*)?업무\s*보고서/.exec(prompt)
 if(!m)return ''
 let value=m[1].replace(/(?:이고|이며|이고요|입니다|이에요|예요|이야|야)$/,'')
 return bad.test(value)?'':value
}
function normalizeClause(raw){
 let value=sentence(raw)
 value=value.replace(/(?:하고 있으며|하고 있으며요|하고 있고|수정하고 있으며)$/,'수정 중')
 value=value.replace(/(?:할\s*계획이야|할\s*계획입니다|할\s*예정이야|할\s*예정입니다)$/,'할 계획')
 value=value.replace(/(?:이야|이에요|입니다|예요|입니다만|이에요)$/,'')
 return sentence(value).slice(0,850)
}
export function parseBusinessReportPrompt(prompt,{today}={}){
 const p=String(prompt||'')
 const result={}
 // Date comes from the explicit report date or "today", not the server's guessed locale.
 const explicit=/(\d{4})\s*(?:년|[-/.])\s*(\d{1,2})\s*(?:월|[-/.])\s*(\d{1,2})\s*일?/.exec(p)
 if(explicit){
   const y=Number(explicit[1]),m=Number(explicit[2]),d=Number(explicit[3])
   const date=new Date(Date.UTC(y,m-1,d))
   if(date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d)
     result.date=y+'년 '+m+'월 '+d+'일'
 }
 if(!result.date&&/오늘|금일|당일|현재\s*날짜/.test(p)&&today)result.date=today
 result.department=nameOf(p,'department')
 result.assignee=nameOf(p,'assignee')
 result.work=normalizeClause(segmentAfter(p,/(?:오늘(?:의)?\s*(?:진행한\s*)?업무|업무\s*내용|수행\s*업무)(?:은|는|:|：|=)\s*/))
 result.progress=normalizeClause(segmentAfter(p,/(?:진행\s*현황|진행\s*상황)(?:은|는|:|：|=)\s*|현재\s+(?=\S)/))
 result.plan=normalizeClause(segmentAfter(p,/(?:향후\s*계획|추후\s*계획)(?:은|는|:|：|=)\s*|앞으로\s+(?=\S)/))
 // Long narrative paragraphs should be proposed by AI, not coerced into metadata.
 for(const key of Object.keys(result)){
   if(!result[key]||bad.test(result[key]))delete result[key]
 }
 return result
}
export function proposeBusinessReport(snapshot,prompt,{today}={}){
 if(!snapshot?.recognized)return []
 const values=parseBusinessReportPrompt(prompt,{today})
 return snapshot.targets.filter(t=>values[t.fieldKey]).map(t=>({
   cellId:t.cellId,value:values[t.fieldKey],source:'사용자 업무보고 정보'
 }))
}
export function reportMissingFields(snapshot,proposals){
 const set=new Set(proposals.map(p=>p.cellId))
 return (snapshot?.targets||[]).filter(t=>!set.has(t.cellId)).map(t=>t.label)
}
