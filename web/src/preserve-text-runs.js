// Preserve unchanged text runs and their formatting around an edit.
export function distributeTextRuns(parts,next){
 const segments=parts.map(s=>Array.from(String(s))),original=segments.flat(),replacement=Array.from(String(next))
 let prefix=0;while(prefix<original.length&&prefix<replacement.length&&original[prefix]===replacement[prefix])prefix++
 let suffix=0;while(suffix<original.length-prefix&&suffix<replacement.length-prefix&&original[original.length-1-suffix]===replacement[replacement.length-1-suffix])suffix++
 const insert=replacement.slice(prefix,replacement.length-suffix).join(''),result=[];let position=0,placed=false
 for(const part of segments){const start=position,end=start+part.length;position=end
  const head=part.slice(0,Math.max(0,Math.min(part.length,prefix-start))).join('')
  const tailStart=Math.max(0,Math.min(part.length,original.length-suffix-start))
  const tail=part.slice(tailStart).join('')
  const shouldInsert=!placed&&(prefix<end||end===original.length)
  result.push(head+(shouldInsert?insert:'')+tail);if(shouldInsert)placed=true
 }
 return result
}
