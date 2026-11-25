import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {inspectDocument,compareDocumentText} from '../src/document-review.js'
import {selectedEdits,canRestoreAI} from '../src/ai-review.js'
test('inspection finds blank, signature, invalid dates and uncertain money',()=>{
 const dom=new JSDOM('<article><table><tr><td>담당자</td><td></td></tr><tr><td>서명</td><td>(인)</td></tr><tr><td>작성일</td><td>2026-02-30</td></tr><tr><td>계약금액</td><td>미정</td></tr></table></article>')
 const kinds=inspectDocument(dom.window.document.querySelector('article')).issues.map(x=>x.kind)
 assert.ok(kinds.includes('빈 항목'));assert.ok(kinds.includes('서명'));assert.ok(kinds.includes('날짜'));assert.ok(kinds.includes('금액'))
})
test('comparison aligns unchanged clauses after a new clause',()=>{
 const result=compareDocumentText('1조 목적\n2조 비밀유지\n3조 기간','1조 목적\n새 조항\n2조 비밀유지\n3조 기간')
 assert.deepEqual(result.changes,[{kind:'추가',text:'새 조항'}])
})
test('AI selection applies only checked entries and undo is guarded against later edits',()=>{
 const edits=[{value:'첫째'},{value:'둘째'},{value:'셋째'}];assert.deepEqual(selectedEdits(edits,['0','2']),[edits[0],edits[2]])
 const state={},snapshot={state,revision:5};assert.equal(canRestoreAI(snapshot,state,5),true);assert.equal(canRestoreAI(snapshot,state,6),false);assert.equal(canRestoreAI(snapshot,{},5),false)
})
