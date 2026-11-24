import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import JSZip from 'jszip'
import {openPackage,savePackage} from '../src/formats.js'
import {captureTableTargets,inferTableValues,validateTableEdits,applyTableEdits} from '../src/table-ai.js'
const HP='http://www.hancom.co.kr/hwpml/2011/paragraph',HS='http://www.hancom.co.kr/hwpml/2011/section'
function environment(){
 const dom=new JSDOM('<!doctype html><html lang="ko"><body><article id="paper"></article></body></html>')
 globalThis.DOMParser=dom.window.DOMParser
 globalThis.XMLSerializer=dom.window.XMLSerializer
 if(!('innerText' in dom.window.HTMLElement.prototype))Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent||''},set(v){this.textContent=v}})
 return dom.window.document.getElementById('paper')
}
function tc(row,col,text='',colSpan=1,rowSpan=1){
 return '<hp:tc><hp:subList><hp:p><hp:run charPrIDRef="25">'+(text?'<hp:t>'+text+'</hp:t>':'')+'</hp:run><hp:linesegarray/></hp:p></hp:subList><hp:cellAddr rowAddr="'+row+'" colAddr="'+col+'"/><hp:cellSpan colSpan="'+colSpan+'" rowSpan="'+rowSpan+'"/><hp:cellSz width="'+(colSpan*1700)+'" height="1984"/></hp:tc>'
}
function fakeTemplate(){
 const first=[
  [tc(0,0,'과제목표',1,4),tc(0,1,'정량목표',2,1),tc(0,3,'비고')],
  [tc(1,1),tc(1,2),tc(1,3)],
  [tc(2,1),tc(2,2),tc(2,3)],
  [tc(3,1),tc(3,2),tc(3,3)]
 ]
 const table=(cols,rows)=>'<hp:p><hp:run><hp:tbl colCnt="'+cols+'" rowCnt="'+rows.length+'"><hp:sz width="47000"/>'+rows.map(cells=>'<hp:tr>'+cells.join('')+'</hp:tr>').join('')+'</hp:tbl></hp:run></hp:p>'
 const other=[
  table(5,[[tc(0,0,'구분',2),tc(0,2,'세부내용'),tc(0,3,'목표'),tc(0,4,'증빙')],[tc(1,0,'필수목표',1,2),...Array.from({length:4},(_,i)=>tc(1,i+1))]]),
  table(31,[[tc(0,0,'구분',1,2),tc(0,1,'추진내용',1,2),tc(0,2,'추 진 일 정(월)',28),tc(0,30,'비고',1,2)],[...Array.from({length:7},(_,i)=>tc(1,2+i*4,String(4+i),4))],[...Array.from({length:31},(_,i)=>tc(2,i))]]),
  table(4,[[tc(0,0,'구분'),tc(0,1,'수익 모델'),tc(0,2,'주요 내용'),tc(0,3,'예상 단가')],[...Array.from({length:4},(_,i)=>tc(1,i))]]),
  table(6,[[tc(0,0,'구분',2),tc(0,2,'사업비'),tc(0,3,'지원금'),tc(0,4,'자체부담금'),tc(0,5,'구성비')],[...Array.from({length:6},(_,i)=>tc(1,i))]])
 ]
 return '<?xml version="1.0"?><hs:sec xmlns:hs="'+HS+'" xmlns:hp="'+HP+'">'+table(4,first)+other.join('')+'</hs:sec>'
}
const prompt=[
'마일로소프트 표 자동입력 검증입니다. 다른 표는 수정하지 마세요.',
'표1 2행 2열 = 문서 자동화 기능 구현',
'표1 2행 3열 = 월 50건 문서 작성 목표',
'표1 2행 4열 = 실증 테스트',
'표1 3행 2열 = 한글 양식 셀 자동 입력',
'표1 3행 3열 = 표 셀 입력 정확도 95% 목표',
'표1 3행 4열 = 검증 예정',
'표1 4행 2열 = 클라우드 문서 저장',
'표1 4행 3열 = 저장·재열기 성공률 100% 목표',
'표1 4행 4열 = 시범 운영'
].join('\n')
test('Five-table HWPX template fills exactly nine logical cells and survives save',async()=>{
 const paper=environment()
 const zip=new JSZip();zip.file('Contents/section0.xml',fakeTemplate())
 zip.file('mimetype','application/hwp+zip')
 const bytes=await zip.generateAsync({type:'uint8array'})
 const state=await openPackage({name:'standard.hwpx',arrayBuffer:async()=>bytes.buffer})
 paper.innerHTML=state.html
 assert.equal(paper.querySelectorAll('table').length,5)
 assert.equal(paper.querySelector('table').rows[0].cells[0].rowSpan,4)
 const snapshot=captureTableTargets(paper,null,{prompt,maxTargets:100})
 assert.equal(snapshot.totalTables,5)
 assert.equal(snapshot.targets.length,9)
 assert.ok(snapshot.targets.find(x=>x.cellId==='t0r1c1'))
 assert.ok(snapshot.targets.find(x=>x.cellId==='t0r3c3'))
 const proposals=inferTableValues(snapshot,prompt)
 const edits=validateTableEdits(snapshot,proposals)
 assert.equal(edits.length,9)
 assert.equal(applyTableEdits(edits),9)
 const blob=await savePackage(state,paper)
 const saved=await JSZip.loadAsync(await blob.arrayBuffer())
 const xml=await saved.file('Contents/section0.xml').async('string')
 const parsed=new DOMParser().parseFromString(xml,'application/xml')
 assert.equal(Array.from(parsed.getElementsByTagName('*')).filter(x=>x.localName==='tbl').length,5)
 assert.match(xml,/월 50건 문서 작성 목표/)
 assert.match(xml,/시범 운영/)
 assert.match(xml,/rowSpan="4"/)
})
test('Wide schedule table does not exhaust non-focused candidate budget',async()=>{
 const paper=environment()
 const zip=new JSZip();zip.file('Contents/section0.xml',fakeTemplate())
 const bytes=await zip.generateAsync({type:'uint8array'})
 const state=await openPackage({name:'standard.hwpx',arrayBuffer:async()=>bytes.buffer})
 paper.innerHTML=state.html
 const snapshot=captureTableTargets(paper,null,{prompt:'사업예산 표를 채워줘',maxTargets:100})
 assert.ok(snapshot.targets.every(x=>x.table===5))
 const all=captureTableTargets(paper,null,{prompt:'문서 표 양식을 검토해줘',maxTargets:100})
 assert.ok(new Set(all.targets.map(x=>x.table)).size>=4)
})
