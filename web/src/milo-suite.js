import {CATEGORIES,BASE_PROMPTS,filterPrompts,parseUserPrompts,saveUserPrompt} from './milo-prompts.js'
import {documentTextSegments,transformBatches,validateTranslation,applyTranslation} from './document-transform.js'
import {PROFILE_FIELDS,emptyProfile,loadProfile,saveProfile,profileContext} from './company-profile.js'
import {extractTextPdf} from './pdf-import.js'

const el=(tag,cls='',text='')=>{
 const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n
}
function button(text,callback,cls=''){
 const b=el('button',cls,text);b.type='button';b.onclick=callback;return b
}
function withLabel(label,control){
 const row=el('label','milo-field');row.append(el('span','',label),control);return row
}
function external(url){
 const u=new URL(url)
 if(u.protocol!=='https:')throw Error('허용되지 않은 주소입니다.')
 window.open(u.href,'_blank','noopener,noreferrer')
}
function short(s,size=150){return String(s||'').slice(0,size)}
function parseJSON(result){return result.json().catch(()=>({}))}
export function installMiloSuite({paper,toast,markDirty,openModal,convertToDocxCopy,getUser,getToken,getModel,getModelId=()=>'',getProviderKey,setFilename,setPrompt,fileName,savePersonalPrompt,listPersonalPrompts,readNotices,readNoticeRefreshTime,saveSharedNotice,recordNoticeRefresh}){
 let savedRange=null
 const cache={gallery:[],nextCursor:null,business:[]}
 const uid=()=>getUser()?.uid||'guest'
 const storage=()=>window.localStorage
 function rememberCursor(){
  const s=window.getSelection()
  if(s?.rangeCount&&paper.contains(s.anchorNode))savedRange=s.getRangeAt(0).cloneRange()
 }
 document.addEventListener('selectionchange',rememberCursor)
 const modal=(title,description)=>{
  openModal('<h2></h2><p></p><div id="miloModalHost" class="milo-modal-body"></div>')
  const m=document.querySelector('#modalContent')
  m.querySelector('h2').textContent=title;m.querySelector('p').textContent=description
  return m.querySelector('#miloModalHost')
 }
 function insertNode(node){
  if(!convertToDocxCopy('milo'))return
  const range=savedRange
  if(range&&paper.contains(range.commonAncestorContainer)){
   range.deleteContents();range.insertNode(node)
  }else{const p=el('p');p.append(node);paper.append(p)}
  markDirty()
 }
 async function aiRequest(mode,prompt,data={}){
  const auth=await getToken()
  if(!auth)throw Error('AI 기능은 Firebase 로그인이 필요합니다.')
  const res=await fetch('/api/ai',{method:'POST',headers:{
   'Content-Type':'application/json',Authorization:'Bearer '+auth
  },body:JSON.stringify({mode,model:getModel(),modelId:getModelId(),prompt,
    selectedText:'',documentText:short(data.documentText||'',24000),
    providerKey:getProviderKey(),tableCells:[]})})
  const json=await parseJSON(res)
  if(!res.ok)throw Error(json.error||'AI 요청 실패')
  return json
 }
 async function loadPersonalPrompts(){
  const local=parseUserPrompts(uid(),storage())
  if(!getUser())return local
  for(const item of local)await savePersonalPrompt(item)
  return await listPersonalPrompts()
 }
 window.addEventListener('milosoft:auth-ready',()=>{void loadPersonalPrompts().catch(()=>{})})
 function showPrompts(category='전체',query=''){
  const host=modal('마일로 문서 프롬프트','표준 문서부터 전문 분야까지 프롬프트를 선택해 왼쪽 AI에 적용하세요.')
  const tools=el('div','milo-filter')
  const select=el('select');for(const c of CATEGORIES){const op=el('option','',c);op.value=c;select.append(op)}
  select.value=category
  const input=el('input');input.type='search';input.placeholder='문서 이름, 분야 검색';input.value=query
  tools.append(select,input,button('내 프롬프트 추가',()=>addUserPrompt()))
  host.append(tools)
  const list=el('div','milo-list');host.append(list)
  let personal=parseUserPrompts(uid(),storage())
  const syncStatus=el('p','','저장된 프롬프트를 불러오는 중…');host.append(syncStatus)
  const redraw=()=>{
   list.replaceChildren()
   const found=filterPrompts([...personal,...BASE_PROMPTS],select.value,input.value)
   for(const p of found){
    const item=el('article','milo-list-item')
    const info=el('div');info.append(el('strong','',p.title),el('small','',p.category+' · '+p.guide))
    const apply=button('프롬프트 사용',()=>{
     setPrompt(p.text);document.querySelector('#modal')?.close()
     toast('프롬프트를 AI 입력창에 넣었습니다. 확인 후 작성 요청하세요.')
    },'milo-primary')
    item.append(info,apply);list.append(item)
   }
   if(!found.length)list.append(el('p','','검색 결과가 없습니다.'))
  }
  select.onchange=redraw;input.oninput=redraw;redraw()
  loadPersonalPrompts().then(items=>{personal=items;syncStatus.textContent=getUser()?'내 프롬프트 DB 연결됨':'로그인하면 다른 기기에서도 볼 수 있습니다.';redraw()}).catch(()=>{syncStatus.textContent='DB 연결 실패 · 이 브라우저의 프롬프트를 표시합니다.'})
 }
 function addUserPrompt(){
  const host=modal('새 프롬프트 등록','사용자 전용 프롬프트를 저장해 다음에도 사용할 수 있습니다.')
  const title=el('input');title.placeholder='예: 해외 진출 사업계획서';title.maxLength=80
  const category=el('select')
  for(const c of CATEGORIES.slice(1)){const op=el('option','',c);op.value=c;category.append(op)}
  const text=el('textarea');text.rows=8;text.placeholder='AI에게 전달할 상세 지침을 작성하세요.'
  host.append(withLabel('프롬프트 이름',title),withLabel('분야',category),withLabel('내용',text))
  host.append(button('저장',async()=>{
   try{const entry={title:title.value,category:category.value,text:text.value};if(!getUser())throw Error('DB 저장을 위해 로그인하세요.');await savePersonalPrompt(entry);toast('프롬프트 DB 저장 완료');showPrompts(category.value)}
   catch(e){toast(e.message)}
  },'milo-primary'))
 }
 async function recommendPrompt(){
  const host=modal('AI 전문 프롬프트 추천','선택한 분야에 맞는 문서 작성 프롬프트를 AI가 추천합니다.')
  const select=el('select')
  for(const c of CATEGORIES.slice(1)){const op=el('option','',c);op.value=c;select.append(op)}
  const status=el('p','','원하는 분야를 선택하세요.')
  const list=el('div','milo-list')
  host.append(withLabel('추천 분야',select),button('AI 추천 받기',async()=>{
   status.textContent='AI가 문서 작성 프롬프트를 추천하고 있습니다…';list.replaceChildren()
   try{
    const data=await aiRequest('promptRecommendation',select.value+' 분야의 실제 업무에서 자주 쓰는 문서 작성 프롬프트를 5개 추천해 줘.')
    if(!data.prompts?.length)throw Error('추천 결과가 없습니다.')
    let stored=0,failed=0
    for(const p of data.prompts){
     try{await savePersonalPrompt({title:p.title,text:p.text,category:select.value});stored++}catch{failed++}
     const row=el('article','milo-list-item');const body=el('div')
     body.append(el('strong','',p.title),el('small','',p.text))
     row.append(body,button('사용',()=>{
      setPrompt(p.text);document.querySelector('#modal')?.close();toast('추천 프롬프트를 AI 입력창에 적용했어요.')
     }))
     row.append(button('다시 저장',async()=>{
      try{await savePersonalPrompt({title:p.title,text:p.text,category:select.value});toast('내 프롬프트 DB 저장 완료')}catch{toast('DB 저장 실패 · 다시 시도해 주세요.')}
     }))
     list.append(row)
    }
    status.textContent=data.prompts.length+'개 추천 · DB 저장 '+stored+'개'+(failed?' · 저장 실패 '+failed+'개':'')
   }catch(e){status.textContent=e.message}
  },'milo-primary'),status,list)
 }
 async function gallery(cursor=null){
  const host=modal('이미지 허브 갤러리','공개 이미지 작은 썸네일과 원본 주소를 확인하고 문서에 삽입하세요.')
  const search=el('input');search.type='search';search.placeholder='이미지 제목·태그 검색'
  const status=el('p','','이미지허브 연결 중…')
  const listing=el('div','milo-gallery')
  const more=button('다음 이미지 불러오기',async()=>{await fetchGallery(cache.nextCursor,true);render()})
  const openHub=button('이미지허브 열기',()=>external('https://imagehub-2vhv.vercel.app'))
  host.append(search,status,listing,el('div','milo-filter'))
  host.lastChild.append(more,openHub)
  const render=()=>{
   listing.replaceChildren()
   const q=search.value.toLocaleLowerCase()
   const filtered=cache.gallery.filter(i=>[i.title,...i.tags].join(' ').toLocaleLowerCase().includes(q))
   for(const item of filtered){
    const card=el('article','milo-image-card')
    const img=el('img');img.src=item.url;img.loading='lazy';img.alt=item.title;img.referrerPolicy='no-referrer'
    const caption=el('strong','',item.title)
    const url=el('input');url.value=item.url;url.readOnly=true;url.title='공개 이미지 URL'
    card.append(img,caption,url,button('문서에 삽입',async()=>{
     try{
      const image=await loadImageAsData(item.url)
      insertNode(image);document.querySelector('#modal')?.close();toast('선택한 이미지가 문서에 삽입됐습니다.')
     }catch(e){toast('이미지 삽입 실패: '+e.message)}
    },'milo-primary'))
    listing.append(card)
   }
   status.textContent=cache.gallery.length+'개 공개 이미지 조회됨'+(filtered.length!==cache.gallery.length?' · 검색 결과 '+filtered.length+'개':'')
   more.disabled=!cache.nextCursor
  }
  const fetchGallery=async(cursor,append)=>{
   status.textContent='이미지 목록 조회 중…'
   try{
    const r=await fetch('/api/imagehub-gallery'+(cursor?'?cursor='+encodeURIComponent(cursor):''))
    const d=await parseJSON(r)
    if(!r.ok)throw Error(d.message||'이미지허브 공개 API 연결 실패')
    cache.gallery=append?[...cache.gallery,...d.items.filter(i=>!cache.gallery.some(old=>old.id===i.id))]:d.items
    cache.nextCursor=d.nextCursor||null
   }catch(e){status.textContent=e.message+' · 이미지허브 사이트에서 공개 상태를 확인해 주세요.'}
  }
  search.oninput=render
  await fetchGallery(null,false);render()
 }
 function loadImageAsData(url){
  return new Promise((resolve,reject)=>{
   const image=new Image()
   image.crossOrigin='anonymous';image.referrerPolicy='no-referrer'
   image.onload=()=>{
    try{
     const scale=Math.min(1,850/Math.max(image.naturalWidth,image.naturalHeight))
     const canvas=el('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale))
     canvas.height=Math.max(1,Math.round(image.naturalHeight*scale))
     canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height)
     const node=el('img')
     node.src=canvas.toDataURL('image/jpeg',0.82)
     node.width=Math.min(620,canvas.width);node.height=Math.round(canvas.height*node.width/canvas.width)
     node.alt='이미지허브 문서 이미지'
     resolve(node)
    }catch(e){reject(Error('원본 이미지 교차 출처 접근을 확인해 주세요.'))}
   }
   image.onerror=()=>reject(Error('공개 이미지 URL을 불러올 수 없습니다.'))
   image.src=url
  })
 }
 async function transform(kind){
  const items=documentTextSegments(paper,100)
  if(!items.length)return toast('편집할 문서 문장이 없습니다.')
  const isTranslate=kind==='translate'
  const host=modal(isTranslate?'마일로 문서 번역':'마일로 문체 변환',
   '문서 원본은 그대로 두고 변환된 문장을 비교한 후 승인하면 적용합니다. 표 구조·병합은 유지합니다.')
  const select=el('select')
  const options=isTranslate?
    [['en','영어'],['ja','일본어'],['zh','중국어'],['ko','한국어'],['fr','프랑스어'],['de','독일어'],['es','스페인어']]:
    [['natural','자연스럽고 읽기 편한 문체'],['business','전문적인 비즈니스 문체'],['friendly','친근한 설명 문체'],['concise','간결한 문체'],['editorial','보도자료 문체']]
  for(const [v,label] of options){const option=el('option','',label);option.value=v;select.append(option)}
  const status=el('p','','대상 문장 '+items.length+'개 · 번역/변환 전후를 비교할 수 있어요.')
  const preview=el('div','milo-transform-preview')
  const apply=button('검토 후 문서에 적용',()=>{},'milo-primary');apply.disabled=true
  let approved=[]
  const run=button('AI 변환 시작',async()=>{
   approved=[];preview.replaceChildren();apply.disabled=true
   try{
    for(const [i,batch] of transformBatches(items,12).entries()){
     status.textContent='변환 중 '+(i+1)+'/'+Math.ceil(items.length/12)
     const prompt=(isTranslate?'원본 문서의 모든 문장을 '+select.selectedOptions[0].textContent+'로 번역.':'원문 의미와 사실을 보존하고 '+select.selectedOptions[0].textContent+'로 변환.')+
       ' 모든 id에 대해 하나씩 응답하고 표 구조를 유지해.'
     const body=JSON.stringify({segments:batch.map(({id,text})=>({id,text}))})
     const data=await aiRequest('transform',prompt,{documentText:body})
     approved.push(...validateTranslation(batch,data.segments))
    }
    if(!approved.length)throw Error('검토할 변환 결과가 없습니다.')
    for(const e of approved.slice(0,80)){
     const row=el('article','milo-compare-row')
     row.append(el('small','',e.old),el('p','',e.text));preview.append(row)
    }
    status.textContent='변환된 문장 '+approved.length+'개 · 확인 후 적용하세요.'
    apply.disabled=false
   }catch(e){status.textContent='변환 오류: '+e.message}
  })
  apply.onclick=()=>{
   if(!convertToDocxCopy(kind))return
   const count=applyTranslation(paper,items,approved)
   if(count){markDirty();document.querySelector('#modal')?.close();toast('문장 '+count+'개 수정됨 · 새 DOCX로 저장 후 확인해 주세요.')}
   else toast('문서가 수정되어 비교 결과를 적용하지 못했습니다. 다시 시도하세요.')
  }
  host.append(withLabel(isTranslate?'번역 언어':'문체 스타일',select),run,status,preview,apply)
 }
 function notices(){
  const host=modal('기업마당 지원사업 공고','저장된 공고를 표시합니다. 최신 공고를 수집하려면 새로고침을 누르세요.')
  const filter=el('select')
  const fields=[['','전체'],['금융','금융'],['기술','기술'],['인력','인력'],['수출','수출'],['내수','내수'],['창업','창업'],['경영','경영'],['기타','기타']]
  for(const [value,title] of fields){const op=el('option','',title);op.value=value;filter.append(op)}
  const search=el('input');search.type='search';search.placeholder='공고명·기관 검색'
  const status=el('p','','저장된 공고를 불러오는 중…'),list=el('div','milo-list')
  const link=button('기업마당 공식 지원사업공고 열기',()=>external('https://www.bizinfo.go.kr/sii/siia/selectSIIA200View.do?schPblancDiv=01'))
  let notices=[]
  const redraw=()=>{
   list.replaceChildren();const q=search.value.trim().toLowerCase()
   const items=notices.filter(n=>(!filter.value||String(n.content).includes('지원 분야: '+filter.value))&&(!q||(n.title+' '+n.content).toLowerCase().includes(q)))
   for(const n of items){const row=el('article','milo-notice-row');const period=String(n.content||'').split('신청 기간: ')[1]||'';let stage='원문 확인'
    if(/상시|예산\s*소진/.test(period))stage='상시·원문 확인'
    else{const dates=period.match(/\d{4}[-.]\d{2}[-.]\d{2}/g)||[];if(dates.length){const last=dates[dates.length-1].replace(/\./g,'-');const end=new Date(last+'T23:59:59+09:00');if(Number.isFinite(end.getTime())){const start=new Date(dates[0].replace(/\./g,'-')+'T00:00:00+09:00');stage=end<Date.now()?'마감':dates.length>1&&Number.isFinite(start.getTime())&&start>Date.now()?'접수 예정':dates.length>1?'접수 중':'원문 확인'}}}
    row.append(el('strong','',n.title),el('p','',stage+' · '+(n.content||'상세 내용은 원문에서 확인하세요.')))
    row.append(button('기업마당 원문 열기',()=>external(n.url),'milo-primary'))
    row.append(button('사업계획서 프롬프트로 연결',()=>{setPrompt('다음 기업마당 지원사업 공고를 참고해 사업계획서 초안을 작성해 줘. 원문과 신청 조건을 반드시 확인하게 안내해.\n공고: '+n.title+'\n신청 정보: '+n.content);document.querySelector('#modal')?.close()}));list.append(row)}
   if(!items.length)list.append(el('p','','표시할 공고가 없습니다.'))
  }
  const load=async()=>{notices=await readNotices();redraw();let last=null;try{last=await readNoticeRefreshTime()}catch{}status.textContent=notices.length+'개 저장된 공고'+(last?' · 마지막 수집 '+last.toLocaleString('ko-KR'):'')+' · 상세·첨부는 원문에서 확인'}
  const refresh=async()=>{
   if(!getUser()){status.textContent='공고 DB 이용을 위해 로그인해 주세요.';return}
   status.textContent='기업마당에서 공고 수집 중…'
   try{
    const r=await fetch('/api/bizinfo');const data=await parseJSON(r);if(!r.ok)throw Error(data.message||'공고 조회 실패')
    let added=0,updated=0,existing=0,failed=0
    for(const item of data.items||[]){try{const result=await saveSharedNotice(item);if(result==='added')added++;else if(result==='updated')updated++;else existing++}catch{failed++}}
    if(!failed)await recordNoticeRefresh()
    await load();status.textContent='신규 '+added+'건 · 변경 '+updated+'건 · 기존 '+existing+'건'+(failed?' · 저장 실패 '+failed+'건':'')+' · '+new Date().toLocaleString('ko-KR')
   }catch(e){
    if(!notices.length){try{const r=await fetch('/api/bizinfo');const data=await parseJSON(r);if(r.ok){notices=data.items||[];redraw()}}catch{}}
    status.textContent='DB 수집·저장 실패: '+e.message+' · 기존 또는 저장되지 않은 공고를 표시합니다.'
   }
  }
  filter.onchange=redraw;search.oninput=redraw
  host.append(withLabel('지원 분야',filter),search,button('새로고침',refresh),status,list,link)
  if(!getUser())status.textContent='공고 DB 이용을 위해 로그인해 주세요.'
  else load().then(()=>{if(!notices.length)void refresh()}).catch(async()=>{try{const response=await fetch('/api/bizinfo');const data=await parseJSON(response);if(!response.ok)throw Error();notices=data.items||[];redraw();status.textContent='DB 연결 실패 · 저장되지 않은 최신 공고를 표시합니다.'}catch{status.textContent='공고 DB와 기업마당 조회에 실패했습니다.'}})
 }
 function company(){
  if(!getUser())return toast('기업 프로필은 로그인 후 저장할 수 있습니다.')
  const host=modal('기업 전용 문서 프로필','작성된 문서가 아니라 등록된 기업 정보를 향후 작성 프롬프트에 참고합니다. 현재 계정의 브라우저에 저장됩니다.')
  const p=loadProfile(uid(),storage());const inputs={}
  const labels={company:'회사명',industry:'업종',products:'주요 제품·서비스',description:'회사·사업 소개',tone:'선호하는 문체',website:'홈페이지 주소'}
  for(const key of PROFILE_FIELDS){
   const control=key==='description'?el('textarea'):el('input')
   if(key==='description')control.rows=4
   control.value=p[key];inputs[key]=control
   host.append(withLabel(labels[key],control))
  }
  host.append(button('기업 프로필 저장',()=>{
   try{
    const data=Object.fromEntries(PROFILE_FIELDS.map(k=>[k,inputs[k].value]))
    saveProfile(uid(),data,storage())
    toast('이 계정의 기업 프로필을 저장했습니다.')
    document.querySelector('#modal')?.close()
   }catch(e){toast(e.message)}
  },'milo-primary'))
  host.append(button('기업 소개서 작성 프롬프트로 연결',()=>{
   const context=profileContext(Object.fromEntries(PROFILE_FIELDS.map(k=>[k,inputs[k].value])))
   if(!context)return toast('기업 정보를 입력해 주세요.')
   setPrompt('다음 사용자가 등록한 기업 프로필을 바탕으로 기업 소개서 초안을 작성해 줘. 확인되지 않은 실적은 만들지 마.\\n'+context)
   document.querySelector('#modal')?.close()
  }))
 }
 function pdfImport(){
  const host=modal('PDF 양식 텍스트 인식','텍스트 PDF는 문장을 추출해 새 DOCX 편집 초안으로 가져올 수 있습니다. 스캔 PDF OCR 및 원본 표 병합 완전 복원은 아직 지원하지 않습니다.')
  const input=el('input');input.type='file';input.accept='.pdf,application/pdf'
  const status=el('p','','30페이지·12MB 이하 PDF를 선택하세요.')
  const list=el('div','milo-list')
  const confirm=button('추출한 텍스트를 문서에 추가',()=>{},'milo-primary');confirm.disabled=true
  let pages=[]
  input.onchange=async()=>{
   confirm.disabled=true;status.textContent='PDF 텍스트 추출 중…'
   try{
    pages=await extractTextPdf(input.files?.[0])
    list.replaceChildren()
    for(const page of pages.slice(0,30)){
     const row=el('article','milo-list-item')
     row.append(el('strong','','페이지 '+page.page),el('p','',short(page.text,700)))
     list.append(row)
    }
    status.textContent=pages.length+'페이지 텍스트 인식 완료 · 레이아웃은 텍스트 초안으로 구성'
    confirm.disabled=false
   }catch(e){status.textContent=e.message}
  }
  confirm.onclick=()=>{
   if(!pages.length||!convertToDocxCopy('pdf'))return
   const header=el('h2','','PDF 텍스트 추출 초안')
   paper.append(header)
   for(const page of pages){
    const h=el('h3','','페이지 '+page.page)
    const p=el('p','',page.text);paper.append(h,p)
   }
   markDirty();document.querySelector('#modal')?.close()
   toast('PDF 텍스트를 추가했습니다. DOCX로 저장 후 서식을 확인하세요.')
  }
  host.append(input,status,list,confirm)
 }
 const actions={
  miloGallery:gallery,miloPrompts:showPrompts,miloRecommend:recommendPrompt,
  miloTranslate:()=>transform('translate'),miloTone:()=>transform('tone'),
  miloNotices:notices,miloProfile:company,miloPdf:pdfImport
 }
 window.addEventListener('milosoft:milo-action',e=>{
  const action=e.detail?.action
  if(actions[action])void Promise.resolve(actions[action]()).catch(error=>toast('마일로 도구 오류: '+error.message))
 })
 return {actions}
}
