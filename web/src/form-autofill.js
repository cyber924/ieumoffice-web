// Label-driven two-column form mapping, retaining original DOCX/HWPX cell bindings.
const DEFINITIONS=[
 ['date',['작성일','보고일','작성일자','신청일','품의일','일자'],'date'],
 ['department',['부서','부서명','소속부서'],'personal'],
 ['author',['기안자','담당자','작성자','신청자','성명','신청인'],'personal'],
 ['title',['제목','건명','안건'],'narrative'],
 ['amount',['요청금액','신청금액','품의금액','예산','예산금액','금액'],'numeric'],
 ['body',['품의내용','품의사항','신청내용','요청내용','상세내용','내용'],'narrative'],
 ['work',['업무내용','업무내역','수행업무'],'narrative'],
 ['progress',['진행현황','진행상황'],'narrative'],
 ['plan',['향후계획','추진계획','추후계획'],'narrative'],
 ['purpose',['목적','추진목적','사업목적'],'narrative'],
 ['reason',['사유','신청사유','추진배경'],'narrative'],
 ['remarks',['비고','기타사항'],'narrative']
];
const norm=s=>String(s||'').replace(/[\s:：*·\u00a0]+/g,'').trim();
const read=n=>String(n?.innerText??n?.textContent??'').replace(/\u00a0/g,' ').trim();
const alias=new Map(DEFINITIONS.flatMap(([key,names,kind])=>names.map(n=>[norm(n),{key,kind}])));
export const identifyFormLabel=x=>alias.get(norm(x))||null;
export function captureLabeledForm(root){
 const tables=Array.from(root.querySelectorAll('table')).filter(t=>!t.parentElement?.closest('table')).slice(0,25);
 const groups=[];
 for(const [ti,table] of tables.entries()){
  const found=new Set(),records=[];
  for(const [ri,row] of Array.from(table.rows).entries()){
   const cs=Array.from(row.cells);if(cs.length!==2)continue;
   const left=read(cs[0]);
   const matched=identifyFormLabel(left)
   // A new template need not have its labels hard-coded in advance.
   // Only short, distinct, non-empty label cells are treated as form fields.
   if(!left||left.length>45||cs[1].querySelector('table,img,svg,input,iframe'))continue
   const key=matched?.key||('custom_'+ti+'_'+ri)
   if(found.has(key))continue
   const kind=matched?.kind||
     (/(?:서명|도장|날인|인감|승인|결재|확인란)/.test(left)?'approval':
      /(?:전화|연락처|이메일|주소|계좌|사업자번호|주민등록|이름|성명|담당자)/.test(left)?'personal':
      /(?:금액|수량|단가|비율|실적|비용|예산|매출|정량)/.test(left)?'numeric':
      /(?:작성일|날짜|일자|기간)/.test(left)?'date':'narrative')
   const hint=cs[1].getAttribute('data-hwp-col');
   const c=hint!==null&&Number.isInteger(+hint)&&+hint>=0?+hint:Math.max(1,cs[0].colSpan||1);
   records.push({fieldKey:key,kind,
    cellId:'t'+ti+'r'+ri+'c'+c,table:ti+1,row:ri+1,column:c+1,
    address:'표'+(ti+1)+'!'+String.fromCharCode(65+Math.min(c,25))+(ri+1),
    label:read(cs[0]),rowLabel:read(cs[0]),columnHeader:'내용',
    tableTitle:'입력 양식',current:read(cs[1]).slice(0,1000),editable:true,el:cs[1]});
   found.add(key);
  }
  if(records.length>=3||records.filter(r=>!r.fieldKey.startsWith('custom_')).length>=2)groups.push(records);
 }
 if(!groups.length)return null;
 const all=groups.flat();
 const entries=all.filter(t=>!t.current);
 const withoutNode=({el,...rest})=>rest;
 return {recognized:true,
  targets:entries.map(withoutNode),fields:all.map(withoutNode),
  elements:new Map(entries.map(x=>[x.cellId,x.el])),
  totalAvailable:entries.length,totalTables:tables.length,formTables:groups.length};
}
const unmark=s=>String(s||'').replace(/\*\*/g,'').replace(/^[-•]\s*/,'').trim();
function extractEntries(prompt){
 const values=new Map();let active=null;
 const lines=String(prompt||'').replace(/\r\n?/g,'\n').split('\n');
 const re=/^\s*(?:[-•]\s*|\d{1,2}[.)]\s*)?([^:：=]{1,22}?)\s*[:：=]\s*(.*)$/;
 for(const line of lines){
  const clean=unmark(line),m=re.exec(clean),match=m?identifyFormLabel(m[1]):null;
  if(match){
   active=match.key;
   values.set(active,unmark(m[2]));continue;
  }
  if(active&&clean&&!/^(?:반드시|조건|중요|핵심 요청|핵심요청|품의 주제|다음 내용|주의|입력 조건|수정 조건)/.test(clean)&&
     !/^\d+[.)]\s/.test(clean)&&!/^[-•]\s/.test(line.trim())&&!/^#{1,4}\s/.test(line.trim())){
   values.set(active,(values.get(active)+' '+clean).trim());
  }else if(clean)active=null;
 }
 return values;
}
function inlineValues(prompt,values){
 for(const [key,names] of DEFINITIONS){
  if(values.has(key))continue;
  const namesPattern=names.map(x=>x.replace(/[.*+?^$()|[\]{}\\]/g,'\\$&')).join('|');
  const r=new RegExp('(?:'+namesPattern+')(?:은|는|:|：|=)\\s*([^,，;。\\n]{1,180})');
  const m=r.exec(prompt);
  if(m)values.set(key,unmark(m[1]).replace(/(?:이고|이며|입니다|이야|이에요)$/,'').trim());
 }
}
function dateText(raw,today){
 const s=unmark(raw);const m=s.match(/(\d{4})\s*(?:년|[-./])\s*(\d{1,2})\s*(?:월|[-./])\s*(\d{1,2})\s*일?/);
 if(m){
  const y=+m[1],mo=+m[2],d=+m[3],check=new Date(Date.UTC(y,mo-1,d));
  if(check.getUTCFullYear()===y&&check.getUTCMonth()===mo-1&&check.getUTCDate()===d)return y+'년 '+mo+'월 '+d+'일';
 }
 return /^(오늘|금일|오늘\s*날짜|당일)(\s*기준|\s*로)?$/.test(s)?today:'';
}
function clean(key,v,today){
 let s=unmark(v).replace(/\s+/g,' ').trim();
 if(key==='date')return dateText(s,today);
 if(/^(?:작성해|채워|넣어|입력해|알아서|정보없음)(?:\s|$)/.test(s))return '';
 if(key==='author'||key==='department')return s.length<=70?s:'';
 if(key==='amount'){
  const m=s.match(/(?:[\d,]+(?:\.\d+)?\s*(?:원|만원|천원|억원))|(?:금액\s*미확정(?:\s*\([^)]*\))?)|(?:미확정(?:\s*\([^)]*\))?)/);
  return m?m[0]:'';
 }
 return s.slice(0,1000);
}
export function extractLabeledValues(prompt,{today='',profile={}}={}){
 const values=extractEntries(prompt);inlineValues(String(prompt||''),values);
 const result=new Map();
 for(const [key,v] of values){const cleaned=clean(key,v,today);if(cleaned)result.set(key,cleaned);}
 if(!result.has('date')&&/(?:오늘|금일)/.test(prompt)&&today)result.set('date',today);
 if(!result.has('department')&&profile?.department)result.set('department',profile.department);
 if(!result.has('author')&&(profile?.assignee||profile?.author))result.set('author',profile.assignee||profile.author);
 return result;
}
// Interpret a stated total independently from ordinary item amounts.
function requestedTotal(prompt){
 const m=String(prompt||'').match(/(?:총\s*(?:견적\s*)?금액|견적\s*총액|총액|합계)\s*(?:은|는|이|가|:|=)?\s*([0-9,]+(?:\.\d+)?\s*(?:천만원|백만원|십만원|억원|만원|천원|원)?|[일이삼사오육칠팔구십백천만억]+\s*원?)/)
 if(!m)return null
 const raw=m[1].replace(/[,\s]/g,'').replace(/원$/,'')
 let value=0
 if(/^\d/.test(raw)){
  const n=parseFloat(raw);value=n*(raw.includes('천만')?10000000:raw.includes('백만')?1000000:raw.includes('십만')?100000:raw.includes('억')?100000000:raw.includes('만')?10000:raw.includes('천')?1000:1)
 }else{
  const digits={일:1,이:2,삼:3,사:4,오:5,육:6,칠:7,팔:8,구:9},units={십:10,백:100,천:1000}
  let section=0,n=0
  for(const ch of raw){if(digits[ch])n=digits[ch];else if(units[ch]){section+=(n||1)*units[ch];n=0}else if(ch==='만'||ch==='억'){value+=(section+n||1)*(ch==='억'?100000000:10000);section=0;n=0}else return null}
  value+=section+n
 }
 return Number.isSafeInteger(value)&&value>0?value.toLocaleString('ko-KR')+'원':null
}
export function proposeLabeledForm(snapshot,prompt,options={}){
 if(!snapshot?.recognized)return [];
 const values=extractLabeledValues(prompt,options);
 const edits=snapshot.targets.filter(t=>values.has(t.fieldKey)).map(t=>({cellId:t.cellId,value:values.get(t.fieldKey),source:'사용자 제공 정보'}));
 const total=requestedTotal(prompt);
 if(total)for(const t of snapshot.targets){if(/^(?:합계|총액|총금액|견적총액|총견적금액)$/.test(norm(t.label))&&!edits.some(e=>e.cellId===t.cellId))edits.push({cellId:t.cellId,value:total,source:'사용자 제공 정보'});}
 return edits;
}
export function formRemaining(snapshot,edits){
 const set=new Set((edits||[]).map(e=>e.cellId));
 return (snapshot?.targets||[]).filter(t=>!set.has(t.cellId)).map(t=>t.label);
}
