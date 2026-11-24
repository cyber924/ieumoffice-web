// Only this server imports public notices into the shared Firestore collection.
import {createRemoteJWKSet,jwtVerify} from 'jose'
import {getApps,initializeApp,cert} from 'firebase-admin/app'
import {getFirestore,Timestamp,FieldValue} from 'firebase-admin/firestore'
import {parseBizInfoList} from './bizinfo.js'
const SOURCE='https://www.bizinfo.go.kr/sii/siia/selectSIIA200View.do?schPblancDiv=01'
const JWKS=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'))
function database(){
 const projectId=process.env.FIREBASE_PROJECT_ID,clientEmail=process.env.FIREBASE_CLIENT_EMAIL,privateKey=process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n')
 if(!projectId||!clientEmail||!privateKey)throw new Error('FIREBASE_ADMIN_NOT_CONFIGURED')
 const app=getApps().find(a=>a.name==='milo-notices')||initializeApp({credential:cert({projectId,clientEmail,privateKey}),projectId},'milo-notices')
 return getFirestore(app)
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'})
 const project=process.env.FIREBASE_PROJECT_ID,token=(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1]
 if(!project||!token)return res.status(401).json({message:'로그인 후 공고를 수집할 수 있습니다.'})
 try{const {payload}=await jwtVerify(token,JWKS,{issuer:'https://securetoken.google.com/'+project,audience:project,algorithms:['RS256']});if(!payload.sub)throw Error('unauthorized')}catch{return res.status(401).json({message:'로그인 정보를 확인해 주세요.'})}
 let db
 try{db=database()}catch{return res.status(503).json({error:'FIREBASE_ADMIN_NOT_CONFIGURED',message:'공고 저장을 위한 서버 Firebase 연결이 필요합니다.'})}
 const ref=db.doc('miloSyncLocks/bizinfo'),nonce=globalThis.crypto.randomUUID(),now=Date.now()
 try{
  const acquired=await db.runTransaction(async tx=>{const snap=await tx.get(ref),old=snap.data();if(old?.expiresAt?.toMillis()>Date.now())return false;tx.set(ref,{nonce,expiresAt:Timestamp.fromMillis(Date.now()+60000)},{merge:true});return true})
  if(!acquired)return res.status(409).json({message:'다른 사용자가 공고를 수집 중입니다. 잠시 후 다시 확인해 주세요.'})
  let completed=false
  try{
   const response=await fetch(SOURCE,{redirect:'follow',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Mozilla/5.0 (compatible; Mozilla/5.0)','Accept':'text/html,application/xhtml+xml','Accept-Language':'ko-KR,ko;q=0.9','Referer':'https://www.bizinfo.go.kr/'}})
   if(!response.ok)throw Error('기업마당 연결 실패')
   const items=parseBizInfoList(await response.text());if(!items.length)throw Error('기업마당 공고 목록을 확인하지 못했습니다.')
   let added=0,updated=0
   for(const item of items){const url=new URL(item.url),id=url.searchParams.get('pblancId');if(!/^PBLN_[A-Za-z0-9_]+$/.test(id||''))continue
    const document=db.doc('miloBizinfoNotices/'+id)
    const outcome=await db.runTransaction(async tx=>{const doc=await tx.get(document),old=doc.data();if(old&&old.title===item.title&&old.content===item.content&&old.url===item.url)return 'existing';tx.set(document,{...item,updatedAt:FieldValue.serverTimestamp()});return old?'updated':'added'})
    if(outcome==='added')added++;if(outcome==='updated')updated++
   }
   completed=true;return res.status(200).json({added,updated,existing:items.length-added-updated,collectedAt:new Date().toISOString()})
  }finally{await db.runTransaction(async tx=>{const doc=await tx.get(ref);if(doc.data()?.nonce===nonce)tx.set(ref,{expiresAt:Timestamp.fromMillis(0),...(completed?{lastCompletedAt:FieldValue.serverTimestamp()}:{})},{merge:true})}).catch(()=>{})}
 }catch{return res.status(502).json({message:'기업마당 공고 수집 또는 DB 저장에 실패했습니다. 기존 공고는 유지됩니다.'})}
}
