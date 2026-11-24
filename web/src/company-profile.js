export const PROFILE_FIELDS=['company','industry','products','description','tone','website']
export const emptyProfile=()=>({company:'',industry:'',products:'',description:'',tone:'격식 있고 자연스럽게',website:''})
export function cleanProfile(data){
 const result={}
 for(const field of PROFILE_FIELDS)result[field]=String(data?.[field]||'').trim().slice(0,field==='description'?2200:300)
 return result
}
export function loadProfile(uid,storage){
 try{return cleanProfile(JSON.parse(storage.getItem('milosoft-company-profile:'+uid)||'{}'))}catch{return emptyProfile()}
}
export function saveProfile(uid,data,storage){
 if(!uid)throw Error('먼저 로그인해 주세요.')
 const value=cleanProfile(data)
 storage.setItem('milosoft-company-profile:'+uid,JSON.stringify(value))
 return value
}
export function profileContext(profile){
 const p=cleanProfile(profile)
 return PROFILE_FIELDS.filter(k=>p[k]).map(k=>k+': '+p[k]).join('\n')
}
