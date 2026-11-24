// HWPX is produced by the same rhwp engine used in IeumOffice.
import JSZip from 'jszip'
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
 if(paper.querySelector('img,svg,canvas,video,audio,iframe'))throw new Error('그림이나 도형이 포함된 문서는 HWPX 변환을 지원하지 않습니다. Word로 저장해 주세요.')
 const {HwpDocument}=await loadEngine()
 const doc=HwpDocument.createEmpty()
 let bytes
 try{
  doc.createBlankDocument()
  const result=JSON.parse(doc.pasteHtml(0,0,0,paper.innerHTML))
  if(!result.ok)throw new Error('본문을 한글 문서로 변환하지 못했습니다.')
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
 const expected=paper.querySelectorAll('table').length
 const actual=xml.getElementsByTagNameNS('*','tbl').length
 if(expected!==actual)throw new Error('일부 표가 변환되지 않아 HWPX 저장을 중단했습니다.')
 const input=(paper.innerText||paper.textContent||'').replace(/\s/g,'')
 const output=Array.from(xml.getElementsByTagNameNS('*','t'),n=>n.textContent||'').join('').replace(/\s/g,'')
 if(input!==output)throw new Error('변환한 본문이 원본과 달라 HWPX 저장을 중단했습니다.')
 return new Blob([bytes],{type:'application/hwp+zip'})
}
