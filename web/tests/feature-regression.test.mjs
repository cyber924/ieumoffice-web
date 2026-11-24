import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import JSZip from 'jszip'
import {exportNewDocx,validateDocxTables} from '../src/docx-export.js'
import {openPackage,savePackage} from '../src/formats.js'
const setup=()=>{
 const dom=new JSDOM('<!doctype html><html lang="ko"><body><article id="paper"></article></body></html>')
 globalThis.DOMParser=dom.window.DOMParser
 globalThis.XMLSerializer=dom.window.XMLSerializer
 return dom.window.document.getElementById('paper')
}
test('HWPX merged columns and rows preserve table shape',async()=>{
 const paper=setup()
 const zip=new JSZip()
 zip.file('Contents/section0.xml','<?xml version="1.0"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:p><hp:run><hp:t>사업계획서</hp:t></hp:run></hp:p><hp:p><hp:run><hp:tbl rowCnt="3" colCnt="3"><hp:tr><hp:tc><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:p><hp:run><hp:t>과제목표</hp:t></hp:run></hp:p></hp:tc><hp:tc><hp:cellAddr colAddr="1" rowAddr="0"/><hp:cellSpan colSpan="2" rowSpan="1"/><hp:p><hp:run><hp:t>정량목표</hp:t></hp:run></hp:p></hp:tc></hp:tr><hp:tr><hp:tc><hp:cellAddr colAddr="0" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="2"/><hp:p><hp:run><hp:t>병합셀</hp:t></hp:run></hp:p></hp:tc><hp:tc><hp:cellAddr colAddr="1" rowAddr="1"/><hp:p><hp:run><hp:t>내용</hp:t></hp:run></hp:p></hp:tc></hp:tr></hp:tbl></hp:run></hp:p></hs:sec>')
 const bytes=await zip.generateAsync({type:'uint8array'})
 const file={name:'plan.hwpx',arrayBuffer:async()=>bytes.buffer}
 const state=await openPackage(file)
 paper.innerHTML=state.html
 const t=paper.querySelector('table')
 assert.ok(t,'the nested HWPX table must render')
 assert.equal(t.rows.length,2)
 assert.equal(t.rows[0].cells[1].colSpan,2)
 assert.equal(t.rows[1].cells[0].rowSpan,2)
 assert.equal(paper.querySelectorAll('table').length,1)
 assert.equal(paper.innerText?.includes('사업계획서')??paper.textContent.includes('사업계획서'),true)
 const output=await savePackage(state,paper)
 assert.ok(output.size>100)
})
test('DOCX includes native DrawingML PNG and table content',async()=>{
 const paper=setup()
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gS8AAAAASUVORK5CYII='
 paper.innerHTML='<h1>신청서</h1><table><tr><td>제목</td><td>성공</td></tr></table><p><img src="data:image/png;base64,'+png+'" width="100" height="100"></p>'
 const blob=await exportNewDocx(paper)
 const zip=await JSZip.loadAsync(await blob.arrayBuffer())
 const xml=await zip.file('word/document.xml').async('string')
 assert.match(xml,/<w:tbl>/)
 assert.match(xml,/<w:drawing>/)
 assert.match(xml,/r:embed="rIdImage1"/)
 assert.ok(zip.file('word/media/image1.png'))
 assert.ok(zip.file('word/_rels/document.xml.rels'))
 assert.equal((await validateDocxTables(blob,paper)).tables,1)
})
