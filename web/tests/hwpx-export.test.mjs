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
})
test('conversion blocks unsupported images instead of losing them',async()=>{
 await assert.rejects(exportHwpx(paper('<p>본문</p><img src="x">'),load),/그림이나 도형/)
})
