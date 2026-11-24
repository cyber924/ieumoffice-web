import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
import JSZip from 'jszip'
import init,{HwpDocument} from '../../vendor/rhwp-core/rhwp.js'
import {exportHwpx} from '../src/hwpx-export.js'
let started
async function load(){if(!started)started=init({module_or_path:await readFile(new URL('../../vendor/rhwp-core/rhwp_bg.wasm',import.meta.url))});await started;return {HwpDocument}}
function paper(html){const dom=new JSDOM('<article>'+html+'</article>');globalThis.DOMParser=dom.window.DOMParser;return dom.window.document.querySelector('article')}
test('new HWPX reopens with Korean text and native table',async()=>{
 const blob=await exportHwpx(paper('<h1>업무 보고서</h1><p>안녕하세요</p><table><tr><th>항목</th><th>내용</th></tr><tr><td>담당자</td><td>홍길동</td></tr></table><p>끝</p>'),load)
 const bytes=new Uint8Array(await blob.arrayBuffer());const reopened=new HwpDocument(bytes);assert.ok(reopened.pageCount()>0);reopened.free()
 const zip=await JSZip.loadAsync(bytes);const xml=await zip.file('Contents/section0.xml').async('string')
 assert.match(xml,/<hp:tbl\b/);assert.match(xml,/홍길동/)
 const header=await zip.file('Contents/header.xml').async('string')
 const ids=[...xml.matchAll(/<hp:tc\b[^>]*borderFillIDRef="(\d+)"/g)].map(x=>x[1])
 assert.equal(ids.length,4)
 for(const id of ids){const b=header.match(new RegExp('<hh:borderFill\\b[^>]*\\bid="'+id+'"[^>]*>[\\s\\S]*?</hh:borderFill>'))?.[0]||'';for(const side of ['left','right','top','bottom'])assert.match(b,new RegExp('<hh:'+side+'Border[^>]*type="SOLID"'))}

})
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lFZ0AAAAASUVORK5CYII='
test('images in body and table cells are embedded as native HWPX pictures',async()=>{
 const blob=await exportHwpx(paper('<p>앞<img width="100" height="50" src="'+png+'">뒤</p><table><tr><td>셀<img width="50" height="50" src="'+png+'">끝</td></tr></table>'),load)
 const zip=await JSZip.loadAsync(await blob.arrayBuffer()),xml=await zip.file('Contents/section0.xml').async('string')
 assert.equal((xml.match(/<hp:pic\b/g)||[]).length,2)
 assert.ok(Object.keys(zip.files).some(name=>/^BinData\//.test(name)))
 assert.match(xml,/앞/);assert.match(xml,/끝/)
 const header=await zip.file('Contents/header.xml').async('string')
 for(const b of header.match(/<hh:borderFill\b[^>]*>[\s\S]*?<\/hh:borderFill>/g)||[])assert.match(b,/<hh:diagonal\b/)
})
test('inaccessible images fail rather than silently disappearing',async()=>{
 await assert.rejects(exportHwpx(paper('<p>본문</p><img src="bad-url">'),load),/이미지를 읽지 못해/)
})
test('borderless imported HWPX cells gain black borders without changing text',async()=>{
 const {ensureHwpxTableBorders}=await import('../src/hwpx-borders.js')
 const dom=new JSDOM();globalThis.DOMParser=dom.window.DOMParser;globalThis.XMLSerializer=dom.window.XMLSerializer
 await load();const doc=HwpDocument.createEmpty();doc.createBlankDocument();doc.pasteHtml(0,0,0,'<table><tr><td>항목</td><td>내용</td></tr><tr><td>담당자</td><td>홍길동</td></tr></table>');const input=doc.exportHwpx();doc.free()
 const output=await ensureHwpxTableBorders(new Blob([input]));const bytes=new Uint8Array(await output.arrayBuffer());const reopened=new HwpDocument(bytes);assert.ok(reopened.pageCount());reopened.free()
 const zip=await JSZip.loadAsync(bytes),header=await zip.file('Contents/header.xml').async('string'),section=await zip.file('Contents/section0.xml').async('string')
 const parser=new DOMParser(),hd=parser.parseFromString(header,'application/xml'),sd=parser.parseFromString(section,'application/xml')
 const styles=Array.from(hd.getElementsByTagNameNS('*','borderFill'));const cells=Array.from(sd.getElementsByTagNameNS('*','tc'));assert.equal(cells.length,4)
 for(const cell of cells){const style=styles.find(x=>x.getAttribute('id')===cell.getAttribute('borderFillIDRef'));for(const name of ['leftBorder','rightBorder','topBorder','bottomBorder']){const side=style.getElementsByTagNameNS('*',name)[0];assert.equal(side.getAttribute('type'),'SOLID');assert.equal(side.getAttribute('color'),'#000000');assert.equal(side.getAttribute('width'),'0.12 mm')}}
 assert.match(section,/홍길동/);assert.equal(zip.file('mimetype')._data.compression.magic,'\x00\x00')
})
test('existing visible colored borders are preserved',async()=>{
 const {ensureHwpxTableBorders}=await import('../src/hwpx-borders.js')
 const dom=new JSDOM();globalThis.DOMParser=dom.window.DOMParser;globalThis.XMLSerializer=dom.window.XMLSerializer
 await load();const doc=HwpDocument.createEmpty();doc.createBlankDocument();doc.pasteHtml(0,0,0,'<table><tr><td style="border:1px solid #ff0000">내용</td></tr></table>');const input=doc.exportHwpx();doc.free()
 const blob=new Blob([input]);const output=await ensureHwpxTableBorders(blob);assert.equal(output,blob)
})
