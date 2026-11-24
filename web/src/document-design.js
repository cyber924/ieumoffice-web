// Non-destructive document layout planner. This does not rewrite document data,
// merge cells or alter imported OOXML/HWPX: imported documents must be copied to
// a new DOCX before applying browser-origin formatting.
export const DESIGN_PRESETS={
  modern:{label:'모던 비즈니스',font:'Noto Sans KR',accent:'#2E5DE6',ink:'#1D2B42',header:'#EAF0FC'},
  classic:{label:'공식 문서',font:'Batang',accent:'#334155',ink:'#202A36',header:'#EDF0F4'},
  compact:{label:'간결한 보고서',font:'Malgun Gothic',accent:'#147D77',ink:'#263448',header:'#E9F6F3'}
}
const norm=s=>String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim()
const plain=e=>norm(e?.innerText??e?.textContent)
function blocksOf(root){
 const out=[]
 for(const child of Array.from(root.children)){
  if(/^(H[1-6]|P|DIV)$/i.test(child.tagName) && !child.querySelector('table') && plain(child)){
   const index=out.length
   out.push({index,text:plain(child).slice(0,220),tag:child.tagName.toLowerCase(),el:child})
  }
 }
 return out
}
function classify(b,i){
 if(b.tag==='h1'||(i===0&&b.text.length<65))return 'title'
 if(/^([ⅠⅡⅢⅣⅤⅥ]|[IVX]+)\.\s+/.test(b.text)||/^\d{1,2}\.\s+[^\d]/.test(b.text)||/^제\d+장/.test(b.text))return 'section'
 if(/^[-•▪▶]\s+/.test(b.text))return 'list'
 return 'body'
}
export function analyzeDocumentDesign(root){
 const blocks=blocksOf(root)
 const roles=blocks.map((b,i)=>({index:b.index,role:classify(b,i),text:b.text}))
 const tables=Array.from(root.querySelectorAll('table')).filter(t=>!t.parentElement?.closest('table'))
 let runOn=0
 for(const cell of root.querySelectorAll('td,th')){
  if(cell.querySelector('p,div,ul,ol,table,img,svg'))continue
  const value=plain(cell)
  if(value.length>65 && /(?:^|\s)\d{1,2}[.)]\s+[^0-9]/.test(value))runOn++
 }
 return {roles,tables:tables.length,numberedCells:runOn,blocks:blocks.length}
}
const ALLOWED=new Set(['title','section','body','list'])
export function validateDesignPlan(root,plan){
 const blocks=blocksOf(root)
 const result=new Map(blocks.map((b,i)=>[b.index,classify(b,i)]))
 for(const item of Array.isArray(plan?.roles)?plan.roles:[]){
  const index=Number(item?.index)
  const role=item?.role
  if(!Number.isInteger(index)||!result.has(index)||!ALLOWED.has(role))continue
  // No AI-generated text is inserted into the document.
  result.set(index,role)
 }
 const preset=DESIGN_PRESETS[plan?.preset]?plan.preset:'modern'
 return {preset,roles:Array.from(result,([index,role])=>({index,role})),tables:root.querySelectorAll('table').length}
}
export function designPreview(root,plan){
 const check=validateDesignPlan(root,plan)
 const roles=check.roles.reduce((obj,r)=>(obj[r.role]=(obj[r.role]||0)+1,obj),{})
 return {preset:check.preset,roles,tableCount:check.tables,numberedCells:analyzeDocumentDesign(root).numberedCells}
}
function splitNumberedCell(cell){
 if(cell.querySelector('p,div,table,ul,ol,img,svg,br'))return 0
 // Split only plain, single-node text containing at least two numbered sections.
 if(cell.childNodes.length!==1 || cell.firstChild.nodeType!==3)return 0
 const original=cell.firstChild.nodeValue||''
 const positions=[...original.matchAll(/(?:^|\s)(\d{1,2})[.)]\s+(?=[가-힣A-Za-z])/g)]
 if(positions.length<2)return 0
 const parts=original.split(/(?=(?:^|\s)\d{1,2}[.)]\s+(?=[가-힣A-Za-z]))/g).map(s=>s.trim()).filter(Boolean)
 if(parts.length<2)return 0
 // Abort if the split would lose or duplicate any non-space character.
 if(norm(parts.join(' '))!==norm(original))return 0
 const nodes=parts.map(part=>{
  const p=cell.ownerDocument.createElement('p')
  p.textContent=part
  p.style.margin='0 0 8px'
  p.style.lineHeight='1.55'
  return p
 })
 cell.replaceChildren(...nodes)
 return nodes.length
}
export function applyDocumentDesign(root,plan){
 const {preset,roles}=validateDesignPlan(root,plan)
 const style=DESIGN_PRESETS[preset]
 const blocks=blocksOf(root)
 let styled=0,split=0
 const roleMap=new Map(roles.map(r=>[r.index,r.role]))
 root.dataset.documentDesign=preset
 for(const block of blocks){
  const role=roleMap.get(block.index)||'body'
  const el=block.el
  el.dataset.designRole=role
  el.style.fontFamily=style.font
  el.style.color=style.ink
  el.style.lineHeight=role==='body'?'1.65':'1.38'
  if(role==='title'){
   // Keep the content unchanged; original h1 remains a heading.
   el.style.fontSize=preset==='compact'?'18pt':'20pt'
   el.style.fontWeight='700';el.style.textAlign='center';el.style.marginBottom='25px'
  }else if(role==='section'){
   el.style.fontSize=preset==='compact'?'12pt':'13pt'
   el.style.fontWeight='700';el.style.color=style.accent;el.style.marginBottom='12px'
  }else{
   el.style.fontSize=preset==='compact'?'10pt':'10.5pt'
   el.style.marginBottom='12px'
  }
  styled++
 }
 for(const table of root.querySelectorAll('table')){
  table.dataset.centerTable='true'
  table.dataset.documentDesign=preset
  table.style.width='100%'
  table.style.borderCollapse='collapse'
  for(const row of table.rows){
   for(const cell of row.cells){
    cell.style.verticalAlign='middle';cell.style.lineHeight='1.55'
    cell.style.padding=preset==='compact'?'6px 8px':'9px 11px'
    cell.style.fontFamily=style.font;cell.style.fontSize=preset==='compact'?'10pt':'10.5pt'
    if(cell.tagName==='TH'){
     cell.style.backgroundColor=style.header
     cell.style.fontWeight='700';cell.style.color=style.ink
     cell.style.textAlign='center'
    }
    // Preserve any styled runs and object nodes inside the cell.
    split+=splitNumberedCell(cell)
   }
  }
 }
 return {preset,blocks:styled,tables:root.querySelectorAll('table').length,splitParagraphs:split}
}
