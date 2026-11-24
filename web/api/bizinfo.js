// Public Bizinfo listing, using the same key-free server-side collection as GoPlan.
import {load} from 'cheerio'
const SOURCE='https://www.bizinfo.go.kr/sii/siia/selectSIIA200View.do?schPblancDiv=01'
const FALLBACK=SOURCE
const categories={'01':'금융','02':'기술','03':'인력','04':'수출','05':'내수','06':'창업','07':'경영','09':'기타'}
const clean=(value,max=1800)=>String(value??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim().slice(0,max)
const safeLink=input=>{
 try{const u=new URL(input,'https://www.bizinfo.go.kr');return u.protocol==='https:'&&['bizinfo.go.kr','www.bizinfo.go.kr'].includes(u.hostname)&&(/\/view\.do$/i.test(u.pathname)||/\/selectSIIA200Detail\.do$/i.test(u.pathname))?u.toString():null}catch{return null}
}
// Retained for existing callers and tests.
export function normalizeBizInfoPayload(body){
 const root=body?.jsonArray||body?.channel||body
 const rows=root?.item
 return (Array.isArray(rows)?rows:rows?[rows]:[]).slice(0,100).flatMap(x=>{
  const url=safeLink(x.pblancUrl||x.link),title=clean(x.pblancNm||x.title,190)
  return url&&title?[{title,content:clean(x.bsnsSumryCn||x.description||'',1400),url}]:[]
 })
}
export function parseBizInfoList(html,field=''){
 const $=load(html),items=[],seen=new Set()
 $('table tbody tr').each((_,tr)=>{
  const cells=$(tr).find('td');if(cells.length<3)return
  let a=$(tr).find('td.subject a').first();if(!a.length)a=$(tr).find('a').first()
  const title=clean(a.text(),190);if(!title)return
  const raw=[a.attr('href')||'',a.attr('onclick')||'',$(tr).html()||''].join(' ')
  let url=safeLink(a.attr('href')||'')
  const id=raw.match(/PBLN_[A-Za-z0-9_]+/i)?.[0]
  if(!url&&id){const u=new URL('/sii/siia/selectSIIA200Detail.do','https://www.bizinfo.go.kr');u.searchParams.set('pblancId',id);url=u.toString()}
  if(!url||seen.has(url))return
  const texts=cells.toArray().map(td=>clean($(td).text(),250))
  const category=texts.find(t=>Object.values(categories).includes(t))||''
  if(field&&categories[field]&&category!==categories[field])return
  const titleIndex=texts.findIndex(t=>t.includes(title))
  const period=titleIndex>=0?texts[titleIndex+1]||'':''
  const org=titleIndex>=0?texts[titleIndex+2]||'':''
  const agency=titleIndex>=0?texts[titleIndex+3]||'':''
  const content=[category&&'지원 분야: '+category,org&&'소관 기관: '+org,agency&&'수행 기관: '+agency,period&&'신청 기간: '+period].filter(Boolean).join(' · ')
  seen.add(url);items.push({title,content,url})
 })
 return items.slice(0,100)
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'})
 const area=String(req.query.field||'')
 try{
  const upstream=await fetch(SOURCE,{redirect:'follow',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Mozilla/5.0 (compatible; Mozilla/5.0)','Accept':'text/html,application/xhtml+xml','Accept-Language':'ko-KR,ko;q=0.9','Referer':'https://www.bizinfo.go.kr/'}})
  if(!upstream.ok)throw new Error('upstream')
  const html=await upstream.text()
  const all=parseBizInfoList(html)
  if(!all.length)throw new Error('unexpected listing')
  res.setHeader('Cache-Control','s-maxage=300,stale-while-revalidate=900')
  return res.status(200).json({items:area&&categories[area]?parseBizInfoList(html,area):all,source:FALLBACK})
 }catch{
  return res.status(502).json({error:'BIZINFO_UNAVAILABLE',message:'기업마당 공고를 불러오지 못했습니다.',source:FALLBACK,items:[]})
 }
}
