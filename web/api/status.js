export default function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='GET')return res.status(405).json({error:'허용되지 않은 요청'})
 res.status(200).json({
  service:'MiloSoft',
  firebaseServerConfigured:Boolean(process.env.FIREBASE_PROJECT_ID),
  providers:{gpt:Boolean(process.env.OPENAI_API_KEY),gemini:Boolean(process.env.GEMINI_API_KEY),claude:Boolean(process.env.ANTHROPIC_API_KEY)},
  mode:'AI provider keys are optional; browser BYOK is tab-memory only'
 })
}
