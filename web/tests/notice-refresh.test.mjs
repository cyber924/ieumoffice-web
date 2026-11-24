import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/notice-refresh.js'
function response(){return {code:null,body:null,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}}}
test('shared collection rejects unauthenticated collection requests',async()=>{const res=response();await handler({method:'POST',headers:{}},res);assert.equal(res.code,401)})
test('shared collection cannot be triggered with GET',async()=>{const res=response();await handler({method:'GET',headers:{}},res);assert.equal(res.code,405)})
