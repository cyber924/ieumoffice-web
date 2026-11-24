// Convert AI-generated Markdown to safe editor HTML. Raw model HTML is never trusted.
const escapeHtml = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
function inline(value){
 return escapeHtml(value).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_\n]+)__/g,'<strong>$1</strong>').replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g,'<em>$1</em>').replace(/`([^`\n]+)`/g,'<code>$1</code>')
}
function cells(line){
 let value=line.trim().replace(/^\|/,'').replace(/\|$/,'')
 return value.split(/(?<!\\)\|/).map(s=>s.trim().replace(/\\\|/g,'|'))
}
function separator(line){return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)}
export function markdownToDocumentHtml(input){
 const lines=String(input||'').replace(/\r\n?/g,'\n').split('\n')
 let out='',i=0
 while(i<lines.length){
  const line=lines[i]
  if(!line.trim()){i++;continue}
  const heading=line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
  if(heading){let level=Math.min(heading[1].length,3);out+=`<h${level}>${inline(heading[2])}</h${level}>`;i++;continue}
  if(i+1<lines.length && line.includes('|') && separator(lines[i+1])){
   const header=cells(line),rows=[];i+=2
   while(i<lines.length && lines[i].trim() && lines[i].includes('|')){rows.push(cells(lines[i]));i++}
   const row=(values,tag)=>'<tr>'+header.map((_,n)=>`<${tag}>${inline(values[n]||'')}</${tag}>`).join('')+'</tr>'
   out+='<table><thead>'+row(header,'th')+'</thead><tbody>'+rows.map(r=>row(r,'td')).join('')+'</tbody></table>';continue
  }
  const list=line.match(/^\s*([-+*]|\d+[.)])\s+(.+)$/)
  if(list){const ordered=/^\d/.test(list[1]),tag=ordered?'ol':'ul';let items=''
   while(i<lines.length){const m=lines[i].match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);if(!m||/^\d/.test(m[1])!==ordered)break;items+='<li>'+inline(m[2])+'</li>';i++}
   out+=`<${tag}>${items}</${tag}>`;continue
  }
  if(/^\s*```/.test(line)){i++;const code=[];while(i<lines.length&&!/^\s*```/.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;out+='<pre><code>'+escapeHtml(code.join('\n'))+'</code></pre>';continue}
  const para=[line];i++
  while(i<lines.length&&lines[i].trim()&&!/^\s{0,3}#{1,6}\s/.test(lines[i])&&!/^\s*([-+*]|\d+[.)])\s+/.test(lines[i])&&!/^\s*```/.test(lines[i])&&!(i+1<lines.length&&lines[i].includes('|')&&separator(lines[i+1])))para.push(lines[i++])
  out+='<p>'+para.map(inline).join('<br>')+'</p>'
 }
 return out
}
