import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {columnLetters,mapTable,analyzeDocumentTables,annotateCoordinates,semanticSnapshot,splitSemanticBatches,isSemanticFillIntent} from '../src/document-map.js'
import {captureBusinessReport,proposeBusinessReport} from '../src/business-report.js'
import {validateTableEdits,applyTableEdits} from '../src/table-ai.js'
import {exportNewDocx,validateDocxTables} from '../src/docx-export.js'
import JSZip from 'jszip'
function setup(html){
 const dom=new JSDOM('<!doctype html><html lang="ko"><body><article id="paper" contenteditable="true">'+html+'</article></body></html>')
 globalThis.DOMParser=dom.window.DOMParser
 if(!('innerText' in dom.window.HTMLElement.prototype))Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent||''},set(s){this.textContent=s}})
 return dom.window.document.getElementById('paper')
}
test('Coordinates start at A1, support AA through AE and preserve rowspan',()=>{
 const cells=Array.from({length:31},(_,i)=>'<td'+(i===0?' rowspan="2"':'')+'>'+ (i===0?'일정':'')+'</td>')
 const paper=setup('<table><tr>'+cells.join('')+'</tr><tr><td>2행</td></tr></table>')
 assert.equal(columnLetters(0),'A')
 assert.equal(columnLetters(25),'Z')
 assert.equal(columnLetters(26),'AA')
 assert.equal(columnLetters(30),'AE')
 const t=mapTable(paper.querySelector('table'),0)
 assert.equal(t.columns,31)
 assert.equal(t.cells[0].address,'표1!A1')
 assert.equal(t.cells[30].address,'표1!AE1')
 assert.equal(t.cells[31].address,'표1!B2')
 assert.equal(t.grid.get('1:0'),t.cells[0])
})
test('A1 and merged cells survive HWP logical coordinates',()=>{
 const paper=setup('<h2>사업계획서</h2><table><tr><td rowspan="4" data-hwp-col="0">과제목표</td><td colspan="2" data-hwp-col="1">정량목표</td><td data-hwp-col="3">비고</td></tr>'+
  '<tr><td data-hwp-col="1"></td><td data-hwp-col="2"></td><td data-hwp-col="3"></td></tr>'+
  '<tr><td data-hwp-col="1"></td><td data-hwp-col="2"></td><td data-hwp-col="3"></td></tr>'+
  '<tr><td data-hwp-col="1"></td><td data-hwp-col="2"></td><td data-hwp-col="3"></td></tr></table>')
 const snapshot=semanticSnapshot(paper,{prompt:'사업계획서 빈칸 채워 줘'})
 assert.equal(snapshot.totalTables,1)
 assert.equal(snapshot.targets.some(t=>t.address==='표1!B2'),true)
 assert.equal(snapshot.targets.some(t=>t.address==='표1!D4'),true)
 assert.equal(new Set(snapshot.targets.map(x=>x.cellId)).size,snapshot.targets.length)
 const map=annotateCoordinates(paper,{show:true,highlight:true})
 assert.equal(map.tables.length,1)
 assert.equal(paper.querySelectorAll('[data-cell-address]').length,12)
 assert.equal(paper.classList.contains('show-cell-addresses'),true)
 assert.equal(paper.querySelector('td').dataset.cellAddress,'표1!A1')
})
test('Semantic one-command request reaches all separate report and business forms',()=>{
 const report=['보고일','부서','담당자','업무 내용','진행 현황','향후 계획'].map(k=>'<tr><th>'+k+'</th><td></td></tr>').join('')
 const business='<table><tr><th>목표</th><th>계획</th></tr><tr><th>추진내용</th><td></td></tr></table>'
 const paper=setup('<h2>업무보고서</h2><table>'+report+'</table><h2>사업계획서</h2>'+business)
 const snapshot=semanticSnapshot(paper,{prompt:'문서 전체 빈칸을 작성해 줘'})
 assert.equal(snapshot.totalTables,2)
 assert.ok(snapshot.targets.some(t=>t.table===1))
 assert.ok(snapshot.targets.some(t=>t.table===2))
 assert.ok(snapshot.targets.some(t=>t.rowLabel==='추진내용'))
 const chunks=splitSemanticBatches(snapshot.targets,3)
 assert.equal(chunks.flat().length,snapshot.targets.length)
 assert.equal(isSemanticFillIntent('업무 관련 문서 전체 작성해 줘'),true)
 assert.equal(isSemanticFillIntent('작성한 문서를 검사해 줘'),false)
})
test('Many monthly grid cells do not hide later tables',()=>{
 const wide='<table><tr>'+Array.from({length:31},(_,i)=>'<th>'+(i+1)+'</th>').join('')+'</tr>'+
  Array.from({length:8},()=>'<tr>'+Array.from({length:31},()=>'<td></td>').join('')+'</tr>').join('')+'</table>'
 const other='<table><tr><th>업무</th><th>내용</th></tr><tr><th>추진계획</th><td></td></tr></table>'
 const paper=setup(wide+other)
 const snapshot=semanticSnapshot(paper,{prompt:'양식 전체 채워 줘',maxTargets:96})
 assert.equal(snapshot.totalTables,2)
 assert.equal(snapshot.targets.length,96)
 assert.equal(snapshot.targets.some(t=>t.table===2),true)
 assert.equal(snapshot.excluded>0,true)
 assert.equal(splitSemanticBatches(snapshot.targets,24).length,4)
})
test('Annotation never writes visible address text into DOCX',async()=>{
 const paper=setup('<table><tr><th>항목</th><th>내용</th></tr><tr><td>계획</td><td></td></tr></table>')
 annotateCoordinates(paper,{show:true,highlight:true})
 const snapshot=semanticSnapshot(paper,{prompt:'계획 작성해 줘'})
 assert.equal(snapshot.targets.length,1)
 const edits=validateTableEdits(snapshot,[{cellId:snapshot.targets[0].cellId,value:'일정 검증'}])
 assert.equal(applyTableEdits(edits),1)
 const file=await exportNewDocx(paper)
 assert.equal((await validateDocxTables(file,paper)).tables,1)
 const zip=await JSZip.loadAsync(await file.arrayBuffer())
 const xml=await zip.file('word/document.xml').async('string')
 assert.match(xml,/일정 검증/)
 assert.equal(xml.includes('표1!B2'),false)
})
test('Existing six-field report keeps one-shot field matching',()=>{
 const labels=['보고일','부서','담당자','업무 내용','진행 현황','향후 계획']
 const paper=setup('<table>'+labels.map(l=>'<tr><th>'+l+'</th><td></td></tr>').join('')+'</table>')
 annotateCoordinates(paper)
 const report=captureBusinessReport(paper)
 assert.ok(report?.recognized)
 assert.equal(report.targets.length,6)
 const prompt='오늘 날짜로 개발팀 업무보고서를 작성해 줘. 담당자는 홍길동이고, 오늘 업무는 AI 한글 문서의 표 자동입력 기능 개발과 테스트야. 현재 표 셀 인식 문제를 수정하고 있으며, 앞으로 자동입력 검증과 DOCX/HWPX 호환성 테스트를 진행할 계획이야.'
 const proposals=proposeBusinessReport(report,prompt,{today:'2026년 11월 24일'})
 assert.equal(proposals.length,6)
})
