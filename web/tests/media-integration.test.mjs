import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import JSZip from 'jszip'
import {installMediaTools,shapeSvg,CHARACTER_PALETTE,DOCUMENT_FONTS} from '../src/media-tools.js'
import {exportNewDocx,validateDocxTables} from '../src/docx-export.js'
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gS8AAAAASUVORK5CYII='
function setup(html='<p>편집할 한국어 글자</p><p>여기에 입력</p>'){
 const dom=new JSDOM('<!doctype html><html><body><section class="milosoft-ribbon"></section><article id="paper" contenteditable="true">'+html+'</article></body></html>',{url:'https://localhost/'})
 const {window}=dom
 globalThis.document=window.document
 globalThis.window=window
 globalThis.DOMParser=window.DOMParser
 globalThis.XMLSerializer=window.XMLSerializer
 globalThis.Image=window.Image
 globalThis.getSelection=()=>window.getSelection()
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true}
 window.HTMLDialogElement.prototype.close=function(){this.open=false}
 return {paper:window.document.getElementById('paper'),window,document:window.document}
}
const focus=(window,node,start=0,end=start)=>{
 const range=window.document.createRange()
 range.setStart(node,start)
 range.setEnd(node,end)
 const sel=window.getSelection()
 sel.removeAllRanges();sel.addRange(range)
 window.document.dispatchEvent(new window.Event('selectionchange'))
}
test('character palette inserts Unicode in saved editor caret position',async()=>{
 const {paper,window,document}=setup()
 let changes=0
 const media=installMediaTools({paper,isImported:()=>false,markDirty:()=>changes++,toast:()=>{}})
 const text=paper.querySelector('p').firstChild
 focus(window,text,3,3)
 media.open('symbol')
 const selected=Array.from(document.querySelectorAll('.media-dialog .symbol-grid button')).find(n=>n.textContent==='㎡')
 assert.ok(selected)
 selected.click()
 assert.ok(paper.textContent.includes('㎡'))
 assert.equal(changes,1)
 assert.ok(Array.from(Object.values(CHARACTER_PALETTE)).some(v=>v.includes('㎡')))
})
test('font selector preserves selection and writes an inline font marker',async()=>{
 const {paper,window,document}=setup()
 let changes=0
 const media=installMediaTools({paper,isImported:()=>false,markDirty:()=>changes++,toast:()=>{}})
 const text=paper.querySelector('p').firstChild
 focus(window,text,0,3)
 media.open('font')
 const button=Array.from(document.querySelectorAll('.media-dialog .media-grid button')).find(n=>n.textContent==='Noto Serif KR')
 assert.ok(button)
 button.click()
 const span=paper.querySelector('span')
 assert.ok(span)
 assert.equal(span.style.fontFamily,'Noto Serif KR')
 assert.equal(span.textContent,'편집할')
 assert.equal(changes,1)
 assert.equal(DOCUMENT_FONTS.length,7)
})
test('imported HWPX Unicode insertion does not require conversion; fonts request copy',async()=>{
 const {paper,window,document}=setup('<table><tr><td data-bind="x">한글 문장</td></tr></table>')
 let conversions=0,edits=0
 const media=installMediaTools({paper,isImported:()=>true,convertToDocxCopy:()=>{conversions++;return true},markDirty:()=>edits++,toast:()=>{}})
 focus(window,paper.querySelector('td').firstChild,2,2)
 media.open('symbol')
 document.querySelector('.media-dialog .symbol-grid button').click()
 assert.equal(conversions,0)
 assert.equal(edits,1)
 media.open('font')
 assert.equal(conversions,1)
})
test('DOCX exports table, Korean symbols, font run, and PNG shape drawing',async()=>{
 const {paper}=setup('<p><span style="font-family:Noto Serif KR">문서 제목 ㎡</span></p><table><tr><td>항목</td><td>내용</td></tr></table><p><img src="data:image/png;base64,'+png+'" alt="도형" width="230" height="90"></p>')
 const blob=await exportNewDocx(paper)
 const zip=await JSZip.loadAsync(await blob.arrayBuffer())
 const xml=await zip.file('word/document.xml').async('string')
 assert.match(xml,/Noto Serif KR/)
 assert.match(xml,/㎡/)
 assert.match(xml,/<w:tbl>/)
 assert.match(xml,/<w:drawing>/)
 assert.match(xml,/r:embed="rIdImage1"/)
 assert.ok(zip.file('word/media/image1.png'))
 assert.ok(zip.file('word/_rels/document.xml.rels'))
 assert.equal((await validateDocxTables(blob,paper)).tables,1)
})
test('shape choices produce distinct SVG primitives',()=>{
 assert.match(shapeSvg('triangle'),/<polygon/)
 assert.match(shapeSvg('ellipse'),/<ellipse/)
 assert.match(shapeSvg('rect'),/<rect/)
 assert.match(shapeSvg('arrow'),/<polygon/)
 assert.match(shapeSvg('line'),/<path/)
})
