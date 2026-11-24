let app=null,auth=null,db=null,storage=null
let modules={}
let signedUser=null
const clean=v=>String(v||'').replace(/[^\p{L}\p{N}_.-]/gu,'_').slice(0,100)
const MAX_BYTES=15*1024*1024
const MAX_TEXT=160000
const MAX_CELLS=1800
const TEXT_CHUNK=10000
const CELL_CHUNK=35

export async function initCloud(config,onAuth){
  if(!config?.apiKey||!config?.projectId||!config?.appId)return false
  const [fa,au,fs,st]=await Promise.all([
    import('firebase/app'),import('firebase/auth'),import('firebase/firestore'),import('firebase/storage')
  ])
  modules={au,fs,st}
  app=fa.initializeApp(config)
  auth=au.getAuth(app)
  db=fs.getFirestore(app)
  storage=st.getStorage(app)
  au.onAuthStateChanged(auth,u=>{signedUser=u;onAuth(u)})
  return true
}
export const isCloudReady=()=>!!auth
export const user=()=>signedUser
export const token=async()=>signedUser?await signedUser.getIdToken():null
export async function login(email,password){if(!auth)throw new Error('Firebase 연결이 설정되지 않았습니다.');return modules.au.signInWithEmailAndPassword(auth,email,password)}
export async function register(email,password){if(!auth)throw new Error('Firebase 연결이 설정되지 않았습니다.');return modules.au.createUserWithEmailAndPassword(auth,email,password)}
export async function logout(){if(auth)await modules.au.signOut(auth)}
function requireUser(){if(!signedUser)throw new Error('먼저 로그인하세요.');return signedUser.uid}
const documentRef=(uid,id)=>modules.fs.doc(db,'users',uid,'documents',id)
const revisionsRef=(uid,id)=>modules.fs.collection(db,'users',uid,'documents',id,'revisions')
const chunksRef=(uid,id,rev)=>modules.fs.collection(db,'users',uid,'documents',id,'revisions',rev,'texts')
const cellsRef=(uid,id,rev)=>modules.fs.collection(db,'users',uid,'documents',id,'revisions',rev,'cells')

export function extractDocumentData(paper){
  const text=String(paper?.innerText||'').replace(/\r\n/g,'\n')
  if(Array.from(text).length>MAX_TEXT)throw new Error('본문이 16만 글자를 넘었습니다. 더 작은 문서로 나누어 저장해 주세요.')
  const tables=[]
  const cells=[]
  const all=Array.from(paper.querySelectorAll('table'))
  all.forEach((table,index)=>{
    const rows=Array.from(table.rows)
    const tableRecord={index,rows:rows.length,columns:Math.max(0,...rows.map(r=>r.cells.length))}
    tables.push(tableRecord)
    rows.forEach((row,r)=>{
      Array.from(row.cells).forEach((cell,c)=>{
        cells.push({
          t:index,r,c,span:Math.min(30,cell.colSpan||1),rowSpan:Math.min(30,cell.rowSpan||1),
          text:String(cell.innerText||'').trim().slice(0,1600)
        })
      })
    })
  })
  if(cells.length>MAX_CELLS)throw new Error('표 셀이 1,800개를 넘었습니다. 문서를 나누어 저장해 주세요.')
  return {text,cells,tables,chars:Array.from(text).length,tableCount:tables.length}
}
function batches(arr,count){const result=[];for(let i=0;i<arr.length;i+=count)result.push(arr.slice(i,i+count));return result}
function checkUser(uid){if(requireUser()!==uid)throw new Error('사용자 계정이 변경되어 저장을 중단했습니다.')}
export async function saveCloud(name,blob,kind,id,documentData){
  const uid=requireUser()
  if(!['docx','hwpx'].includes(kind))throw new Error('지원되지 않는 문서 형식')
  if(blob.size>MAX_BYTES)throw new Error('15MB 이하의 문서만 저장할 수 있습니다.')
  if(!documentData||typeof documentData.text!=='string')throw new Error('문서 내용 분석이 필요합니다.')
  const textParts=batches(Array.from(documentData.text),TEXT_CHUNK).map(a=>a.join(''))
  const cellParts=batches(documentData.cells||[],CELL_CHUNK)
  if(textParts.length+cellParts.length>300)throw new Error('문서 색인 데이터가 너무 큽니다.')
  const docId=id||crypto.randomUUID()
  const revisionId='v_'+crypto.randomUUID().replace(/-/g,'')
  const filename=revisionId+'_'+clean(name)
  const storagePath='user-files/'+uid+'/'+docId+'/'+filename
  const docRef=documentRef(uid,docId)
  const previous=await modules.fs.getDoc(docRef)
  checkUser(uid)
  const old=previous.exists()?previous.data():null
  const revisionNumber=Math.max(1,Number(old?.revisionNumber||0)+1)
  const revisionRef=modules.fs.doc(revisionsRef(uid,docId),revisionId)
  const uploadRef=modules.st.ref(storage,storagePath)
  let uploaded=false
  try{
    await modules.st.uploadBytes(uploadRef,blob,{
      contentType:kind==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/octet-stream'
    })
    uploaded=true
    checkUser(uid)
    const batch=modules.fs.writeBatch(db)
    const timestamp=modules.fs.serverTimestamp()
    const metadata={
      name,kind,path:storagePath,size:blob.size,updatedAt:timestamp,
      createdAt:old?.createdAt||timestamp,revisionId,revisionNumber,
      textPreview:documentData.text.slice(0,7500),
      charCount:documentData.chars,tableCount:documentData.tableCount
    }
    batch.set(docRef,metadata)
    batch.set(revisionRef,{
      name,kind,path:storagePath,size:blob.size,savedAt:timestamp,revisionNumber,
      charCount:documentData.chars,tableCount:documentData.tableCount,
      tables:documentData.tables.slice(0,60)
    })
    textParts.forEach((text,index)=>batch.set(modules.fs.doc(chunksRef(uid,docId,revisionId),'t_'+String(index).padStart(3,'0')),{index,text}))
    cellParts.forEach((cells,index)=>batch.set(modules.fs.doc(cellsRef(uid,docId,revisionId),'c_'+String(index).padStart(3,'0')),{index,cells}))
    await batch.commit()
    return {id:docId,revisionId,revisionNumber,path:storagePath}
  }catch(error){
    // File version names are immutable: only delete this attempt, never an older saved file.
    if(uploaded)try{await modules.st.deleteObject(uploadRef)}catch{}
    throw error
  }
}
export async function listCloud(){
  const uid=requireUser()
  const col=modules.fs.collection(db,'users',uid,'documents')
  const snap=await modules.fs.getDocs(modules.fs.query(col,modules.fs.limit(150)))
  return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0))
}
export async function loadCloud(meta){
  const uid=requireUser()
  if(!meta.path?.startsWith('user-files/'+uid+'/'))throw new Error('파일 경로가 올바르지 않습니다.')
  const bytes=await modules.st.getBytes(modules.st.ref(storage,meta.path),MAX_BYTES)
  return new File([bytes],meta.name,{type:'application/octet-stream'})
}
export async function listRevisions(docId){
  const uid=requireUser()
  const query=modules.fs.query(revisionsRef(uid,docId),modules.fs.limit(100))
  const snap=await modules.fs.getDocs(query)
  return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.revisionNumber||0)-(a.revisionNumber||0))
}
export async function loadRevisionText(docId,revisionId,{maxChars=18000}={}){
  const uid=requireUser()
  if(!/^[\w-]{1,80}$/.test(String(docId))||!/^[\w-]{1,80}$/.test(String(revisionId)))throw new Error('문서 ID 형식이 올바르지 않습니다.')
  const chunks=await modules.fs.getDocs(modules.fs.query(chunksRef(uid,docId,revisionId),modules.fs.limit(100)))
  if(chunks.empty)return ''
  return chunks.docs.map(x=>x.data()).sort((a,b)=>(a.index||0)-(b.index||0)).map(x=>x.text||'').join('').slice(0,maxChars)
}
export async function readCloudIndexed(doc){
  if(!doc.revisionId)return doc.textPreview||''
  return loadRevisionText(doc.id,doc.revisionId,{maxChars:18000})
}


// Template memory records only field labels and table geometry.
// This collection needs the accompanying owner-only Firestore rule to be published.
const templateRef=(uid,id)=>modules.fs.doc(db,'users',uid,'templateMemory',id)
export async function saveTemplateMemory(record){
 const uid=requireUser()
 if(!/^tm_[0-9a-f]{8}_[0-9]{1,6}$/.test(record?.id||''))throw new Error('양식 식별자가 올바르지 않습니다.')
 if(typeof record.canonical!=='string'||record.canonical.length>12000)throw new Error('양식 구조가 너무 큽니다.')
 const data={title:String(record.title||'양식').slice(0,80),
   canonical:record.canonical,tableCount:record.tableCount,
   fieldCount:record.fieldCount,version:1,updatedAt:modules.fs.serverTimestamp()}
 await modules.fs.setDoc(templateRef(uid,record.id),data)
 checkUser(uid)
 return {id:record.id,synced:true}
}
export async function readTemplateMemory(id){
 const uid=requireUser()
 if(!/^tm_[0-9a-f]{8}_[0-9]{1,6}$/.test(id||''))return null
 const snapshot=await modules.fs.getDoc(templateRef(uid,id))
 checkUser(uid)
 return snapshot.exists()?{id:snapshot.id,...snapshot.data()}:null
}
export async function listTemplateMemories(){
 const uid=requireUser()
 const col=modules.fs.collection(db,'users',uid,'templateMemory')
 const snapshots=await modules.fs.getDocs(modules.fs.query(col,modules.fs.limit(80)))
 checkUser(uid)
 return snapshots.docs.map(d=>({id:d.id,...d.data()}))
}

async function catalogId(value){
 const data=new TextEncoder().encode(String(value).normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase())
 const digest=await crypto.subtle.digest('SHA-256',data)
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
}
export async function savePersonalPrompt(entry){
 const uid=requireUser(),title=String(entry.title||'').trim().slice(0,80),text=String(entry.text||'').trim().slice(0,5000),category=String(entry.category||'행정').slice(0,30)
 if(!title||!text)throw new Error('프롬프트 제목과 내용이 필요합니다.')
 const id=await catalogId(category+'\n'+title+'\n'+text);checkUser(uid)
 const ref=modules.fs.doc(db,'users',uid,'miloPrompts',id)
 await modules.fs.runTransaction(db,async tx=>{const current=await tx.get(ref);if(current.exists())return;tx.set(ref,{title,text,category,updatedAt:modules.fs.serverTimestamp()})})
 checkUser(uid);return id
}
export async function listPersonalPrompts(){
 const uid=requireUser(),q=modules.fs.query(modules.fs.collection(db,'users',uid,'miloPrompts'),modules.fs.orderBy('updatedAt','desc'),modules.fs.limit(500))
 const snap=await modules.fs.getDocs(q);checkUser(uid)
 return snap.docs.map(d=>({id:d.id,...d.data(),guide:'내 저장 프롬프트'}))
}
export async function readNotices(){
 requireUser();const q=modules.fs.query(modules.fs.collection(db,'miloBizinfoNotices'),modules.fs.orderBy('updatedAt','desc'),modules.fs.limit(500))
 const snap=await modules.fs.getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()}))
}
export async function readNoticeRefreshTime(){
 requireUser();const snap=await modules.fs.getDoc(modules.fs.doc(db,'miloSyncLocks','bizinfo'));return snap.exists()?snap.data()?.lastCompletedAt?.toDate?.()||null:null
}
