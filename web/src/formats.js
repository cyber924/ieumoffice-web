import JSZip from 'jszip'

const enc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const direct = (n, local) => Array.from(n?.children || []).filter(x => x.localName === local)
const descendants = (n, local) => Array.from(n?.getElementsByTagName('*') || []).filter(x => x.localName === local)
const first = (n, local) => descendants(n,local)[0] || null
const textOf = (n) => descendants(n,'t').map(x=>x.textContent||'').join('')
const xmlRead = (text) => {
  const d = new DOMParser().parseFromString(text,'application/xml')
  if (d.querySelector('parsererror')) throw new Error('문서 내부 XML을 읽을 수 없습니다.')
  return d
}
const extension = (name) => (name.split('.').pop() || '').toLowerCase()
const MAX_FILE = 15 * 1024 * 1024
const MAX_XML = 30 * 1024 * 1024

function setText(node, value, isHwp) {
  const text = String(value ?? '')
  const ts = descendants(node,'t')
  if (ts.length) {
    ts[0].textContent=text
    if (!isHwp) ts[0].setAttribute('xml:space','preserve')
    for(let i=1;i<ts.length;i++)ts[i].textContent=''
    return
  }
  const doc=node.ownerDocument
  const prefix=isHwp?'hp':'w'
  const ns=isHwp?(node.namespaceURI||'http://www.hancom.co.kr/hwpml/2011/paragraph'):'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const para=node.localName==='p'?node:first(node,'p')
  if(!para) throw new Error('텍스트를 추가할 문단을 찾을 수 없습니다.')
  const run=doc.createElementNS(ns,prefix+':run')
  const t=doc.createElementNS(ns,prefix+':t')
  t.textContent=text
  if(!isHwp)t.setAttribute('xml:space','preserve')
  run.appendChild(t)
  para.appendChild(run)
}
function sizeGuard(bytes,zip) {
  if(bytes.byteLength>MAX_FILE)throw new Error('15MB 이하의 문서만 지원합니다.')
  if(Object.keys(zip.files).length>3500)throw new Error('압축 항목이 너무 많습니다.')
}
function makeBinding(state,node) {
  const id='n'+(++state.seq)
  state.bindings.set(id,{node,text:textOf(node)})
  return id
}
function htmlPara(state,node) {
  const id=makeBinding(state,node)
  const t=textOf(node)
  return '<p class="doc-paragraph" data-bind="'+id+'">'+(t?enc(t):'<br>')+'</p>'
}

function attrOf(n,key,defaultValue='') {
  if(!n)return defaultValue
  return n.getAttribute(key) ?? n.getAttribute('w:'+key) ?? n.getAttribute('hp:'+key) ?? defaultValue
}
const localLower=n=>String(n?.localName||'').toLowerCase()
function hwpUnitToPx(x) {
  const v=Number(x)
  return Number.isFinite(v)&&v>0?Math.max(14,Math.min(1200,Math.round(v/75))):null
}
function tableText(node){
  return descendants(node,'t').filter(t=>{
    let parent=t.parentElement
    while(parent&&parent!==node) {
      if(parent.localName==='tbl')return false
      parent=parent.parentElement
    }
    return true
  }).map(t=>t.textContent||'').join('')
}
function tableCellLayout(cell,type) {
  if(type==='hwpx') {
    const span=first(cell,'cellSpan')||first(cell,'tcPr')||cell
    const addr=first(cell,'cellAddr')||first(cell,'tcPr')||cell
    const size=first(cell,'cellSz')||first(cell,'tcPr')
    return {
      colSpan:Math.max(1,Math.min(30,Number(attrOf(span,'colSpan','1'))||1)),
      rowSpan:Math.max(1,Math.min(60,Number(attrOf(span,'rowSpan','1'))||1)),
      colAddr:Math.max(0,Number(attrOf(addr,'colAddr','-1'))),
      width:hwpUnitToPx(attrOf(size,'width'))
    }
  }
  const grid=first(cell,'gridSpan')
  return {colSpan:Math.max(1,Math.min(30,Number(attrOf(grid,'val','1'))||1)),rowSpan:1,colAddr:-1,width:null}
}
function htmlTable(state,node,type,depth=0) {
  if(depth>3)return '<p class="import-warning">중첩 표 미리보기 제한 · 원본 파일에는 유지됩니다.</p>'
  const rows=direct(node,'tr')
  const tableWidth=type==='hwpx'?hwpUnitToPx(attrOf(first(node,'sz'),'width')):null
  const attributes=' data-kind="'+type+'"'+(tableWidth?' style="width:min(100%,'+tableWidth+'px);table-layout:fixed"':'')
  let html='<table'+attributes+'><tbody>'
  for(const row of rows) {
    const rowId=makeBinding(state,row)
    html+='<tr data-row-bind="'+rowId+'">'
    let cells=direct(row,'tc')
    if(type==='hwpx')cells=cells.slice().sort((a,b)=>{
      const x=tableCellLayout(a,type).colAddr,y=tableCellLayout(b,type).colAddr
      return (Number.isFinite(x)?x:9999)-(Number.isFinite(y)?y:9999)
    })
    for(const cell of cells){
      const id=makeBinding(state,cell)
      const dims=tableCellLayout(cell,type)
      let attrs=' data-bind="'+id+'"'
      if(dims.colSpan>1)attrs+=' colspan="'+dims.colSpan+'"'
      if(dims.rowSpan>1)attrs+=' rowspan="'+dims.rowSpan+'"'
      if(dims.width)attrs+=' style="width:'+dims.width+'px"'
      const value=tableText(cell)
      const nested=direct(first(cell,'subList')||cell,'tbl')
      const nestedHtml=nested.length?nested.map(n=>htmlTable(state,n,type,depth+1)).join(''):''
      html+='<td'+attrs+'>'+(value?enc(value):'<br>')+nestedHtml+'</td>'
    }
    html+='</tr>'
  }
  return html+'</tbody></table>'
}
function buildDocxHtml(state,doc){
  const body=first(doc,'body')
  if(!body)throw new Error('DOCX 본문을 찾을 수 없습니다.')
  return Array.from(body.children).map(node=>{
    if(node.localName==='p')return htmlPara(state,node)
    if(node.localName==='tbl')return htmlTable(state,node,'docx')
    return ''
  }).join('')||'<p><br></p>'
}
function buildHwpxParagraph(state,node) {
  // HWPX tables are normally nested in hp:p/hp:run, unlike DOCX tables.
  // Rendering a p's full text AND its table duplicates cell contents.
  const runs=direct(node,'run')
  if(!runs.length)return htmlPara(state,node)
  let result='',buffer='',hasObjects=false
  const flush=()=>{
    if(!buffer)return
    // Only bind a plain paragraph; a mixed paragraph must not overwrite tables.
    const bind=hasObjects?' contenteditable="false" data-mixed="true"':' data-bind="'+makeBinding(state,node)+'"'
    result+='<p class="doc-paragraph"'+bind+'>'+enc(buffer)+'</p>'
    buffer=''
  }
  for(const run of runs){
    for(const part of Array.from(run.children)){
      if(part.localName==='t'){buffer+=part.textContent||'';continue}
      if(part.localName==='tab'){buffer+='\t';continue}
      if(part.localName==='lineBreak'){buffer+='\n';continue}
      if(part.localName==='tbl'){
        hasObjects=true
        flush()
        result+=htmlTable(state,part,'hwpx')
        continue
      }
      if(['pic','rect','ellipse','polygon','shape','line'].includes(part.localName)){
        hasObjects=true
        flush()
        result+='<p class="import-warning" contenteditable="false">['+part.localName+' · 원본 개체는 파일에 보존됩니다]</p>'
      }
    }
  }
  if(!hasObjects && !result)return htmlPara(state,node)
  flush()
  return result
}
function buildHwpxHtml(state,doc){
  const section=first(doc,'sec')||doc.documentElement
  const blocks=Array.from(section.children).filter(x=>['p','tbl'].includes(x.localName))
  return blocks.map(node=>node.localName==='tbl'?htmlTable(state,node,'hwpx'):buildHwpxParagraph(state,node)).join('')||'<p><br></p>'
}
export async function openPackage(file) {
  const ext=extension(file.name)
  if(ext==='hwp')throw new Error('구형 HWP 바이너리 파일은 아직 편집할 수 없습니다. 한컴오피스에서 HWPX로 저장한 후 열어주세요.')
  if(!['docx','hwpx'].includes(ext))throw new Error('DOCX 또는 HWPX 파일을 선택해 주세요.')
  const bytes=await file.arrayBuffer()
  if(bytes.byteLength>MAX_FILE)throw new Error('15MB 이하의 문서만 지원합니다.')
  const zip=await JSZip.loadAsync(bytes)
  sizeGuard(bytes,zip)
  const state={type:ext,filename:file.name,zip,documents:[],bindings:new Map(),seq:0,originalBytes:bytes}
  if(ext==='docx'){
    const entry=zip.file('word/document.xml')
    if(!entry)throw new Error('DOCX 문서 본문이 없습니다.')
    const xml=await entry.async('string')
    if(xml.length>MAX_XML)throw new Error('문서 내용이 너무 큽니다.')
    const doc=xmlRead(xml)
    state.documents.push({path:'word/document.xml',doc})
    state.html=buildDocxHtml(state,doc)
  }else{
    const matches=Object.keys(zip.files).filter(n=>/(^|\/)section[0-9]+\.xml$/i.test(n)).sort()
    if(!matches.length)throw new Error('HWPX 섹션 XML을 찾지 못했습니다.')
    let all=''
    for(const path of matches){
      const xml=await zip.file(path).async('string')
      if(xml.length>MAX_XML)throw new Error('한글 문서 섹션이 너무 큽니다.')
      const doc=xmlRead(xml)
      state.documents.push({path,doc})
      all+=buildHwpxHtml(state,doc)
    }
    state.html=all
  }
  return state
}
function bindNewRows(state,paper){
  const sourceRows=Array.from(paper.querySelectorAll('tr[data-copy-row]'))
  for(const el of sourceRows){
    const ref=state.bindings.get(el.dataset.copyRow)
    if(!ref)throw new Error('표 행 원본을 찾지 못했습니다.')
    const original=ref.node
    const copy=original.cloneNode(true)
    original.parentNode.insertBefore(copy,original.nextSibling)
    if(state.type==='hwpx'){
      const table=copy.parentNode
      const oldCount=Number(table.getAttribute('rowCnt')||0)
      if(oldCount)table.setAttribute('rowCnt',String(oldCount+1))
      for(const c of descendants(copy,'cellAddr')){
        const old=Number(c.getAttribute('rowAddr')||0)
        c.setAttribute('rowAddr',String(old+1))
      }
    }
    const rid=makeBinding(state,copy)
    el.dataset.rowBind=rid
    delete el.dataset.copyRow
    const oldCells=direct(copy,'tc')
    Array.from(el.cells).forEach((cell,index)=>{
      if(!oldCells[index])return
      const id=makeBinding(state,oldCells[index])
      cell.dataset.bind=id
      setText(oldCells[index],cell.innerText,state.type==='hwpx')
      state.bindings.get(id).text=cell.innerText
    })
  }
}
export async function savePackage(state,paper) {
  if(!state)return createDocx(paper)
  bindNewRows(state,paper)
  for(const el of paper.querySelectorAll('[data-bind]')){
    const item=state.bindings.get(el.dataset.bind)
    if(!item || el.tagName==='TR' || el.dataset.mixed==='true')continue
    const text=el.innerText.replace(/\n$/,'')
    if(text!==item.text){
      setText(item.node,text,state.type==='hwpx')
      item.text=text
    }
  }
  const serializer=new XMLSerializer()
  for(const entry of state.documents)state.zip.file(entry.path,serializer.serializeToString(entry.doc))
  return new Blob([await state.zip.generateAsync({type:'uint8array',compression:'DEFLATE'})],{type:state.type==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/zip'})
}
export function importedModeLimitations(state) {
  return state?.type==='hwpx'?'HWPX 제한 편집: 병합 셀·문단 순서 미리보기 개선. 표 셀 텍스트만 수정 가능하며 기존 표 구조는 보호합니다. 누름틀·그림·배치는 원본 파일로 재확인하세요.':'DOCX 제한 편집: 기존 단락과 표 셀의 텍스트를 수정할 수 있습니다. 글꼴·주석·각주·복잡한 서식은 원본에서 확인하세요.'
}
export function insertTableMarkup(rows=3,cols=3){
  let s='<table><tbody>'
  for(let i=0;i<rows;i++){s+='<tr>';for(let j=0;j<cols;j++)s+=(i===0?'<th>':'<td>')+'<br>'+(i===0?'</th>':'</td>');s+='</tr>'}
  return s+'</tbody></table><p><br></p>'
}
export function addTableRow(state,element){
  if(state)return false // Imported HWPX requires cellAddr/rowAddr regeneration; preserve the original structure.
  const row=element.closest('tr')
  if(!row)return false
  const clone=row.cloneNode(true)
  clone.querySelectorAll('td,th').forEach(cell=>{cell.innerHTML='<br>';delete cell.dataset.bind})
  delete clone.dataset.rowBind
  if(state && row.dataset.rowBind)clone.dataset.copyRow=row.dataset.rowBind
  row.after(clone)
  return true
}
export function addTableColumn(state,element){
  const tr=element.closest('tr')
  if(!tr)return false
  if(state)return false
  for(const row of tr.closest('table').rows){
    const cell=row.insertCell(-1)
    cell.innerHTML='<br>'
  }
  return true
}
const twips=n=>Math.round(n*20)
const fromColor=(x,fallback='000000')=>/^#[0-9a-fA-F]{6}$/.test(x||'')?x.slice(1).toUpperCase():fallback
function runXml(node,style={}){
  if(node.nodeType===3)return node.nodeValue?'<w:r>'+runPr(style)+'<w:t xml:space="preserve">'+enc(node.nodeValue)+'</w:t></w:r>':''
  if(node.nodeType!==1)return ''
  if(node.tagName==='BR')return '<w:r><w:br/></w:r>'
  if(node.tagName==='HR')return ''
  const next={...style}
  if(node.matches('b,strong'))next.bold=true
  if(node.matches('i,em'))next.italic=true
  if(node.matches('u'))next.underline=true
  if(node.style.fontWeight==='bold'||Number(node.style.fontWeight)>=600)next.bold=true
  if(node.style.fontStyle==='italic')next.italic=true
  if(node.style.textDecoration.includes('underline'))next.underline=true
  if(node.style.fontFamily)next.font=node.style.fontFamily.replace(/['"]/g,'').split(',')[0].trim()
  if(node.style.fontSize){const size=parseFloat(node.style.fontSize);if(Number.isFinite(size)&&size>=7&&size<=72)next.size=node.style.fontSize.endsWith('px')?size*.75:size}
  if(node.style.color)next.color=node.style.color
  if(node.style.backgroundColor)next.highlight=node.style.backgroundColor
  let value=''
  for(const child of node.childNodes)value+=runXml(child,next)
  return value
}
function runPr(s){
  let xml=''
  if(s.bold)xml+='<w:b/>'
  if(s.italic)xml+='<w:i/>'
  if(s.underline)xml+='<w:u w:val="single"/>'
  if(s.size)xml+='<w:sz w:val="'+Math.round(s.size*2)+'"/>'
  if(s.font)xml+='<w:rFonts w:ascii="'+enc(s.font)+'" w:hAnsi="'+enc(s.font)+'" w:eastAsia="'+enc(s.font)+'"/>'
  if(s.color){const hex=fromColor(s.color);if(hex!=='000000'||s.color==='#000000')xml+='<w:color w:val="'+hex+'"/>'}
  if(s.highlight)xml+='<w:shd w:fill="'+fromColor(s.highlight,'FFFF00')+'"/>'
  return xml?'<w:rPr>'+xml+'</w:rPr>':''
}
function wParagraph(el, options={}){
  const align=el?.style?.textAlign||(options.heading?'center':'left')
  const a={left:'left',right:'right',center:'center',justify:'both',start:'left',end:'right'}
  let pr='<w:pPr><w:jc w:val="'+(a[align]||'left')+'"/>'
  if(options.heading)pr+='<w:spacing w:after="260"/><w:keepNext/>'
  if(el?.style?.lineHeight){const v=parseFloat(el.style.lineHeight);if(Number.isFinite(v)&&v>=1&&v<=3)pr+='<w:spacing w:line="'+Math.round(v*240)+'" w:lineRule="auto"/>'}
  pr+='</w:pPr>'
  const style=options.heading?{bold:true,size:options.heading===1?18:15}:{}
  let runs=''
  if(el?.childNodes)for(const child of el.childNodes)runs+=runXml(child,style)
  if(!runs)runs='<w:r><w:t xml:space="preserve">'+enc(el?.innerText||'')+'</w:t></w:r>'
  return '<w:p>'+pr+runs+'</w:p>'
}
function wTable(el){
  const rows=Array.from(el.rows)
  const count=Math.max(1,...rows.map(row=>Array.from(row.cells).reduce((a,c)=>a+Math.max(1,c.colSpan),0)))
  let xml='<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>'
  for(const edge of ['top','left','bottom','right','insideH','insideV'])xml+='<w:'+edge+' w:val="single" w:sz="6"/>'
  xml+='</w:tblBorders></w:tblPr><w:tblGrid>'
  for(let i=0;i<count;i++)xml+='<w:gridCol w:w="'+Math.floor(9000/count)+'"/>'
  xml+='</w:tblGrid>'
  for(const row of rows){
    xml+='<w:tr>'
    for(const cell of row.cells){
      const colspan=Math.max(1,cell.colSpan)
      xml+='<w:tc><w:tcPr><w:tcW w:w="'+Math.floor(9000*colspan/count)+'" w:type="dxa"/>'
      if(colspan>1)xml+='<w:gridSpan w:val="'+colspan+'"/>'
      if(cell.rowSpan>1)xml+='<w:vMerge w:val="restart"/>'
      const bg=cell.style.backgroundColor
      if(bg&&/^#[0-9a-fA-F]{6}$/.test(bg))xml+='<w:shd w:fill="'+fromColor(bg)+'"/>'
      xml+='</w:tcPr>'+wParagraph(cell)+'</w:tc>'
    }
    xml+='</w:tr>'
  }
  return xml+'</w:tbl>'
}
function convertNode(el){
  if(el.tagName==='TABLE')return wTable(el)
  if(el.tagName==='HR')return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6"/></w:pBdr></w:pPr></w:p>'
  if(el.tagName==='UL'||el.tagName==='OL'){
    return Array.from(el.children).map((li,i)=>wParagraph(li)).join('')
  }
  return wParagraph(el,{heading:el.tagName==='H1'?1:el.tagName==='H2'?2:0})
}
export async function createDocx(paper) {
  let body=''
  for(const el of paper.children)body+=convertNode(el)
  if(!body)body=wParagraph(null)
  const landscape=paper.dataset.orientation==='landscape'
  const narrow=paper.dataset.margin==='narrow'
  const page=landscape?{w:16838,h:11906}:{w:11906,h:16838}
  const margin=narrow?720:1440
  const sect='<w:sectPr><w:pgSz w:w="'+page.w+'" w:h="'+page.h+'"'+(landscape?' w:orient="landscape"':'')+'/>'+
    '<w:pgMar w:top="'+margin+'" w:right="'+margin+'" w:bottom="'+margin+'" w:left="'+margin+'"/></w:sectPr>'
  const word='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+sect+'</w:body></w:document>'
  const zip=new JSZip()
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml',word)
  return new Blob([await zip.generateAsync({type:'uint8array',compression:'DEFLATE'})],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})
}
export function safeFilename(name,ext){
  const stem=String(name||'마일로소프트_문서').replace(/\.(docx|hwpx|hwp|txt)$/i,'').replace(/[\/\\:*?"<>|]/g,'_').slice(0,100)
  return (stem||'문서')+'.'+ext
}
