// MiloSoft 2026 document input tools: persistent caret, native glyph insertion,
// font selection and image/shape editing. Existing HWPX is converted to a new
// DOCX edit copy only with an explicit user confirmation.
export const DOCUMENT_FONTS=[
  {name:'맑은 고딕',css:'"Malgun Gothic",sans-serif'},
  {name:'바탕',css:'Batang,serif'},
  {name:'함초롬바탕',css:'"HCR Batang",Batang,serif'},
  {name:'Noto Sans KR',css:'"Noto Sans KR",sans-serif'},
  {name:'Noto Serif KR',css:'"Noto Serif KR",serif'},
  {name:'나눔고딕',css:'"Nanum Gothic",sans-serif'},
  {name:'나눔명조',css:'"Nanum Myeongjo",serif'}
]
export const CHARACTER_PALETTE={
  '기본 기호':'○ ● □ ■ △ ▲ ◇ ◆ ★ ☆ ✓ ✔ ☑ ※ ☎ → ← ↔ ↑ ↓ § ¶',
  '원문자':'① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ㉠ ㉡ ㉢ ㉣ ㈜',
  '수학':'± × ÷ ≤ ≥ ≠ ∞ ∑ ∴ ∫ √ π α β γ Δ Ω ∂ ∝',
  '단위':'℃ ℉ ㎜ ㎝ ㎞ ㎡ ㎥ ㎏ ㎎ ㎖ ㎛ ㎧ ₩ € £ ¥ $',
  '문장 부호':'· ― … ‘ ’ “ ” 「 」 『 』 〈 〉 《 》 〃',
  '화살표':'↗ ↘ ↙ ↖ ⇑ ⇓ ⇔ ⇒ ⇐ ➜ ➤ ➔'
}
const SHAPES=[
  ['rect','사각형'],['round','둥근 사각형'],['ellipse','타원'],
  ['triangle','삼각형'],['arrow','화살표'],['line','직선']
]
export function shapeSvg(kind,color='#e4ecff',w=420,h=180){
 const c=/^#[0-9a-f]{6}$/i.test(color)?color:'#e4ecff'
 const fill='fill="'+c+'" stroke="#263c5b" stroke-width="3"'
 const paths={
  rect:'<rect x="14" y="14" width="392" height="152" '+fill+'/>',
  round:'<rect x="14" y="14" width="392" height="152" rx="28" '+fill+'/>',
  ellipse:'<ellipse cx="210" cy="90" rx="194" ry="75" '+fill+'/>',
  triangle:'<polygon points="210,12 403,167 17,167" '+fill+'/>',
  arrow:'<polygon points="14,55 276,55 276,15 405,90 276,165 276,125 14,125" '+fill+'/>',
  line:'<path d="M15 90H405" stroke="'+c+'" stroke-width="8" fill="none"/>'
 }
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 420 180">'+(paths[kind]||paths.rect)+'</svg>'
}
export function rasterShape(kind,color,w=420,h=180){
 return new Promise((resolve,reject)=>{
  if(typeof document==='undefined')return reject(new Error('브라우저가 필요합니다.'))
  const svg=shapeSvg(kind,color,w,h)
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}))
  const image=new Image()
  image.onload=()=>{
   try{
    const canvas=document.createElement('canvas')
    canvas.width=w;canvas.height=h
    canvas.getContext('2d').drawImage(image,0,0,w,h)
    resolve(canvas.toDataURL('image/png'))
   }catch(e){reject(e)}finally{URL.revokeObjectURL(url)}
  }
  image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('도형 생성 실패'))}
  image.src=url
 })
}
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function readImage(file){
 return new Promise((resolve,reject)=>{
  if(!file || !['image/png','image/jpeg'].includes(file.type))return reject(new Error('PNG/JPEG만 지원합니다.'))
  if(file.size>3*1024*1024)return reject(new Error('이미지는 3MB 이하만 지원합니다.'))
  const reader=new FileReader()
  reader.onload=()=>resolve(reader.result)
  reader.onerror=()=>reject(new Error('그림 파일을 읽지 못했습니다.'))
  reader.readAsDataURL(file)
 })
}
export function installMediaTools({paper,isImported,convertToDocxCopy,markDirty,toast}){
 const ribbon=document.querySelector('.milosoft-ribbon')
 const panel=document.createElement('div')
 panel.className='media-toolbar'
 panel.setAttribute('aria-label','문서 개체 도구')
 panel.innerHTML='<span class="media-label">입력 도구</span>'+
  '<button type="button" data-add="image">그림</button>'+
  '<button type="button" data-add="shape">도형</button>'+
  '<button type="button" data-add="font">웹폰트</button>'+
  '<button type="button" data-add="symbol">문자표</button>'+
  '<button type="button" data-add="resize">개체 크기</button>'+
  '<input id="mediaUpload" type="file" accept="image/png,image/jpeg" hidden>'
 ribbon?.append(panel)
 const upload=panel.querySelector('#mediaUpload')
 const dialog=document.createElement('dialog')
 dialog.className='media-dialog'
 dialog.innerHTML='<h3>문서 입력</h3><div class="media-options"></div><button type="button" class="media-close">닫기</button>'
 document.body.append(dialog)
 dialog.querySelector('.media-close').onclick=()=>dialog.close()
 const heading=dialog.querySelector('h3'),options=dialog.querySelector('.media-options')
 let savedRange=null
 let selectedObject=null
 const inPaper=n=>Boolean(n&&paper.contains(n))
 const capture=()=>{
  const s=window.getSelection()
  if(s?.rangeCount&&inPaper(s.anchorNode))savedRange=s.getRangeAt(0).cloneRange()
 }
 const restored=()=>{
  if(!savedRange||!inPaper(savedRange.commonAncestorContainer))return false
  const s=window.getSelection();s.removeAllRanges();s.addRange(savedRange.cloneRange())
  return true
 }
 const caret=node=>{
  // No previous caret: append a safe paragraph instead of placing content
  // inside the final table row or breaking an imported table.
  const block=document.createElement('p')
  block.append(node)
  paper.append(block)
  const r=document.createRange()
  r.setStartAfter(node);r.collapse(true)
  const s=window.getSelection();s.removeAllRanges();s.addRange(r)
  capture()
 }
 const insertNode=node=>{
  if(restored()){
   const s=window.getSelection(),r=s.getRangeAt(0)
   r.deleteContents();r.insertNode(node);r.setStartAfter(node);r.collapse(true)
   s.removeAllRanges();s.addRange(r);capture()
  }else caret(node)
  markDirty()
 }
 const guard=kind=>{
  if(!isImported())return true
  if(kind==='symbol')return true
  if(typeof convertToDocxCopy!=='function')return false
  return convertToDocxCopy(kind)
 }
 // capture before dialogs/buttons steal the document selection
 paper.addEventListener('keyup',capture)
 paper.addEventListener('mouseup',capture)
 panel.addEventListener('pointerdown',capture)
 document.addEventListener('selectionchange',capture)
 dialog.addEventListener('pointerdown',()=>{}) // savedRange intentionally survives dialog focus
 function open(title){heading.textContent=title;options.replaceChildren();dialog.showModal()}
 function option(text,handler,className=''){
  const b=document.createElement('button');b.type='button';b.textContent=text
  if(className)b.className=className
  b.addEventListener('pointerdown',e=>e.preventDefault())
  b.onclick=handler
  return b
 }
 const fileImage=async file=>{
  const data=await readImage(file)
  const img=new Image()
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=data})
  const scale=Math.min(1,560/img.naturalWidth,650/img.naturalHeight)
  const width=Math.max(20,Math.round(img.naturalWidth*scale))
  const height=Math.max(20,Math.round(img.naturalHeight*scale))
  const element=document.createElement('img')
  element.alt=file.name.replace(/[<>]/g,'')
  element.src=data;element.width=width;element.height=height
  element.style.maxWidth='100%';element.dataset.miloMedia='image'
  insertNode(element);toast('그림을 삽입했습니다. 개체 크기 메뉴에서 조절할 수 있어요.')
 }
 upload.onchange=async()=>{
  const file=upload.files?.[0]
  if(!file)return
  try{await fileImage(file)}catch(e){toast(e.message)}finally{upload.value=''}
 }
 const showShape=()=>{
  if(!guard('shape'))return
  open('도형 삽입')
  const hint=document.createElement('p');hint.textContent='도형을 고르면 현재 커서 위치에 삽입됩니다. 색상과 크기는 도형 선택 후 변경할 수 있어요.'
  options.append(hint)
  const grid=document.createElement('div');grid.className='media-grid'
  for(const [kind,label] of SHAPES){
   grid.append(option(label,async()=>{
    try{
     const data=await rasterShape(kind,'#e4ecff')
     const image=document.createElement('img')
     image.src=data;image.alt=label;image.width=420;image.height=180
     image.dataset.miloMedia='shape';image.dataset.shapeKind=kind;image.dataset.shapeColor='#e4ecff'
     image.style.maxWidth='100%'
     dialog.close();insertNode(image);selectedObject=image
     toast(label+' 도형을 삽입했습니다.')
    }catch(e){toast(e.message)}
   }))
  }
  options.append(grid)
 }
 const showSymbols=()=>{
  // Existing HWPX text cells support Unicode insert and preserve original XML on save.
  if(!guard('symbol'))return
  open('문자표')
  const description=document.createElement('p');description.textContent='문서에서 커서를 놓은 뒤 기호를 선택하세요. 문자표는 HWPX 텍스트에도 적용할 수 있습니다.'
  options.append(description)
  for(const [category,chars] of Object.entries(CHARACTER_PALETTE)){
   const title=document.createElement('div');title.className='symbol-category';title.textContent=category
   options.append(title)
   const grid=document.createElement('div');grid.className='symbol-grid'
   for(const chr of chars.split(' ').filter(Boolean)){
    grid.append(option(chr,()=>{
     const cell=savedRange?.startContainer?.parentElement?.closest?.('td,th')
     if(isImported() && (!cell || !cell.hasAttribute('data-bind'))){
       toast('한글 문서에서는 표의 텍스트 셀에 커서를 둔 뒤 문자표를 이용해 주세요.');return
     }
     const node=document.createTextNode(chr)
     dialog.close();insertNode(node);toast('문자 '+chr+' 삽입 완료')
    }))
   }
   options.append(grid)
  }
 }
 const showFonts=()=>{
  if(!guard('font'))return
  open('문서 글꼴 변경')
  const description=document.createElement('p')
  description.textContent='글자를 드래그해서 선택한 뒤 글꼴을 고르세요. 웹폰트가 표시되며 DOCX에는 글꼴 이름이 기록됩니다.'
  options.append(description)
  const grid=document.createElement('div');grid.className='media-grid'
  for(const font of DOCUMENT_FONTS){
   const b=option(font.name,()=>{
    if(!restored())return toast('문서에서 글자를 먼저 선택해 주세요.')
    const r=window.getSelection()?.getRangeAt(0)
    if(!r||r.collapsed)return toast('변경할 글자를 드래그해서 선택하세요.')
    const span=document.createElement('span')
    span.style.fontFamily=font.name
    try{
     span.append(r.extractContents());r.insertNode(span)
    }catch(e){return toast('여러 표 셀에 걸친 선택은 지원하지 않습니다. 글자를 한 문단 안에서 선택해 주세요.')}
    const next=document.createRange();next.selectNodeContents(span)
    const sel=window.getSelection();sel.removeAllRanges();sel.addRange(next);capture()
    markDirty();dialog.close();toast(font.name+' 글꼴 적용 완료')
   })
   b.style.fontFamily=font.css;grid.append(b)
  }
  options.append(grid)
 }
 function resize(){
  if(!guard('resize'))return
  const range=savedRange
  const image=selectedObject&&inPaper(selectedObject)?selectedObject:
    range?.startContainer?.parentElement?.closest?.('img')
  if(!image||image.tagName!=='IMG')return toast('문서의 그림이나 도형을 먼저 클릭하세요.')
  selectedObject=image
  open('그림·도형 속성')
  const size=document.createElement('div');size.className='media-property-grid'
  size.innerHTML='<label>너비(px)<input data-width type="number" min="20" max="650"></label><label>높이(px)<input data-height type="number" min="20" max="850"></label>'
  const w=size.querySelector('[data-width]'),h=size.querySelector('[data-height]')
  w.value=image.width||300;h.value=image.height||180
  options.append(size)
  options.append(option('크기 적용',()=>{
   const width=Number(w.value),height=Number(h.value)
   if(!Number.isFinite(width)||!Number.isFinite(height)||width<20||width>650||height<20||height>850)return toast('너비 20~650px, 높이 20~850px를 입력하세요.')
   image.width=Math.round(width);image.height=Math.round(height)
   image.style.width=Math.round(width)+'px';image.style.height=Math.round(height)+'px'
   markDirty();dialog.close();toast('개체 크기를 수정했습니다.')
  },'primary'))
  if(image.dataset.miloMedia==='shape'&&image.dataset.shapeKind){
   const color=document.createElement('input');color.type='color'
   color.value=image.dataset.shapeColor||'#e4ecff'
   const label=document.createElement('label');label.textContent='도형 색상 '
   label.append(color);options.append(label)
   options.append(option('색상 변경',async()=>{
    try{
     image.src=await rasterShape(image.dataset.shapeKind,color.value,420,180)
     image.dataset.shapeColor=color.value
     markDirty();dialog.close();toast('도형 색상을 변경했습니다.')
    }catch(e){toast(e.message)}
   }))
  }
 }
 paper.addEventListener('click',e=>{
  const img=e.target?.closest?.('img')
  if(img&&inPaper(img)){selectedObject=img;capture()}
 })
 const handlers={image:()=>{if(guard('image'))upload.click()},
  shape:showShape,font:showFonts,symbol:showSymbols,resize}
 for(const [kind,handler] of Object.entries(handlers)){
  panel.querySelector('[data-add="'+kind+'"]').onclick=handler
 }
 return {open:kind=>handlers[kind]?.()}
}
