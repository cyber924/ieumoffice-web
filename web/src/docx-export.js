import JSZip from 'jszip'

// The document producer keeps every editor table as a real OOXML w:tbl block.
// It also traverses pasted container elements, which the previous flat export missed.
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
let imageContext=[]
const xmlEscape = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
const text = node => String(node?.innerText ?? node?.textContent ?? '')
const local = node => (node?.localName || '').replace(/^.*:/,'').toLowerCase()
const children = n => Array.from(n?.childNodes || [])
const elements = n => children(n).filter(x => x.nodeType === 1)
const clamp = (n,a,b) => Math.max(a,Math.min(b,n))
const validHex = x => /^#[0-9a-f]{6}$/i.test(x || '')
function hex(value, fallback='000000'){
 if(validHex(value))return value.slice(1).toUpperCase()
 const rgb=String(value||'').match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
 if(rgb)return rgb.slice(1,4).map(x=>clamp(Number(x),0,255).toString(16).padStart(2,'0')).join('').toUpperCase()
 return fallback
}
function rPr(style){
 let r=''
 if(style.bold)r+='<w:b/>'
 if(style.italic)r+='<w:i/>'
 if(style.underline)r+='<w:u w:val="single"/>'
 if(style.strike)r+='<w:strike/>'
 if(style.font)r+='<w:rFonts w:ascii="'+xmlEscape(style.font)+'" w:hAnsi="'+xmlEscape(style.font)+'" w:eastAsia="'+xmlEscape(style.font)+'"/>'
 if(style.size)r+='<w:sz w:val="'+clamp(Math.round(style.size*2),12,144)+'"/>'
 if(style.color)r+='<w:color w:val="'+hex(style.color)+'"/>'
 if(style.highlight)r+='<w:shd w:val="clear" w:fill="'+hex(style.highlight,'FFFF00')+'"/>'
 return r?'<w:rPr>'+r+'</w:rPr>':''
}
function parseStyle(node,prior){
 const s={...prior}
 const tag=local(node)
 if(tag==='b'||tag==='strong')s.bold=true
 if(tag==='i'||tag==='em')s.italic=true
 if(tag==='u')s.underline=true
 if(tag==='s'||tag==='strike'||tag==='del')s.strike=true
 const css=node?.style
 if(css?.fontWeight==='bold'||Number(css?.fontWeight)>=600)s.bold=true
 if(css?.fontStyle==='italic')s.italic=true
 if(css?.textDecoration?.includes('underline'))s.underline=true
 if(css?.color)s.color=css.color
 if(css?.backgroundColor)s.highlight=css.backgroundColor
 if(css?.fontFamily)s.font=css.fontFamily.replace(/["']/g,'').split(',')[0].trim()
 if(css?.fontSize){
  let n=parseFloat(css.fontSize)
  if(css.fontSize.endsWith('px'))n*=.75
  if(Number.isFinite(n)&&n>=6&&n<=72)s.size=n
 }
 return s
}
function drawingXml(src,width=420,height=220){
 if(!/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(src||''))return ''
 if(imageContext.length>=25)return ''
 const id=imageContext.length+1
 const mime=src.match(/^data:image\/(png|jpeg)/)[1]
 const ext=mime==='jpeg'?'jpg':'png'
 const filename='image'+id+'.'+ext
 const relationship='rIdImage'+id
 const w=clamp(Number(width)||420,20,650)*9525
 const h=clamp(Number(height)||220,20,850)*9525
 imageContext.push({src,filename,relationship,ext,id})
 return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'+
 '<wp:extent cx="'+w+'" cy="'+h+'"/><wp:docPr id="'+id+'" name="MiloSoft Image '+id+'"/>'+
 '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'+
 '<pic:pic><pic:nvPicPr><pic:cNvPr id="'+id+'" name="'+filename+'"/><pic:cNvPicPr/></pic:nvPicPr>'+
 '<pic:blipFill><a:blip r:embed="'+relationship+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'+
 '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+w+'" cy="'+h+'"/></a:xfrm>'+
 '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'+
 '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
}
function inline(node,style={}){
 if(node.nodeType===3){
  const value=node.nodeValue||''
  return value?'<w:r>'+rPr(style)+'<w:t xml:space="preserve">'+xmlEscape(value)+'</w:t></w:r>':''
 }
 if(node.nodeType!==1)return ''
 const tag=local(node)
 if(tag==='br')return '<w:r><w:br/></w:r>'
 if(tag==='img')return drawingXml(node.getAttribute('src'),node.getAttribute('width')||node.naturalWidth,node.getAttribute('height')||node.naturalHeight)
 if(tag==='table')return ''
 let result=''
 const next=parseStyle(node,style)
 for(const c of children(node))result+=inline(c,next)
 return result
}
function paragraph(node,{heading=0}={}){
 const styles=heading?{bold:true,size:heading===1?18:15}:{}
 const alignment=node?.style?.textAlign||(heading?'center':'left')
 const align=({center:'center',right:'right',justify:'both',start:'left',end:'right'})[alignment]||'left'
 let pr='<w:pPr><w:jc w:val="'+align+'"/>'
 const lh=parseFloat(node?.style?.lineHeight||'')
 if(Number.isFinite(lh)&&lh>=1&&lh<=3)pr+='<w:spacing w:line="'+Math.round(lh*240)+'" w:lineRule="auto"/>'
 if(heading)pr+='<w:keepNext/><w:spacing w:after="240"/>'
 pr+='</w:pPr>'
 let runs=''
 if(node?.nodeType===3)runs=inline(node,styles)
 else if(node)for(const c of children(node))runs+=inline(c,styles)
 if(!runs)runs='<w:r><w:t xml:space="preserve">'+xmlEscape(text(node))+'</w:t></w:r>'
 return '<w:p>'+pr+runs+'</w:p>'
}
function tableLayout(table){
 const rows=Array.from(table.rows||[])
 const reservations=[]
 const out=[]
 let max=0
 for(let r=0;r<rows.length;r++){
  const occupied=reservations[r]||new Map()
  const placements=[]
  for(const [col,item] of occupied){
   if(item.start===col)placements.push({col,span:item.span,vertical:'continue'})
  }
  let next=0
  for(const cell of Array.from(rows[r].cells||[])){
   while(occupied.has(next))next++
   const span=clamp(Number(cell.colSpan)||1,1,40)
   const rowSpan=clamp(Number(cell.rowSpan)||1,1,100)
   const start=next
   placements.push({col:start,span,vertical:rowSpan>1?'restart':null,cell})
   for(let dr=1;dr<rowSpan&&r+dr<rows.length;dr++){
    if(!reservations[r+dr])reservations[r+dr]=new Map()
    for(let k=0;k<span;k++)reservations[r+dr].set(start+k,{start,span})
   }
   next+=span
  }
  placements.sort((a,b)=>a.col-b.col)
  max=Math.max(max, ...placements.map(p=>p.col+p.span),1)
  out.push(placements)
 }
 return {rows:out,cols:Math.max(1,max)}
}
function cellXml(item,colCount){
 const cell=item.cell
 const span=item.span
 const width=Math.floor(9000*span/colCount)
 let pr='<w:tcPr><w:tcW w:w="'+width+'" w:type="dxa"/>'
 if(span>1)pr+='<w:gridSpan w:val="'+span+'"/>'
 if(item.vertical)pr+='<w:vMerge'+(item.vertical==='restart'?' w:val="restart"':'')+'/>'
 const background=cell?.style?.backgroundColor
 if(background)pr+='<w:shd w:val="clear" w:fill="'+hex(background,'FFFFFF')+'"/>'
 pr+='</w:tcPr>'
 if(!cell)return '<w:tc>'+pr+'<w:p/></w:tc>'
 const blocks=blockChildren(cell)
 const center=cell.style?.textAlign==='center'
 const content=center?'<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'+
  '<w:r><w:t xml:space="preserve">'+xmlEscape(text(cell))+'</w:t></w:r></w:p>':(blocks||paragraph(cell))
 return '<w:tc>'+pr+content+'</w:tc>'
}
function tableXml(table){
 const {rows,cols}=tableLayout(table)
 let xml='<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>'+
  (table.dataset?.centerTable==='true'?'<w:jc w:val="center"/>':'')+
  '<w:tblLayout w:type="fixed"/><w:tblBorders>'
 for(const edge of ['top','left','bottom','right','insideH','insideV'])xml+='<w:'+edge+' w:val="single" w:sz="6" w:color="8B98A9"/>'
 xml+='</w:tblBorders></w:tblPr><w:tblGrid>'
 for(let i=0;i<cols;i++)xml+='<w:gridCol w:w="'+Math.floor(9000/cols)+'"/>'
 xml+='</w:tblGrid>'
 for(const placements of rows){
  xml+='<w:tr>'
  let col=0
  for(const item of placements){
   while(col<item.col){xml+=cellXml({span:1},cols);col++}
   xml+=cellXml(item,cols)
   col=item.col+item.span
  }
  while(col<cols){xml+=cellXml({span:1},cols);col++}
  xml+='</w:tr>'
 }
 return xml+'</w:tbl>'
}
// Normalizes pasted nested blocks, preserving tables before/after the text.
// Flattening an outer <div> using innerText was the cause of tables becoming plain text.
function blockChildren(parent){
 let out=''
 let inlineBuffer=[]
 const flush=()=>{
  if(!inlineBuffer.length)return
  const wrapper={nodeType:1,style:{},childNodes:inlineBuffer}
  out+=paragraph(wrapper)
  inlineBuffer=[]
 }
 for(const node of children(parent)){
  if(node.nodeType===3){if((node.nodeValue||'').trim())inlineBuffer.push(node);continue}
  if(node.nodeType!==1)continue
  const tag=local(node)
  if(tag==='table'){
   flush();out+=tableXml(node);continue
  }
  if(['p','h1','h2','h3','h4','h5','h6','li'].includes(tag)){
   flush();out+=paragraph(node,{heading:tag==='h1'?1:tag==='h2'?2:0});continue
  }
  if(tag==='hr'){
   flush();out+='<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6"/></w:pBdr></w:pPr></w:p>';continue
  }
  if(['ul','ol'].includes(tag)){
   flush()
   for(const li of elements(node)){if(local(li)==='li')out+=paragraph(li)}
   continue
  }
  // A wrapper may include the tables inserted by a rich-text paste operation.
  const containsBlock=typeof node.querySelector==='function'&&Boolean(node.querySelector('table,p,div,section,article,ul,ol,h1,h2,h3,hr'))
  if(containsBlock){flush();out+=blockChildren(node)}
  else {flush();out+=paragraph(node)}
 }
 flush()
 return out
}
function documentXml(paper){
 let body=blockChildren(paper)
 if(!body)body='<w:p/>'
 const landscape=paper.dataset?.orientation==='landscape'
 const narrow=paper.dataset?.margin==='narrow'
 const pg=landscape?{w:16838,h:11906}:{w:11906,h:16838}
 const mar=narrow?720:1440
 body+='<w:sectPr><w:pgSz w:w="'+pg.w+'" w:h="'+pg.h+'"'+(landscape?' w:orient="landscape"':'')+'/>'+
   '<w:pgMar w:top="'+mar+'" w:right="'+mar+'" w:bottom="'+mar+'" w:left="'+mar+'"/></w:sectPr>'
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<w:document xmlns:w="'+W+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'+
  ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'+
  ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'+
  ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>'+body+'</w:body></w:document>'
}
export async function exportNewDocx(paper){
 imageContext=[]
 const zip=new JSZip()
 zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?>'+
 '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
 '<Default Extension="xml" ContentType="application/xml"/>'+
 '<Default Extension="png" ContentType="image/png"/>'+
 '<Default Extension="jpg" ContentType="image/jpeg"/>'+
 '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
 '</Types>')
 zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?>'+
 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'+
 '</Relationships>')
 zip.file('word/document.xml',documentXml(paper))
 if(imageContext.length){
  const relations=['<?xml version="1.0" encoding="UTF-8"?>',
   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
  for(const img of imageContext){
   const encoded=img.src.split(',')[1]
   const decoded=atob(encoded)
   const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0))
   zip.file('word/media/'+img.filename,bytes)
   relations.push('<Relationship Id="'+img.relationship+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/'+img.filename+'"/>')
  }
  relations.push('</Relationships>')
  zip.file('word/_rels/document.xml.rels',relations.join(''))
 }
 return new Blob([await zip.generateAsync({type:'uint8array',compression:'DEFLATE'})],
  {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})
}
const descendants=(node,tag)=>Array.from(node?.getElementsByTagName('*')||[]).filter(x=>local(x)===tag)
export async function validateDocxTables(blob,paper){
 const expected=Array.from(paper.querySelectorAll('table'))
 if(!expected.length)return {tables:0,cells:0}
 const zip=await JSZip.loadAsync(await blob.arrayBuffer())
 const part=zip.file('word/document.xml')
 if(!part)throw new Error('DOCX에 문서 XML이 없어 다운로드를 중단했습니다.')
 const xml=await part.async('string')
 const parsed=new DOMParser().parseFromString(xml,'application/xml')
 if(descendants(parsed,'parsererror').length||local(parsed.documentElement)==='parsererror')throw new Error('DOCX 문서 XML 구조가 올바르지 않습니다.')
 const actual=descendants(parsed,'tbl')
 if(expected.length!==actual.length)throw new Error('표 저장 검증 실패: 화면 표 '+expected.length+'개, 파일 표 '+actual.length+'개. 파일 저장을 중단했습니다.')
 let cells=0
 for(let i=0;i<expected.length;i++){
  const wRows=descendants(actual[i],'tr')
  const dRows=Array.from(expected[i].rows||[])
  if(wRows.length!==dRows.length)throw new Error('표 '+(i+1)+'의 행이 보존되지 않아 저장을 중단했습니다.')
  const xmlContent=descendants(actual[i],'t').map(n=>n.textContent||'').join(' ')
  for(const row of dRows)for(const cell of Array.from(row.cells||[])){
   const value=text(cell).replace(/\s+/g,'').trim()
   // Word's <w:p> boundaries may split a paragraph into multiple text nodes.
   // Compare ordered non-whitespace characters so paragraph formatting does
   // not produce a false "missing cell" error after design normalization.
   if(value&&!xmlContent.replace(/\s+/g,'').includes(value)){
    throw new Error('표 '+(i+1)+'의 셀 내용이 DOCX에 누락되어 저장을 중단했습니다.')
   }
   cells++
  }
 }
 return {tables:expected.length,cells}
}
