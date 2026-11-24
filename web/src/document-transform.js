// Transform only text leaf nodes. Keep cell geometry, images and document structure.
export function documentTextSegments(root,max=120){
 const items=[]
 const walk=root.ownerDocument.createTreeWalker(root,NodeFilter.SHOW_TEXT)
 let node
 while((node=walk.nextNode())&&items.length<max){
  const value=(node.nodeValue||'').trim()
  if(!value||value.length>2200)continue
  const tag=node.parentElement?.closest('script,style,svg,noscript')
  if(tag)continue
  items.push({id:items.length,text:value,node})
 }
 return items
}
export function transformBatches(items,size=20){
 return Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size))
}
export function validateTranslation(items,proposals){
 const byId=new Map(items.map(x=>[x.id,x]))
 const seen=new Set(),edits=[]
 for(const x of Array.isArray(proposals)?proposals:[]){
  const id=Number(x?.id),text=typeof x?.text==='string'?x.text.trim():''
  if(!Number.isInteger(id)||!byId.has(id)||seen.has(id)||!text||text.length>3600)continue
  seen.add(id);edits.push({id,old:byId.get(id).text,text})
 }
 return edits
}
export function applyTranslation(root,items,edits){
 const byId=new Map(items.map(x=>[x.id,x]))
 let changed=0
 for(const e of edits){
  const item=byId.get(e.id)
  if(item && root.contains(item.node) && item.node.nodeValue.trim()===e.old){
   const m=item.node.nodeValue.match(/^(\s*)(.*?)(\s*)$/s)
   item.node.nodeValue=(m?.[1]||'')+e.text+(m?.[3]||'')
   changed++
  }
 }
 return changed
}
