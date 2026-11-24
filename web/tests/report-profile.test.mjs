import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {captureBusinessReport} from '../src/business-report.js'
import {reportToday,readReportProfile,saveReportProfile,proposeReportDefaults,missingReportProfileFields} from '../src/report-profile.js'
import {validateTableEdits,applyTableEdits} from '../src/table-ai.js'
import {exportNewDocx,validateDocxTables} from '../src/docx-export.js'
import JSZip from 'jszip'
function fixture(){
 const dom=new JSDOM('<!doctype html><html><body><article id="paper"><h2>업무보고서</h2><table><tbody>'+
 ['보고일','부서','담당자','업무 내용','진행 현황','향후 계획'].map(k=>'<tr><th>'+k+'</th><td><br></td></tr>').join('')+
 '</tbody></table></article></body></html>')
 globalThis.DOMParser=dom.window.DOMParser
 if(!('innerText' in dom.window.HTMLElement.prototype))Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent||''},set(v){this.textContent=v}})
 return dom.window.document.querySelector('#paper')
}
const store=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}}
test('Seoul date is used across UTC calendar boundary',()=>{
 assert.equal(reportToday(new Date('2026-11-23T16:00:00Z')),'2026년 11월 24일')
})
test('Profile is scoped by user uid and email is never treated as person name',()=>{
 const storage=store()
 const a={uid:'alpha',email:'alpha@example.com',displayName:null},b={uid:'beta',email:'beta@example.com'}
 saveReportProfile(a,{department:'개발팀',assignee:'홍길동'},storage)
 assert.deepEqual(readReportProfile(a,storage),{department:'개발팀',assignee:'홍길동'})
 assert.deepEqual(readReportProfile(b,storage),{department:'',assignee:''})
 assert.deepEqual(readReportProfile({uid:'gamma',email:'gamma@example.com'},storage),{department:'',assignee:''})
})
test('Generic prompt adds date and configured profile; generated work fields complete six in one approved batch',()=>{
 const paper=fixture(),snapshot=captureBusinessReport(paper)
 const prompt='마일로소프트 AI 문서 자동화 SaaS 사업을 주제로 업무보고서 작성해 줘'
 const direct=proposeReportDefaults(snapshot,prompt,{today:'2026년 11월 24일',profile:{department:'개발팀',assignee:'홍길동'}})
 assert.equal(direct.length,3)
 const values=[
 ['work','AI 문서 자동화 SaaS 핵심 기능 개선'],
 ['progress','표 자동입력과 한글 양식 호환성 점검 진행'],
 ['plan','프로토타입 안정화 및 테스트 확대']
 ]
 const targets=new Map(snapshot.targets.map(t=>[t.fieldKey,t]))
 const others=values.map(([k,value])=>({cellId:targets.get(k).cellId,value}))
 const edits=validateTableEdits(snapshot,[...direct,...others])
 assert.equal(edits.length,6)
 assert.equal(applyTableEdits(edits),6)
 assert.equal(paper.querySelector('table').rows[0].cells[1].textContent,'2026년 11월 24일')
 assert.equal(paper.querySelector('table').rows[1].cells[1].textContent,'개발팀')
 assert.equal(paper.querySelector('table').rows[2].cells[1].textContent,'홍길동')
 assert.equal(paper.querySelectorAll('td').length,6)
})
test('When profile is absent, never fabricate identity and show missing items',()=>{
 const paper=fixture(),snapshot=captureBusinessReport(paper)
 const direct=proposeReportDefaults(snapshot,'업무보고서 작성해 줘',{today:'2026년 11월 24일',profile:{department:'',assignee:''}})
 assert.equal(direct.length,1)
 assert.deepEqual(missingReportProfileFields(snapshot,direct),['부서','담당자'])
})
test('Do not override existing cells or explicit date/name requests',()=>{
 const paper=fixture()
 paper.querySelectorAll('td')[2].textContent='이미 입력한 담당자'
 const snapshot=captureBusinessReport(paper)
 const proposals=proposeReportDefaults(snapshot,'보고일은 2026년 11월 20일, 부서는 기획팀, 담당자는 김철수. 업무보고서 작성해 줘',{today:'2026년 11월 24일',profile:{department:'개발팀',assignee:'홍길동'}})
 const edits=validateTableEdits(snapshot,proposals)
 assert.equal(edits.some(e=>e.label==='담당자'),false)
 const date=edits.find(e=>e.label==='보고일')
 assert.equal(date.value,'2026년 11월 20일')
 assert.equal(edits.find(e=>e.label==='부서').value,'기획팀')
})
test('Prepared report saves real table and Korean text to DOCX',async()=>{
 const paper=fixture(),snapshot=captureBusinessReport(paper)
 const values=proposeReportDefaults(snapshot,'업무보고서 작성해 줘',{today:'2026년 11월 24일',profile:{department:'개발팀',assignee:'홍길동'}})
 const edits=validateTableEdits(snapshot,values)
 applyTableEdits(edits)
 const blob=await exportNewDocx(paper)
 assert.equal((await validateDocxTables(blob,paper)).tables,1)
 const zip=await JSZip.loadAsync(await blob.arrayBuffer())
 const xml=await zip.file('word/document.xml').async('string')
 assert.match(xml,/2026년 11월 24일/)
 assert.match(xml,/홍길동/)
 assert.match(xml,/<w:tbl>/)
})
