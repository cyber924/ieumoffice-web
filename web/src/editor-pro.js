// MiloSoft ribbon editor for new DOCX documents and safe read/modify mode on imported files.
const ribbon = {
  '파일': [
    ['새 문서','newDocument'],['파일 열기','openFile'],['내 문서','myDocuments'],['DOCX / HWPX 저장','saveFile'],['클라우드 저장','cloudSave'],['다른 이름으로 저장','cloudSaveAs'],['인쇄','printDoc'],['양식 선택','templates']
  ],
  '편집': [
    ['실행 취소','undo'],['다시 실행','redo'],['모두 선택','selectAll'],['찾기·바꾸기','find'],['복사','copy'],['붙여넣기','paste']
  ],
  '보기': [
    ['확대 +','zoomIn'],['축소 −','zoomOut'],['100%','zoomReset'],['눈금자 표시','ruler'],['편집 기호','marks']
  ],
  '입력': [
    ['표 삽입','insertTable'],['오늘 날짜','today'],['구분선','hr'],['링크','link'],['글상자','box'],['그림','image'],['도형','shape'],['웹폰트','webFont'],['문자표','symbols']
  ],
  '서식': [
    ['굵게','bold'],['기울임','italic'],['밑줄','underline'],['왼쪽','alignLeft'],['가운데','alignCenter'],['오른쪽','right'],['양쪽','justify'],
    ['제목','heading'],['글머리기호','bullets'],['번호 목록','numbers'],
    ['글꼴','font'],['글자 크기','size'],['글자색','color'],['강조색','highlight'],['줄 간격','lineHeight']
  ],
  '쪽': [
    ['A4 세로','portrait'],['A4 가로','landscape'],['여백 보통','marginNormal'],['여백 좁게','marginNarrow'],['문서 인쇄','printDoc']
  ],
  '표': [
    ['표 삽입','insertTable'],['행 추가','addRow'],['열 추가','addColumn'],['행 삭제','deleteRow'],['열 삭제','deleteColumn'],
    ['셀 병합','mergeCells'],['셀 분할','splitCell'],['셀 가운데','centerCell'],['표 가운데 배치','centerTable'],['셀 배경','cellBackground'],['테두리색','borderColor']
  ],
  '도구': [
    ['문서 검사','inspect'],['맞춤법 검사','spell'],['버전 비교','compare'],['AI 참고 검색','searchAI'],['문서 찾기','myDocuments']
  ]
}
const needsNew = new Set(['today','hr','link','box','font','size','color','highlight','lineHeight','right','justify','heading','bullets','numbers','landscape','portrait','marginNormal','marginNarrow','deleteRow','deleteColumn','splitCell','cellBackground','borderColor','marks'])
const htmlEsc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function installRibbon({paper,isImported,markDirty,toast,getCell,inspect,compare,searchAI}) {
  const quick=document.querySelector('.toolbar')
  const ribbonRoot=document.createElement('section')
  ribbonRoot.className='milosoft-ribbon'
  ribbonRoot.setAttribute('aria-label','문서 편집 메뉴')
  const nav=document.createElement('div')
  nav.className='ribbon-tabs'
  const tools=document.createElement('div')
  tools.className='ribbon-tools'
  const caption=document.createElement('div')
  caption.className='ribbon-caption'
  caption.textContent='새 문서: DOCX 서식 일부 저장 지원 · 가져온 문서: 표 셀·단락 텍스트 위주 보존 편집'
  ribbonRoot.append(nav,tools,caption)
  quick.before(ribbonRoot)
  quick.classList.add('quick-toolbar')
  let zoom=100
  let active='표'
  let selectionRange=null
  let showMarks=false
  const click=id=>document.getElementById(id)?.click()
  const within=()=>{const s=getSelection();return s?.rangeCount&&paper.contains(s.anchorNode)}
  document.addEventListener('selectionchange',()=>{if(within())selectionRange=getSelection().getRangeAt(0).cloneRange()})
  function restore(){
    if(selectionRange && paper.contains(selectionRange.commonAncestorContainer)){
      const sel=getSelection();sel.removeAllRanges();sel.addRange(selectionRange)
    }
    paper.focus()
  }
  function exec(command,value){
    if(command==='justifyCenter'&&cell()){
      const target=cell()
      target.style.textAlign='center'
      for(const p of target.querySelectorAll('p,div,h1,h2'))p.style.textAlign='center'
      markDirty();toast('셀의 글자를 가운데 정렬했습니다.');return
    }
    restore();document.execCommand(command,false,value);markDirty()
  }
  function cell(){return getCell()}
  function table(){return cell()?.closest('table')}
  function noImported(id) {
    if(isImported() && needsNew.has(id)){toast('가져온 DOCX/HWPX는 원본 구조 보존을 위해 이 편집 도구를 제한합니다. 새 DOCX 문서에서 사용해 주세요.');return true}
    return false
  }
  function activeParent(){
    let n=selectionRange?.startContainer
    if(n?.nodeType===3)n=n.parentElement
    return n?.closest?.('p,h1,h2,h3,div,li')||null
  }
  async function paste(){
    restore()
    try{const text=await navigator.clipboard.readText();if(!text)return;document.execCommand('insertText',false,text);markDirty()}
    catch{toast('클립보드 읽기 권한이 필요합니다. Ctrl+V를 이용해 주세요.')}
  }
  async function copy(){
    try{if(!selectionRange)return toast('복사할 내용을 선택해 주세요.');await navigator.clipboard.writeText(selectionRange.toString());toast('선택한 텍스트를 복사했습니다.')}
    catch{toast('Ctrl+C로 복사해 주세요.')}
  }
  function replaceAll(){
    const query=prompt('찾을 문구를 입력해 주세요.')
    if(!query)return
    const replacement=prompt('바꿀 문구를 입력해 주세요. (취소하면 변경하지 않음)')
    if(replacement===null)return
    if(!confirm('문서 전체에서 정확히 일치하는 문구를 바꿀까요?'))return
    const walker=document.createTreeWalker(paper,NodeFilter.SHOW_TEXT)
    let node,changes=0
    while((node=walker.nextNode())){
      const prev=node.nodeValue||''
      if(!prev.includes(query))continue
      changes+=prev.split(query).length-1
      node.nodeValue=prev.split(query).join(replacement)
    }
    if(changes){markDirty();toast(changes+'곳을 바꿨습니다.')}else toast('일치하는 문구가 없습니다.')
  }
  function insertMarkup(markup){restore();document.execCommand('insertHTML',false,markup);markDirty()}
  function rowDelete(){
    const tr=cell()?.closest('tr')
    if(!tr)return toast('표 안의 셀을 선택해 주세요.')
    const tbl=tr.closest('table')
    if(tbl.rows.length<=1)return toast('마지막 행은 삭제하지 않습니다.')
    tr.remove();markDirty()
  }
  function columnDelete(){
    const c=cell()
    if(!c)return toast('표 안의 셀을 선택해 주세요.')
    const tbl=c.closest('table')
    const index=c.cellIndex
    if(Array.from(tbl.rows).some(r=>Array.from(r.cells).some(x=>x.colSpan>1||x.rowSpan>1)))return toast('병합된 셀이 포함된 표의 열 삭제는 지원하지 않습니다.')
    if(tbl.rows[0]?.cells.length<=1)return toast('마지막 열은 삭제하지 않습니다.')
    Array.from(tbl.rows).forEach(r=>r.cells[index]?.remove());markDirty()
  }
  function splitCell(){
    const c=cell();if(!c)return toast('셀을 선택해 주세요.')
    const span=c.colSpan
    if(span<=1)return toast('병합된 셀을 선택해 주세요.')
    c.colSpan=1
    for(let i=1;i<span;i++){const created=document.createElement(c.tagName.toLowerCase());created.innerHTML='<br>';c.after(created)}
    markDirty()
  }
  const hexRegex=/^#[0-9A-Fa-f]{6}$/
  function styleCell(key,label){
    const c=cell();if(!c)return toast('표 안의 셀을 선택해 주세요.')
    const value=prompt(label,key==='backgroundColor'?'#eef3f9':'#8b98a9')
    if(value===null)return
    if(!hexRegex.test(value))return toast('색상은 #RRGGBB 형식으로 입력해 주세요.')
    if(key==='backgroundColor')c.style.backgroundColor=value
    else c.style.border='1px solid '+value
    markDirty()
  }
  function styleText(key,label,def){
    const value=prompt(label,def)
    if(value===null)return
    if(key==='fontSize'&&!/^(8|9|10|11|12|13|14|16|18|20|24|28|32)$/.test(value))return toast('지원하는 글자 크기를 선택해 주세요: 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32')
    if(['color','backgroundColor'].includes(key)&&!hexRegex.test(value))return toast('색상은 #RRGGBB 형식으로 입력해 주세요.')
    restore()
    const sel=getSelection()
    if(!sel?.rangeCount||sel.isCollapsed)return toast('서식을 적용할 글자를 먼저 선택해 주세요.')
    const mark=document.createElement('span')
    if(key==='fontSize')mark.style.fontSize=value+'pt'
    else if(key==='fontFamily')mark.style.fontFamily=value
    else mark.style[key]=value
    const range=sel.getRangeAt(0)
    try{range.surroundContents(mark)}
    catch{document.execCommand('styleWithCSS',false,true);document.execCommand(key==='fontSize'?'fontSize':key==='color'?'foreColor':key==='backgroundColor'?'hiliteColor':'fontName',false,value)}
    markDirty()
  }
  function setPage(key,value){
    paper.dataset[key]=value
    if(key==='orientation'){
      const horizontal=value==='landscape'
      paper.style.width=horizontal?'1123px':'794px'
      paper.style.minHeight=horizontal?'794px':'1123px'
    }
    if(key==='margin'){
      paper.style.padding=value==='narrow'?'35px':'75px 72px'
    }
    markDirty();toast('쪽 설정을 변경했습니다. 출력은 Word에서도 확인해 주세요.')
  }
  function openTab(name){
    active=name;tools.replaceChildren()
    for(const [label,id] of ribbon[name]){
      const button=document.createElement('button')
      button.type='button';button.textContent=label
      button.dataset.action=id
      button.title=label
      if(id==='saveFile'||id==='cloudSave'||id==='cloudSaveAs')button.classList.add('ribbon-accent')
      button.addEventListener('mousedown',()=>{if(within())selectionRange=getSelection().getRangeAt(0).cloneRange()})
      button.onclick=()=>run(id)
      tools.append(button)
    }
    for(const b of nav.querySelectorAll('button'))b.classList.toggle('selected',b.dataset.tab===name)
  }
  function run(id){
    if(noImported(id))return
    if(['newDocument','fileInput','myDocuments','saveFile','cloudSave','cloudSaveAs','printDoc','templates','undo','redo','bold','italic','underline','alignLeft','alignCenter','insertTable','addRow','addColumn','mergeCells'].includes(id)){
      click(id==='openFile'?'fileInput':id);return
    }
    switch(id){
      case 'openFile':document.getElementById('fileInput')?.click();break
      case 'selectAll':restore();document.execCommand('selectAll');break
      case 'copy':copy();break
      case 'paste':paste();break
      case 'find':replaceAll();break
      case 'zoomIn':zoom=Math.min(150,zoom+10);paper.style.zoom=zoom+'%';toast('화면 배율 '+zoom+'%');break
      case 'zoomOut':zoom=Math.max(70,zoom-10);paper.style.zoom=zoom+'%';toast('화면 배율 '+zoom+'%');break
      case 'zoomReset':zoom=100;paper.style.zoom='100%';break
      case 'ruler':document.body.classList.toggle('show-ruler');break
      case 'marks':showMarks=!showMarks;paper.classList.toggle('show-marks',showMarks);break
      case 'image':window.dispatchEvent(new CustomEvent('milosoft:media-action',{detail:{kind:'image'}}));break
      case 'shape':window.dispatchEvent(new CustomEvent('milosoft:media-action',{detail:{kind:'shape'}}));break
      case 'webFont':window.dispatchEvent(new CustomEvent('milosoft:media-action',{detail:{kind:'font'}}));break
      case 'symbols':window.dispatchEvent(new CustomEvent('milosoft:media-action',{detail:{kind:'symbol'}}));break
      case 'today':insertMarkup(htmlEsc(new Date().toLocaleDateString('ko-KR')));break
      case 'hr':insertMarkup('<hr>');break
      case 'box':insertMarkup('<table><tbody><tr><td>내용을 입력하세요</td></tr></tbody></table><p><br></p>');break
      case 'link':{
        const url=prompt('링크 주소를 입력하세요. (https://)')
        if(!url)return
        if(!/^https:\/\/[^ ]+$/i.test(url))return toast('https:// 링크만 허용합니다.')
        exec('createLink',url);break
      }
      case 'right':exec('justifyRight');break
      case 'justify':exec('justifyFull');break
      case 'heading':{
        restore();document.execCommand('formatBlock',false,'h2');markDirty();break
      }
      case 'bullets':exec('insertUnorderedList');break
      case 'numbers':exec('insertOrderedList');break
      case 'font':styleText('fontFamily','글꼴을 입력해 주세요. 예: 맑은 고딕','맑은 고딕');break
      case 'size':styleText('fontSize','글자 크기(pt)','12');break
      case 'color':styleText('color','글자색 (#RRGGBB)','#26354e');break
      case 'highlight':styleText('backgroundColor','강조색 (#RRGGBB)','#fff3a3');break
      case 'lineHeight':{
        const value=prompt('줄 간격을 지정하세요. 예: 1.2, 1.5, 1.8','1.5')
        if(value===null)return
        if(!['1','1.2','1.5','1.8','2'].includes(value))return toast('1, 1.2, 1.5, 1.8, 2 중에서 선택해 주세요.')
        const p=activeParent();if(!p)return toast('문단 안에 커서를 두세요.')
        p.style.lineHeight=value;markDirty();break
      }
      case 'portrait':setPage('orientation','portrait');break
      case 'landscape':setPage('orientation','landscape');break
      case 'marginNormal':setPage('margin','normal');break
      case 'marginNarrow':setPage('margin','narrow');break
      case 'deleteRow':rowDelete();break
      case 'deleteColumn':columnDelete();break
      case 'splitCell':splitCell();break
      case 'centerCell':exec('justifyCenter');break
      case 'centerTable':{
        const target=table();if(!target)return toast('표 안에 커서를 두세요.')
        if(isImported())return toast('가져온 문서의 표 위치 변경은 제한합니다.')
        target.style.width='90%';target.style.marginLeft='auto';target.style.marginRight='auto'
        target.dataset.centerTable='true'
        markDirty();toast('표를 가운데 배치했습니다.');break
      }
      case 'cellBackground':styleCell('backgroundColor','셀 배경색 (#RRGGBB)');break
      case 'borderColor':styleCell('borderColor','테두리색 (#RRGGBB)');break
      case 'inspect':inspect();break
      case 'spell':paper.spellcheck=!paper.spellcheck;toast(paper.spellcheck?'브라우저 맞춤법 검사가 켜졌습니다.':'브라우저 맞춤법 검사를 껐습니다.');break
      case 'compare':compare();break
      case 'searchAI':searchAI();break
      default:toast('지원하지 않는 명령입니다: '+id)
    }
  }
  for(const name of Object.keys(ribbon)){
    const button=document.createElement('button')
    button.type='button';button.dataset.tab=name;button.textContent=name
    button.onclick=()=>openTab(name)
    nav.append(button)
  }
  openTab(active)
  return {openTab}
}
