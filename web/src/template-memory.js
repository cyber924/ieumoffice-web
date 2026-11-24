// Template memory stores geometry and field labels only, never filled content.
// Hash is always verified against the saved canonical structure on lookup.
const clean=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,80)
const labelCell=cell=>clean(cell?.innerText??cell?.textContent)
function grid(table){
 const taken=new Set(),out=[]
 for(const [r,row] of Array.from(table.rows).entries()){
  let c=0
  for(const cell of row.cells){
   while(taken.has(r+':'+c))c++
   const hint=cell.getAttribute('data-hwp-col')
   if(hint!==null&&Number.isInteger(+hint)&&+hint>=0&&+hint<=128)c=+hint
   const colspan=Math.max(1,Math.min(40,Number(cell.colSpan)||1))
   const rowspan=Math.max(1,Math.min(80,Number(cell.rowSpan)||1))
   const name=(c===0 || cell.tagName==='TH')?labelCell(cell):''
   out.push({r,c,w:colspan,h:rowspan,label:name})
   for(let y=r+1;y<r+rowspan;y++)for(let x=c;x<c+colspan;x++)taken.add(y+':'+x)
   c+=colspan
  }
 }
 return out
}
export function templateStructure(root){
 const tables=Array.from(root.querySelectorAll('table')).filter(t=>!t.parentElement?.closest('table')).slice(0,30)
 return tables.map(table=>grid(table))
}
export function templateFingerprint(structure){
 const canonical=JSON.stringify(structure)
 let hash=2166136261
 for(let i=0;i<canonical.length;i++){
  hash^=canonical.charCodeAt(i)
  hash=Math.imul(hash,16777619)>>>0
 }
 return 'tm_'+hash.toString(16).padStart(8,'0')+'_'+canonical.length
}
export function describeTemplate(root,{title='양식'}={}){
 const structure=templateStructure(root)
 if(!structure.length)throw new Error('표가 포함된 문서를 먼저 불러와 주세요.')
 const canonical=JSON.stringify(structure)
 if(canonical.length>12000)throw new Error('양식 구조가 너무 큽니다. 표를 나누어 저장해 주세요.')
 return {id:templateFingerprint(structure),title:clean(title)||'양식',
  structure,canonical,tableCount:structure.length,
  fieldCount:structure.reduce((sum,table)=>sum+table.filter(c=>c.label).length,0),version:1}
}
export function verifyTemplate(record,root){
 if(!record||typeof record.canonical!=='string')return false
 const current=templateStructure(root)
 return record.id===templateFingerprint(current) && record.canonical===JSON.stringify(current)
}
export function localTemplateKey(uid,id){return 'milosoft:templates:v1:'+String(uid||'guest')+':'+String(id||'')}
export function saveTemplateLocal(uid,record,storage){
 const target=storage||(typeof localStorage!=='undefined'?localStorage:null)
 if(!target)throw new Error('브라우저에 양식을 저장할 수 없습니다.')
 target.setItem(localTemplateKey(uid,record.id),JSON.stringify(record))
 return {record,location:'browser'}
}
export function loadTemplateLocal(uid,recordId,storage){
 const target=storage||(typeof localStorage!=='undefined'?localStorage:null)
 try{
  const item=JSON.parse(target?.getItem(localTemplateKey(uid,recordId))||'null')
  return item?.id===recordId&&item.version===1?item:null
 }catch{return null}
}
