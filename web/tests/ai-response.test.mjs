import test from 'node:test'
import assert from 'node:assert/strict'
import {parseTableProposals,tableDraftIntent,tablePromptGuide} from '../api/table-output.js'
const candidates=[
 {cellId:'t0r1c1',label:'사업목표 / 정량목표',tableTitle:'사업목표',rowLabel:'정량목표',table:1,row:2,column:2,current:''},
 {cellId:'t0r2c1',label:'추진내용 / 개요',tableTitle:'사업목표',rowLabel:'추진내용',table:1,row:3,column:2,current:''},
 {cellId:'t0r3c1',label:'이미 입력됨',table:1,row:4,column:2,current:'기존 값'}
]
test('fenced JSON keeps strict cell IDs',()=>{
 const raw='아래 제안입니다.\\n'+'\x60\x60\x60json\\n'+JSON.stringify({edits:[{cellId:'t0r1c1',value:'월 50건 수행'},{cellId:'t0r2c1',value:'업무 자동화 추진'}]})+'\\n\x60\x60\x60'
 const result=parseTableProposals(raw,candidates)
 assert.equal(result.parsed,true)
 assert.equal(result.edits.length,2)
})
test('coordinate fallback maps to exact whitelisted cell',()=>{
 const result=parseTableProposals(JSON.stringify({cells:[{table:1,row:2,column:2,text:'자동화 추진'}]}),candidates)
 assert.deepEqual(result.edits,[{cellId:'t0r1c1',value:'자동화 추진'}])
})
test('invalid IDs and existing entries are never overwritten',()=>{
 const result=parseTableProposals(JSON.stringify({edits:[
 {cellId:'t0r3c1',value:'덮어쓰기'},{cellId:'t99r1c1',value:'악의적 변경'},
 {cellId:'t0r1c1',value:'정상 입력'},{cellId:'t0r1c1',value:'중복'}
 ]}),candidates)
 assert.deepEqual(result.edits,[{cellId:'t0r1c1',value:'정상 입력'}])
})
test('natural language draft changes instruction but preserves fact integrity',()=>{
 assert.equal(tableDraftIntent('표에 모든 빈칸 채워줘'),true)
 assert.match(tablePromptGuide(true),/제안 초안/)
 assert.match(tablePromptGuide(true),/실제 사람 이름/)
})
