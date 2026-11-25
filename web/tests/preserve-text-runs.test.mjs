import test from 'node:test'
import assert from 'node:assert/strict'
import {distributeTextRuns} from '../src/preserve-text-runs.js'
test('edited text retains unaffected surrounding styled runs',()=>{
 const result=distributeTextRuns(['계약 ','원래 내용',' 종료'],'계약 새 내용 종료')
 assert.equal(result.join(''),'계약 새 내용 종료');assert.equal(result[0],'계약 ');assert.equal(result[2],' 종료')
})
test('handles insertion, removal, and Korean/emoji code points',()=>{
 for(const [parts,next] of [[['가','나다'],'가새나다'],[['앞','😀중간','뒤'],'앞뒤'],[['ABC'],'새 문장'],[['',''],'새']])assert.equal(distributeTextRuns(parts,next).join(''),next)
})
