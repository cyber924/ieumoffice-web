import './styles.css'
import {markdownToDocumentHtml} from './document-markdown.js'
import {exportHwpx} from './hwpx-export.js'
import {ensureHwpxTableBorders} from './hwpx-borders.js'
import {installMediaTools} from './media-tools.js'
import {exportNewDocx,validateDocxTables} from './docx-export.js'
import {installRibbon} from './editor-pro.js'
import {captureTableTargets,validateTableEdits,applyTableEdits,inferTableValues} from './table-ai.js'
import {captureBusinessReport,isReportFillRequest,proposeBusinessReport,reportMissingFields} from './business-report.js'
import {captureLabeledForm,proposeLabeledForm,formRemaining} from './form-autofill.js'
import {AUTOFILL_MODES,completeDraft,isUnverifiedDraft} from './sample-autofill.js'
import {readReportProfile,saveReportProfile,reportToday,proposeReportDefaults,missingReportProfileFields} from './report-profile.js'
import {annotateCoordinates,semanticSnapshot,splitSemanticBatches,isSemanticFillIntent} from './document-map.js'
import {DESIGN_PRESETS,analyzeDocumentDesign,validateDesignPlan,designPreview,applyDocumentDesign} from './document-design.js'
import {describeTemplate,verifyTemplate,saveTemplateLocal,loadTemplateLocal} from './template-memory.js'
import {installMiloSuite} from './milo-suite.js'
import {loadProfile,profileContext} from './company-profile.js'
import {openPackage,savePackage,createDocx,importedModeLimitations,insertTableMarkup,addTableRow,addTableColumn,safeFilename} from './formats.js'
import {initCloud,isCloudReady,user,token,login,register,logout,saveCloud,listCloud,loadCloud,extractDocumentData,listRevisions,readCloudIndexed,saveTemplateMemory,readTemplateMemory} from './cloud.js'

const $=id=>document.getElementById(id)
const paper=$('paper')
const initial=paper.innerHTML
let state=null
let selectedModel='gpt'
// BYOK keys intentionally remain only in this browser tab memory.
const sessionKeys={gpt:'',gemini:'',claude:''}
let cloudId=null
let referenceDocuments=[]
let referenceSnapshot=[]
let cloudSaveRunning=false
let recentSelection=''
let pendingProposal=''
let pendingTableEdits=[]
let pendingTableSnapshot=null
let fillMode='sample' // default: reviewed examples; strict mode never invents missing fields

let activeRememberedTemplate=null
let templateLookupSequence=0
let showCoordinates=false
let showBlankTargets=false
let mapTimer
let lastFocusedCell=null
let dirty=false
let toastTimer

function toast(message){const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,4300)}
function setStatus(message){$('saveStatus').textContent=message}
function setNotice(message){$('noticeBar').textContent=message}
function fileName(){return $('filename').value.trim()||'제목 없는 문서'}
function updateWords(){$('wordCount').textContent=(paper.innerText||'').length+'자'}
function refreshDocumentMap(){
  const mapped=annotateCoordinates(paper,{show:showCoordinates,highlight:showBlankTargets})
  const info=$('coordinateInfo')
  if(info)info.textContent='표 '+mapped.tables.length+'개 · 빈 셀 '+mapped.blankCells.length+'개'
}
function scheduleDocumentMap(){
  clearTimeout(mapTimer)
  mapTimer=setTimeout(refreshDocumentMap,180)
}
function updateMode(){
  const mode=state?.type||'docx'
  $('filetype').textContent=mode.toUpperCase()
  $('saveFile').textContent=mode.toUpperCase()+' 저장'
  setNotice(state?importedModeLimitations(state):
    '새 문서 모드: 표와 텍스트를 작성한 뒤 DOCX로 저장할 수 있습니다. 복잡한 페이지 배치와 머리글·바닥글은 아직 지원하지 않습니다.')
  for(const id of ['insertTable','addColumn','mergeCells'])$(id).disabled=!!state
  $('insertTable').title=state?'가져온 문서에는 원본 구조를 보존하기 위해 새 표를 삽입하지 않습니다.':'새 표 삽입'
  $('mergeCells').title=state?'기존 표 병합 구조는 편집하지 않습니다.':'연속된 같은 행의 셀을 병합'
}
function restoreDraft(){
  try{
    const value=JSON.parse(localStorage.getItem('milosoft-draft-v2')||'null')
    if(value?.html && !value.source){paper.innerHTML=value.html;$('filename').value=value.name||'제목 없는 문서';setStatus('이 브라우저에 저장된 임시 문서를 복원했습니다.')}
  }catch{}
  updateWords();updateMode();scheduleDocumentMap()
}
let saveTimer
function markDirty(){
  dirty=true;updateWords();scheduleDocumentMap();setStatus('문서 수정됨 · 로컬 임시 저장')
  clearTimeout(saveTimer)
  saveTimer=setTimeout(()=>{
    if(state){setStatus('원본 기반 문서 수정 중 · 파일로 저장해 주세요.');return}
    try{
      localStorage.setItem('milosoft-draft-v2',JSON.stringify({name:fileName(),html:paper.innerHTML,source:false}))
      setStatus('이 브라우저에 임시 저장됨 · 서버 저장 아님')
    }catch{setStatus('로컬 임시 저장 용량 초과 · 파일로 저장해 주세요.')}
  },350)
}
function exec(command,value){
  if(command==='justifyCenter'){
    const cell=getCell()
    if(cell&&paper.contains(cell)){
      cell.style.textAlign='center'
      for(const p of cell.querySelectorAll('p,div,h1,h2'))p.style.textAlign='center'
      markDirty();toast('선택한 표 셀을 가운데 정렬했습니다.');return
    }
  }
  paper.focus();document.execCommand(command,false,value);markDirty()
}
for(const [id,cmd,val] of [['bold','bold'],['italic','italic'],['underline','underline'],['undo','undo'],['redo','redo'],['alignLeft','justifyLeft'],['alignCenter','justifyCenter']])$(id).onclick=()=>exec(cmd,val)
$('filename').addEventListener('input',markDirty)
paper.addEventListener('input',markDirty)
paper.addEventListener('mouseup',()=>{recentSelection=String(window.getSelection()?.toString()||'').slice(0,10000)})
paper.addEventListener('keyup',()=>{recentSelection=String(window.getSelection()?.toString()||'').slice(0,10000)})
paper.addEventListener('focusin',e=>{if(e.target.closest('td,th'))lastFocusedCell=e.target.closest('td,th')})
function getCell(){
  const s=window.getSelection()
  const node=s?.anchorNode
  return node?.nodeType===1?node.closest?.('td,th')||lastFocusedCell:node?.parentElement?.closest?.('td,th')||lastFocusedCell
}
$('insertTable').onclick=()=>{
  if(state)return toast('원본 문서의 표 구조는 보존합니다.')
  exec('insertHTML',insertTableMarkup(3,3))
}
$('addRow').onclick=()=>{
  const cell=getCell()
  if(!cell)return toast('먼저 표 안에 커서를 놓으세요.')
  if(state && !cell.closest('tr')?.dataset.rowBind)return toast('원본 표의 행을 선택해 주세요.')
  if(addTableRow(state,cell)){markDirty();toast('행이 추가되었습니다. 저장 후 원본 파일에서 확인하세요.')}
}
$('addColumn').onclick=()=>{
  const cell=getCell()
  if(!cell)return toast('표 안에 커서를 놓으세요.')
  if(!addTableColumn(state,cell))return toast('기존 파일의 열 추가는 아직 지원하지 않습니다.')
  markDirty()
}
$('mergeCells').onclick=()=>{
  if(state)return toast('기존 문서의 병합 구조는 보존됩니다.')
  const cell=getCell()
  const next=cell?.nextElementSibling
  if(!cell||!next)return toast('같은 행에 병합할 다음 셀이 있어야 합니다.')
  cell.colSpan=Math.max(1,cell.colSpan)+Math.max(1,next.colSpan)
  cell.append(' '+next.innerText)
  next.remove()
  markDirty();toast('오른쪽 셀과 병합했습니다.')
}
$('newDocument').onclick=()=>{
  if(dirty&&!confirm('새 문서를 만들까요? 저장하지 않은 현재 변경 내용은 사라질 수 있습니다.'))return
  state=null;cloudId=null;lastFocusedCell=null;referenceDocuments=[]
  paper.innerHTML=initial;$('filename').value='제목 없는 문서'
  delete paper.dataset.orientation;delete paper.dataset.margin
  activeRememberedTemplate=null
  localStorage.removeItem('milosoft-draft-v2');dirty=false;updateMode();updateWords();scheduleDocumentMap();setStatus('새 문서 준비 완료')
}
function download(blob,name){
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove()
  setTimeout(()=>URL.revokeObjectURL(url),1500)
}
async function blobForSave(){
  const blob=state?await savePackage(state,paper):await exportNewDocx(paper)
  // Reject a DOCX before any download/upload if native table elements are missing.
  if(!state || state.type==='docx')await validateDocxTables(blob,paper)
  return state?.type==='hwpx'?await ensureHwpxTableBorders(blob):blob
}
$('saveFile').onclick=async()=>{
  const b=$('saveFile');b.disabled=true;setStatus('문서 파일 생성 중…')
  try{
    const blob=await blobForSave()
    download(blob,safeFilename(fileName(),state?.type||'docx'))
    dirty=false;setStatus('파일 다운로드 완료 · 외부 프로그램에서 확인하세요.')
    toast('파일로 저장했습니다.')
  }catch(e){setStatus('저장 실패');toast(e.message)}finally{b.disabled=false}
}
async function loadFile(file){
  if(!file)return
  const ext=file.name.split('.').pop().toLowerCase()
  if(ext==='hwp')return toast('구형 HWP는 아직 편집을 지원하지 않습니다. 한컴오피스에서 HWPX로 변환 후 열어주세요.')
  if(file.size>15*1024*1024)return toast('15MB 이하의 파일만 지원합니다.')
  if(ext==='txt'){
    state=null;paper.innerHTML='';const p=document.createElement('p');p.textContent=await file.text();paper.append(p)
  }else{
    setStatus('문서 구조 분석 중…')
    try{
      const parsed=await openPackage(file)
      state=parsed;paper.innerHTML=parsed.html
    }catch(e){setStatus('파일 열기 실패');return toast(e.message)}
  }
  cloudId=null;referenceDocuments=[];$('filename').value=file.name.replace(/\.(docx|hwpx|txt)$/i,'')
  dirty=false;updateMode();updateWords();refreshDocumentMap();setStatus(file.name+' 열기 완료 · 제한 편집 모드')
  void restoreRememberedTemplate()
  toast('파일을 열었습니다. 복잡한 서식은 저장 후 확인하세요.')
}
$('fileInput').onchange=async e=>{
  const file=e.target.files?.[0]
  if(!file)return
  if(dirty&&!confirm('현재 수정 중인 문서를 저장했나요? 다른 파일을 열면 편집 내용이 사라집니다.')){e.target.value='';return}
  await loadFile(file);e.target.value=''
}
$('saveHwpx').onclick=async()=>{
  const button=$('saveHwpx');button.disabled=true;setStatus('HWPX 문서 생성 중…')
  try{
    const blob=await ensureHwpxTableBorders(state?.type==='hwpx'?await savePackage(state,paper):await exportHwpx(paper))
    download(blob,safeFilename(fileName(),'hwpx'))
    setStatus('HWPX 다운로드 완료 · 한글에서 서식을 확인해 주세요.')
    toast('HWPX 파일을 저장했습니다. 복잡한 서식은 한글에서 확인하세요.')
  }catch(e){setStatus('HWPX 저장 실패');toast(e.message)}finally{button.disabled=false}
}
$('saveText').onclick=()=>{
  const value=(paper.innerText||paper.textContent||'').replace(/\r?\n/g,'\r\n')
  download(new Blob(['\ufeff',value],{type:'text/plain;charset=utf-8'}),safeFilename(fileName(),'txt'))
  toast('TXT 파일을 다운로드했습니다. 표와 서식은 텍스트로 저장됩니다.')
}
$('printDoc').onclick=()=>window.print()
function openModal(html){$('modalContent').innerHTML=html;$('modal').showModal()}
$('closeModal').onclick=()=>$('modal').close()
$('templates').onclick=()=>{
  openModal('<h2>문서 양식 선택</h2><p>새 문서에 표 양식을 구성합니다. 기존 DOCX/HWPX 파일의 표 구조는 수정하지 않습니다.</p><div class="modal-list" id="templateList"></div>')
  const templates=[
    ['품의서',['작성일','부서','기안자','제목','요청금액','품의 내용']],
    ['업무보고서',['보고일','부서','담당자','업무 내용','진행 현황','향후 계획']],
    ['신청서',['신청자','연락처','신청 내용','신청일','확인란']],
    ['계약 검토표',['계약명','계약 상대방','계약 금액','기간','검토 의견','담당자']],
    ['회의록',['회의명','회의일','참석자','안건','결정사항','후속조치']],
    ['기본 양식',['항목','내용']]
  ]
  for(const [name,rows] of templates){
    const btn=document.createElement('button');btn.textContent=name
    btn.onclick=()=>{
      if(dirty&&!confirm('현재 문서를 새 양식으로 교체할까요?'))return
      state=null;cloudId=null;referenceDocuments=[]
      paper.innerHTML='<h1>'+name+'</h1><table><tbody>'+rows.map((r,i)=>'<tr><th>'+r+'</th><td><br></td></tr>').join('')+'</tbody></table><p><br></p>'
      $('filename').value=name;activeRememberedTemplate=null;updateMode();markDirty();refreshDocumentMap();$('modal').close()
    }
    $('templateList').append(btn)
  }
}
document.querySelectorAll('[data-model]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('[data-model]').forEach(x=>x.classList.remove('active'))
  b.classList.add('active');selectedModel=b.dataset.model;toast(b.textContent+' 모델 선택됨')
})
function addMessage(role,msg){
  const div=document.createElement('div')
  div.className=role==='user'?'user-message':'assistant-message'
  div.textContent=msg
  $('messages').append(div);$('messages').scrollTop=$('messages').scrollHeight
}
$('aiForm').onsubmit=async e=>{
  e.preventDefault()
  const prompt=$('aiPrompt').value.trim()
  if(!prompt)return
  const authToken=await token()
  if(!authToken)return toast('AI 기능은 Firebase 로그인 및 서버 API 키 설정 후 사용할 수 있습니다.')
  const selectedText=recentSelection||''
  // Only explicitly selected, authenticated user's documents become AI context.
  const selectedReferences=referenceSnapshot.slice(0,3)
  const referenceText=selectedReferences.map(r=>'[참고 문서: '+r.name+']\n'+r.text).join('\n\n')
  const businessProfile=user()?profileContext(loadProfile(user().uid,localStorage)):''
  const businessContext=businessProfile?'\n\n[사용자 등록 기업 정보 - 실제 정보 확인 필요]\n'+businessProfile.slice(0,1800):''
  // The dedicated six-field report engine is preserved; other forms use
  // semantic cell coordinates and a combined user-approved preview.
  const crossTableRequest=/모든\s*표|표\s*전체|문서\s*전체|전체\s*빈칸|모든\s*빈칸|양식\s*전체/.test(prompt) && paper.querySelectorAll('table').length>1
  const labeledForm=captureLabeledForm(paper)
  const genericFormMode=Boolean(labeledForm?.recognized && isSemanticFillIntent(prompt))
  const report=!genericFormMode&&!crossTableRequest&&isReportFillRequest(prompt)?captureBusinessReport(paper):null
  const reportMode=Boolean(report?.recognized)
  const semanticMode=!reportMode&&!genericFormMode&&isSemanticFillIntent(prompt)
  const tableIntent=genericFormMode||reportMode||semanticMode||/표|셀|양식|칸|작성자|작성일|제목|항목|빈칸|채워|기입|입력|반영/.test(prompt)
  refreshDocumentMap()
  const snapshot=genericFormMode?labeledForm:(reportMode?report:(semanticMode?semanticSnapshot(paper,{prompt,maxTargets:96}):(tableIntent?captureTableTargets(paper,getCell(),{prompt,maxTargets:100}):null)))
  const requestedTableFill=tableIntent && snapshot?.targets.some(t=>!t.current)
  pendingTableSnapshot=requestedTableFill?snapshot:null
  pendingTableEdits=[]
  const today=reportToday()
  const identity=user()
  const reportProfile=(reportMode||genericFormMode)?readReportProfile(identity):null
  const directEdits=requestedTableFill?(genericFormMode?proposeLabeledForm(snapshot,prompt,{today,profile:reportProfile}):(reportMode?proposeReportDefaults(snapshot,prompt,{today,profile:reportProfile}):inferTableValues(snapshot,prompt,{today}))):[]
  const directFieldCount=directEdits.length
  const completionOptions={mode:fillMode,today,profile:reportProfile||{},prompt}
  addMessage('user',prompt)
  $('aiPrompt').value='';$('aiSend').disabled=true;$('aiStatus').textContent='AI 요청 중…'
  try{
    // Explicit logical table coordinates require no model guessing: user-provided values are validated locally.
    if(requestedTableFill && directEdits.length && /표\s*\d+\s*\d+\s*행\s*\d+\s*열\s*[:：=]/.test(prompt)){
      pendingTableEdits=validateTableEdits(pendingTableSnapshot,directEdits)
      pendingProposal=''
      $('aiApply').disabled=pendingTableEdits.length===0
      const preview=pendingTableEdits.map(e=>e.label+' : (빈칸) → '+e.value).join('\n')
      $('aiPreviewText').textContent=preview||'유효한 빈 셀을 찾지 못했습니다.'
      $('aiApply').textContent='표 '+pendingTableEdits.length+'개 셀에 적용'
      addMessage('assistant',pendingTableEdits.length+'개 표 셀을 지정 좌표로 확인했습니다. 미리보기를 확인하고 적용하세요.')
      $('aiPreview').hidden=false
      return
    }
    if(genericFormMode&&requestedTableFill){
      const chunks=splitSemanticBatches(snapshot.targets,20)
      const generated=[]
      const errors=[]
      for(let index=0;index<chunks.length;index++){
        $('aiStatus').textContent='양식 항목 작성 '+(index+1)+'/'+chunks.length
        try{
          const response=await fetch('/api/ai',{method:'POST',
            headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken},
            body:JSON.stringify({
              model:selectedModel,mode:'labeled',prompt,selectedText,
              documentText:(paper.innerText.slice(0,14500)+'\n\n'+referenceText.slice(0,5500)+businessContext).slice(0,24000),
              providerKey:sessionKeys[selectedModel]||'',tableCells:chunks[index]
            })})
          const data=await response.json()
          if(!response.ok)throw new Error(data.error||'AI 요청 실패')
          if(Array.isArray(data.fields)){
            const byKey=new Map(chunks[index].map(t=>[t.fieldKey,t]))
            for(const proposed of data.fields){
              const target=byKey.get(proposed?.fieldKey)
              if(target&&typeof proposed.value==='string'&&proposed.value.trim())
                generated.push({cellId:target.cellId,value:proposed.value.slice(0,1000)})
            }
          }
        }catch(error){errors.push('묶음 '+(index+1)+': '+error.message)}
      }
      const directIds=new Set(directEdits.map(e=>e.cellId))
      const completed=completeDraft(snapshot,directEdits,generated.filter(e=>!directIds.has(e.cellId)),completionOptions)
      pendingTableEdits=validateTableEdits(snapshot,completed.edits)
      const sourceById=new Map(completed.edits.map(e=>[e.cellId,e.source]))
      for(const edit of pendingTableEdits)edit.source=sourceById.get(edit.cellId)||edit.source
      pendingProposal=''
      const missing=formRemaining(snapshot,pendingTableEdits)
      const exampleCount=pendingTableEdits.filter(e=>e.source==='기본 예시값 (확인 후 수정)').length
      const addresses=new Map(snapshot.targets.map(t=>[t.cellId,t.address]))
      $('aiPreviewText').textContent=
        (pendingTableEdits.map(e=>e.label+' ['+(addresses.get(e.cellId)||e.cellId)+']'+(isUnverifiedDraft(e.source)?' [예시·초안 확인]':' [제공 정보]')+'\n  → '+e.value).join('\n\n')
        ||'확인된 입력값이 없습니다.')+
        (exampleCount?'\n\n예시값 '+exampleCount+'개는 실제 정보를 확인한 후 수정해 주세요.':'')+
        (missing.length?'\n\n추가 확인 필요 ('+missing.length+'개): '+missing.join(' · '):'')+
        (errors.length?'\n\nAI 요청 오류: '+errors.join(' / '):'')
      $('aiApply').textContent='양식 '+pendingTableEdits.length+'개 셀 일괄 적용'
      $('aiApply').disabled=pendingTableEdits.length===0
      $('aiPreview').hidden=false
      addMessage('assistant','양식 '+snapshot.targets.length+'개 빈칸을 인식하고 '+pendingTableEdits.length+
        '개 입력안을 준비했어. 예시값 '+exampleCount+'개는 실제 정보로 검토·수정해 줘. 기존 값과 표 구조는 유지하며 승인 시 한 번에 적용해.'+
        (missing.length?' 입력 보류: '+missing.join(' · '):''))
      return
    }
    if(semanticMode&&requestedTableFill){
      const candidates=snapshot.targets
      const chunks=splitSemanticBatches(candidates,24)
      const suggested=[]
      const errors=[]
      for(let index=0;index<chunks.length;index++){
        $('aiStatus').textContent='양식 분석 및 작성 '+(index+1)+'/'+chunks.length
        try{
          const response=await fetch('/api/ai',{method:'POST',
            headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken},
            body:JSON.stringify({
              model:selectedModel,mode:'semantic',prompt,
              selectedText,documentText:(paper.innerText.slice(0,14500)+'\n\n'+referenceText.slice(0,5500)+businessContext).slice(0,24000),
              providerKey:sessionKeys[selectedModel]||'',tableCells:chunks[index]
            })})
          const data=await response.json()
          if(!response.ok)throw new Error(data.error||'AI 요청 실패')
          if(Array.isArray(data.edits))suggested.push(...data.edits)
        }catch(error){
          errors.push('묶음 '+(index+1)+': '+error.message)
          // If all provider calls fail, do not claim a successful generation.
          if(errors.length===chunks.length)break
        }
      }
      const protectedIds=new Set(directEdits.map(e=>e.cellId))
      const completed=completeDraft(snapshot,directEdits,suggested.filter(e=>!protectedIds.has(e.cellId)),completionOptions)
      pendingTableEdits=validateTableEdits(snapshot,completed.edits)
      const sourceById=new Map(completed.edits.map(e=>[e.cellId,e.source]))
      for(const edit of pendingTableEdits)edit.source=sourceById.get(edit.cellId)||edit.source
      pendingProposal=''
      const remaining=Math.max(0,snapshot.totalAvailable-pendingTableEdits.length)
      const warnings=[
        completed.examples?'기본 예시값 '+completed.examples+'개는 검토 및 수정 후 사용하세요.':'',
        snapshot.excluded?'이번 요청의 처리 범위를 넘어 제외한 빈 셀 '+snapshot.excluded+'개':'',
        errors.length?'일부 AI 요청 실패 ('+errors.length+'/'+chunks.length+')':'',
        remaining?'입력되지 않는 셀 '+remaining+'개는 내용 검토 또는 추가 요청이 필요합니다.':''
      ].filter(Boolean)
      const entries=pendingTableEdits.map(e=>e.label+' ['+(snapshot.targets.find(t=>t.cellId===e.cellId)?.address||e.cellId)+']'+(isUnverifiedDraft(e.source)?' [예시·초안 확인]':' [제공 정보]')+'\n  → '+e.value)
      $('aiPreviewText').textContent=(entries.join('\n\n')||'자동 입력 가능한 내용이 없습니다.')+
        (warnings.length?'\n\n'+warnings.join('\n'):'')
      $('aiPreview').hidden=false
      $('aiApply').textContent=pendingTableEdits.length+'개 셀 일괄 적용'
      $('aiApply').disabled=pendingTableEdits.length===0
      addMessage('assistant',pendingTableEdits.length+'개 입력안을 준비했어. 빈칸과 기존 값은 보호하고, 미리보기에서 확인한 뒤 한 번에 적용해 줘.'+
        (warnings.length?' '+warnings.join(' '):''))
      return
    }
    const res=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken},body:JSON.stringify({model:selectedModel,prompt,selectedText,documentText:(paper.innerText.slice(0,14500)+'\n\n'+referenceText.slice(0,5500)+businessContext).slice(0,24000),providerKey:sessionKeys[selectedModel]||'',tableCells:requestedTableFill?snapshot.targets:[],mode:requestedTableFill?(reportMode?'report':'table'):'text'})})
    const data=await res.json()
    if(!res.ok)throw new Error(data.error||'AI 요청 실패')
    const rawEdits=Array.isArray(data.edits)?data.edits:[]
    if(reportMode){
      // The server returns one proposal per field; the UI maps fields
      // to actual cells rather than trusting model-generated coordinates.
      const byKey=new Map(snapshot.targets.map(t=>[t.fieldKey,t]))
      const modelProposals=Array.isArray(data.fields)?data.fields:[]
      for(const proposal of modelProposals){
        // Identifying fields can only come from the user's request or verified profile.
        if(!['work','progress','plan'].includes(proposal?.fieldKey))continue
        const target=byKey.get(proposal?.fieldKey)
        if(!target||typeof proposal.value!=='string'||!proposal.value.trim())continue
        rawEdits.push({cellId:target.cellId,value:proposal.value.slice(0,1000)})
      }
    }
    const check=data.diagnostics
    if(requestedTableFill && check?.candidateCells===0){
      toast('AI가 표 후보 셀을 받지 못했습니다. 문서 안에 표가 있는지 확인해 주세요.')
    }
    const protectedIds=new Set(directEdits.map(x=>x.cellId))
    const proposals=[...directEdits,...rawEdits.filter(x=>!protectedIds.has(x?.cellId))]
    const completed=requestedTableFill?completeDraft(snapshot,proposals,[],completionOptions):{edits:[],examples:0}
    pendingTableEdits=pendingTableSnapshot?validateTableEdits(pendingTableSnapshot,completed.edits):[]
    const sources=new Map(completed.edits.map(e=>[e.cellId,e.source]))
    for(const edit of pendingTableEdits)edit.source=sources.get(edit.cellId)||edit.source
    pendingProposal=String(data.suggestion||'')
    $('aiApply').disabled = Boolean(requestedTableFill && !pendingTableEdits.length)
    if(pendingTableEdits.length){
      const description=pendingTableEdits.map(e=>e.label+(isUnverifiedDraft(e.source)?' [예시·초안]':' [제공 정보]')+' : '+(e.before||'(빈칸)')+' → '+e.value).join('\n')
      addMessage('assistant',reportMode?'업무보고서 '+pendingTableEdits.length+'개 항목을 한 번에 준비했습니다. 확인 후 적용해 주세요.\n'+description:'표 '+pendingTableEdits.length+'개 셀에 입력할 내용을 준비했습니다. 아래 미리보기에서 확인해 주세요.\n'+description)
      $('aiPreviewText').textContent=description
      $('aiApply').textContent=reportMode?'업무보고서 '+pendingTableEdits.length+'개 항목 일괄 적용':'표 '+pendingTableEdits.length+'개 셀에 적용'
      if(reportMode && pendingTableEdits.length<snapshot.targets.length){
        const missing=reportMissingFields(snapshot,pendingTableEdits)
        $('aiPreviewText').textContent+='\n\n입력 보류 ('+missing.length+'개): '+missing.join(' · ')+
          (missingReportProfileFields(snapshot,pendingTableEdits).length?'\n부서·담당자 정보는 우측 상단 업무보고 기본정보 메뉴에서 설정할 수 있어요.':'')
      }
    }else{
      addMessage('assistant',pendingProposal||(requestedTableFill?'표의 빈칸 '+snapshot.targets.length+'개를 인식했지만 적용할 AI 제안이 없습니다. 사업명·작성 목적 등을 구체적으로 입력해 주세요.':'적용할 제안이 없습니다.'))
      $('aiPreviewText').textContent=pendingProposal||'표 구조를 보호하기 위해 변경하지 않았습니다.'
      if(requestedTableFill)pendingProposal=''
      $('aiApply').textContent='문서에 적용'
    }
    $('aiPreview').hidden=false
  }catch(err){
    if(requestedTableFill && (directEdits.length||fillMode==='sample')){
      const completed=completeDraft(snapshot,directEdits,[],completionOptions)
      pendingTableEdits=validateTableEdits(pendingTableSnapshot,completed.edits)
      const sources=new Map(completed.edits.map(e=>[e.cellId,e.source]))
      for(const edit of pendingTableEdits)edit.source=sources.get(edit.cellId)||edit.source
      if(pendingTableEdits.length){
        const preview=pendingTableEdits.map(e=>e.label+(isUnverifiedDraft(e.source)?' [예시·초안]':' [제공 정보]')+' : (빈칸) → '+e.value).join('\n')
        $('aiPreviewText').textContent=preview
        $('aiApply').textContent='표 '+pendingTableEdits.length+'개 셀에 적용'
        $('aiApply').disabled=false
        $('aiPreview').hidden=false
        addMessage('assistant','AI 호출 실패로 예시값 또는 사용자 지정값 '+pendingTableEdits.length+'개만 준비했습니다. 실제 정보와 생성된 예시를 반드시 확인 후 적용해 주세요.')
      }else addMessage('assistant','요청이 완료되지 않았습니다: '+err.message)
    }else addMessage('assistant','요청이 완료되지 않았습니다: '+err.message)
  }
  finally{$('aiStatus').textContent='AI 연결';$('aiSend').disabled=false}
}
$('aiReject').onclick=()=>{$('aiPreview').hidden=true;pendingProposal='';pendingTableEdits=[];pendingTableSnapshot=null}
$('aiApply').onclick=()=>{
  if(pendingTableEdits.length){
    const reviewCount=pendingTableEdits.filter(x=>isUnverifiedDraft(x.source)).length
    const applied=applyTableEdits(pendingTableEdits)
    pendingTableEdits=[];pendingTableSnapshot=null;pendingProposal=''
    $('aiPreview').hidden=true
    if(applied){
      markDirty();refreshDocumentMap()
      if(reviewCount){
        setNotice('예시·AI 초안 '+reviewCount+'개가 포함된 문서입니다. 실제 제출·결재 전에 이름, 금액, 내용 등을 검토하고 수정하세요.')
      }
      toast('표 '+applied+'개 셀을 적용했습니다.'+(reviewCount?' 예시·AI 초안 '+reviewCount+'개를 확인해 주세요.':' 저장하여 확인하세요.'))
    }else toast('표가 수정되어 적용하지 않았습니다. 다시 AI에게 요청하세요.')
    return
  }
  if(!pendingProposal)return toast('적용할 수정안이 없습니다.')
  if(state)return toast('원본 DOCX/HWPX의 표 외 텍스트 자동 삽입은 제한됩니다.')
  const html=markdownToDocumentHtml(pendingProposal)
  const selection=window.getSelection()
  const inside=selection?.rangeCount && paper.contains(selection.anchorNode) && paper.contains(selection.focusNode)
  if(inside){paper.focus();document.execCommand('insertHTML',false,html)}
  else paper.insertAdjacentHTML('beforeend',html)
  $('aiPreview').hidden=true;pendingProposal='';markDirty();toast('제안을 문서에 적용했습니다.')
}
async function loginDialog(){
  if(!isCloudReady())return openModal('<h2>로그인 연결 대기</h2><p>Firebase 설정이 아직 등록되지 않았습니다. Vercel 환경 변수(VITE_FIREBASE_*)를 연결하면 이메일 로그인과 클라우드 저장을 사용할 수 있습니다.</p>')
  if(user())return openModal('<h2>내 계정</h2><p>현재 로그인: '+String(user().email||'')+'</p><button type="button" id="signoutButton">로그아웃</button>'),$('signoutButton').onclick=async()=>{await logout();$('modal').close();toast('로그아웃되었습니다.')}
  openModal('<h2>마일로소프트 로그인</h2><p>Firebase 이메일 계정으로 로그인합니다.</p><label>이메일<input class="field" type="email" id="email" autocomplete="email"></label><label>비밀번호<input class="field" type="password" id="password" autocomplete="current-password"></label><div class="flex-buttons"><button id="doLogin" type="button" class="primary">로그인</button><button id="doRegister" type="button">회원가입</button></div><p id="loginMessage"></p>')
  for(const [id,action] of [['doLogin',login],['doRegister',register]])$(id).onclick=async()=>{
    try{await action($('email').value.trim(),$('password').value);$('modal').close();toast('로그인되었습니다.')}catch(err){$('loginMessage').textContent=err.message}
  }
}
$('authButton').onclick=loginDialog
function reportProfileDialog(){
  if(!user())return loginDialog()
  const account=user()
  const profile=readReportProfile(account)
  openModal('<h2>업무보고 기본정보</h2><p>이 브라우저에서 로그인한 계정에만 적용됩니다. 부서와 담당자를 등록하면 업무보고서의 빈칸에 자동 제안합니다. 입력하지 않은 항목은 임의로 만들지 않습니다.</p>'+
    '<label>부서<input class="field" id="reportDepartment" maxlength="70" autocomplete="organization"></label>'+
    '<label>담당자<input class="field" id="reportAssignee" maxlength="70" autocomplete="name"></label>'+
    '<p id="reportProfileStatus" role="status"></p><div class="flex-buttons"><button type="button" id="saveReportProfile" class="primary">저장</button><button type="button" id="clearReportProfile">기본정보 비우기</button></div>')
  $('reportDepartment').value=profile.department
  $('reportAssignee').value=profile.assignee
  $('saveReportProfile').onclick=()=>{
    try{
      saveReportProfile(account,{department:$('reportDepartment').value,assignee:$('reportAssignee').value})
      $('modal').close()
      toast('업무보고 기본정보가 이 브라우저에 저장됐습니다.')
    }catch(err){$('reportProfileStatus').textContent=err.message}
  }
  $('clearReportProfile').onclick=()=>{
    $('reportDepartment').value=''
    $('reportAssignee').value=''
    $('reportProfileStatus').textContent='값을 지웠습니다. 저장을 누르면 반영됩니다.'
  }
}
const reportProfileButton=document.createElement('button')
reportProfileButton.type='button'
reportProfileButton.id='reportProfileOpen'
reportProfileButton.textContent='업무보고 기본정보'
reportProfileButton.title='업무보고서 부서·담당자 기본값'
reportProfileButton.onclick=reportProfileDialog
$('aiSettings').insertAdjacentElement('afterend',reportProfileButton)

// BYOK: never write provider keys to localStorage, Firestore, GitHub, or logs.
$('aiSettings').onclick=async()=>{
  openModal('<h2>AI 모델·API 키 설정</h2><p>API 키는 이 브라우저 탭의 메모리에만 보관됩니다. 새로고침하면 지워지며, AI 요청할 때만 암호화된 HTTPS 연결로 서버에 전달됩니다. 운영자 공용 키는 Vercel Secrets에 등록할 수 있습니다.</p><div id="keyFields"></div><div class="flex-buttons"><button type="button" id="saveKeys" class="primary">이 탭에 적용</button><button type="button" id="clearKeys">키 초기화</button><button type="button" id="checkServer">서버 연결 확인</button></div><p id="settingsStatus" role="status"></p>');
  for(const [id,label] of [['gpt','GPT · OpenAI'],['gemini','Gemini · Google'],['claude','Claude · Anthropic']]){
    const field=document.createElement('div');
    const labelEl=document.createElement('label');labelEl.textContent=label;
    const input=document.createElement('input');input.type='password';input.className='field';input.autocomplete='off';input.placeholder=sessionKeys[id]?'현재 탭에 키가 등록됨 · 변경할 때만 입력':'API 키 입력 (선택)';input.dataset.provider=id;input.maxLength=500;
    field.append(labelEl,input);$('keyFields').append(field)
  }
  $('saveKeys').onclick=()=>{
    for(const input of $('keyFields').querySelectorAll('input[data-provider]'))if(input.value.trim())sessionKeys[input.dataset.provider]=input.value.trim();
    $('modal').close();toast('이 탭에 AI 키를 적용했습니다. 새로고침하면 삭제됩니다.')
  };
  $('clearKeys').onclick=()=>{for(const k of Object.keys(sessionKeys))sessionKeys[k]='';$('modal').close();toast('이 탭에 보관한 AI 키를 초기화했습니다.')};
  $('checkServer').onclick=async()=>{
    $('settingsStatus').textContent='확인 중…';
    try{
      const response=await fetch('/api/status',{cache:'no-store'});
      if(!response.ok)throw Error('상태 API 연결 실패 ('+response.status+')');
      const info=await response.json();
      $('settingsStatus').textContent='서버 API: 정상 · 서버 제공 모델 키: '+Object.entries(info.providers||{}).map(([n,ok])=>n+' '+(ok?'등록됨':'미등록')).join(' / ')+' · 로그인: '+(user()?'접속됨':'필요');
    }catch(e){$('settingsStatus').textContent=e.message}
  }
};

function openCloudSaveDialog(asNew=false){
  if(!isCloudReady())return toast('Firebase 연결을 확인해 주세요.')
  if(!user())return loginDialog()
  const currentName=fileName()
  openModal('<h2>클라우드 문서 저장</h2><p>사용할 문서 제목을 입력하세요. DOCX/HWPX는 Storage에, 본문·표 데이터는 Firestore에 저장합니다.</p><label for="cloudDocumentName">문서 제목</label><input id="cloudDocumentName" class="field" maxlength="100" autocomplete="off"><div class="cloud-save-options"><label><input type="radio" name="saveMode" value="update"> 현재 문서 저장 (새 버전)</label><label><input type="radio" name="saveMode" value="new"> 다른 이름으로 새 문서 저장</label></div><p id="saveDialogMessage" role="status"></p><button type="button" class="primary" id="confirmCloudSave">저장하기</button>')
  const title=$('cloudDocumentName')
  title.value=currentName
  const options=Array.from(document.querySelectorAll('input[name="saveMode"]'))
  if(!cloudId){
    options.find(el=>el.value==='update').disabled=true
    options.find(el=>el.value==='new').checked=true
  }else options.find(el=>el.value===(asNew?'new':'update')).checked=true
  $('confirmCloudSave').onclick=async()=>{
    const nextTitle=title.value.trim()
    if(!nextTitle)return $('saveDialogMessage').textContent='문서 제목을 입력해 주세요.'
    if(nextTitle.length>100)return $('saveDialogMessage').textContent='문서 제목을 100자 이하로 입력해 주세요.'
    const mode=options.find(el=>el.checked)?.value||'new'
    await saveCurrentCloud({asNew:mode==='new',title:nextTitle})
  }
  title.focus();title.select()
}
async function saveCurrentCloud({asNew=false,title=null}={}) {
  if(!isCloudReady())return toast('Firebase 설정을 확인해 주세요.')
  if(!user())return loginDialog()
  if(cloudSaveRunning)return
  const actualTitle=(title||fileName()).trim()
  if(!actualTitle)return toast('문서 제목을 입력해 주세요.')
  cloudSaveRunning=true
  const button=$('cloudSave')
  button.disabled=true
  const previousId=cloudId
  const oldTitle=$('filename').value
  const message=$('saveDialogMessage')
  if(message)message.textContent='문서와 표 데이터를 저장하고 있습니다…'
  try{
    setStatus('DOCX 표 검증 및 클라우드 파일 저장 중…')
    const data=extractDocumentData(paper)
    const blob=await blobForSave()
    const ext=state?.type||'docx'
    // New title -> new document ID; previous version stays intact.
    const result=await saveCloud(safeFilename(actualTitle,ext),blob,ext,asNew?null:cloudId,data)
    cloudId=result.id
    $('filename').value=actualTitle
    dirty=false
    setStatus('Storage + Firestore 저장 완료 · '+actualTitle+' · 버전 '+result.revisionNumber)
    if($('modal').open)$('modal').close()
    toast('"'+actualTitle+'" 저장 완료 (버전 '+result.revisionNumber+')')
  }catch(err){
    cloudId=previousId
    $('filename').value=oldTitle
    setStatus('클라우드 저장 실패 · 기존 문서 유지됨')
    if(message)message.textContent='저장 실패: '+err.message
    toast('저장되지 않았습니다: '+err.message)
  }finally{
    cloudSaveRunning=false
    button.disabled=false
  }
}
$('cloudSave').onclick=()=>openCloudSaveDialog(false)
if($('cloudSaveAs'))$('cloudSaveAs').onclick=()=>openCloudSaveDialog(true)

function dateText(value){
  if(!value)return '날짜 미상'
  const d=value.toDate?.()||new Date(value.seconds?value.seconds*1000:value)
  return Number.isNaN(d.getTime())?'날짜 미상':d.toLocaleString('ko-KR')
}
function renderDocumentRows(rows){
  const list=$('documentsList')
  if(!list)return
  list.replaceChildren()
  if(!rows.length){list.textContent='해당하는 문서가 없습니다.';return}
  for(const row of rows){
    const item=document.createElement('div');item.className='cloud-document'
    const caption=document.createElement('div');caption.className='cloud-document-info'
    const title=document.createElement('strong');title.textContent=row.name||'이름 없는 문서'
    const info=document.createElement('small')
    info.textContent=(row.kind||'DOCX').toUpperCase()+' · '+(row.charCount||0)+'자 · '+(row.tableCount||0)+'개 표 · '+dateText(row.updatedAt)
    const preview=document.createElement('small')
    preview.textContent=(row.textPreview||'').replace(/\s+/g,' ').slice(0,90)
    caption.append(title,info,preview)
    const controls=document.createElement('div');controls.className='cloud-document-actions'
    const open=document.createElement('button');open.textContent='열기'
    open.onclick=async()=>{
      if(dirty&&!confirm('저장하지 않은 문서 수정 내용을 버리고 다른 문서를 열까요?'))return
      open.disabled=true
      try{
        const f=await loadCloud(row)
        await loadFile(f)
        cloudId=row.id
        $('modal').close()
        toast('저장 문서를 열었습니다.')
      }catch(err){toast('문서를 열지 못했습니다: '+err.message)}
      finally{open.disabled=false}
    }
    const versions=document.createElement('button');versions.textContent='버전'
    versions.onclick=()=>showVersions(row)
    const reference=document.createElement('button')
    reference.textContent=referenceDocuments.includes(row.id)?'AI 참고 해제':'AI 참고'
    reference.onclick=async()=>{
      if(referenceDocuments.includes(row.id)){
        referenceDocuments=referenceDocuments.filter(id=>id!==row.id)
        referenceSnapshot=referenceSnapshot.filter(x=>x.id!==row.id)
        toast('AI 참고 문서에서 제외했습니다.')
      }else{
        if(referenceDocuments.length>=3)return toast('AI 참고 문서는 최대 3개까지 선택할 수 있습니다.')
        reference.disabled=true
        try{
          const text=await readCloudIndexed(row)
          if(!text)return toast('선택한 문서에는 검색 가능한 본문 데이터가 없습니다.')
          referenceDocuments.push(row.id)
          referenceSnapshot.push({id:row.id,name:row.name,text})
          toast('이 문서를 AI 참고 자료에 추가했습니다.')
        }catch(err){toast(err.message)}
        finally{reference.disabled=false}
      }
      reference.textContent=referenceDocuments.includes(row.id)?'AI 참고 해제':'AI 참고'
      const indicator=$('referenceCount')
      if(indicator)indicator.textContent='AI 참고 문서 '+referenceDocuments.length+'개 선택됨'
    }
    controls.append(open,versions,reference)
    item.append(caption,controls)
    list.append(item)
  }
}
let cloudRows=[]
async function showCloudDocuments(){
  if(!isCloudReady())return toast('Firebase 연결 후 내 문서를 사용할 수 있습니다.')
  if(!user())return loginDialog()
  openModal('<h2>내 문서 검색·재활용</h2><p>Firestore에 저장된 본문 일부와 제목으로 검색하고, 이전 파일 버전을 선택하거나 AI 참고 문서로 지정할 수 있습니다.</p><input id="documentSearch" class="field" type="search" placeholder="제목·문서 내용 검색" aria-label="문서 검색"><p id="referenceCount">AI 참고 문서 '+referenceDocuments.length+'개 선택됨</p><div id="documentsList">목록을 조회하고 있습니다…</div>')
  try{
    cloudRows=await listCloud()
    if(!$('documentSearch'))return
    const search=()=>{
      const term=$('documentSearch').value.trim().toLocaleLowerCase()
      renderDocumentRows(cloudRows.filter(r=>!term||(r.name||'').toLocaleLowerCase().includes(term)||(r.textPreview||'').toLocaleLowerCase().includes(term)))
    }
    $('documentSearch').addEventListener('input',search)
    search()
  }catch(err){
    if($('documentsList'))$('documentsList').textContent='문서 조회 실패: '+err.message
  }
}
$('myDocuments').onclick=showCloudDocuments
async function showVersions(row){
  openModal('<h2>문서 버전 복원</h2><p>선택한 버전을 편집기로 가져옵니다. 복원 후 클라우드 저장을 누르면 새 버전이 만들어집니다. 기존 파일은 삭제되지 않습니다.</p><div id="versionList">버전 조회 중…</div>')
  try{
    let versions=await listRevisions(row.id)
    if(!versions.length)versions=[{id:'legacy',path:row.path,name:row.name,revisionNumber:row.revisionNumber||1,savedAt:row.updatedAt}]
    if(!$('versionList'))return
    const list=$('versionList');list.replaceChildren()
    for(const version of versions){
      const button=document.createElement('button')
      button.className='field'
      button.textContent='버전 '+(version.revisionNumber||'?')+' · '+dateText(version.savedAt)+' · '+(version.name||row.name)
      button.onclick=async()=>{
        if(dirty&&!confirm('저장되지 않은 현재 작업을 버리고 이 버전을 복원할까요?'))return
        button.disabled=true
        try{
          const f=await loadCloud({...version,name:version.name||row.name})
          await loadFile(f)
          cloudId=row.id
          $('modal').close()
          toast('이전 버전을 불러왔습니다. 저장하면 새 버전이 됩니다.')
        }catch(err){toast('복원 실패: '+err.message)}
        finally{button.disabled=false}
      }
      list.append(button)
    }
  }catch(err){if($('versionList'))$('versionList').textContent='버전 조회 실패: '+err.message}
}
$('toggleAI').onclick=()=>{document.body.classList.add('ai-hidden');toast('AI 패널 숨김 · 새로고침하면 다시 표시됩니다.')}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}})
const config={
  apiKey:import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId:import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket:import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
}
initCloud(config,u=>{
  $('authButton').textContent=u?.email||'로그인'
  if(!u){referenceDocuments=[];referenceSnapshot=[];cloudId=null}
  $('aiStatus').textContent=u?'연결 상태 확인':'로그인 후 AI 사용'
  void restoreRememberedTemplate()
}).then(connected=>{if(!connected)$('aiStatus').textContent='AI·Firebase 설정 전'}).catch(e=>{console.warn('Firebase configuration unavailable',e.message);$('aiStatus').textContent='연결 설정 오류'})
restoreDraft()

function documentInspection(){
 const tables=Array.from(paper.querySelectorAll('table'))
 const warnings=[]
 let empty=0,invalidDates=0,missingLabels=0
 for(const [ti,tbl] of tables.entries()){
  for(const [ri,row] of Array.from(tbl.rows).entries()){
   const cells=Array.from(row.cells)
   if(cells.length===2&&ri>0){
    const label=(cells[0].innerText||'').trim()
    const val=(cells[1].innerText||'').trim()
    if(label&&!val){empty++;warnings.push('표 '+(ti+1)+' · '+label+': 내용 없음')}
    if(/날짜|작성일|보고일|일자/.test(label)&&val&&!/^\d{4}[.\/-]\s*\d{1,2}[.\/-]\s*\d{1,2}/.test(val))invalidDates++
   }
  }
 }
 if(paper.innerText.trim().length<10)warnings.push('문서 본문이 거의 비어 있습니다.')
 if(invalidDates)warnings.push('날짜 형식 확인 필요: '+invalidDates+'곳')
 if(state)warnings.push('가져온 문서의 레이아웃은 Word/한컴에서 반드시 재확인하세요.')
 openModal('<h2>문서 검사</h2><p>규칙 기반 점검 결과입니다. 외부 AI로 내용이 전송되지 않습니다.</p><div id="inspectionResults"></div>')
 const box=$('inspectionResults')
 const summary=document.createElement('p')
 summary.textContent='문서 길이: '+paper.innerText.trim().length+'자 · 표: '+tables.length+'개 · 빈 필드: '+empty+'개'
 box.append(summary)
 if(!warnings.length){const p=document.createElement('p');p.textContent='기본 검사에서 발견된 문제가 없습니다.';box.append(p)}
 for(const w of warnings.slice(0,40)){const p=document.createElement('p');p.textContent='• '+w;box.append(p)}
}
function diffLines(before,after){
 const a=String(before||'').split(/\r?\n/),b=String(after||'').split(/\r?\n/)
 const max=Math.max(a.length,b.length),items=[]
 for(let i=0;i<max;i++){
  if((a[i]||'')===(b[i]||''))continue
  items.push({line:i+1,old:a[i]||'',now:b[i]||''})
  if(items.length>=60)break
 }
 return {items,oldCount:a.length,newCount:b.length}
}
async function compareHistory(){
 if(!cloudId)return toast('먼저 클라우드에 저장한 문서를 열어 주세요.')
 if(!user())return loginDialog()
 openModal('<h2>버전 내용 비교</h2><p>이전에 저장한 문서 본문과 현재 편집 중인 내용을 줄 단위로 비교합니다. 표 스타일과 레이아웃의 차이까지 비교하지는 않습니다.</p><div id="historyCompare">이전 버전을 조회 중…</div>')
 try{
  const versions=await listRevisions(cloudId)
  if(!versions.length)throw new Error('비교할 저장 버전이 없습니다.')
  const host=$('historyCompare');if(!host)return
  host.replaceChildren()
  const select=document.createElement('select');select.className='field'
  for(const v of versions){const o=document.createElement('option');o.value=v.id;o.textContent='버전 '+v.revisionNumber+' · '+dateText(v.savedAt);select.append(o)}
  const button=document.createElement('button');button.textContent='비교하기'
  const result=document.createElement('div');result.className='compare-diff'
  button.onclick=async()=>{
   result.textContent='비교 중…'
   try{
    const text=await readCloudIndexed({id:cloudId,revisionId:select.value,textPreview:''})
    const diff=diffLines(text,paper.innerText)
    result.replaceChildren()
    const title=document.createElement('p');title.textContent='변경된 줄 '+diff.items.length+'개 (최대 60줄 표시)';result.append(title)
    for(const item of diff.items){
     const row=document.createElement('div')
     const before=document.createElement('div');before.className='removed';before.textContent='− '+item.line+'행: '+item.old
     const after=document.createElement('div');after.className='added';after.textContent='+ '+item.line+'행: '+item.now
     row.append(before,after);result.append(row)
    }
    if(!diff.items.length)result.textContent='비교한 범위에서 달라진 줄이 없습니다.'
   }catch(e){result.textContent='비교 실패: '+e.message}
  }
  host.append(select,button,result)
 }catch(e){if($('historyCompare'))$('historyCompare').textContent=e.message}
}
async function searchReferences(){
 if(!user())return loginDialog()
 openModal('<h2>AI 참고 문서 검색</h2><p>내 문서에서 관련 내용을 찾고, AI 참고 자료로 선택할 수 있습니다.</p><input id="ragSearch" class="field" placeholder="예: 업무보고 회의록 비용 정산"><div id="ragResults">검색어를 입력하고 검색해 주세요.</div><button type="button" id="ragSearchButton">문서 검색</button>')
 $('ragSearchButton').onclick=async()=>{
  const query=$('ragSearch').value.trim().toLocaleLowerCase()
  if(!query)return toast('검색어를 입력해 주세요.')
  const result=$('ragResults');result.textContent='내 문서 검색 중…'
  try{
    const rows=await listCloud()
    const terms=query.split(/\s+/).filter(x=>x.length>1).slice(0,8)
    const ranked=rows.map(row=>{
      const text=((row.name||'')+' '+(row.textPreview||'')).toLocaleLowerCase()
      const score=terms.reduce((sum,t)=>sum+(row.name||'').toLocaleLowerCase().includes(t)*3+Number(text.includes(t)),0)
      return {row,score}
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12)
    result.replaceChildren()
    if(!ranked.length){result.textContent='검색 결과가 없습니다.';return}
    for(const {row,score} of ranked){
      const line=document.createElement('div');line.className='cloud-document'
      const description=document.createElement('div');description.className='cloud-document-info'
      const title=document.createElement('strong');title.textContent=row.name
      const preview=document.createElement('small');preview.textContent=(row.textPreview||'').slice(0,160)
      description.append(title,preview)
      const select=document.createElement('button');select.textContent='AI 참고 추가'
      select.onclick=async()=>{
        if(referenceDocuments.includes(row.id))return toast('이미 선택한 참고 문서입니다.')
        if(referenceDocuments.length>=3)return toast('최대 3개의 참고 문서를 선택할 수 있습니다.')
        select.disabled=true
        try{
          const text=await readCloudIndexed(row)
          if(!text)return toast('저장된 본문을 찾지 못했습니다.')
          referenceDocuments.push(row.id);referenceSnapshot.push({id:row.id,name:row.name,text})
          select.textContent='선택됨'
          toast('AI 참고 자료로 선택했습니다.')
        }catch(e){toast(e.message)}finally{select.disabled=false}
      }
      line.append(description,select);result.append(line)
    }
  }catch(e){result.textContent='검색 실패: '+e.message}
 }
}
installRibbon({paper,isImported:()=>Boolean(state),markDirty,toast,getCell,inspect:documentInspection,compare:compareHistory,searchAI:searchReferences})
const convertToDocxCopy=(kind)=>{
  if(!state)return true
  const name=String($('filename').value||'제목 없는 문서')
  if(!confirm('이 기능은 가져온 HWPX/DOCX의 원본 편집을 지원하지 않습니다. 현재 보이는 내용을 새 DOCX 편집 사본으로 변환할까요? 복잡한 표·누름틀·원본 스타일은 달라질 수 있습니다. 원본 파일은 변경되지 않습니다.'))return false
  state=null;cloudId=null
  $('filename').value=name+'-편집사본'
  // Existing DOM is intentionally retained, but all source bindings become
  // irrelevant because the new DOCX exporter uses the rendered DOM.
  paper.removeAttribute('data-imported')
  updateMode();markDirty()
  toast('DOCX 편집 사본으로 전환했습니다. 파일을 별도 이름으로 저장해 주세요.')
  return true
}
const mediaTools=installMediaTools({paper,isImported:()=>Boolean(state),convertToDocxCopy,markDirty,toast})
installMiloSuite({
 paper,toast,markDirty,openModal,convertToDocxCopy,
 getUser:user,getToken:token,getModel:()=>selectedModel,
 getProviderKey:()=>sessionKeys[selectedModel]||'',
 setFilename:name=>{$('filename').value=name},
 setPrompt:value=>{$('aiPrompt').value=value;$('aiPrompt').focus()},
 fileName
})

window.addEventListener('milosoft:media-action',e=>mediaTools.open(e.detail?.kind))

// Compact AI workspace shortcuts. All generation actions use existing login,
// provider key controls, AI review, and explicit approval before document edits.
const quickPanel=document.createElement('section')
quickPanel.className='ai-quick-actions'
quickPanel.setAttribute('aria-label','AI 문서 작업 바로가기')
const label=document.createElement('div');label.className='overline';label.textContent='AI 문서 도구'
quickPanel.append(label)
for(const [caption,message,local] of [
 ['문서 요약','현재 문서에서 중요한 내용을 다섯 문장 이내로 요약해 줘.',false],
 ['맞춤법·교정','현재 문서의 맞춤법과 어색한 표현을 검토하고 수정안을 제시해 줘. 문서는 수정하지 마.',false],
 ['표 자동입력','표에서 비어 있는 제목, 작성자, 작성일 등 항목을 사용자가 제공한 정보만으로 채워 줘. 알 수 없는 값은 빈칸으로 둬.',false],
 ['기존 문서 검색','',true],
 ['양식 오류 검사','',true]
]){
 const button=document.createElement('button')
 button.type='button';button.textContent=caption
 button.onclick=()=>{
  if(local){if(caption==='기존 문서 검색')searchReferences();else documentInspection();return}
  $('aiPrompt').value=message
  $('aiPrompt').focus()
  toast('AI 요청을 입력했습니다. 내용을 확인한 뒤 작성 요청을 눌러 주세요.')
 }
 quickPanel.append(button)
}
const modelRow=document.querySelector('.models')
modelRow?.after(quickPanel)
const fillControls=document.createElement('div')
fillControls.className='ai-fill-mode'
fillControls.innerHTML='<label for="aiFillMode">양식 자동완성</label><select id="aiFillMode" aria-label="양식 자동완성 모드">'+
  '<option value="sample">전체 자동완성 · 예시값 사용</option>'+
  '<option value="strict">실제 정보 우선 · 미확인 항목 비움</option></select>'+
  '<small>예시값은 미리보기에서 확인하고 실제 정보로 수정해 주세요.</small>'
document.querySelector('.models')?.after(fillControls)
$('aiFillMode').value=fillMode
$('aiFillMode').onchange=()=>{
  fillMode=$('aiFillMode').value==='strict'?'strict':'sample'
  toast(fillMode==='sample'?'전체 자동완성: 부족한 정보에 예시값을 제안합니다.':'실제 정보 우선: 확인되지 않은 항목을 비워 둡니다.')
}

function templateStatus(message){
 const status=document.getElementById('templateMemoryStatus')
 if(status)status.textContent=message
}
async function restoreRememberedTemplate(){
 const sequence=++templateLookupSequence
 let descriptor
 try{descriptor=describeTemplate(paper,{title:fileName()})}
 catch{activeRememberedTemplate=null;templateStatus('양식 없음');return}
 const uid=user()?.uid||'guest'
 let found=loadTemplateLocal(uid,descriptor.id)
 if(!found && user() && isCloudReady()){
   try{found=await readTemplateMemory(descriptor.id)}
   catch{templateStatus('서버 양식 규칙 미게시 · 브라우저에서만 검색 가능')}
 }
 if(sequence!==templateLookupSequence)return
 if(found && verifyTemplate(found,paper)){
   activeRememberedTemplate=found
   saveTemplateLocal(uid,found)
   templateStatus('기억된 양식: '+(found.title||'양식')+' · '+found.tableCount+'개 표')
 }else{
   activeRememberedTemplate=null
   templateStatus('새 양식 · 기억하기 가능')
 }
}
async function rememberCurrentTemplate(){
 let record
 try{record=describeTemplate(paper,{title:fileName()})}
 catch(error){toast(error.message);return}
 const uid=user()?.uid||'guest'
 try{saveTemplateLocal(uid,record)}catch(error){toast(error.message);return}
 activeRememberedTemplate=record
 templateStatus('브라우저 저장됨 · 서버 동기화 확인 중')
 if(user()&&isCloudReady()){
   try{
     await saveTemplateMemory(record)
     templateStatus('양식 기억 완료 · Firestore 동기화됨')
   }catch(error){
     templateStatus('브라우저에만 저장됨 · Firestore 규칙 게시 필요')
     toast('양식은 현재 브라우저에 저장됐습니다. 별도 Firestore 보안 규칙을 게시해야 다른 기기에서도 동기화됩니다.')
   }
 }else{
   templateStatus('브라우저에만 저장됨 · 로그인하면 서버 동기화 가능')
 }
}
function renderDesignReview(response,source='AI'){
 const analysis=analyzeDocumentDesign(paper)
 const verified=validateDesignPlan(paper,response)
 const preview=designPreview(paper,verified)
 openModal('<h2>문서 디자인 수정안</h2><p>텍스트와 표 병합은 변경하지 않고 제목·문단·표의 서식만 정리합니다. 원본 DOCX/HWPX를 열었다면 새 DOCX 편집 사본으로 전환해야 합니다.</p><label for="designPreset">디자인 스타일</label><select id="designPreset" class="field"></select><div id="designSummary"></div><button type="button" class="primary" id="designApply">디자인 적용</button>')
 const select=$('designPreset')
 for(const [id,preset] of Object.entries(DESIGN_PRESETS)){
   const option=document.createElement('option');option.value=id;option.textContent=preset.label;select.append(option)
 }
 select.value=verified.preset
 const summary=$('designSummary')
 const p=document.createElement('p')
 p.textContent=source+' 분석 · '+analysis.blocks+'개 문단 · '+preview.tableCount+'개 표 · 번호 포함 긴 셀 '+preview.numberedCells+'개. 적용 전후에는 문서 텍스트를 수정하지 않습니다.'
 summary.append(p)
 for(const [kind,label] of [['title','제목'],['section','소제목'],['body','본문'],['list','목록']]){
   const row=document.createElement('p')
   row.textContent=label+' '+(preview.roles[kind]||0)+'개'
   summary.append(row)
 }
 $('designApply').onclick=()=>{
   if(state && !convertToDocxCopy('design'))return
   const count=applyDocumentDesign(paper,{...verified,preset:select.value})
   markDirty();refreshDocumentMap()
   $('modal').close()
   toast('디자인 정리 완료 · 문단 '+count.blocks+'개, 표 '+count.tables+'개. DOCX 저장 후 확인해 주세요.')
 }
}
async function suggestDocumentDesign(){
 const analysis=analyzeDocumentDesign(paper)
 if(!analysis.blocks&&!analysis.tables)return toast('디자인을 적용할 문서가 없습니다.')
 const fallback={preset:'modern',roles:analysis.roles}
 const access=await token()
 if(!access){
   renderDesignReview(fallback,'규칙 기반')
   return
 }
 templateStatus('AI 디자인 분석 중…')
 try{
   const response=await fetch('/api/ai',{method:'POST',headers:{
     'Content-Type':'application/json',Authorization:'Bearer '+access
   },body:JSON.stringify({model:selectedModel,mode:'design',
     prompt:'문서를 읽고 제목·소제목·본문의 적합한 서식 역할을 구분하고 하나의 스타일을 추천해 줘.',
     documentText:JSON.stringify({blocks:analysis.roles.slice(0,120),tables:analysis.tables}),
     providerKey:sessionKeys[selectedModel]||''})})
   const data=await response.json()
   if(!response.ok)throw new Error(data.error||'AI 호출 실패')
   renderDesignReview(data.design||fallback,'AI')
 }catch(error){
   toast('AI 디자인 분석 오류 · 규칙 기반 디자인안을 사용합니다.')
   renderDesignReview(fallback,'규칙 기반')
 }
}
const designTools=document.createElement('div')
designTools.className='document-design-tools'
designTools.setAttribute('aria-label','AI 디자인 및 양식 기억')
const designButton=document.createElement('button')
designButton.type='button';designButton.textContent='AI 문서 디자인';designButton.onclick=suggestDocumentDesign
const rememberButton=document.createElement('button')
rememberButton.type='button';rememberButton.textContent='양식 기억';rememberButton.onclick=rememberCurrentTemplate
const statusLabel=document.createElement('span')
statusLabel.id='templateMemoryStatus';statusLabel.textContent='양식 인식 준비'
designTools.append(designButton,rememberButton,statusLabel)
document.querySelector('.milosoft-ribbon')?.append(designTools)
void restoreRememberedTemplate()

const coordinateBar=document.createElement('div')
coordinateBar.className='coordinate-toolbar'
coordinateBar.innerHTML='<button type="button" id="coordinateToggle" aria-pressed="false">표 좌표 보기</button>'+
  '<button type="button" id="blankToggle" aria-pressed="false">AI 입력칸 표시</button>'+
  '<span id="coordinateInfo" aria-live="polite"></span>'
document.querySelector('.milosoft-ribbon')?.append(coordinateBar)
$('coordinateToggle').onclick=()=>{
  showCoordinates=!showCoordinates
  $('coordinateToggle').setAttribute('aria-pressed',String(showCoordinates))
  $('coordinateToggle').classList.toggle('selected',showCoordinates)
  refreshDocumentMap()
}
$('blankToggle').onclick=()=>{
  showBlankTargets=!showBlankTargets
  $('blankToggle').setAttribute('aria-pressed',String(showBlankTargets))
  $('blankToggle').classList.toggle('selected',showBlankTargets)
  refreshDocumentMap()
}
refreshDocumentMap()


