import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import JSZip from 'jszip'
import {analyzeDocumentDesign,validateDesignPlan,applyDocumentDesign,designPreview} from '../src/document-design.js'
import {describeTemplate,verifyTemplate,saveTemplateLocal,loadTemplateLocal,templateFingerprint,templateStructure} from '../src/template-memory.js'
import {exportNewDocx,validateDocxTables} from '../src/docx-export.js'
const html='<h1>업무보고서</h1><p>1. 추진 목적</p><p>품질을 개선하는 업무입니다.</p><table><tbody>'+
  '<tr><th rowspan="2">과제목표</th><th>정량목표</th><th>비고</th></tr>'+
  '<tr><td>1. 문서 자동작성 고도화 2. 품질 검증 추진</td><td></td></tr>'+
  '</tbody></table>'
function make(content=html){
 const document=new JSDOM('<!doctype html><html lang="ko"><body><article id="paper">'+content+'</article></body></html>').window.document
 globalThis.DOMParser=document.defaultView.DOMParser
 if(!('innerText' in document.defaultView.HTMLElement.prototype))Object.defineProperty(document.defaultView.HTMLElement.prototype,'innerText',{get(){return this.textContent||''},set(v){this.textContent=v}})
 return document.getElementById('paper')
}
function localStore(){
 const data=new Map()
 return{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}
}
test('AI plan classification never modifies any text before approval',()=>{
 const paper=make()
 const before=paper.innerHTML
 const analysis=analyzeDocumentDesign(paper)
 assert.equal(analysis.tables,1)
 assert.ok(analysis.roles.find(r=>r.role==='title'))
 assert.ok(analysis.roles.find(r=>r.role==='section'))
 const proposed={preset:'classic',roles:[{index:1,role:'section'},{index:2,role:'body'},{index:999,role:'title'},{index:1,role:'malicious'}]}
 const checked=validateDesignPlan(paper,proposed)
 assert.equal(checked.roles.length,3)
 assert.equal(checked.roles[1].role,'section')
 assert.deepEqual(designPreview(paper,checked).preset,'classic')
 assert.equal(paper.innerHTML,before)
})
test('Applying design keeps table structure and creates separate numbered paragraphs',async()=>{
 const paper=make()
 const table=paper.querySelector('table'),oldRows=table.rows.length
 const style=applyDocumentDesign(paper,{preset:'modern',roles:[{index:0,role:'title'},{index:1,role:'section'},{index:2,role:'body'}]})
 assert.equal(style.tables,1)
 assert.equal(table.rows.length,oldRows)
 assert.equal(table.rows[0].cells[0].rowSpan,2)
 assert.equal(table.rows[0].cells[0].textContent,'과제목표')
 assert.equal(paper.querySelector('h1').textContent,'업무보고서')
 const parts=table.rows[1].cells[0].querySelectorAll('p')
 assert.equal(parts.length,2)
 assert.match(parts[0].textContent,/자동작성/)
 assert.match(parts[1].textContent,/품질 검증/)
 const docx=await exportNewDocx(paper)
 const check=await validateDocxTables(docx,paper)
 assert.equal(check.tables,1)
 const zip=await JSZip.loadAsync(await docx.arrayBuffer())
 const xml=await zip.file('word/document.xml').async('string')
 assert.match(xml,/<w:tbl>/)
 assert.match(xml,/품질 검증 추진/)
 assert.match(xml,/<w:vMerge/)
})
test('Template structure remains identical when values in right-side cells change',()=>{
 const paper=make('<h1>품의서</h1><table><tr><th>작성일</th><td></td></tr><tr><th>부서</th><td></td></tr><tr><th>담당자</th><td></td></tr></table>')
 const record=describeTemplate(paper,{title:'품의서'})
 paper.querySelectorAll('td')[0].textContent='2026년 11월 24일'
 paper.querySelectorAll('td')[1].textContent='경영'
 paper.querySelectorAll('td')[2].textContent='홍길동'
 assert.equal(verifyTemplate(record,paper),true)
 const changed=describeTemplate(paper,{title:'새로 작성한 품의서'})
 assert.equal(changed.id,record.id)
 assert.equal(changed.canonical,record.canonical)
 assert.equal(changed.title,'새로 작성한 품의서')
})
test("Template memory is scoped by uid and does not include user's filled content",()=>{
 const paper=make('<table><tr><th>제목</th><td>비공개 회사 운영계획</td></tr><tr><th>작성자</th><td>이름</td></tr><tr><th>작성일</th><td>2026.11.24</td></tr></table>')
 const template=describeTemplate(paper,{title:'업무용 서식'})
 assert.equal(template.canonical.includes('비공개 회사 운영계획'),false)
 assert.equal(template.canonical.includes('2026.11.24'),false)
 const store=localStore()
 saveTemplateLocal('user1',template,store)
 assert.equal(loadTemplateLocal('user2',template.id,store),null)
 const recovered=loadTemplateLocal('user1',template.id,store)
 assert.equal(recovered.canonical,template.canonical)
 assert.equal(verifyTemplate(recovered,paper),true)
})
test('Changed labels or altered merged geometry invalidate remembered template',()=>{
 const paper=make()
 const original=describeTemplate(paper)
 assert.equal(verifyTemplate(original,paper),true)
 paper.querySelector('th').textContent='다른 과제'
 assert.equal(verifyTemplate(original,paper),false)
 assert.notEqual(describeTemplate(paper).id,original.id)
 paper.querySelector('th').textContent='과제목표'
 paper.querySelector('th').rowSpan=1
 assert.equal(verifyTemplate(original,paper),false)
})
test('Fingerprint does not depend on document title or values',()=>{
 const a=make('<table><tr><th>작성일</th><td></td></tr><tr><th>부서</th><td></td></tr></table>')
 const b=make('<table><tr><th>작성일</th><td>오늘</td></tr><tr><th>부서</th><td>경영</td></tr></table>')
 assert.equal(templateFingerprint(templateStructure(a)),templateFingerprint(templateStructure(b)))
})
