import './styles.css'
import {captureTableTargets,validateTableEdits,applyTableEdits} from './table-ai.js'
import {openPackage,savePackage,createDocx,importedModeLimitations,insertTableMarkup,addTableRow,addTableColumn,safeFilename} from './formats.js'
import {initCloud,isCloudReady,user,token,login,register,logout,saveCloud,listCloud,loadCloud} from './cloud.js'

const $=id=>document.getElementById(id)
const paper=$('paper')
const initial=paper.innerHTML
let state=null
let selectedModel='gpt'
// BYOK keys intentionally remain only in this browser tab memory.
const sessionKeys={gpt:'',gemini:'',claude:''}
let cloudId=null
let recentSelection=''
let pendingProposal=''
let pendingTableEdits=[]
let pendingTableSnapshot=null
let lastFocusedCell=null
let dirty=false
let toastTimer

function toast(message){const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,4300)}
function setStatus(message){$('saveStatus').textContent=message}
function setNotice(message){$('noticeBar').textContent=message}
function fileName(){return $('filename').value.trim()||'제목 없는 문서'}
function updateWords(){$('wordCount').textContent=(paper.innerText||'').length+'자'}
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
  updateWords();updateMode()
}
let saveTimer
function markDirty(){
  dirty=true;updateWords();setStatus('문서 수정됨 · 로컬 임시 저장')
  clearTimeout(saveTimer)
  saveTimer=setTimeout(()=>{
    if(state){setStatus('원본 기반 문서 수정 중 · 파일로 저장해 주세요.');return}
    try{
      localStorage.setItem('milosoft-draft-v2',JSON.stringify({name:fileName(),html:paper.innerHTML,source:false}))
      setStatus('이 브라우저에 임시 저장됨 · 서버 저장 아님')
    }catch{setStatus('로컬 임시 저장 용량 초과 · 파일로 저장해 주세요.')}
  },350)
}
function exec(command,value){paper.focus();document.execCommand(command,false,value);markDirty()}
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
  state=null;cloudId=null;lastFocusedCell=null
  paper.innerHTML=initial;$('filename').value='제목 없는 문서'
  localStorage.removeItem('milosoft-draft-v2');dirty=false;updateMode();updateWords();setStatus('새 문서 준비 완료')
}
function download(blob,name){
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove()
  setTimeout(()=>URL.revokeObjectURL(url),1500)
}
async function blobForSave(){return state?savePackage(state,paper):createDocx(paper)}
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
  cloudId=null;$('filename').value=file.name.replace(/\.(docx|hwpx|txt)$/i,'')
  dirty=false;updateMode();updateWords();setStatus(file.name+' 열기 완료 · 제한 편집 모드')
  toast('파일을 열었습니다. 복잡한 서식은 저장 후 확인하세요.')
}
$('fileInput').onchange=async e=>{
  const file=e.target.files?.[0]
  if(!file)return
  if(dirty&&!confirm('현재 수정 중인 문서를 저장했나요? 다른 파일을 열면 편집 내용이 사라집니다.')){e.target.value='';return}
  await loadFile(file);e.target.value=''
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
      state=null;cloudId=null
      paper.innerHTML='<h1>'+name+'</h1><table><tbody>'+rows.map((r,i)=>'<tr><th>'+r+'</th><td><br></td></tr>').join('')+'</tbody></table><p><br></p>'
      $('filename').value=name;updateMode();markDirty();$('modal').close()
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
  const tableIntent=/표|셀|양식|칸|작성자|작성일|제목|항목|빈칸|채워|기입|입력|반영/.test(prompt)
  const snapshot=tableIntent?captureTableTargets(paper,getCell()):null
  const requestedTableFill=tableIntent && snapshot?.targets.some(t=>!t.current)
  pendingTableSnapshot=requestedTableFill?snapshot:null
  pendingTableEdits=[]
  addMessage('user',prompt)
  $('aiPrompt').value='';$('aiSend').disabled=true;$('aiStatus').textContent='AI 요청 중…'
  try{
    const res=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken},body:JSON.stringify({model:selectedModel,prompt,selectedText,documentText:paper.innerText.slice(0,24000),providerKey:sessionKeys[selectedModel]||'',tableCells:requestedTableFill?snapshot.targets:[],mode:requestedTableFill?'table':'text'})})
    const data=await res.json()
    if(!res.ok)throw new Error(data.error||'AI 요청 실패')
    const rawEdits=Array.isArray(data.edits)?data.edits:[]
    pendingTableEdits=pendingTableSnapshot?validateTableEdits(pendingTableSnapshot,rawEdits):[]
    pendingProposal=String(data.suggestion||'')
    $('aiApply').disabled = Boolean(requestedTableFill && !pendingTableEdits.length)
    if(pendingTableEdits.length){
      const description=pendingTableEdits.map(e=>e.label+' : '+(e.before||'(빈칸)')+' → '+e.value).join('\n')
      addMessage('assistant','표 '+pendingTableEdits.length+'개 셀에 입력할 내용을 준비했습니다. 아래 미리보기에서 확인해 주세요.\n'+description)
      $('aiPreviewText').textContent=description
      $('aiApply').textContent='표 '+pendingTableEdits.length+'개 셀에 적용'
    }else{
      addMessage('assistant',pendingProposal||'일치하는 표 입력값을 찾지 못했어요. 수정할 셀을 먼저 선택하거나 내용을 구체적으로 요청해 주세요.')
      $('aiPreviewText').textContent=pendingProposal||'표 구조를 보호하기 위해 변경하지 않았습니다.'
      if(requestedTableFill)pendingProposal=''
      $('aiApply').textContent='문서에 적용'
    }
    $('aiPreview').hidden=false
  }catch(err){addMessage('assistant','요청이 완료되지 않았습니다: '+err.message)}
  finally{$('aiStatus').textContent='AI 연결';$('aiSend').disabled=false}
}
$('aiReject').onclick=()=>{$('aiPreview').hidden=true;pendingProposal='';pendingTableEdits=[];pendingTableSnapshot=null}
$('aiApply').onclick=()=>{
  if(pendingTableEdits.length){
    const applied=applyTableEdits(pendingTableEdits)
    pendingTableEdits=[];pendingTableSnapshot=null;pendingProposal=''
    $('aiPreview').hidden=true
    if(applied){markDirty();toast('표 '+applied+'개 셀에 적용했습니다. 저장하여 확인하세요.')}
    else toast('표가 수정되어 적용하지 않았습니다. 다시 AI에게 요청하세요.')
    return
  }
  if(!pendingProposal)return toast('적용할 수정안이 없습니다.')
  if(state)return toast('원본 DOCX/HWPX의 표 외 텍스트 자동 삽입은 제한됩니다.')
  const text=pendingProposal
  paper.focus()
  const selection=window.getSelection()
  if(selection?.rangeCount && paper.contains(selection.anchorNode))document.execCommand('insertText',false,text)
  else{const p=document.createElement('p');p.textContent=text;paper.append(p)}
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
$('cloudSave').onclick=async()=>{
  if(!isCloudReady())return toast('Firebase 환경 변수 연결 후 사용할 수 있습니다.')
  if(!user())return loginDialog()
  try{setStatus('클라우드 저장 중…');const blob=await blobForSave();cloudId=await saveCloud(safeFilename(fileName(),state?.type||'docx'),blob,state?.type||'docx',cloudId);setStatus('클라우드 저장 완료');toast('내 문서에 저장했습니다.')}
  catch(e){setStatus('클라우드 저장 실패');toast(e.message)}
}
$('myDocuments').onclick=async()=>{
  if(!isCloudReady())return toast('Firebase 연결 후 내 문서를 사용할 수 있습니다.')
  if(!user())return loginDialog()
  openModal('<h2>내 문서</h2><p>Firebase에 저장된 문서입니다.</p><div id="documentsList">목록 조회 중…</div>')
  try{
    const rows=await listCloud(),list=$('documentsList')
    list.replaceChildren()
    if(!rows.length){list.textContent='저장된 문서가 없습니다.';return}
    for(const row of rows){const b=document.createElement('button');b.className='field';b.style.textAlign='left';b.textContent=row.name+' · '+Math.round((row.size||0)/1024)+'KB';b.onclick=async()=>{try{const f=await loadCloud(row);await loadFile(f);cloudId=row.id;$('modal').close()}catch(err){toast(err.message)}};list.append(b)}
  }catch(err){$('documentsList').textContent='목록 조회 실패: '+err.message}
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
  $('aiStatus').textContent=u?'연결 상태 확인':'로그인 후 AI 사용'
}).then(connected=>{if(!connected)$('aiStatus').textContent='AI·Firebase 설정 전'}).catch(e=>{console.warn('Firebase configuration unavailable',e.message);$('aiStatus').textContent='연결 설정 오류'})
restoreDraft()
