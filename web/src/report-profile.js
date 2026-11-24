// Work report defaults are derived from confirmed user data and local calendar.
// Never infer a real person's name/department from email or from an AI response.
// Profile values are optional, stored only on the current browser for that Firebase uid.
import {proposeBusinessReport} from './business-report.js'
const KEYS=['department','assignee']
const storeKey=uid=>'milosoft-report-profile-v1:'+String(uid||'')
const normalized=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,80)
const isMissing=s=>/^(?:미정|없음|비움|빈칸|입력하지 않음|알 수 없음)$/i.test(s)
export function readReportProfile(identity,storage){
  const uid=identity?.uid
  if(!uid)return {department:'',assignee:''}
  const source=storage||(typeof localStorage!=='undefined'?localStorage:null)
  let saved={}
  try{saved=JSON.parse(source?.getItem(storeKey(uid))||'{}')||{}}catch{}
  const assignee=normalized(saved.assignee||identity.displayName||'')
  const department=normalized(saved.department||'')
  return {
    department:!isMissing(department)?department:'',
    assignee:!isMissing(assignee)?assignee:''
  }
}
export function saveReportProfile(identity,values,storage){
  if(!identity?.uid)throw new Error('로그인이 필요합니다.')
  const cleaned={}
  for(const key of KEYS){
    const value=normalized(values?.[key])
    if(value.length>70)throw new Error('기본 정보는 70자 이하로 입력해 주세요.')
    cleaned[key]=value
  }
  const source=storage||(typeof localStorage!=='undefined'?localStorage:null)
  if(!source)throw new Error('이 브라우저는 로컬 저장을 지원하지 않습니다.')
  source.setItem(storeKey(identity.uid),JSON.stringify(cleaned))
  return cleaned
}
export function reportToday(now=new Date()){
  // Never use a UTC date for a Korean business report.
  return new Intl.DateTimeFormat('ko-KR',{
    timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric'
  }).format(now)
}
function shouldSkip(prompt,key){
  const text=String(prompt||'')
  const subject=key==='date'?'보고일|날짜|일자':key==='department'?'부서|부서명':'담당자|작성자|이름'
  return new RegExp('(?:'+subject+').{0,18}(?:비워|입력하지|제외|생략|쓰지 마|미정)').test(text)
}
export function proposeReportDefaults(snapshot,prompt,{today,profile={}}={}){
  if(!snapshot?.recognized)return []
  const values=new Map(proposeBusinessReport(snapshot,prompt,{today}).map(x=>[x.cellId,x]))
  for(const target of snapshot.targets){
    if(values.has(target.cellId)||shouldSkip(prompt,target.fieldKey))continue
    let value=''
    if(target.fieldKey==='date')value=today||''
    if(target.fieldKey==='department')value=profile.department||''
    if(target.fieldKey==='assignee')value=profile.assignee||''
    value=normalized(value)
    if(!value)continue
    values.set(target.cellId,{
      cellId:target.cellId,value,
      source:target.fieldKey==='date'?'기본 보고일(서울 날짜)':'사용자가 설정한 업무보고 기본 정보'
    })
  }
  return Array.from(values.values())
}
export function missingReportProfileFields(snapshot,edits){
 const filled=new Set(edits.map(x=>x.cellId))
 return (snapshot?.targets||[]).filter(x=>
   ['department','assignee'].includes(x.fieldKey)&&!filled.has(x.cellId)
 ).map(x=>x.label)
}
