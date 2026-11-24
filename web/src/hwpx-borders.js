import JSZip from 'jszip'
const HH='http://www.hancom.co.kr/hwpml/2011/head'
const HP='http://www.hancom.co.kr/hwpml/2011/paragraph'
const edges=['leftBorder','rightBorder','topBorder','bottomBorder']
const parse=s=>{const x=new DOMParser().parseFromString(s,'application/xml');if(x.querySelector('parsererror'))throw new Error('한글 문서 서식을 읽지 못했습니다.');return x}
const nodes=(node,ns,name)=>Array.from(node.getElementsByTagNameNS(ns,name))
// Repair fully borderless cells only. Clone their border fill so other uses of
// the same definition and partially bordered/custom-colored cells stay intact.
export async function ensureHwpxTableBorders(blob){
 const zip=await JSZip.loadAsync(await blob.arrayBuffer()),headerFile=zip.file('Contents/header.xml')
 if(!headerFile)throw new Error('한글 문서의 표 서식을 찾지 못했습니다.')
 const header=parse(await headerFile.async('string')),container=nodes(header,HH,'borderFills')[0]
 if(!container)throw new Error('한글 문서의 테두리 목록이 없습니다.')
 const styles=nodes(container,HH,'borderFill'),byId=new Map(styles.map(s=>[s.getAttribute('id'),s]))
 let nextId=Math.max(0,...styles.map(s=>Number(s.getAttribute('id'))||0))+1, changed=0
 const replacements=new Map()
 const sectionPaths=Object.keys(zip.files).filter(n=>/^Contents\/section\d+\.xml$/.test(n))
 for(const path of sectionPaths){
  const doc=parse(await zip.file(path).async('string'));let sectionChanged=false
  for(const cell of nodes(doc,HP,'tc')){
   const id=cell.getAttribute('borderFillIDRef'),style=byId.get(id)
   if(!style)throw new Error('표 셀의 테두리 설정을 찾지 못했습니다.')
   const sides=edges.map(side=>nodes(style,HH,side)[0])
   if(sides.some(e=>!e))throw new Error('표 셀의 테두리 정보가 올바르지 않습니다.')
   if(!sides.every(e=>e.getAttribute('type')==='NONE'))continue
   let newId=replacements.get(id)
   if(!newId){
    const copy=style.cloneNode(true);newId=String(nextId++);copy.setAttribute('id',newId)
    for(const edge of edges){const side=nodes(copy,HH,edge)[0];side.setAttribute('type','SOLID');side.setAttribute('width','0.12 mm');side.setAttribute('color','#000000')}
    container.appendChild(copy);byId.set(newId,copy);replacements.set(id,newId)
   }
   cell.setAttribute('borderFillIDRef',newId);sectionChanged=true;changed++
  }
  if(sectionChanged)zip.file(path,new XMLSerializer().serializeToString(doc))
 }
 if(!changed)return blob
 container.setAttribute('itemCnt',String(nodes(container,HH,'borderFill').length))
 zip.file('Contents/header.xml',new XMLSerializer().serializeToString(header))
 // HWPX requires mimetype to be the first, uncompressed entry.
 const mimetype=zip.file('mimetype');if(mimetype)zip.file('mimetype',await mimetype.async('uint8array'),{compression:'STORE'})
 return new Blob([await zip.generateAsync({type:'uint8array',compression:'DEFLATE'})],{type:'application/hwp+zip'})
}
