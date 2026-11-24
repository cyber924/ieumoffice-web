// Server proxy for ImageHub's metadata-only public gallery endpoint.
const origin='https://imagehub-2vhv.vercel.app'
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'})
 const cursor=String(req.query.cursor||'')
 if(cursor.length>4096||!/^[A-Za-z0-9+/_=%:.\-]*$/.test(cursor))return res.status(400).json({error:'INVALID_CURSOR'})
 const url=new URL('/api/public-gallery',origin)
 if(cursor)url.searchParams.set('cursor',cursor)
 try{
  const upstream=await fetch(url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(14000)})
  if(!upstream.ok)throw new Error('HUB_UNAVAILABLE')
  const payload=await upstream.json()
  const items=Array.isArray(payload.items)?payload.items.slice(0,40).filter(i=>{
   try{const u=new URL(i.url);return u.origin===origin&&u.pathname.startsWith('/api/images/')}catch{return false}
  }).map(i=>({id:String(i.id).slice(0,200),title:String(i.title||'이미지').slice(0,180),url:i.url,tags:Array.isArray(i.tags)?i.tags.slice(0,10).map(String):[]})):[]
  res.setHeader('Cache-Control','s-maxage=60,stale-while-revalidate=120')
  return res.status(200).json({items,nextCursor:typeof payload.nextCursor==='string'?payload.nextCursor:null})
 }catch{
  return res.status(502).json({error:'IMAGEHUB_UNAVAILABLE',items:[],message:'이미지허브 공개 갤러리 연결을 확인하세요.'})
 }
}
