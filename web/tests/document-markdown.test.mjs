import test from 'node:test'
import assert from 'node:assert/strict'
import {markdownToDocumentHtml} from '../src/document-markdown.js'
test('AI headings, emphasis and table become editable document structure',()=>{
 const html=markdownToDocumentHtml('### 업무 보고\n\n**목적**을 확인합니다.\n\n| 항목 | 내용 |\n| --- | --- |\n| 담당자 | 홍길동 |')
 assert.match(html,/<h3>업무 보고<\/h3>/)
 assert.match(html,/<strong>목적<\/strong>/)
 assert.match(html,/<table><thead><tr><th>항목<\/th><th>내용<\/th>/)
 assert.match(html,/<td>담당자<\/td><td>홍길동<\/td>/)
 assert.doesNotMatch(html,/###|\*\*/)
})
test('untrusted HTML cannot execute and escaped table pipes stay in cells',()=>{
 const html=markdownToDocumentHtml('| 항목 | 내용 |\n| --- | --- |\n| a\\|b | <img src=x onerror=alert(1)> |')
 assert.match(html,/a\|b/)
 assert.match(html,/&lt;img/)
 assert.doesNotMatch(html,/<img/)
})
test('generated table remains a native table in Word export',async()=>{
 const {JSDOM}=await import('jsdom')
 const {default:JSZip}=await import('jszip')
 const {exportNewDocx,validateDocxTables}=await import('../src/docx-export.js')
 const dom=new JSDOM('<article id="paper"></article>')
 globalThis.DOMParser=dom.window.DOMParser
 const paper=dom.window.document.getElementById('paper')
 paper.innerHTML=markdownToDocumentHtml('### 업무 보고\n\n| 항목 | 내용 |\n| --- | --- |\n| 담당자 | 홍길동 |')
 const blob=await exportNewDocx(paper)
 assert.deepEqual(await validateDocxTables(blob,paper),{tables:1,cells:4})
 const zip=await JSZip.loadAsync(await blob.arrayBuffer())
 const xml=await zip.file('word/document.xml').async('string')
 assert.match(xml,/<w:tbl>/)
 assert.match(xml,/홍길동/)
})
