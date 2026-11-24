import test from 'node:test'
import assert from 'node:assert/strict'
import {noticeIdentity} from '../src/cloud.js'
test('official notice keeps stable ID across listing query variations',()=>{
 const item={title:'지원사업',content:'신청',url:'https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?cpage=1&pblancId=PBLN_123'}
 assert.equal(noticeIdentity(item).id,'PBLN_123')
 assert.equal(noticeIdentity({...item,url:item.url.replace('cpage=1','cpage=2')}).id,'PBLN_123')
})
test('external or forged paths cannot be stored as official notices',()=>{
 for(const url of ['https://evil.example/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_123','https://www.bizinfo.go.kr/redirect?pblancId=PBLN_123','https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=../../wrong'])assert.throws(()=>noticeIdentity({title:'x',url}))
})
