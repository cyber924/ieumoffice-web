// Translate rendered new-document styles to native HWPX paragraph, character and table properties.
const HH='http://www.hancom.co.kr/hwpml/2011/head',HP='http://www.hancom.co.kr/hwpml/2011/paragraph'
const nodes=(root,ns,name)=>Array.from(root.getElementsByTagNameNS(ns,name))
const key=s=>String(s||'').replace(/\s+/g,' ').trim()
const xmlDoc=s=>{const d=new DOMParser().parseFromString(s,'application/xml');if(d.querySelector('parsererror'))throw Error('HWPX 서식을 읽지 못했습니다.');return d}
const color=s=>{const m=String(s||'').match(/rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);return m?'#'+m.slice(1,4).map(v=>Math.min(255,+v).toString(16).padStart(2,'0')).join('').toUpperCase():/^#[\da-f]{6}$/i.test(s)?s.toUpperCase():null}
export function applyHwpxStyles(headerText,sectionText,paper){
 const head=xmlDoc(headerText),section=xmlDoc(sectionText),view=paper.ownerDocument.defaultView
 if(!view?.getComputedStyle||typeof XMLSerializer==='undefined')return {header:headerText,section:sectionText}
 const paraList=nodes(head,HH,'paraProperties')[0],charList=nodes(head,HH,'charProperties')[0]
 if(!paraList||!charList)return {header:headerText,section:sectionText}
 const paras=nodes(paraList,HH,'paraPr'),chars=nodes(charList,HH,'charPr'),paraById=new Map(paras.map(x=>[x.getAttribute('id'),x])),charById=new Map(chars.map(x=>[x.getAttribute('id'),x]))
 let paraId=Math.max(0,...paras.map(x=>+x.getAttribute('id')||0))+1,charId=Math.max(0,...chars.map(x=>+x.getAttribute('id')||0))+1
 const paraCache=new Map(),charCache=new Map(),fontCache=new Map()
 function fontRefs(family){
  const face=String(family||'').split(',')[0].trim().replace(/^['"]|['"]$/g,'')
  if(!face||/^(?:serif|sans-serif|system-ui|monospace)$/i.test(face))return null
  if(fontCache.has(face))return fontCache.get(face)
  const refs={}
  for(const group of nodes(head,HH,'fontface')){
   const lang=group.getAttribute('lang')?.toLowerCase(),fonts=nodes(group,HH,'font');let font=fonts.find(x=>x.getAttribute('face')===face)
   if(!font&&fonts.length){font=fonts[0].cloneNode(true);font.setAttribute('id',String(Math.max(-1,...fonts.map(x=>+x.getAttribute('id')||0))+1));font.setAttribute('face',face);group.appendChild(font);group.setAttribute('fontCnt',String(fonts.length+1))}
   if(lang&&font)refs[lang]=font.getAttribute('id')
  }
  fontCache.set(face,refs);return refs
 }
 const candidates=Array.from(paper.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th,div')).filter(x=>key(x.textContent)&&!x.querySelector('table')&&(!x.matches('div,td,th')||!x.querySelector('p,h1,h2,h3,h4,h5,h6,li,div')))
 const queues=new Map();for(const el of candidates){const k=key(el.textContent);if(!queues.has(k))queues.set(k,[]);queues.get(k).push(el)}
 for(const p of nodes(section,HP,'p')){
  if(nodes(p,HP,'tbl').length)continue
  const k=key(nodes(p,HP,'t').map(t=>t.textContent).join('')),q=queues.get(k);if(!k||!q?.length)continue
  const el=q.shift(),css=view.getComputedStyle(el),align=({center:'CENTER',right:'RIGHT',justify:'JUSTIFY',left:'LEFT',start:'LEFT'})[css.textAlign]||'LEFT'
  const old=p.getAttribute('paraPrIDRef')||'0',pk=old+'|'+align
  if(!paraCache.has(pk)){
   const base=paraById.get(old)||paras[0],clone=base.cloneNode(true),id=String(paraId++);clone.setAttribute('id',id)
   const alignment=nodes(clone,HH,'align')[0];if(alignment)alignment.setAttribute('horizontal',align)
   paraList.appendChild(clone);paraCache.set(pk,id)
  }
  p.setAttribute('paraPrIDRef',paraCache.get(pk))
  for(const run of Array.from(p.children).filter(x=>x.localName==='run'&&nodes(x,HP,'t').length)){
   const runText=key(nodes(run,HP,'t').map(t=>t.textContent).join(''))
   const styled=Array.from(el.querySelectorAll('span,b,strong,i,em,u,font')).find(n=>runText&&key(n.textContent)===runText)||el
   const cs=view.getComputedStyle(styled),size=parseFloat(cs.fontSize),hex=color(cs.color),weight=parseInt(cs.fontWeight,10)||(/bold/i.test(cs.fontWeight)?700:400),italic=cs.fontStyle==='italic'
   const family=cs.fontFamily,oldChar=run.getAttribute('charPrIDRef')||'0',ck=[oldChar,size,hex,weight>=600,italic,family].join('|')
   if(!charCache.has(ck)){
    const base=charById.get(oldChar)||chars[0],clone=base.cloneNode(true),id=String(charId++);clone.setAttribute('id',id)
    if(Number.isFinite(size)&&size>0)clone.setAttribute('height',String(Math.max(600,Math.min(7200,Math.round(size*75)))))
    if(hex)clone.setAttribute('textColor',hex)
    const refs=fontRefs(family),fontRef=nodes(clone,HH,'fontRef')[0];if(refs&&fontRef)for(const [lang,id] of Object.entries(refs))fontRef.setAttribute(lang,id)
    for(const [name,on] of [['bold',weight>=600],['italic',italic]]){const oldNode=nodes(clone,HH,name)[0];if(on&&!oldNode)clone.appendChild(head.createElementNS(HH,'hh:'+name));if(!on&&oldNode)oldNode.remove()}
    charList.appendChild(clone);charCache.set(ck,id)
   }
   run.setAttribute('charPrIDRef',charCache.get(ck))
  }
 }
 paraList.setAttribute('itemCnt',String(nodes(paraList,HH,'paraPr').length));charList.setAttribute('itemCnt',String(nodes(charList,HH,'charPr').length))
 const sourceTables=Array.from(paper.querySelectorAll('table')),outTables=nodes(section,HP,'tbl')
 if(sourceTables.length===outTables.length)sourceTables.forEach((table,i)=>{
  const target=outTables[i],sourceCells=Array.from(table.querySelectorAll('td,th')).filter(c=>c.closest('table')===table),outCells=nodes(target,HP,'tc').filter(c=>{let n=c.parentNode;while(n&&n.localName!=='tbl')n=n.parentNode;return n===target})
  if(sourceCells.length!==outCells.length)return
  const tw=table.getBoundingClientRect().width,scale=tw>0?Math.min(1,42520/(tw*75)):1;let totalHeight=0
  sourceCells.forEach((c,j)=>{const rect=c.getBoundingClientRect(),out=outCells[j],sz=nodes(out,HP,'cellSz')[0],margin=nodes(out,HP,'cellMargin')[0],sub=nodes(out,HP,'subList')[0],css=view.getComputedStyle(c)
   if(sz&&rect.width>0&&rect.height>0){sz.setAttribute('width',String(Math.max(1,Math.round(rect.width*75*scale))));sz.setAttribute('height',String(Math.max(1,Math.round(rect.height*75))))}
   if(margin){for(const side of ['left','right','top','bottom']){const n=parseFloat(css.getPropertyValue('padding-'+side));if(Number.isFinite(n))margin.setAttribute(side,String(Math.max(0,Math.round(n*75))))}out.setAttribute('hasMargin','1')}
   if(sub)sub.setAttribute('vertAlign',css.verticalAlign==='bottom'?'BOTTOM':css.verticalAlign==='top'?'TOP':'CENTER')
  })
  if(tw>0){const sz=Array.from(target.children).find(n=>n.localName==='sz');if(sz)sz.setAttribute('width',String(Math.max(1,Math.round(tw*75*scale))))}
  for(const row of table.rows)totalHeight+=row.getBoundingClientRect().height
  if(totalHeight>0){const sz=Array.from(target.children).find(n=>n.localName==='sz');if(sz)sz.setAttribute('height',String(Math.round(totalHeight*75)))}
 })
 const ser=new XMLSerializer();return {header:ser.serializeToString(head),section:ser.serializeToString(section)}
}
