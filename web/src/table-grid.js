// Logical positions account for both horizontal and vertical merged cells.
export function tableGrid(table){
 const rows=Array.from(table.rows),slots=[],cells=new Map();let width=0
 rows.forEach((row,r)=>{
  slots[r] ||= [];let c=0
  for(const cell of Array.from(row.cells)){
   while(slots[r][c])c++
   const rs=Math.max(1,Math.min(Number(cell.rowSpan)||1,rows.length-r)),cs=Math.max(1,Number(cell.colSpan)||1)
   const entry={cell,row:r,col:c,rowSpan:rs,colSpan:cs};cells.set(cell,entry)
   for(let y=r;y<r+rs;y++){slots[y] ||= [];for(let x=c;x<c+cs;x++)slots[y][x]=entry}
   c+=cs;width=Math.max(width,c)
  }
 })
 return {table,rows,slots,cells,width}
}
function blankLike(cell){const result=cell.ownerDocument.createElement(cell.tagName.toLowerCase());result.style.cssText=cell.style.cssText;result.innerHTML='<br>';return result}
function insertAt(row,grid,col,cell){const before=Array.from(row.cells).find(x=>(grid.cells.get(x)?.col??Infinity)>=col);row.insertBefore(cell,before||null)}
export function insertColumn(table,cell){
 const g=tableGrid(table),at=g.cells.get(cell);if(!at)return false
 const index=at.col+at.colSpan,seen=new Set()
 for(let r=0;r<g.rows.length;r++){
  const left=g.slots[r]?.[index-1],right=g.slots[r]?.[index]
  if(left&&right&&left===right){if(!seen.has(left)){left.cell.colSpan++;seen.add(left)};continue}
  // A vertically spanning neighbour is represented once, with matching rowSpan.
  const reference=left||right;if(reference&&reference.row<r)continue
  const created=blankLike(reference?.cell||cell);created.rowSpan=reference?.rowSpan||1
  insertAt(g.rows[r],g,index,created)
 }
 table.querySelector(':scope > colgroup')?.remove();return true
}
export function deleteColumn(table,cell){
 const g=tableGrid(table),at=g.cells.get(cell);if(!at||g.width<=1)return false
 const col=at.col,seen=new Set()
 for(let r=0;r<g.rows.length;r++){
  const entry=g.slots[r]?.[col];if(!entry||seen.has(entry))continue;seen.add(entry)
  if(entry.colSpan>1)entry.cell.colSpan=entry.colSpan-1;else entry.cell.remove()
 }
 table.querySelector(':scope > colgroup')?.remove();return true
}
export function insertRow(table,cell){
 const g=tableGrid(table),at=g.cells.get(cell);if(!at)return false
 const pos=at.row+at.rowSpan,ref=g.rows[Math.min(g.rows.length-1,pos-1)],row=ref.cloneNode(false),covered=new Set()
 for(let col=0;col<g.width;col++){
  const above=g.slots[pos-1]?.[col],below=g.slots[pos]?.[col]
  if(above&&below&&above===below){if(!covered.has(above)){above.cell.rowSpan++;covered.add(above)};continue}
  if(!above||covered.has(above))continue
  covered.add(above);const newCell=blankLike(above.cell);newCell.colSpan=above.colSpan;row.appendChild(newCell)
 }
 ref.after(row);return true
}
export function deleteRow(table,cell){
 const g=tableGrid(table),at=g.cells.get(cell);if(!at||g.rows.length<=1)return false
 const index=at.row,row=g.rows[index],next=g.rows[index+1],seen=new Set()
 for(const entry of g.slots[index]||[]){if(!entry||seen.has(entry))continue;seen.add(entry)
  if(entry.row<index)entry.cell.rowSpan=entry.rowSpan-1
  else if(entry.rowSpan>1&&next){entry.cell.rowSpan=entry.rowSpan-1;insertAt(next,g,entry.col,entry.cell)}
 }
 row.remove();return true
}
export function columnWidths(table,g=tableGrid(table)){
 const existing=Array.from(table.querySelectorAll(':scope > colgroup > col'))
 if(existing.length===g.width){const widths=existing.map(c=>c.getBoundingClientRect().width||parseFloat(c.style.width));if(widths.every(x=>Number.isFinite(x)&&x>0))return widths}
 const widths=Array(g.width).fill(0)
 for(const e of g.cells.values()){const width=e.cell.getBoundingClientRect().width/e.colSpan;if(width>0)for(let c=e.col;c<e.col+e.colSpan;c++)if(!widths[c]||e.colSpan===1)widths[c]=width}
 const fallback=(table.getBoundingClientRect().width||g.width*100)/g.width
 return widths.map(x=>Math.max(28,x||fallback))
}
export function setColumns(table,widths){
 let group=table.querySelector(':scope > colgroup');if(!group){group=table.ownerDocument.createElement('colgroup');table.prepend(group)}
 group.replaceChildren(...widths.map(w=>{const c=table.ownerDocument.createElement('col');c.style.width=Math.max(28,w)+'px';return c}))
 table.style.tableLayout='fixed';table.style.width=widths.reduce((a,b)=>a+b,0)+'px'
}
export function rangeCells(table,a,b){
 const g=tableGrid(table),x=g.cells.get(a),y=g.cells.get(b);if(!x||!y)return []
 const top=Math.min(x.row,y.row),bottom=Math.max(x.row+x.rowSpan,y.row+y.rowSpan),left=Math.min(x.col,y.col),right=Math.max(x.col+x.colSpan,y.col+y.colSpan),entries=new Set()
 for(let r=top;r<bottom;r++)for(let c=left;c<right;c++){const e=g.slots[r]?.[c];if(!e||e.row<top||e.col<left||e.row+e.rowSpan>bottom||e.col+e.colSpan>right)return [];entries.add(e)}
 return Array.from(entries,e=>e.cell)
}
export function mergeRange(table,cells){
 if(cells.length<2)return false
 const g=tableGrid(table),entries=cells.map(c=>g.cells.get(c));if(entries.some(e=>!e))return false
 const top=Math.min(...entries.map(e=>e.row)),left=Math.min(...entries.map(e=>e.col)),bottom=Math.max(...entries.map(e=>e.row+e.rowSpan)),right=Math.max(...entries.map(e=>e.col+e.colSpan)),set=new Set(entries)
 for(let r=top;r<bottom;r++)for(let c=left;c<right;c++)if(!set.has(g.slots[r]?.[c]))return false
 const first=g.slots[top][left].cell
 for(const e of entries){if(e.cell===first)continue;const br=first.ownerDocument.createElement('br');first.append(br,...Array.from(e.cell.childNodes));e.cell.remove()}
 first.colSpan=right-left;first.rowSpan=bottom-top;return true
}
export function splitMerged(table,cell){
 const g=tableGrid(table),e=g.cells.get(cell);if(!e||(e.colSpan===1&&e.rowSpan===1))return false
 cell.colSpan=1;cell.rowSpan=1
 for(let y=e.row;y<e.row+e.rowSpan;y++)for(let x=e.col;x<e.col+e.colSpan;x++){if(y===e.row&&x===e.col)continue;insertAt(g.rows[y],g,x,blankLike(cell))}
 return true
}
