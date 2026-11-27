import test from 'node:test'
import assert from 'node:assert/strict'
import {AI_MODELS,validModel,loadModelPreferences} from '../src/ai-models.js'
test('model catalog is provider scoped and keeps server defaults',()=>{
 for(const [provider,models] of Object.entries(AI_MODELS)){
  assert.equal(validModel(provider,''),true)
  for(const [id] of models)assert.equal(validModel(provider,id),true)
 }
 assert.equal(validModel('gpt','gemini-3.8-flash'),false)
 assert.equal(validModel('claude','https://example.org'),false)
 assert.equal(validModel('other',''),false)
})
test('preferences reject stale and malformed choices',()=>{
 assert.deepEqual(loadModelPreferences({getItem:()=>JSON.stringify({gpt:'gpt-6.2-sol',gemini:'bad',claude:'claude-haiku-5-5'})}),{gpt:'gpt-6.2-sol',gemini:'',claude:'claude-haiku-5-5'})
 assert.deepEqual(loadModelPreferences({getItem:()=>'{'}),{gpt:'',gemini:'',claude:''})
})
