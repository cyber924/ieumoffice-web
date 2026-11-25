export const ADMIN_EMAIL='cyber924@naver.com'
const data=[
 ['품의서','행정','작성일|부서|기안자|제목|요청금액|품의 내용'],
 ['업무보고서','행정','보고일|부서|담당자|업무 내용|진행 현황|향후 계획'],
 ['신청서','행정','신청자|연락처|신청 내용|신청일|확인란'],
 ['계약 검토표','법률','계약명|계약 상대방|계약 금액|기간|검토 의견|담당자'],
 ['회의록','행정','회의명|회의일|참석자|안건|결정사항|후속조치'],
 ['기본 양식','기타','항목|내용'],
 ['사업계획서','사업','사업명|사업 배경|목표 고객|서비스 내용|시장 분석|수익 모델|추진 일정|예산|기대 효과'],
 ['사업 제안서','사업','제안명|제안 배경|고객 요구사항|수행 범위|추진 방법|일정|예산|기대 효과'],
 ['업무협약서','법률','협약 당사자|협약 목적|협력 분야|역할과 책임|협약 기간|비밀유지|분쟁 해결|서명'],
 ['비밀유지계약서','법률','계약 당사자|목적|비밀정보 정의|사용 범위|비밀유지 의무|예외|유효 기간|반환 및 폐기|서명'],
 ['견적서','회계','견적번호|발행일|공급자|수신처|품목 및 규격|수량|단가|합계|유효 기간|비고'],
 ['지출결의서','회계','결의일|부서|담당자|지출 목적|지출 항목|금액|지급처|증빙 자료|검토 사항'],
 ['프로젝트 진행보고서','IT','프로젝트명|보고일|담당자|목표|주요 성과|진행 현황|문제와 위험|향후 일정'],
 ['행사 운영계획서','행사','행사명|목적|일시 및 장소|대상|프로그램|역할 분담|예산|안전 계획|홍보 계획'],
 ['교육 계획서','교육','교육명|목표|대상|일정|교육 내용|운영 방법|강사|예산|평가 방법'],
 ['채용 공고문','인사','채용 직무|담당 업무|자격 요건|우대 사항|근무 조건|접수 기간|전형 절차|문의처']
]
export const DEFAULT_TEMPLATES=data.map(([title,category,fields])=>({title,category,fields:fields.split('|'),source:'기본'}))
export function cleanTemplate(value){
 const title=String(value?.title||'').trim().slice(0,80),category=String(value?.category||'기타').trim().slice(0,30)
 const fields=Array.isArray(value?.fields)?value.fields.map(x=>String(x||'').trim().slice(0,80)).filter(Boolean).slice(0,25):[]
 if(!title||fields.length<2)throw Error('양식 이름과 두 개 이상의 항목이 필요합니다.')
 return {title,category,fields,source:value?.source==='AI'?'AI':'기본'}
}
export function filterTemplates(items,category,term,favorites,onlyFavorites=false){
 const q=String(term||'').trim().toLocaleLowerCase()
 return items.filter(x=>(!category||x.category===category)&&(!onlyFavorites||favorites.has(x.id))&&(!q||[x.title,x.category,...x.fields].join(' ').toLocaleLowerCase().includes(q)))
}
