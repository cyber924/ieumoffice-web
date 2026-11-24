import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {captureBusinessReport,isReportFillRequest,parseBusinessReportPrompt,proposeBusinessReport,reportMissingFields} from '../src/business-report.js'
import {validateTableEdits,applyTableEdits} from '../src/table-ai.js'
import {exportNewDocx,validateDocxTables} from '../src/docx-export.js'
import JSZip from 'jszip'
function render(title='업무보고서'){
 const dom=new JSDOM('<!doctype html><html lang="ko"><body><article id="paper" contenteditable="true"><h2>'+title+'</h2><table><tbody>'+
  ['보고일','부서','담당자','업무 내용','진행 현황','향후 계획'].map((x,i)=>'<tr><th>'+x+'</th><td'+(i===4?' data-hwp-col="1"':'')+'><br></td></tr>').join('')+
  '</tbody></table><p>원본 문단 유지</p></article></body></html>')
 globalThis.DOMParser=dom.window.DOMParser
 if(!('innerText' in dom.window.HTMLElement.prototype))Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent||''},set(s){this.textContent=s}})
 return dom.window.document.getElementById('paper')
}
const request='오늘 날짜로 개발팀 업무보고서를 작성해 줘. 담당자는 홍길동이고, 오늘 업무는 AI 한글 문서의 표 자동입력 기능 개발과 테스트야. 현재 표 셀 인식 문제를 수정하고 있으며, 앞으로 자동입력 검증과 DOCX/HWPX 호환성 테스트를 진행할 계획이야. 기존 양식은 그대로 유지해 줘.'
test('Natural language report fills all six named fields at once',()=>{
 const paper=render()
 const snapshot=captureBusinessReport(paper)
 assert.equal(snapshot.recognized,true)
 assert.equal(snapshot.targets.length,6)
 assert.equal(new Set(snapshot.targets.map(x=>x.cellId)).size,6)
 assert.equal(isReportFillRequest(request),true)
 const values=parseBusinessReportPrompt(request,{today:'2026년 11월 24일'})
 assert.equal(values.date,'2026년 11월 24일')
 assert.equal(values.department,'개발팀')
 assert.equal(values.assignee,'홍길동')
 assert.match(values.work,/AI 한글 문서/)
 assert.match(values.progress,/표 셀 인식/)
 assert.match(values.plan,/자동입력 검증/)
 const proposals=proposeBusinessReport(snapshot,request,{today:'2026년 11월 24일'})
 assert.equal(proposals.length,6)
 const edits=validateTableEdits(snapshot,proposals)
 assert.equal(edits.length,6)
 assert.equal(applyTableEdits(edits),6)
 assert.equal(paper.querySelectorAll('table').length,1)
 assert.equal(paper.querySelector('table').rows.length,6)
 assert.equal(paper.querySelectorAll('td').length,6)
 assert.equal(paper.querySelectorAll('th').length,6)
 assert.equal(paper.querySelector('table').rows[2].cells[1].textContent,'홍길동')
 assert.equal(reportMissingFields(snapshot,edits).length,0)
})
test('Do not invent missing person or department',()=>{
 const paper=render()
 const snapshot=captureBusinessReport(paper)
 const proposals=proposeBusinessReport(snapshot,'오늘 업무보고서를 작성해 줘. 업무 내용은 신규 문서 양식 테스트야.',{today:'2026년 11월 24일'})
 assert.equal(proposals.some(p=>p.cellId===snapshot.fields[1].cellId),false)
 assert.equal(proposals.some(p=>p.cellId===snapshot.fields[2].cellId),false)
 assert.equal(proposals.some(p=>p.cellId===snapshot.fields[0].cellId),true)
})
test('Existing values are preserved and unrelated tables are ignored',()=>{
 const paper=render()
 paper.querySelectorAll('td')[2].textContent='기존 담당자'
 const extra=paper.ownerDocument.createElement('table');extra.innerHTML='<tr><td>검토</td><td>확인</td></tr>'
 paper.append(extra)
 const snapshot=captureBusinessReport(paper)
 assert.equal(snapshot.targets.length,5)
 const edits=validateTableEdits(snapshot,proposeBusinessReport(snapshot,request,{today:'2026년 11월 24일'}))
 assert.equal(applyTableEdits(edits),5)
 assert.equal(paper.querySelectorAll('td')[2].textContent,'기존 담당자')
 assert.equal(extra.innerText,'검토확인')
})
test('Report contents survive native DOCX export',async()=>{
 const paper=render()
 const snapshot=captureBusinessReport(paper)
 const edits=validateTableEdits(snapshot,proposeBusinessReport(snapshot,request,{today:'2026년 11월 24일'}))
 assert.equal(applyTableEdits(edits),6)
 const file=await exportNewDocx(paper)
 const checked=await validateDocxTables(file,paper)
 assert.equal(checked.tables,1)
 assert.equal(checked.cells,12)
 const zip=await JSZip.loadAsync(await file.arrayBuffer())
 const xml=await zip.file('word/document.xml').async('string')
 assert.match(xml,/홍길동/)
 assert.match(xml,/개발팀/)
 assert.match(xml,/업무보고서/)
})
test('Simple greeting is not a report editing request',()=>{
 assert.equal(isReportFillRequest('오늘 날씨가 어때?'),false)
 assert.equal(isReportFillRequest('업무보고서 요약해 줘'),false)
})
