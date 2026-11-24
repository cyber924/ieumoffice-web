// Official Bizinfo support announcements: summary only, attachments never downloaded.
const SOURCE='https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do'
const FALLBACK='https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/list.do'
const clean=(value,max=1800)=>String(value??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim().slice(0,max)
const safeLink=input=>{
 try{const u=new URL(input);return u.protocol==='https:'&&['bizinfo.go.kr','www.bizinfo.go.kr'].includes(u.hostname)&&u.pathname.includes('/view.do')?u.toString():null}catch{return null}
}
const fields=['01','02','03','04','05','06','07','09']
export function normalizeBizInfoPayload(body){
 const root=body?.jsonArray||body?.channel||body
 const rows=root?.item
 return (Array.isArray(rows)?rows:rows?[rows]:[]).slice(0,100).flatMap(x=>{
  const link=safeLink(x.pblancUrl||x.link)
  const title=clean(x.pblancNm||x.title,190)
  if(!link||!title)return []
  return [{title,content:clean(x.bsnsSumryCn||x.description||'',1400),url:link}]
 })
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'})
 const key=process.env.BIZINFO_API_KEY
 if(!key)return res.status(503).json({error:'BIZINFO_KEY_REQUIRED',message:'기업마당 공식 API 인증키 등록이 필요합니다.',source:FALLBACK,items:[]})
 const area=String(req.query.field||'')
 const q=new URL(SOURCE)
 q.searchParams.set('crtfcKey',key)
 q.searchParams.set('dataType','json')
 q.searchParams.set('pageIndex','1')
 q.searchParams.set('pageUnit','30')
 q.searchParams.set('searchCnt','30')
 if(fields.includes(area))q.searchParams.set('searchLclasId',area)
 try{
  const upstream=await fetch(q,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}})
  if(!upstream.ok)throw new Error('BIZINFO_UPSTREAM_'+upstream.status)
  const body=await upstream.json()
  res.setHeader('Cache-Control','s-maxage=300,stale-while-revalidate=900')
  return res.status(200).json({items:normalizeBizInfoPayload(body),source:FALLBACK})
 }catch{
  return res.status(502).json({error:'BIZINFO_UNAVAILABLE',message:'기업마당 공고를 불러오지 못했습니다.',source:FALLBACK,items:[]})
 }
}
