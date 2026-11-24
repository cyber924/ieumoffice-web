import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import JSZip from 'jszip'
import {exportNewDocx,validateDocxTables} from '../src/docx-export.js'
import {openPackage,savePackage} from '../src/formats.js'
const setup=()=>{
 const dom=new JSDOM('<!doctype html><html lang="ko"><body><article id="paper"></article></body></html>')
 globalThis.DOMParser=dom.window.DOMParser
 globalThis.XMLSerializer=dom.window.XMLSerializer
 if(!('innerText' in dom.window.HTMLElement.prototype)){
  Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{
   get(){return this.textContent||''},
   set(v){this.textContent=v}
  })
 }
 return dom.window.document.getElementById('paper')
}
test('HWPX merged columns and rows preserve table shape',async()=>{
 const paper=setup()
 const zip=new JSZip()
 zip.file('Contents/section0.xml','<?xml version="1.0"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:p><hp:run><hp:t>사업계획서</hp:t></hp:run></hp:p><hp:p><hp:run><hp:tbl rowCnt="3" colCnt="3"><hp:tr><hp:tc><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:p><hp:run><hp:t>과제목표</hp:t></hp:run></hp:p></hp:tc><hp:tc><hp:cellAddr colAddr="1" rowAddr="0"/><hp:cellSpan colSpan="2" rowSpan="1"/><hp:p><hp:run><hp:t>정량목표</hp:t></hp:run></hp:p></hp:tc></hp:tr><hp:tr><hp:tc><hp:cellAddr colAddr="0" rowAddr="1"/><hp:cellSpan colSpan="1" rowSpan="2"/><hp:p><hp:run><hp:t>병합셀</hp:t></hp:run></hp:p></hp:tc><hp:tc><hp:cellAddr colAddr="1" rowAddr="1"/><hp:p><hp:run><hp:t>내용</hp:t></hp:run></hp:p></hp:tc></hp:tr></hp:tbl></hp:run></hp:p></hs:sec>')
 const bytes=await zip.generateAsync({type:'uint8array'})
 const file={name:'plan.hwpx',arrayBuffer:async()=>bytes.buffer}
 const state=await openPackage(file)
 paper.innerHTML=state.html
 const t=paper.querySelector('table')
 assert.ok(t,'the nested HWPX table must render')
 assert.equal(t.rows.length,2)
 assert.equal(t.rows[0].cells[1].colSpan,2)
 assert.equal(t.rows[1].cells[0].rowSpan,2)
 assert.equal(paper.querySelectorAll('table').length,1)
 assert.equal(paper.innerText?.includes('사업계획서')??paper.textContent.includes('사업계획서'),true)
 const output=await savePackage(state,paper)
 assert.ok(output.size>100)
})
test('DOCX includes native DrawingML PNG and table content',async()=>{
 const paper=setup()
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gS8AAAAASUVORK5CYII='
 paper.innerHTML='<h1>신청서</h1><table><tr><td>제목</td><td>성공</td></tr></table><p><img src="data:image/png;base64,'+png+'" width="100" height="100"></p>'
 const blob=await exportNewDocx(paper)
 const zip=await JSZip.loadAsync(await blob.arrayBuffer())
 const xml=await zip.file('word/document.xml').async('string')
 assert.match(xml,/<w:tbl>/)
 assert.match(xml,/<w:drawing>/)
 assert.match(xml,/r:embed="rIdImage1"/)
 assert.ok(zip.file('word/media/image1.png'))
 assert.ok(zip.file('word/_rels/document.xml.rels'))
 assert.equal((await validateDocxTables(blob,paper)).tables,1)
})

test('HWPX regression: exact five-table layout pattern and 31-column schedule',async()=>{
 const paper=setup()
 const zip=new JSZip()
 const HP='http://www.hancom.co.kr/hwpml/2011/paragraph'
 const HS='http://www.hancom.co.kr/hwpml/2011/section'
 const cell=(column,row,colSpan=1,rowSpan=1,label='')=>'<hp:tc><hp:subList><hp:p><hp:run><hp:t>'+label+'</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="'+column+'" rowAddr="'+row+'"/><hp:cellSpan colSpan="'+colSpan+'" rowSpan="'+rowSpan+'"/><hp:cellSz width="'+(colSpan*650)+'" height="1984"/></hp:tc>'
 const table=(id,columns,rowSpecs)=>{
  const rows=rowSpecs.map((cells,r)=>'<hp:tr>'+cells.map(x=>cell(x[0],r,x[1]||1,x[2]||1,x[3]||'')).join('')+'</hp:tr>').join('')
  return '<hp:p><hp:run><hp:tbl id="'+id+'" colCnt="'+columns+'" rowCnt="'+rowSpecs.length+'"><hp:sz width="48000"/>'+rows+'</hp:tbl></hp:run></hp:p>'
 }
 const first=[
  [[0,1,4,'과제목표'],[1,2,1,'정량목표'],[3,1,1,'비고']],
  [[1,1,1,''],[2,1,1,''],[3,1,1,'']],
  [[1,1,1,''],[2,1,1,''],[3,1,1,'']],
  [[1,1,1,''],[2,1,1,''],[3,1,1,'']]
 ]
 const goals=[
  [[0,2,1,'구분'],[2,1,1,'세부내용'],[3,1,1,'목표'],[4,1,1,'증빙']],
  ...Array.from({length:5},(_,r)=>r===0?
   [[0,1,3,'필수목표'],[1],[2],[3],[4]]:
   r===3?[[0,1,2,'자율목표'],[1],[2],[3],[4]]:
   [[1],[2],[3],[4]])
 ]
 const schedule=[
  [[0,1,2,'구분'],[1,1,2,'추진내용'],[2,28,1,'추진 일정(월)'],[30,1,2,'비고']],
  Array.from({length:7},(_,i)=>[2+i*4,4,1,String(i+4)]),
  ...Array.from({length:5},()=>Array.from({length:31},(_,i)=>[i]))
 ]
 const revenue=Array.from({length:6},(_,r)=>Array.from({length:4},(_,i)=>[i,1,1,r===0?['구분','수익모델','계획','단가'][i]:'']))
 const budget=Array.from({length:8},(_,r)=>r===0?
  [[0,2,1,'구분'],[2,1,1,'사업비'],[3,1,1,'지원금'],[4,1,1,'자체부담금'],[5,1,1,'구성비']]:
  r===1?[[0,1,5,'직접비'],...Array.from({length:5},(_,i)=>[i+1])]:
  r<6?Array.from({length:5},(_,i)=>[i+1]):
  Array.from({length:6},(_,i)=>[i]))
 const xml='<?xml version="1.0"?><hs:sec xmlns:hs="'+HS+'" xmlns:hp="'+HP+'">'+
  '<hp:p><hp:run><hp:t>사업계획서</hp:t></hp:run></hp:p>'+
  table('one',4,first)+table('two',5,goals)+table('three',31,schedule)+
  table('four',4,revenue)+table('five',6,budget)+'</hs:sec>'
 zip.file('Contents/section0.xml',xml)
 const bytes=await zip.generateAsync({type:'uint8array'})
 const state=await openPackage({name:'test-template.hwpx',arrayBuffer:async()=>bytes.buffer})
 paper.innerHTML=state.html
 assert.equal(state.tableStats.tables,5)
 assert.equal(state.tableStats.maxColumns,31)
 assert.equal(paper.querySelectorAll('table').length,5)
 assert.equal(paper.querySelector('table').rows[0].cells[0].rowSpan,4)
 assert.equal(paper.querySelectorAll('table')[2].querySelectorAll('col').length,31)
 assert.equal(paper.querySelectorAll('table')[2].rows[0].cells[2].colSpan,28)
 assert.equal(paper.textContent.match(/사업계획서/g)?.length,1)
 const blob=await savePackage(state,paper)
 const saved=await JSZip.loadAsync(await blob.arrayBuffer())
 const original=await zip.file('Contents/section0.xml').async('string')
 assert.equal(await saved.file('Contents/section0.xml').async('string'),original)
})
