import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {captureLabeledForm,extractLabeledValues,proposeLabeledForm,formRemaining} from '../src/form-autofill.js'
import {validateTableEdits,applyTableEdits} from '../src/table-ai.js'
import {exportNewDocx,validateDocxTables} from '../src/docx-export.js'
import JSZip from 'jszip'
const prompt=[
'현재 열려 있는 품의서의 빈칸 6개를 한 번에 채워 줘.',
'1. **작성일:** 오늘 날짜인 2026년 11월 24일',
'2. **부서:** 개발팀',
'3. **기안자:** 홍길동',
'4. **제목:** 마일로소프트 AI 문서 자동화 SaaS 기능 고도화 및 품질 검증 추진 품의',
'5. **요청금액:** 금액 미확정 (예산 검토 필요)',
'6. **품의 내용:** 마일로소프트의 HWPX·DOCX 양식 분석, 셀 좌표 자동 생성, AI 문서 자동 작성 및 Firebase 저장 기능을 개선한다.',
'기존 표 구조, 병합 및 테두리는 유지하고 모두 미리보기로 보여줘.'
].join('\n')
function setup(){
 const dom=new JSDOM('<!doctype html><html lang="ko"><body><article id="paper"><h2>품의서</h2><table><tbody>'+
  ['작성일','부서','기안자','제목','요청금액','품의 내용'].map(n=>'<tr><th>'+n+'</th><td><br></td></tr>').join('')+
  '</tbody></table></article></body></html>')
 globalThis.DOMParser=dom.window.DOMParser
 if(!('innerText' in dom.window.HTMLElement.prototype))Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent||''},set(v){this.textContent=v}})
 return dom.window.document.getElementById('paper')
}
test('Six marked-down procurement fields parsed with labels and without markdown',()=>{
 const paper=setup()
 const snap=captureLabeledForm(paper)
 assert.equal(snap.recognized,true)
 assert.equal(snap.targets.length,6)
 const values=extractLabeledValues(prompt,{today:'2026년 11월 24일'})
 assert.equal(values.get('date'),'2026년 11월 24일')
 assert.equal(values.get('department'),'개발팀')
 assert.equal(values.get('author'),'홍길동')
 assert.equal(values.get('amount'),'금액 미확정 (예산 검토 필요)')
 assert.match(values.get('title'),/마일로소프트/)
 assert.match(values.get('body'),/HWPX/)
 const edits=validateTableEdits(snap,proposeLabeledForm(snap,prompt,{today:'2026년 11월 24일'}))
 assert.equal(edits.length,6)
 assert.equal(applyTableEdits(edits),6)
 assert.equal(formRemaining(snap,edits).length,0)
 assert.equal(paper.querySelector('table').rows.length,6)
 assert.equal(paper.querySelector('table').rows[0].cells[1].textContent,'2026년 11월 24일')
})
test('Unknown money and personal data remain blank',()=>{
 const paper=setup(),snap=captureLabeledForm(paper)
 const request='마일로소프트 SaaS를 위한 품의서를 자동으로 작성해 줘. 오늘 기준으로 생성해 줘.'
 const edits=proposeLabeledForm(snap,request,{today:'2026년 11월 24일'})
 assert.deepEqual(edits.map(e=>e.cellId),[snap.targets[0].cellId])
 assert.equal(formRemaining(snap,edits).length,5)
})
test('Already-filled values are preserved',()=>{
 const paper=setup()
 paper.querySelector('table').rows[2].cells[1].textContent='기존 기안자'
 const snap=captureLabeledForm(paper)
 const edits=validateTableEdits(snap,proposeLabeledForm(snap,prompt,{today:'2026년 11월 24일'}))
 assert.equal(edits.length,5)
 applyTableEdits(edits)
 assert.equal(paper.querySelector('table').rows[2].cells[1].textContent,'기존 기안자')
})
test('DOCX exports all six cells and keeps the original table',async()=>{
 const paper=setup(),snap=captureLabeledForm(paper)
 applyTableEdits(validateTableEdits(snap,proposeLabeledForm(snap,prompt,{today:'2026년 11월 24일'})))
 const blob=await exportNewDocx(paper)
 assert.equal((await validateDocxTables(blob,paper)).tables,1)
 const zip=await JSZip.loadAsync(await blob.arrayBuffer())
 const xml=await zip.file('word/document.xml').async('string')
 assert.match(xml,/홍길동/)
 assert.match(xml,/개발팀/)
 assert.match(xml,/미확정/)
 assert.match(xml,/품의/)
})
test('Generic label mapping works for an application',()=>{
 const paper=setup()
 paper.querySelector('table').rows[0].cells[0].textContent='신청일'
 paper.querySelector('table').rows[2].cells[0].textContent='신청자'
 paper.querySelector('table').rows[5].cells[0].textContent='신청 내용'
 const snap=captureLabeledForm(paper)
 assert.equal(snap.targets.length,6)
 assert.equal(snap.targets[0].fieldKey,'date')
 assert.equal(snap.targets[2].fieldKey,'author')
 assert.equal(snap.targets[5].fieldKey,'body')
})
