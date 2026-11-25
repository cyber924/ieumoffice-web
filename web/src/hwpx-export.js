// HWPX is produced by the same rhwp engine used in IeumOffice.
import JSZip from 'jszip'
import {applyHwpxStyles} from './hwpx-styles.js'
let enginePromise
async function engine(){
 if(!enginePromise)enginePromise=(async()=>{
  const url='/hwpx-engine/rhwp.js'
  const mod=await import(/* @vite-ignore */ url)
  const response=await fetch('/hwpx-engine/rhwp_bg.wasm')
  if(!response.ok)throw new Error('한글 변환 엔진을 불러오지 못했습니다.')
  await mod.default({module_or_path:new Uint8Array(await response.arrayBuffer())})
  return mod
 })().catch(error=>{enginePromise=null;throw error})
 return enginePromise
}
export async function exportHwpx(paper,loadEngine=engine){
 if(paper.querySelector('svg,canvas,video,audio,iframe'))throw new Error('지원하지 않는 개체가 포함되어 HWPX 저장을 중단했습니다.')
 const {HwpDocument}=await loadEngine()
 const doc=HwpDocument.createEmpty()
 let bytes
 try{
  doc.createBlankDocument()
  // Stylesheets are not part of innerHTML: materialize the visible grid on a copy.
  const copy=paper.cloneNode(true)
  // The editable view uses stylesheet rules, which do not accompany innerHTML.
  // Pass the actual displayed formatting to the HTML-to-HWPX converter.
  const originals=[paper,...paper.querySelectorAll('*')], copies=[copy,...copy.querySelectorAll('*')]
  const view=paper.ownerDocument.defaultView
  if(view?.getComputedStyle)for(let i=0;i<originals.length;i++){
   const original=originals[i],target=copies[i],css=view.getComputedStyle(original)
   if(!target?.style||!css)continue
   for(const property of ['font-family','font-size','font-weight','font-style','color','text-align','vertical-align','background-color','padding-top','padding-right','padding-bottom','padding-left']){
    const value=css.getPropertyValue(property)
    if(value&&!/^(?:transparent|rgba\(0, 0, 0, 0\))$/.test(value))target.style.setProperty(property,value)
   }
   if(/^(?:TABLE|TR|TD|TH|COL)$/.test(original.tagName)){
    const rect=original.getBoundingClientRect()
    if(rect.width>0&&/^(?:TABLE|TD|TH|COL)$/.test(original.tagName))target.style.width=Math.round(rect.width)+'px'
    if(rect.height>0&&original.tagName==='TR')target.style.height=Math.round(rect.height)+'px'
   }
  }
  for(const cell of copy.querySelectorAll('td,th')){
   const style=cell.style
   for(const side of ['Top','Right','Bottom','Left']){
    if(!style['border'+side+'Style'] || style['border'+side+'Style']==='none')
     style['border'+side]='1px solid #000000'
   }
  }
  const pictures=[]
  for(const [index,img] of [...copy.querySelectorAll('img')].entries()){
   const original=paper.querySelectorAll('img')[index]
   const source=original.currentSrc||original.getAttribute('src')||''
   let response
   try{response=await fetch(source)}catch{throw new Error('이미지를 읽지 못해 HWPX 저장을 중단했습니다. 이미지를 다시 삽입해 주세요.')}
   if(!response.ok)throw new Error('이미지를 읽지 못해 HWPX 저장을 중단했습니다.')
   const image=await response.blob(), mime=image.type.toLowerCase().split(';')[0]
   const ext=({'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/bmp':'bmp'})[mime]
   if(!ext)throw new Error('HWPX는 PNG, JPEG, GIF, BMP 이미지를 지원합니다. 이미지를 변환해 다시 삽입해 주세요.')
   const width=Math.max(1,Math.min(1200,Math.round(Number(original.getAttribute('width'))||original.width||original.naturalWidth||420)))
   const height=Math.max(1,Math.min(1600,Math.round(Number(original.getAttribute('height'))||original.height||original.naturalHeight||220)))
   const marker='IEUMIMAGE'+index+'X'+Math.random().toString(36).slice(2)+'END'
   pictures.push({marker,bytes:new Uint8Array(await image.arrayBuffer()),width,height,ext})
   img.replaceWith(copy.ownerDocument.createTextNode(marker))
  }
  const result=JSON.parse(doc.pasteHtml(0,0,0,copy.innerHTML))
  if(!result.ok)throw new Error('본문을 한글 문서로 변환하지 못했습니다.')
  const checked=(label,json)=>{const v=JSON.parse(json);if(!v.ok)throw new Error(label+' 변환에 실패했습니다.');return v}
  for(const pic of pictures){
   const match=JSON.parse(doc.searchText(pic.marker,0,0,0,true,true,true))
   if(!match.found||match.totalMatchCount!==1)throw new Error('그림 위치를 찾지 못해 HWPX 저장을 중단했습니다.')
   const {para,charOffset,cellContext}=match
   const args=[pic.bytes,pic.width*75,pic.height*75,pic.width,pic.height,pic.ext,'']
   if(cellContext){
    const c=cellContext,path=JSON.stringify([{controlIndex:c.ctrlIdx,cellIndex:c.cellIdx,cellParaIndex:c.cellPara}])
    checked('그림 위치',doc.deleteTextInCellByPath(0,c.parentPara,path,charOffset,pic.marker.length))
    const inserted=checked('그림',doc.insertPictureInCell(0,c.parentPara,charOffset,path,...args))
    checked('그림 배치',doc.setCellPicturePropertiesByPath(0,c.parentPara,path,inserted.controlIdx,JSON.stringify({treatAsChar:true})))
   }else{
    checked('그림 위치',doc.deleteText(0,para,charOffset,pic.marker.length))
    const inserted=checked('그림',doc.insertPicture(0,para,charOffset,'',...args))
    checked('그림 배치',doc.setPictureProperties(0,para,inserted.controlIdx,JSON.stringify({treatAsChar:true})))
   }
  }
  const exported=doc.exportHwpxWithReport()
  try{
   const report=JSON.parse(exported.contentLoss())
   if(report.count)throw new Error('변환 중 일부 내용이 누락되어 HWPX 저장을 중단했습니다.')
   bytes=exported.takeBytes()
  }finally{exported.free()}
 }finally{doc.free()}
 const reopened=new HwpDocument(bytes)
 try{if(reopened.pageCount()<1)throw new Error('생성된 HWPX를 다시 열지 못했습니다.')}finally{reopened.free()}
 const zip=await JSZip.loadAsync(bytes)
 const section=await zip.file('Contents/section0.xml')?.async('string')
 if(!section)throw new Error('HWPX 본문을 확인하지 못했습니다.')
 const xml=new DOMParser().parseFromString(section,'application/xml')
 if(xml.querySelector('parsererror'))throw new Error('HWPX 본문 형식이 올바르지 않습니다.')
 const imageCount=paper.querySelectorAll('img').length
 if(xml.getElementsByTagNameNS('*','pic').length!==imageCount)throw new Error('일부 그림이 저장되지 않아 HWPX 저장을 중단했습니다.')
 const expected=paper.querySelectorAll('table').length
 const actual=xml.getElementsByTagNameNS('*','tbl').length
 if(expected!==actual)throw new Error('일부 표가 변환되지 않아 HWPX 저장을 중단했습니다.')
 const input=(paper.innerText||paper.textContent||'').replace(/\s/g,'')
 const output=Array.from(xml.getElementsByTagNameNS('*','t'),n=>n.textContent||'').join('').replace(/\s/g,'')
 if(input!==output)throw new Error('변환한 본문이 원본과 달라 HWPX 저장을 중단했습니다.')
 // Add the standard diagonal element omitted by the engine on newly-created borders.
 const header=await zip.file('Contents/header.xml')?.async('string')
 if(!header)throw new Error('HWPX 서식을 확인하지 못했습니다.')
 const normalized=header.replace(/<hh:borderFill\b[^>]*>[\s\S]*?<\/hh:borderFill>/g,block=>
  /<hh:diagonal\b/.test(block)?block:block.replace(/(?=<hc:fillBrush\b|<\/hh:borderFill>)/,'<hh:diagonal type="SOLID" width="0.1 mm" color="none"/>'))
 const styled=applyHwpxStyles(normalized,section,paper)
 zip.file('Contents/header.xml',styled.header)
 zip.file('Contents/section0.xml',styled.section)
 bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'})
 const verified=new HwpDocument(bytes)
 try{if(verified.pageCount()<1)throw new Error('HWPX 최종 파일을 다시 열지 못했습니다.')}finally{verified.free()}
 return new Blob([bytes],{type:'application/hwp+zip'})
}
