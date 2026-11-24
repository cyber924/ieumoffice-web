import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {captureLabeledForm,proposeLabeledForm} from '../src/form-autofill.js'
import {captureBusinessReport} from '../src/business-report.js'
import {semanticSnapshot} from '../src/document-map.js'
import {completeDraft,isUnverifiedDraft} from '../src/sample-autofill.js'
import {validateTableEdits,applyTableEdits} from '../src/table-ai.js'
import {exportNewDocx,validateDocxTables} from '../src/docx-export.js'
import JSZip from 'jszip'
function paper(labels){
 const doc=new JSDOM('<!doctype html><html><body><article id="paper"><h2>양식</h2><table><tbody>'+
 labels.map((x,i)=>'<tr><th>'+x+'</th><td>'+(i===-1?'이미 작성':'<br>')+'</td></tr>').join('')+
 '</tbody></table></article></body></html>').window.document
 globalThis.DOMParser=doc.defaultView.DOMParser
 if(!('innerText' in doc.defaultView.HTMLElement.prototype))Object.defineProperty(doc.defaultView.HTMLElement.prototype,'innerText',{get(){return this.textContent||''},set(v){this.textContent=v}})
 return doc.getElementById('paper')
}
const today='2026년 11월 24일'
const profile={department:'',assignee:''}
test('Full-draft mode prepares all six purchase approval cells with clearly sourced examples',()=>{
 const root=paper(['작성일','부서','기안자','제목','요청금액','품의 내용'])
 const s=captureLabeledForm(root)
 assert.equal(s.targets.length,6)
 const completed=completeDraft(s,[],[],{mode:'sample',today,profile,prompt:'마일로소프트 기능 개선 품의서를 작성해 줘'})
 assert.equal(completed.edits.length,6)
 assert.equal(completed.examples,6)
 assert.equal(completed.missing,0)
 const values=new Map(completed.edits.map(e=>[s.targets.find(t=>t.cellId===e.cellId).fieldKey,e.value]))
 assert.equal(values.get('date'),today)
 assert.equal(values.get('department'),'경영')
 assert.equal(values.get('author'),'홍길동')
 assert.equal(values.get('amount'),'예산 검토 필요 (예시)')
 assert.match(values.get('body'),/예시 초안/)
 assert.ok(completed.edits.every(e=>isUnverifiedDraft(e.source)))
})
test('User-provided facts override all examples and model text',()=>{
 const root=paper(['작성일','부서','기안자','제목','요청금액','품의 내용'])
 const s=captureLabeledForm(root)
 const direct=proposeLabeledForm(s,
  '1. 작성일: 2026년 11월 24일\n2. 부서: 개발팀\n3. 기안자: 김하늘\n4. 요청금액: 150,000원',
  {today})
 const ai=[{cellId:s.targets[1].cellId,value:'임의 부서'},{cellId:s.targets[3].cellId,value:'신규 운영 프로세스 정리'}]
 const completed=completeDraft(s,direct,ai,{mode:'sample',today,profile,prompt:'개발 업무 검토'})
 const value=new Map(completed.edits.map(e=>[e.cellId,e.value]))
 assert.equal(completed.edits.length,6)
 assert.equal(value.get(s.targets[1].cellId),'개발팀')
 assert.equal(value.get(s.targets[2].cellId),'김하늘')
 assert.equal(value.get(s.targets[4].cellId),'150,000원')
 assert.equal(value.get(s.targets[3].cellId),'신규 운영 프로세스 정리')
})
test('Strict mode keeps unknown fields empty',()=>{
 const root=paper(['작성일','부서','기안자','제목','요청금액','품의 내용'])
 const s=captureLabeledForm(root)
 const completed=completeDraft(s,[],[{cellId:s.targets[5].cellId,value:'업무 자동화 품질 점검'}],{mode:'strict',today,profile,prompt:'품의서 작성'})
 assert.equal(completed.edits.length,1)
 assert.equal(completed.examples,0)
 assert.equal(completed.missing,5)
})
test('AI must not invent names, money, date or approval, even in sample mode',()=>{
 const root=paper(['작성일','부서','기안자','제목','요청금액','품의 내용'])
 const s=captureLabeledForm(root)
 const generated=s.targets.map(t=>({cellId:t.cellId,value:'허위 확인 완료',source:'AI 초안'}))
 const completed=completeDraft(s,[],generated,{mode:'sample',today,profile,prompt:'품의서 작성'})
 assert.equal(completed.edits.length,6)
 const byKey=new Map(completed.edits.map(e=>[s.targets.find(t=>t.cellId===e.cellId).fieldKey,e]))
 assert.equal(byKey.get('date').value,today)
 assert.equal(byKey.get('author').value,'홍길동')
 assert.equal(byKey.get('amount').value,'예산 검토 필요 (예시)')
 assert.equal(byKey.get('body').value,'허위 확인 완료')
})
test('One-click form apply preserves all six cells and exports real DOCX',async()=>{
 const root=paper(['보고일','부서','담당자','업무 내용','진행 현황','향후 계획'])
 const snap=captureLabeledForm(root)
 const completed=completeDraft(snap,[],[],{mode:'sample',today,profile,prompt:'마일로소프트 업무보고서 작성'})
 const edits=validateTableEdits(snap,completed.edits)
 assert.equal(edits.length,6)
 assert.equal(applyTableEdits(edits),6)
 assert.equal(root.querySelectorAll('td').length,6)
 const blob=await exportNewDocx(root)
 assert.equal((await validateDocxTables(blob,root)).tables,1)
 const zip=await JSZip.loadAsync(await blob.arrayBuffer())
 const xml=await zip.file('word/document.xml').async('string')
 assert.match(xml,/홍길동/)
 assert.match(xml,/경영/)
 assert.match(xml,/2026년 11월 24일/)
})
test('Multi-table merged-cell form retains geometry while adding review placeholders',()=>{
 const root=paper(['작성일','부서','담당자','업무 내용'])
 root.insertAdjacentHTML('beforeend','<table><tr><th rowspan="2">사업목표</th><th colspan="2">정량목표</th></tr><tr><td></td><td></td></tr></table>')
 const snap=semanticSnapshot(root,{prompt:'모든 표를 작성해 줘'})
 const completed=completeDraft(snap,[],[],{mode:'sample',today,profile,prompt:'AI 문서 자동화 개선'})
 const edits=validateTableEdits(snap,completed.edits)
 assert.equal(edits.length,snap.targets.length)
 applyTableEdits(edits)
 const merge=root.querySelectorAll('table')[1]
 assert.equal(merge.rows[0].cells[0].rowSpan,2)
 assert.equal(merge.rows[0].cells[1].colSpan,2)
 assert.equal(merge.rows[1].cells.length,2)
})
test('Pre-existing form cell content cannot be overwritten',()=>{
 const root=paper(['작성일','부서','담당자','업무 내용'])
 root.querySelectorAll('td')[1].textContent='기존 부서'
 const snap=captureLabeledForm(root)
 const completed=completeDraft(snap,[],[],{mode:'sample',today,profile,prompt:'업무보고서 작성'})
 assert.equal(completed.edits.length,3)
 applyTableEdits(validateTableEdits(snap,completed.edits))
 assert.equal(root.querySelectorAll('td')[1].textContent,'기존 부서')
})

test('Previously unseen labels in a new two-column form receive review placeholders',()=>{
 const root=paper(['사업 개요','핵심 성과지표','검토 의견','서명란'])
 const snap=captureLabeledForm(root)
 assert.equal(snap.targets.length,4)
 const completed=completeDraft(snap,[],[],{mode:'sample',today,profile,prompt:'신규 사업계획서 작성'})
 assert.equal(completed.edits.length,4)
 assert.ok(completed.edits.every(e=>e.value.length>0))
 const sign=snap.targets.find(t=>t.label==='서명란')
 const value=completed.edits.find(e=>e.cellId===sign.cellId).value
 assert.match(value,/승인 전/)
})
