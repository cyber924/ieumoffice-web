// PDF.js performs client-side text extraction only. Scanned / image-only PDFs
// need OCR, which this module intentionally does not fabricate or promise.
const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs'
const WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs'
export async function extractTextPdf(file){
 if(!file||file.type!=='application/pdf'||file.size>12*1024*1024)throw Error('12MB 이하 PDF 파일을 선택해 주세요.')
 const pdfjs=await import(/* @vite-ignore */ PDFJS)
 pdfjs.GlobalWorkerOptions.workerSrc=WORKER
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false})
 const doc=await task.promise
 if(doc.numPages>30)throw Error('30페이지 이하의 PDF부터 지원합니다.')
 const pages=[]
 for(let page=1;page<=doc.numPages;page++){
  const p=await doc.getPage(page),content=await p.getTextContent()
  const text=content.items.map(i=>typeof i.str==='string'?i.str:'').filter(Boolean).join(' ').trim()
  pages.push({page,text})
 }
 if(pages.every(p=>!p.text))throw Error('스캔 이미지 PDF입니다. OCR 기능이 없어 문자를 자동 추출할 수 없습니다.')
 return pages
}
