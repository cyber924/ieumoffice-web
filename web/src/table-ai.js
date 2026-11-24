// MiloSoft table AI: stable cell identifiers and approval before applying changes.
const read = node => String(node?.innerText ?? node?.textContent ?? '').replace(/\u00a0/g,' ').trim()
const clean = value => String(value ?? '').trim()
const normalized = value => clean(value).replace(/[\s:：*]+/g,'').toLowerCase()
const HEADERS=new Set(['항목','내용','구분','비고','번호','성명','이름','순번','내역','금액'])
const isHeader = value => HEADERS.has(normalized(value))
export function captureTableTargets(root, preferredCell=null){
  const targets=[],elements=new Map()
  const tables=Array.from(root.querySelectorAll('table')).slice(0,20)
  tables.forEach((table,tableIndex)=>{
    const rows=Array.from(table.rows).slice(0,70)
    rows.forEach((row,rowIndex)=>{
      const cells=Array.from(row.cells).slice(0,15)
      const first=read(cells[0])
      const headerRow=cells.every(c=>c.tagName.toUpperCase()==='TH') ||
        (rowIndex===0 && cells.length>1 && (isHeader(first)||cells.some(c=>isHeader(read(c)))))
      if(headerRow)return
      const labeled=cells.length>=2&&first.length>0&&!isHeader(first)
      cells.forEach((cell,columnIndex)=>{
        const selected=preferredCell===cell
        const editable=selected||(labeled?columnIndex>0:rowIndex>0&&columnIndex>0)
        if(!editable)return
        const cellId='t'+tableIndex+'r'+rowIndex+'c'+columnIndex
        const colHeader=read(rows[0]?.cells?.[columnIndex])
        const label=labeled?first+(columnIndex>1?' / '+(colHeader&&!isHeader(colHeader)?colHeader:(columnIndex+1)+'열'):''):
          '표 '+(tableIndex+1)+' / '+(rowIndex+1)+'행 '+(columnIndex+1)+'열'
        const target={cellId,label,current:read(cell).slice(0,1000),table:tableIndex+1,row:rowIndex+1,column:columnIndex+1,editable:true}
        targets.push(target);elements.set(cellId,cell)
      })
    })
  })
  return {targets:targets.slice(0,100),elements}
}
export function validateTableEdits(snapshot,proposals,{overwrite=false}={}){
  if(!snapshot||!Array.isArray(proposals))return []
  const allowed=new Map(snapshot.targets.map(t=>[t.cellId,t]))
  const seen=new Set(),valid=[]
  for(const proposed of proposals.slice(0,100)){
    const id=clean(proposed?.cellId)
    const target=allowed.get(id),element=snapshot.elements.get(id)
    const value=typeof proposed?.value==='string'?proposed.value.trim():''
    if(!target||!element?.isConnected||seen.has(id)||!value||value.length>1000)continue
    if(read(element)!==target.current)continue
    if(target.current&&!overwrite)continue
    if(value===target.current)continue
    seen.add(id)
    valid.push({cellId:id,label:target.label,before:target.current,value,element,source:proposed.source||'AI 제안'})
  }
  return valid
}
function fieldFromPrompt(prompt,label){
  const escaped=label.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')
  const pat=new RegExp('(?:^|[,，;\\n\\s])'+escaped+'(?:은|는|을|를|에)?\\s*(?:[:：=]|(?:으로|라고))?\\s*[\\\"“]?([^,，;\\n\\\"”]+?)(?=\\s*(?:[,，;\\n]|(?:작성자|작성일|날짜|제목|성명|담당자)(?:은|는|:|：)|$))','i')
  const match=clean(prompt).match(pat)
  return match?.[1]?.trim().replace(/[.。]+$/,'')||''
}
export function inferTableValues(snapshot,prompt,{today=''}={}){
  const proposals=[]
  const fillAll=/표|셀|양식|빈칸|채워|작성|입력|기입/.test(prompt)
  for(const t of snapshot?.targets||[]){
    if(t.current)continue
    const label=normalized(t.label)
    let value=''
    const terms=label.includes('작성자')||label.includes('담당자')?['작성자','담당자']:
      label.includes('작성일')||label.includes('날짜')||label.includes('일자')?['작성일','날짜','일자']:
      label.includes('제목')?['제목']:
      label.includes('성명')?['성명','이름']:[]
    for(const term of terms){value=fieldFromPrompt(prompt,term);if(value)break}
    const dateField=terms.some(x=>['작성일','날짜','일자'].includes(x))
    if(dateField&&(/오늘/.test(value)||!value&&fillAll&&today))value=today
    if(!value||value.length>1000)continue
    proposals.push({cellId:t.cellId,value,source:dateField&&value===today?'오늘 날짜 제안':'요청 내용'})
  }
  return proposals
}
export function applyTableEdits(edits){
  let applied=0
  for(const edit of edits){
    if(!edit.element?.isConnected||read(edit.element)!==edit.before)continue
    edit.element.textContent=edit.value
    applied++
  }
  return applied
}
export function matchingFormFields(root){
  const snapshot=captureTableTargets(root)
  return {snapshot,fields:snapshot.targets.filter(t=>!t.current)}
}
