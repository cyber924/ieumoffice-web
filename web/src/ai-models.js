// Public text-model catalog. Empty ID preserves the existing server default.
export const AI_MODELS = {
  "gpt": [
    [
      "gpt-6.2-astra",
      "GPT-6.2 Astra"
    ],
    [
      "gpt-6.2-sol",
      "GPT-6.2 Sol"
    ],
    [
      "gpt-6.1-terra",
      "GPT-6.1 Terra"
    ],
    [
      "gpt-6-sol",
      "GPT-6 Sol"
    ],
    [
      "gpt-6-luna",
      "GPT-6 Luna"
    ],
    [
      "gpt-5.6-sol",
      "GPT-5.6 Sol"
    ],
    [
      "gpt-5.6-terra",
      "GPT-5.6 Terra"
    ]
  ],
  "gemini": [
    [
      "gemini-3.6-flash",
      "Gemini 3.6 Flash"
    ],
    [
      "gemini-3.5-flash",
      "Gemini 3.5 Flash"
    ],
    [
      "gemini-3.5-flash-lite",
      "Gemini 3.5 Flash-Lite"
    ],
    [
      "gemini-3.1-pro-preview",
      "Gemini 3.1 Pro (Preview)"
    ],
    ["gemini-3.1-flash-lite","Gemini 3.1 Flash-Lite"],
    ["gemini-2.5-pro","Gemini 2.5 Pro"],
    ["gemini-2.5-flash","Gemini 2.5 Flash"]
  ],
  "claude": [
    [
      "claude-opus-5-5",
      "Claude Opus 5.5"
    ],
    [
      "claude-sonnet-5-5",
      "Claude Sonnet 5.5"
    ],
    [
      "claude-haiku-5-5",
      "Claude Haiku 5.5"
    ],
    [
      "claude-fable-5-2",
      "Claude Fable 5.2"
    ]
  ]
}
export function validModel(provider,id){
 return Object.hasOwn(AI_MODELS,provider) && typeof id==='string' && (id==='' || AI_MODELS[provider].some(([value])=>value===id))
}
export function loadModelPreferences(storage){
 const out={gpt:'',gemini:'',claude:''}
 try{
  const saved=JSON.parse(storage.getItem('milo-ai-models-v1')||'{}')
  for(const provider of Object.keys(out))if(validModel(provider,saved?.[provider]))out[provider]=saved[provider]
 }catch{}
 return out
}
