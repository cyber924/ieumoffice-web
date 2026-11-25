import test from 'node:test'
import assert from 'node:assert/strict'
import {DEFAULT_TEMPLATES,cleanTemplate,filterTemplates} from '../src/template-library.js'
import {JSDOM} from 'jsdom'
import {exportNewDocx,validateDocxTables} from '../src/docx-export.js'
test('16 distinct usable templates include 10 new forms',()=>{
 assert.ok(DEFAULT_TEMPLATES.length>=16);assert.equal(new Set(DEFAULT_TEMPLATES.map(x=>x.title)).size,DEFAULT_TEMPLATES.length)
 for(const t of DEFAULT_TEMPLATES){assert.ok(t.fields.length>=2);assert.ok(t.title);assert.ok(t.category)}
})
test('search, category and favorites combine correctly',()=>{
 const items=DEFAULT_TEMPLATES.map((x,i)=>({...x,id:String(i)})),favorite=new Set([String(items.findIndex(x=>x.title==='견적서'))])
 assert.deepEqual(filterTemplates(items,'회계','견적',favorite,true).map(x=>x.title),['견적서'])
 assert.equal(filterTemplates(items,'법률','견적',favorite,false).length,0)
})
test('template validation bounds generated output and rejects missing fields',()=>{
 assert.throws(()=>cleanTemplate({title:'불완전 양식',fields:['하나']}))
 assert.equal(cleanTemplate({title:'이름',fields:['항목','내용'],source:'AI'}).source,'AI')
 assert.equal(cleanTemplate({title:'X'.repeat(300),fields:Array(40).fill('값')}).fields.length,25)
})
test('template table is serialized as a real DOCX table',async()=>{
 const dom=new JSDOM('<article><h1>사업계획서</h1><table><tbody><tr><th>사업명</th><td>예시</td></tr><tr><th>사업목표</th><td></td></tr></tbody></table></article>');globalThis.DOMParser=dom.window.DOMParser
 const p=dom.window.document.querySelector('article'),blob=await exportNewDocx(p)
 assert.deepEqual(await validateDocxTables(blob,p),{tables:1,cells:4})
})
