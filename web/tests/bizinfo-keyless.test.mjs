import test from 'node:test'
import assert from 'node:assert/strict'
import handler,{parseBizInfoList} from '../api/bizinfo.js'
const fixture=`<table><tbody>
<tr><td>10</td><td>기술</td><td class="subject"><a href="/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_111">기술 지원 사업</a></td><td>2026-01-01 ~ 2026-12-31</td><td>중소벤처기업부</td><td>전문기관</td></tr>
<tr><td>9</td><td>금융</td><td class="subject"><a href="#" onclick="open('PBLN_222')">금융 지원 사업</a></td><td>상시</td><td>정부</td><td>수행기관</td></tr>
<tr><td>8</td><td>기술</td><td class="subject"><a href="https://evil.example/view.do">피싱</a></td><td>x</td></tr>
</tbody></table>`
test('public listing supplies official links and filters without a key',()=>{
 const all=parseBizInfoList(fixture);assert.equal(all.length,2);assert.match(all[0].content,/2026/);assert.match(all[1].url,/PBLN_222/);assert.deepEqual(parseBizInfoList(fixture,'01').map(x=>x.title),['금융 지원 사업'])
})
test('endpoint returns results with no key configured',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>({ok:true,text:async()=>fixture})
 let status,body;const res={status(x){status=x;return this},json(x){body=x;return this},setHeader(){}}
 try{await handler({method:'GET',query:{field:'02'}},res);assert.equal(status,200);assert.equal(body.items[0].title,'기술 지원 사업')}finally{globalThis.fetch=previous}
})
test('upstream layout failure is reported instead of pretending there are no notices',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>({ok:true,text:async()=>'<html>blocked</html>'});let status;const res={status(x){status=x;return this},json(){return this},setHeader(){}}
 try{await handler({method:'GET',query:{}},res);assert.equal(status,502)}finally{globalThis.fetch=previous}
})
