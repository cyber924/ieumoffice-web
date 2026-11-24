// Universal reviewed-draft completion. Example values are NOT verified facts.
// The document is never changed here; original table bindings remain owned by the editor.
export const AUTOFILL_MODES={
  sample:'전체 자동완성 · 예시값 사용',
  strict:'실제 정보 우선 · 미확인 항목 비움'
}
const trim=s=>String(s??'').replace(/\s+/g,' ').trim()
const sample='기본 예시값 (확인 후 수정)'
function relevantLabel(t){
 return trim([t.rowLabel,t.label,t.columnHeader,t.tableTitle].filter(Boolean).join(' '))
}
const explicitSkip=/(?:실제\s*서명|인감\s*날인|전자\s*서명|결재\s*완료|승인\s*확정)/
function exampleFor(t,{today='',profile={},prompt=''}={}){
 const key=t.baseKey||t.fieldKey||''
 const label=relevantLabel(t)
 const subject=trim(prompt).replace(/^\s*현재\s*열려\s*있는\s*/,'').slice(0,75)
 const purpose=subject&&subject.length>=6?'요청 주제에 따른 ':'문서 목적에 따른 '
 if(key==='date'||/(?:작성일|보고일|신청일|품의일|날짜|일자)/.test(label))return today||'작성일 확인 필요 (예시)'
 if(key==='department'||/(?:부서|소속팀|소속부서)/.test(label))return trim(profile.department)||'경영'
 if(key==='author'||/(?:기안자|담당자|작성자|신청인|신청자|대표자|성명|이름|발신인|수신인)/.test(label))return trim(profile.assignee||profile.author)||'홍길동'
 if(key==='company'||/(?:회사명|기업명|상호|법인명|사업자명)/.test(label))return '예시 주식회사'
 if(key==='amount'||/(?:요청금액|품의금액|신청금액|금액|예산|단가|비용|합계|총액)/.test(label))return '예산 검토 필요 (예시)'
 if(/(?:전화|연락처|휴대폰|팩스)/.test(label))return '연락처 확인 필요 (예시)'
 if(/(?:이메일|전자우편)/.test(label))return '이메일 확인 필요 (예시)'
 if(/(?:주소|소재지|사업장)/.test(label))return '주소 확인 필요 (예시)'
 if(/(?:계좌|주민등록|사업자등록번호|식별번호)/.test(label))return '정보 확인 필요 (예시)'
 if(/(?:서명|날인|인감|결재|승인|확인란)/.test(label))return '승인 전 — 별도 확인 필요 (예시)'
 if(/(?:완료일|마감일|기간|기한|납기)/.test(label))return '일정 확인 필요 (예시)'
 if(/(?:매출|수량|실적|성장률|목표치|비율|정량|점수|통계)/.test(label))return '예상 수치 검토 필요 (예시)'
 if(/(?:국가|지역|장소|위치)/.test(label))return '장소 확인 필요 (예시)'
 if(key==='title'||/(?:제목|안건|건명)/.test(label))return '업무 추진 및 품질 개선 계획 (예시)'
 if(key==='body'||/(?:품의\s*내용|신청\s*내용|요청\s*내용|상세\s*내용|본문|의견)/.test(label))return purpose+'주요 과제와 개선 사항을 검토하고, 실행 절차 및 품질 확인 계획을 수립하는 내용입니다. (예시 초안)'
 if(key==='work'||/(?:업무\s*내용|추진\s*내용|수행\s*업무)/.test(label))return purpose+'핵심 기능 점검과 업무 개선을 추진합니다. (예시 초안)'
 if(key==='progress'||/(?:진행\s*현황|추진\s*현황|진척\s*상황)/.test(label))return '현재 단계별 추진 항목을 점검 중이며 검증 결과 확인이 필요합니다. (예시 초안)'
 if(key==='plan'||/(?:향후\s*계획|추진\s*계획|향후\s*일정)/.test(label))return '요구사항을 검토한 뒤 기능 검증과 사용성 테스트를 순차적으로 진행할 계획입니다. (예시 초안)'
 if(key==='purpose'||/(?:사업\s*목적|추진\s*목적|목표)/.test(label))return '업무 효율과 결과물의 품질을 높이기 위한 추진 계획입니다. (예시 초안)'
 if(key==='reason'||/(?:사유|배경|필요성)/.test(label))return '업무 처리 효율과 서비스 품질 개선 필요성에 따른 검토 내용입니다. (예시 초안)'
 if(key==='remarks'||/(?:비고|참고|특이사항)/.test(label))return '세부 사항 확인 후 수정 필요 (예시)'
 if(t.kind==='date')return today||'날짜 확인 필요 (예시)'
 if(t.kind==='personal')return '정보 확인 필요 (예시)'
 if(t.kind==='approval')return '승인 전 — 별도 확인 필요 (예시)'
 if(t.kind==='numeric')return '수치 검토 필요 (예시)'
 if(explicitSkip.test(label))return '승인 전 — 별도 확인 필요 (예시)'
 return '검토용 내용 작성 예시 — '+(trim(t.rowLabel||t.columnHeader).slice(0,35)||'세부 항목')+' 확인 후 수정'
}
export function completeDraft(snapshot,direct=[],generated=[],{mode='sample',today='',profile={},prompt=''}={}){
 if(!snapshot?.targets)return {edits:[],examples:0,missing:0}
 const targets=new Map(snapshot.targets.map(t=>[t.cellId,t]))
 const accepted=new Map()
 for(const [index,entry] of [...direct,...generated].entries()){
  const t=targets.get(entry?.cellId)
  const value=typeof entry?.value==='string'?entry.value.trim():''
  if(!t||t.current||!value||value.length>1000||accepted.has(entry.cellId))continue
  // Model output cannot invent identity, financial facts, approvals, or dates.
  // These must come from the user, current date, or explicitly marked placeholders.
  if(index>=direct.length && (['date','personal','numeric','approval'].includes(t.kind)||
      ['date','author','department','amount'].includes(t.baseKey||t.fieldKey)))continue
  accepted.set(t.cellId,{cellId:t.cellId,value,source:entry.source||'AI 초안 (검토 필요)'})
 }
 if(mode==='sample'){
  for(const t of snapshot.targets){
   if(accepted.has(t.cellId)||t.current)continue
   const value=exampleFor(t,{today,profile,prompt})
   if(value)accepted.set(t.cellId,{cellId:t.cellId,value,source:sample})
  }
 }
 const edits=snapshot.targets.filter(t=>accepted.has(t.cellId)).map(t=>accepted.get(t.cellId))
 return {edits,examples:edits.filter(e=>e.source===sample).length,
  missing:snapshot.targets.filter(t=>!accepted.has(t.cellId)).length}
}
export function isUnverifiedDraft(source){
 return /예시|AI 초안|검토/.test(String(source||''))
}
