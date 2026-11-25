import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import {JSDOM} from 'jsdom'
import {exportNewDocx,validateDocxTables} from '../src/docx-export.js'
function fixture(html){
 const dom=new JSDOM('<!doctype html><html><body><article id="paper">'+html+'</article></body></html>')
 globalThis.DOMParser=dom.window.DOMParser
 return dom.window.document.getElementById('paper')
}
test('pasted nested table is serialized as a real Word table, not free text',async()=>{
 const paper=fixture('<div><p>계약서</p><div class="import"><table><tbody><tr><th>항목</th><th>내용</th></tr><tr><td>제목</td><td>AI 자동입력</td></tr><tr><td>담당자</td><td>홍길동</td></tr></tbody></table></div><p>끝 문단</p></div>')
 const blob=await exportNewDocx(paper)
 const zip=await JSZip.loadAsync(await blob.arrayBuffer())
 const xml=await zip.file('word/document.xml').async('string')
 assert.equal((xml.match(/<w:tbl>/g)||[]).length,1)
 assert.equal((xml.match(/<w:tr>/g)||[]).length,3)
 assert.equal((xml.match(/<w:tc>/g)||[]).length,6)
 assert.ok(xml.includes('AI 자동입력'))
 assert.ok(xml.includes('홍길동'))
 assert.ok(xml.indexOf('<w:tbl>')<xml.indexOf('끝 문단'))
 assert.deepEqual(await validateDocxTables(blob,paper),{tables:1,cells:6})
})
test('two tables, colspan and rowspans remain native OOXML table structures',async()=>{
 const paper=fixture('<table><tr><td colspan="2">병합</td></tr><tr><td>왼쪽</td><td>오른쪽</td></tr></table><div><table><tr><td rowspan="2">고정</td><td>1행</td></tr><tr><td>2행</td></tr></table></div>')
 const blob=await exportNewDocx(paper)
 const zip=await JSZip.loadAsync(await blob.arrayBuffer())
 const xml=await zip.file('word/document.xml').async('string')
 assert.equal((xml.match(/<w:tbl>/g)||[]).length,2)
 assert.match(xml,/<w:gridSpan w:val="2"/)
 assert.match(xml,/<w:vMerge w:val="restart"/)
 assert.deepEqual(await validateDocxTables(blob,paper),{tables:2,cells:6})
})
test('new-document A4 page and Korean text survive zip',async()=>{
 const paper=fixture('<h1>주간업무회의</h1><p>작성자 홍길동</p><table><tr><td>작성일</td><td>2026년 11월 24일</td></tr></table>')
 const blob=await exportNewDocx(paper)
 const zip=await JSZip.loadAsync(await blob.arrayBuffer())
 const xml=await zip.file('word/document.xml').async('string')
 assert.match(xml,/주간업무회의/)
 assert.match(xml,/w:pgSz w:w="11906" w:h="16838"/)
 assert.equal((xml.match(/<w:tbl>/g)||[]).length,1)
 assert.ok(blob.size>1000)
})
test('center-aligned table cell retains its image in DOCX',async()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lFZ0AAAAASUVORK5CYII='
 const paper=fixture('<table><tr><td style="text-align:center"><p>사진</p><img src="data:image/png;base64,'+png+'" width="100" height="100"></td></tr></table>')
 const blob=await exportNewDocx(paper),zip=await JSZip.loadAsync(await blob.arrayBuffer()),xml=await zip.file('word/document.xml').async('string')
 assert.match(xml,/<w:drawing>/);assert.ok(zip.file('word/media/image1.png'))
})
test('unsupported images fail rather than silently disappear',async()=>{
 await assert.rejects(exportNewDocx(fixture('<p><img src="https://example.invalid/image.png"></p>')),/그림을 Word에 저장할 수 없습니다/)
})
test('explicit column widths and row height survive DOCX export',async()=>{
 const paper=fixture('<table><colgroup><col style="width:30%"><col style="width:70%"></colgroup><tr style="height:40px"><td>항목</td><td>내용</td></tr></table>')
 const blob=await exportNewDocx(paper),zip=await JSZip.loadAsync(await blob.arrayBuffer()),xml=await zip.file('word/document.xml').async('string')
 assert.match(xml,/<w:gridCol w:w="2700"\/>/);assert.match(xml,/<w:gridCol w:w="6300"\/>/);assert.match(xml,/<w:trHeight w:val="600" w:hRule="atLeast"\/>/)
})
