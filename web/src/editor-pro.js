import {tableGrid,insertColumn,deleteColumn,insertRow,deleteRow,columnWidths,setColumns,rangeCells,mergeRange,splitMerged} from './table-grid.js'
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
    ['전체 셀 선택','selectAllCells'],['셀 병합','mergeCells'],['셀 분할','splitCell'],['셀 가운데','centerCell'],['표 가운데 배치','centerTable'],['셀 배경','cellBackground'],['테두리색','borderColor'],
    ['열 너비','columnWidth'],['행 높이','rowHeight'],['셀 여백','cellPadding'],['셀 세로 정렬','cellVertical'],['테두리 굵기','borderWidth'],['열 균등','distributeColumns'],['행 균등','distributeRows'],['페이지 폭에 맞춤','fitTable'],['표 변경 취소','undoTable'],['표 다시 실행','redoTable']
  ],
  '도구': [
    ['문서 검사','inspect'],['맞춤법 검사','spell'],['버전 비교','compare'],['AI 참고 검색','searchAI'],['문서 찾기','myDocuments']
  ],
  '마일로 적용': [
    ['이미지 갤러리','miloGallery'],['프롬프트','miloPrompts'],['AI 추천','miloRecommend'],
    ['문서 번역','miloTranslate'],['문체 변환','miloTone'],['사업공고','miloNotices'],
    ['기업 프로필','miloProfile'],['PDF 양식 인식','miloPdf']
  ]
}
const needsNew = new Set(['today','hr','link','box','font','size','color','highlight','lineHeight','right','justify','heading','bullets','numbers','landscape','portrait','marginNormal','marginNarrow','deleteRow','deleteColumn','splitCell','cellBackground','borderColor','marks','columnWidth','rowHeight','cellPadding','cellVertical','borderWidth','distributeColumns','distributeRows','fitTable','undoTable','redoTable','selectAllCells'])
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
      const targets=activeCells().slice(),t=cell().closest('table');rememberTable(t)
      for(const target of targets){target.style.textAlign='center';for(const p of target.querySelectorAll('p,div,h1,h2'))p.style.textAlign='center'}
      markDirty();toast('선택한 셀을 가운데 정렬했습니다.');return
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
  let selected=[],anchorCell=null,history=[],future=[]
  function clearSelection(){for(const c of selected)c.classList.remove('table-selected');selected=[]}
  function selectCell(c,extend=false){
    if(!c||!paper.contains(c))return
    const t=c.closest('table'),range=extend&&anchorCell?.closest('table')===t?rangeCells(t,anchorCell,c):[c]
    clearSelection();selected=range.length?range:[c];for(const item of selected)item.classList.add('table-selected')
    if(!extend)anchorCell=c
  }
  paper.addEventListener('pointerdown',e=>{const c=e.target.closest?.('td,th');if(c&&paper.contains(c)){selectCell(c,e.shiftKey);if(e.shiftKey)e.preventDefault()}})
  function activeCells(){const c=cell();if(selected.length&&selected.every(x=>x.isConnected&&x.closest('table')===c?.closest('table')))return selected;return c?[c]:[]}
  function tableSnapshot(t){const copy=t.cloneNode(true);for(const c of copy.querySelectorAll('.table-selected'))c.classList.remove('table-selected');return copy.outerHTML}
  function rememberTable(t){
    clearSelection();const entry={table:t,html:tableSnapshot(t),after:null};history.push(entry);if(history.length>40)history.shift();future=[]
    queueMicrotask(()=>{if(history.includes(entry)&&t.isConnected)entry.after=tableSnapshot(t)})
  }
  function applyHistory(from,to){
    const entry=from[from.length-1];if(!entry?.table?.isConnected)return toast('되돌릴 표 변경이 없습니다.')
    const table=entry.table;clearSelection()
    if(entry.after&&entry.after!==tableSnapshot(table))return toast('이후 표 내용이 변경되어 안전하게 되돌릴 수 없습니다.')
    from.pop();to.push({table,html:tableSnapshot(table),after:entry.html})
    const clone=table.ownerDocument.createElement('template');clone.innerHTML=entry.html;const restored=clone.content.firstElementChild
    for(const attr of Array.from(table.attributes))table.removeAttribute(attr.name)
    for(const attr of Array.from(restored.attributes))table.setAttribute(attr.name,attr.value)
    table.innerHTML=restored.innerHTML;anchorCell=null;markDirty()
  }
  function changeStructure(id){
    const c=cell(),t=c?.closest('table');if(!t)return toast('표 안의 셀을 선택해 주세요.')
    if(isImported())return toast('가져온 파일의 표 구조 변경은 아직 지원하지 않습니다.')
    const group=activeCells().slice()
    if((id==='deleteRow'||id==='deleteColumn')&&!confirm('선택한 '+(id==='deleteRow'?'행':'열')+'과 그 안의 내용이 삭제됩니다. 계속할까요?'))return
    rememberTable(t)
    let ok=false
    if(id==='addRow')ok=insertRow(t,c)
    if(id==='addColumn')ok=insertColumn(t,c)
    if(id==='deleteRow')ok=deleteRow(t,c)
    if(id==='deleteColumn')ok=deleteColumn(t,c)
    if(id==='mergeCells'){
      if(group.length<2){const g=tableGrid(t),e=g.cells.get(c),next=e&&g.slots[e.row]?.[e.col+e.colSpan]?.cell;if(next)group.push(next)}
      ok=mergeRange(t,group)
    }
    if(id==='splitCell')ok=splitMerged(t,c)
    if(!ok){history.pop();return toast('선택한 셀의 구조에서는 이 작업을 수행할 수 없습니다.')}
    anchorCell=null;markDirty();toast('표 구조를 변경했습니다.')
  }
  // Intercept the compact toolbar as well as the ribbon so both share one grid implementation.
  for(const id of ['addRow','addColumn','mergeCells'])document.getElementById(id)?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();changeStructure(id)},true)
  function rowDelete(){changeStructure('deleteRow')}
  function columnDelete(){changeStructure('deleteColumn')}
  function splitCell(){changeStructure('splitCell')}
  function prepareColumns(t){const g=tableGrid(t);if(!g.width)return null;const widths=columnWidths(t,g);setColumns(t,widths);return Array.from(t.querySelectorAll(':scope > colgroup > col'))}
  function numberInput(label,initial,min,max){const v=prompt(label,String(Math.round(initial)));if(v===null)return null;const n=Number(v);if(!Number.isFinite(n)||n<min||n>max){toast(min+'~'+max+' 사이의 숫자를 입력해 주세요.');return null}return n}
  function tableAction(id){
    if(id==='undoTable'){window.dispatchEvent(new Event('milosoft:undo'));return}
    if(id==='redoTable'){window.dispatchEvent(new Event('milosoft:redo'));return}
    const c=cell(),t=table();if(!c||!t)return toast('표 안의 셀을 선택해 주세요.')
    const targets=activeCells().slice()
    if(id==='columnWidth'){
      const value=numberInput('선택한 열 너비 (px)',c.getBoundingClientRect().width,28,1000);if(value===null)return
      const pos=tableGrid(t).cells.get(c)?.col;rememberTable(t);const cols=prepareColumns(t);if(!cols||pos==null){history.pop();return toast('열 구조를 확인해 주세요.')}
      cols[pos].style.width=value+'px';t.style.width=Array.from(cols).reduce((a,col)=>a+parseFloat(col.style.width),0)+'px'
    }else if(id==='rowHeight'){
      const row=c.closest('tr'),value=numberInput('선택한 행 높이 (px)',row.getBoundingClientRect().height,18,1000);if(value===null)return
      rememberTable(t);row.style.height=value+'px'
    }else if(id==='cellPadding'){
      const value=numberInput('선택한 셀 안쪽 여백 (px)',parseFloat(getComputedStyle(c).paddingLeft)||0,0,100);if(value===null)return
      rememberTable(t);for(const target of targets)target.style.padding=value+'px'
    }else if(id==='cellVertical'){
      const value=prompt('세로 정렬: 위, 가운데, 아래','가운데');if(value===null)return
      const alignment={'위':'top','가운데':'middle','아래':'bottom'}[value.trim()];if(!alignment)return toast('위, 가운데, 아래 중 하나를 입력해 주세요.')
      rememberTable(t);for(const target of targets)target.style.verticalAlign=alignment
    }else if(id==='borderWidth'){
      const value=numberInput('선택한 셀 테두리 굵기 (px)',1,1,10);if(value===null)return
      rememberTable(t);for(const target of targets){target.style.borderStyle='solid';target.style.borderWidth=value+'px'}
    }else if(id==='distributeColumns'){
      rememberTable(t);const cols=prepareColumns(t);if(!cols){history.pop();return toast('열 구조를 확인해 주세요.')}
      const width=t.getBoundingClientRect().width/cols.length;for(const col of cols)col.style.width=width+'px'
    }else if(id==='distributeRows'){
      rememberTable(t);const rows=Array.from(t.rows),height=t.getBoundingClientRect().height/rows.length;for(const row of rows)row.style.height=height+'px'
    }else if(id==='fitTable'){
      rememberTable(t);t.style.width='100%';const group=t.querySelector(':scope > colgroup');if(group){const cols=Array.from(group.children),sizes=cols.map(c=>parseFloat(c.style.width)||1),sum=sizes.reduce((a,b)=>a+b,0);cols.forEach((c,i)=>c.style.width=(sizes[i]/sum*100)+'%')}
    }
    markDirty();toast('표 크기와 간격을 변경했습니다.')
  }
  let drag=null
  function edgeAt(event){
    const c=event.target.closest?.('td,th');if(!c||!paper.contains(c))return null
    const t=c.closest('table'),g=tableGrid(t),e=g.cells.get(c),rect=c.getBoundingClientRect();if(!e)return null
    const left=Math.abs(event.clientX-rect.left),right=Math.abs(event.clientX-rect.right),top=Math.abs(event.clientY-rect.top),bottom=Math.abs(event.clientY-rect.bottom),hit=7
    if(Math.min(left,right)<=hit){const index=left<right?e.col-1:e.col+e.colSpan-1;if(index>=0&&index<g.width)return {kind:'column',t,index}}
    if(Math.min(top,bottom)<=hit){const index=top<bottom?e.row-1:e.row+e.rowSpan-1;if(index>=0&&index<g.rows.length)return {kind:'row',t,index}}
    return null
  }
  paper.addEventListener('pointerdown',event=>{
    if(isImported()||event.button!==0||event.shiftKey)return
    const edge=edgeAt(event);if(!edge)return
    rememberTable(edge.t)
    if(edge.kind==='column'){const cols=prepareColumns(edge.t);if(!cols){history.pop();return};drag={kind:'column',table:edge.t,cols,index:edge.index,start:event.clientX,original:parseFloat(cols[edge.index].style.width),total:parseFloat(edge.t.style.width)}}
    else{const row=edge.t.rows[edge.index];drag={kind:'row',row,start:event.clientY,original:row.getBoundingClientRect().height}}
    event.preventDefault();paper.setPointerCapture(event.pointerId)
  })
  paper.addEventListener('pointermove',event=>{
    if(!drag){const edge=isImported()?null:edgeAt(event);paper.style.cursor=edge?(edge.kind==='column'?'col-resize':'row-resize'):'';return}
    if(drag.kind==='column'){const width=Math.max(28,drag.original+event.clientX-drag.start);drag.cols[drag.index].style.width=width+'px';drag.table.style.width=(drag.total+width-drag.original)+'px'}else drag.row.style.height=Math.max(18,drag.original+event.clientY-drag.start)+'px';event.preventDefault()
  })
  paper.addEventListener('pointerup',()=>{if(drag){const t=drag.table||drag.row.closest('table');drag=null;const entry=history.at(-1);if(entry?.table===t)entry.after=tableSnapshot(t);markDirty()}})
  paper.addEventListener('pointercancel',()=>{if(drag){drag=null;markDirty()}})
  const hexRegex=/^#[0-9A-Fa-f]{6}$/
  function styleCell(key,label){
    const c=cell();if(!c)return toast('표 안의 셀을 선택해 주세요.')
    const value=prompt(label,key==='backgroundColor'?'#eef3f9':'#8b98a9')
    if(value===null)return
    if(!hexRegex.test(value))return toast('색상은 #RRGGBB 형식으로 입력해 주세요.')
    const targets=activeCells().slice();rememberTable(c.closest('table'))
    for(const target of targets){if(key==='backgroundColor')target.style.backgroundColor=value;else target.style.border='1px solid '+value}
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
    if(id==='selectAllCells'){const t=table();if(!t)return toast('표 안의 셀을 선택해 주세요.');clearSelection();selected=Array.from(t.querySelectorAll('td,th')).filter(c=>c.closest('table')===t);for(const c of selected)c.classList.add('table-selected');return toast('표 전체를 선택했습니다. 여러 셀은 Shift를 누르고 선택할 수 있습니다.')}
    if(['addRow','addColumn','mergeCells'].includes(id)){changeStructure(id);return}
    if(['newDocument','fileInput','myDocuments','saveFile','cloudSave','cloudSaveAs','printDoc','templates','undo','redo','bold','italic','underline','alignLeft','alignCenter','insertTable'].includes(id)){
      click(id==='openFile'?'fileInput':id);return
    }
    if(id.startsWith('milo')){window.dispatchEvent(new CustomEvent('milosoft:milo-action',{detail:{action:id}}));return}
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
      case 'columnWidth':case 'rowHeight':case 'cellPadding':case 'cellVertical':case 'borderWidth':case 'distributeColumns':case 'distributeRows':case 'fitTable':case 'undoTable':case 'redoTable':tableAction(id);break
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
