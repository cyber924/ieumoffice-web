// Document insertion tools for new DOCX documents.
// Imported HWPX / DOCX keeps original XML structure; structural inserts are restricted.
const allowedFonts=[
 {name:'맑은 고딕',css:'Malgun Gothic, sans-serif'},
 {name:'바탕',css:'Batang, serif'},
 {name:'함초롬바탕',css:'HCR Batang, Batang, serif'},
 {name:'Noto Sans KR',css:'Noto Sans KR, sans-serif'},
 {name:'Noto Serif KR',css:'Noto Serif KR, serif'},
 {name:'나눔고딕',css:'Nanum Gothic, sans-serif'},
 {name:'나눔명조',css:'Nanum Myeongjo, serif'}
]
const symbols=['○','●','□','■','△','▲','◇','◆','★','☆','✓','✔','☑','※','☎','→','←','↔','↑','↓','§','¶','℃','℉','㎜','㎝','㎡','㎥','₩','€','™','©','®','①','②','③','④','⑤','㉠','㉡','ⅰ','ⅱ','Ⅰ','Ⅱ','Ⅲ','±','×','÷','≤','≥','≠','∞','∑','∴','π','α','β','γ','한','㈜']
function pngDataUrlFromSvg(svg,width,height) {
 return new Promise((resolve,reject)=>{
  const img=new Image()
  const blob=new Blob([svg],{type:'image/svg+xml'})
  const url=URL.createObjectURL(blob)
  img.onload=()=>{
   try{
    const canvas=document.createElement('canvas')
    canvas.width=width;canvas.height=height
    const ctx=canvas.getContext('2d')
    ctx.drawImage(img,0,0,width,height)
    resolve(canvas.toDataURL('image/png'))
   }catch(err){reject(err)}finally{URL.revokeObjectURL(url)}
  }
  img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('도형 이미지를 만들 수 없습니다.'))}
  img.src=url
 })
}
function shapeSvg(kind,color,width=420,height=180){
 const common='fill="'+color+'" stroke="#22324e" stroke-width="3"'
 const shape={
  rect:'<rect x="18" y="18" width="384" height="144" rx="8" '+common+'/>',
  round:'<rect x="18" y="18" width="384" height="144" rx="36" '+common+'/>',
  ellipse:'<ellipse cx="210" cy="90" rx="185" ry="68" '+common+'/>',
  triangle:'<polygon points="210,15 400,160 20,160" '+common+'/>',
  arrow:'<polygon points="15,56 280,56 280,17 405,90 280,163 280,124 15,124" '+common+'/>'
 }[kind]||'<rect x="18" y="18" width="384" height="144" '+common+'/>'
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 420 180">'+shape+'</svg>'
}
function getInsertedImage(file){
 return new Promise((resolve,reject)=>{
  if(!file||!/^image\/(png|jpeg)$/.test(file.type))return reject(new Error('PNG 또는 JPEG 이미지만 삽입할 수 있습니다.'))
  if(file.size>3*1024*1024)return reject(new Error('이미지는 3MB 이하만 지원합니다.'))
  const reader=new FileReader()
  reader.onload=()=>resolve(reader.result)
  reader.onerror=()=>reject(new Error('이미지 파일을 읽지 못했습니다.'))
  reader.readAsDataURL(file)
 })
}
export function installMediaTools({paper,isImported,insertHtml,markDirty,toast,getSelectionRange}){
 const panel=document.createElement('div')
 panel.className='media-toolbar'
 panel.innerHTML='<span class="media-label">입력 도구</span><button type="button" data-add="image">그림</button><button type="button" data-add="shape">도형</button><button type="button" data-add="font">웹폰트</button><button type="button" data-add="symbol">문자표</button><input id="mediaUpload" type="file" accept="image/png,image/jpeg" hidden>'
 document.querySelector('.milosoft-ribbon')?.append(panel)
 const input=panel.querySelector('#mediaUpload')
 const button=kind=>panel.querySelector('[data-add="'+kind+'"]')
 const dialog=document.createElement('dialog')
 dialog.className='media-dialog'
 dialog.innerHTML='<h3 id="mediaHeading">편집 도구</h3><div id="mediaOptions"></div><button type="button" class="media-close">닫기</button>'
 document.body.append(dialog)
 dialog.querySelector('.media-close').onclick=()=>dialog.close()
 const options=dialog.querySelector('#mediaOptions')
 const heading=dialog.querySelector('#mediaHeading')
 let rememberedRange=null
 document.addEventListener('selectionchange',()=>{
  const selection=getSelection()
  if(selection?.rangeCount && paper.contains(selection.anchorNode))rememberedRange=selection.getRangeAt(0).cloneRange()
 })
 function restoreCursor(){
  if(rememberedRange&&paper.contains(rememberedRange.commonAncestorContainer)){
   const sel=getSelection()
   sel.removeAllRanges();sel.addRange(rememberedRange)
  }
  paper.focus()
 }
 function insert(fragment){
  restoreCursor()
  document.execCommand('insertHTML',false,fragment)
  markDirty()
 }
 function guard(){
  if(isImported()){toast('가져온 파일은 원본 그림·양식 구조 보존을 위해 새 개체 삽입을 제한합니다. 새 DOCX 문서를 이용해 주세요.');return false}
  return true
 }
 button('image').onclick=()=>{if(guard())input.click()}
 input.onchange=async e=>{
  const file=e.target.files?.[0]
  if(!file)return
  try{
   const data=await getInsertedImage(file)
   const image=new Image()
   image.onload=()=>{
    const scale=Math.min(1,560/image.naturalWidth,650/image.naturalHeight)
    const width=Math.max(20,Math.round(image.naturalWidth*scale))
    const height=Math.max(20,Math.round(image.naturalHeight*scale))
    insert('<p><img alt="삽입한 그림" src="'+data+'" width="'+width+'" height="'+height+'" style="max-width:100%;height:auto"></p>')
    toast('그림을 삽입했습니다. DOCX 파일에 포함하여 저장합니다.')
   }
   image.onerror=()=>toast('그림을 표시할 수 없습니다.')
   image.src=data
  }catch(err){toast(err.message)}finally{input.value=''}
 }
 button('shape').onclick=()=>{
  if(!guard())return
  heading.textContent='도형 삽입'
  options.replaceChildren()
  const row=document.createElement('div');row.className='media-grid'
  for(const [kind,label] of [['rect','사각형'],['round','둥근 사각형'],['ellipse','타원'],['triangle','삼각형'],['arrow','화살표']]){
   const b=document.createElement('button');b.textContent=label
   b.onclick=async()=>{
    try{
     const svg=shapeSvg(kind,'#e4ecff')
     const png=await pngDataUrlFromSvg(svg,420,180)
     insert('<p><img alt="'+label+'" src="'+png+'" width="420" height="180" style="max-width:100%;height:auto"></p>')
     dialog.close();toast(label+' 도형을 삽입했습니다.')
    }catch(err){toast(err.message)}
   }
   row.append(b)
  }
  options.append(row);dialog.showModal()
 }
 button('font').onclick=()=>{
  if(!guard())return
  heading.textContent='문서 글꼴 선택'
  options.replaceChildren()
  const label=document.createElement('p');label.textContent='글자를 먼저 선택한 뒤 글꼴을 고르세요. 다른 PC에 글꼴이 없으면 대체 표시될 수 있습니다.'
  options.append(label)
  const row=document.createElement('div');row.className='media-grid'
  for(const font of allowedFonts){
   const b=document.createElement('button');b.textContent=font.name;b.style.fontFamily=font.css
   b.onclick=()=>{
    restoreCursor()
    const sel=getSelection()
    if(!sel?.rangeCount||sel.isCollapsed)return toast('글꼴을 바꿀 글자를 먼저 선택해 주세요.')
    document.execCommand('fontName',false,font.name)
    markDirty()
    dialog.close();toast(font.name+' 글꼴을 적용했습니다.')
   }
   row.append(b)
  }
  options.append(row);dialog.showModal()
 }
 button('symbol').onclick=()=>{
  if(!guard())return
  heading.textContent='문자표'
  options.replaceChildren()
  const help=document.createElement('p');help.textContent='문자를 선택하면 편집 중인 커서 위치에 삽입합니다.'
  options.append(help)
  const row=document.createElement('div');row.className='symbol-grid'
  for(const sym of symbols){
   const b=document.createElement('button');b.textContent=sym;b.title='문자 '+sym
   b.onclick=()=>{insert(sym);dialog.close()}
   row.append(b)
  }
  options.append(row);dialog.showModal()
 }
 return {open:kind=>button(kind)?.click()}
}
