import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import JSZip from 'jszip'
import {BASE_PROMPTS,CATEGORIES,filterPrompts,saveUserPrompt,parseUserPrompts} from '../src/milo-prompts.js'
import {documentTextSegments,transformBatches,validateTranslation,applyTranslation} from '../src/document-transform.js'
import {cleanProfile,saveProfile,loadProfile,profileContext} from '../src/company-profile.js'
import {normalizeBizInfoPayload} from '../api/bizinfo.js'
import {exportNewDocx,validateDocxTables} from '../src/docx-export.js'
const st=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,v)=>values.set(key,v)}}
function paper(html){
 const dom=new JSDOM('<!doctype html><html><body><article id="paper">'+html+'</article></body></html>')
 globalThis.NodeFilter=dom.window.NodeFilter
 globalThis.DOMParser=dom.window.DOMParser
 Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{configurable:true,get(){return this.textContent||''}})
 return dom.window.document.getElementById('paper')
}
test('Milo standard prompt library covers requested business disciplines',()=>{
 assert.ok(BASE_PROMPTS.length>=35)
 for(const category of ['IT','경제','법률','회계','건설','교육','마케팅']){
  assert.ok(CATEGORIES.includes(category))
  assert.ok(filterPrompts(BASE_PROMPTS,category).length>0)
 }
 assert.ok(BASE_PROMPTS.find(x=>x.title==='보도자료'))
 assert.ok(BASE_PROMPTS.find(x=>x.title==='표준 계약서 초안'))
 assert.ok(BASE_PROMPTS.find(x=>x.title==='표준 사업계획서'))
})
test('User prompt additions are scoped by account and sanitized',()=>{
 const store=st()
 const entry=saveUserPrompt('userA',{title:'사용자 기획안',text:'사업계획서 작성',category:'IT'},store)
 assert.equal(parseUserPrompts('userA',store).length,1)
 assert.equal(parseUserPrompts('userB',store).length,0)
 assert.equal(entry.category,'IT')
})
test('Translation updates text only, never changes table geometry or other cells',async()=>{
 const root=paper('<h1>업무보고서</h1><table><tbody><tr><th rowspan="2">보고일</th><th>내용</th></tr><tr><td>사업을 추진합니다.</td></tr></tbody></table>')
 const before=root.querySelector('table').outerHTML
 const segments=documentTextSegments(root)
 assert.ok(segments.length>=3)
 const target=segments.find(x=>x.text==='사업을 추진합니다.')
 const edits=validateTranslation(segments,[{id:target.id,text:'We will proceed with the project.'},{id:90000,text:'MALICIOUS'}])
 assert.equal(edits.length,1)
 assert.equal(applyTranslation(root,segments,edits),1)
 assert.equal(root.querySelector('table').rows[0].cells[0].rowSpan,2)
 assert.equal(root.querySelectorAll('table').length,1)
 assert.match(root.textContent,/We will proceed/)
 const file=await exportNewDocx(root)
 assert.equal((await validateDocxTables(file,root)).tables,1)
 const zip=await JSZip.loadAsync(await file.arrayBuffer())
 assert.match(await zip.file('word/document.xml').async('string'),/We will proceed/)
})
test('Translation proposals are rejected after source text is changed',()=>{
 const root=paper('<p>원래 문장입니다.</p>')
 const items=documentTextSegments(root)
 const edits=validateTranslation(items,[{id:0,text:'Translated sentence.'}])
 root.querySelector('p').textContent='내용이 변경됨'
 assert.equal(applyTranslation(root,items,edits),0)
})
test('Document transformation batches remain bounded',()=>{
 const root=paper('<p>'+Array.from({length:31},(_,i)=>'<span>문장'+i+'</span>').join('')+'</p>')
 const segments=documentTextSegments(root)
 assert.equal(segments.length,31)
 assert.equal(transformBatches(segments,12).length,3)
})
test('Company profiles are owner scoped and cleanly readable',()=>{
 const store=st()
 saveProfile('alpha',{company:'마일로소프트',industry:'IT',description:'AI 문서 자동화'},store)
 assert.equal(loadProfile('beta',store).company,'')
 assert.equal(loadProfile('alpha',store).company,'마일로소프트')
 assert.match(profileContext(loadProfile('alpha',store)),/AI 문서 자동화/)
 assert.equal(cleanProfile({tone:'전문적인 문체'}).tone,'전문적인 문체')
})
test('Bizinfo official feed response only keeps titles, summaries and official links',()=>{
 const items=normalizeBizInfoPayload({jsonArray:{item:[
  {title:'테스트 지원사업',link:'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?pblancId=PBLN_1',description:'<div>공고 사업개요</div>',flpthNm:'https://files.example/private.pdf'},
  {title:'피싱',link:'https://evil.example/steal',description:'비공개'}
 ]}})
 assert.equal(items.length,1)
 assert.deepEqual(Object.keys(items[0]).sort(),['content','title','url'])
 assert.equal(items[0].content,'공고 사업개요')
 assert.equal(items[0].url.includes('bizinfo.go.kr'),true)
})
