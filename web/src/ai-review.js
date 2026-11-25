export function selectedEdits(edits,indices){
 const valid=new Set(indices.map(Number).filter(Number.isInteger))
 return edits.filter((_,index)=>valid.has(index))
}
export function canRestoreAI(snapshot,state,revision){return Boolean(snapshot)&&snapshot.state===state&&snapshot.revision===revision}
