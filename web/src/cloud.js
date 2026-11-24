let app=null,auth=null,db=null,storage=null
let modules={}
let signedUser=null
const clean=(v)=>String(v||'').replace(/[^\p{L}\p{N}_.-]/gu,'_').slice(0,100)

export async function initCloud(config,onAuth) {
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
export async function saveCloud(name,blob,kind,id) {
  if(!signedUser)throw new Error('먼저 로그인하세요.')
  if(blob.size>15*1024*1024)throw new Error('15MB 이하의 문서만 저장할 수 있습니다.')
  const docId=id||crypto.randomUUID()
  const storagePath='user-files/'+signedUser.uid+'/'+docId+'/'+clean(name)
  const ref=modules.st.ref(storage,storagePath)
  await modules.st.uploadBytes(ref,blob,{contentType:kind==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/octet-stream'})
  const docRef=modules.fs.doc(db,'users',signedUser.uid,'documents',docId)
  await modules.fs.setDoc(docRef,{name,kind,path:storagePath,size:blob.size,updatedAt:modules.fs.serverTimestamp()},{merge:true})
  return docId
}
export async function listCloud() {
  if(!signedUser)throw new Error('먼저 로그인하세요.')
  const col=modules.fs.collection(db,'users',signedUser.uid,'documents')
  const snap=await modules.fs.getDocs(modules.fs.query(col,modules.fs.limit(50)))
  return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0))
}
export async function loadCloud(meta){
  if(!signedUser)throw new Error('먼저 로그인하세요.')
  if(!meta.path.startsWith('user-files/'+signedUser.uid+'/'))throw new Error('파일 경로가 올바르지 않습니다.')
  const bytes=await modules.st.getBytes(modules.st.ref(storage,meta.path),15*1024*1024)
  return new File([bytes],meta.name,{type:'application/octet-stream'})
}
