import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import JSZip from 'jszip'
import {openPackage,savePackage} from '../src/formats.js'
function setup(){const dom=new JSDOM('<article></article>');globalThis.DOMParser=dom.window.DOMParser;globalThis.XMLSerializer=dom.window.XMLSerializer;Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{configurable:true,get(){return this.textContent||''},set(v){this.textContent=v}});return dom.window.document.querySelector('article')}
async function imported(xml){const z=new JSZip();z.file('word/document.xml',xml);z.file('word/header1.xml','untouched header');z.file('word/media/image1.png',new Uint8Array([1,2,3,4]));const b=await z.generateAsync({type:'uint8array'});return openPackage({name:'원본.docx',arrayBuffer:async()=>b.buffer})}
test('DOCX edited runs retain other styles and untouched header/image bytes',async()=>{
 const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>계약 </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>원래 내용</w:t></w:r><w:r><w:t> 종료</w:t></w:r></w:p></w:body></w:document>'
 const paper=setup(),state=await imported(xml);paper.innerHTML=state.html;paper.querySelector('p').innerText='계약 새 내용 종료'
 const out=await JSZip.loadAsync(await (await savePackage(state,paper)).arrayBuffer()),body=await out.file('word/document.xml').async('string')
 assert.match(body,/<w:b\/>/);assert.match(body,/<w:i\/>/);assert.match(body,/새/);assert.equal(await out.file('word/header1.xml').async('string'),'untouched header');assert.deepEqual([...await out.file('word/media/image1.png').async('uint8array')],[1,2,3,4])
})
