'use strict';

const SYSTEM = `You are LexAI, an expert legal assistant specialized in answering law questions clearly and accessibly. You are professional, precise, and always cite legal sources.

CORE RULES:
- Always identify the jurisdiction first
- Break complex legal concepts into plain language  
- Structure every answer using the FORMAT below
- Never give definitive legal opinion — always recommend consulting a licensed attorney
- If outside your knowledge, say so clearly

JURISDICTION HANDLING:
- Common Law: UK, USA, Canada, Australia
- Civil Law: France, Morocco, Spain, Germany, Italy
- Mixed: South Africa, Quebec, Louisiana
- Islamic Law: Saudi Arabia, Iran, UAE (partial)
- Hybrid: Morocco (civil + Islamic Moudawwana)

MANDATORY RESPONSE FORMAT:
**⚖️ Legal Area:** [Criminal / Civil / Labor / Family / Commercial / Tax / Constitutional]
**🌍 Jurisdiction:** [Country + Legal System]
**📖 Short Answer:** [1–2 sentence direct answer in plain language]
**📋 Detailed Explanation:** [Full explanation with legal reasoning, numbered steps, define legal terms inline]
**📜 Applicable Laws & Articles:** [Law name + Article number, Code + Section, Case law if relevant]
**✅ Your Rights / Options:** [Numbered list of options/rights]
**⏱ Deadlines & Timeframes:** [Statute of limitations, filing deadlines, appeal windows]
**💰 Potential Costs:** [Court fees, legal aid availability, estimated attorney costs]
**🚨 Important Warning:** [Risk factors, what NOT to do, common mistakes]
**👨‍⚖️ Next Step:** [Concrete action — who to contact, which court, which form]

LANGUAGE RULES:
- Detect user language automatically, respond in SAME language
- Arabic questions → answer in Arabic + cite Arab/Islamic law
- French questions → answer in French + cite French/Francophone law  
- Define ALL legal jargon immediately after using it

CRITICAL RULES:
1. NEVER fabricate case citations or article numbers
2. ALWAYS add disclaimer: informational only, not formal legal advice
3. ALWAYS recommend a licensed attorney for high-stakes cases
4. Flag immediate danger → direct to emergency services or legal aid hotlines
5. Criminal matters → always mention right to remain silent and right to attorney
6. For Morocco → cite Moudawwana (Code de la famille), Code du travail (Loi 65-99), Code pénal (Dahir 1-59-413)`;

const state = {
  apiKey: localStorage.getItem('lexai_key') || '',
  messages: [],
  isLoading: false,
  sidebarOpen: window.innerWidth > 768,
  lang: 'en',
};

const $=id=>document.getElementById(id);
const els={
  sidebar:$('sidebar'),menuBtn:$('menuBtn'),sidebarClose:$('sidebarClose'),
  newChatBtn:$('newChatBtn'),clearBtn:$('clearBtn'),apiBtn:$('apiBtn'),
  welcome:$('welcome'),chat:$('chat'),msgs:$('msgs'),
  userInput:$('userInput'),sendBtn:$('sendBtn'),charCt:$('charCt'),toast:$('toast'),
};

// ── LANGUAGE DETECT ──────────────────────────────────────────────────────────
function detectLang(t){
  if(/[\u0600-\u06FF]/.test(t)) return 'ar';
  if(/\b(je|mon|ma|votre|comment|est-ce|pouvez|bonjour|merci|droit|loi)\b/i.test(t)) return 'fr';
  return 'en';
}
function langLabel(l){return{en:'🇺🇸 English',fr:'🇫🇷 Français',ar:'🌍 العربية'}[l]||'🌐'}

// ── SIDEBAR ──────────────────────────────────────────────────────────────────
function toggleSidebar(force){
  state.sidebarOpen = force!==undefined ? force : !state.sidebarOpen;
  els.sidebar.classList.toggle('closed', !state.sidebarOpen);
  let bd=document.querySelector('.sb-bd');
  if(!bd){bd=document.createElement('div');bd.className='sb-bd';document.body.appendChild(bd);bd.addEventListener('click',()=>toggleSidebar(false));}
  bd.classList.toggle('on', state.sidebarOpen && window.innerWidth<=768);
}
els.menuBtn.addEventListener('click',()=>toggleSidebar());
els.sidebarClose.addEventListener('click',()=>toggleSidebar(false));

document.querySelectorAll('.sb-item').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.sb-item').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    if(b.dataset.q) submitMsg(b.dataset.q);
    if(window.innerWidth<=768) toggleSidebar(false);
  });
});

// ── CHAT RESET ───────────────────────────────────────────────────────────────
function resetChat(){state.messages=[];els.msgs.innerHTML='';showWelcome(true);}
els.newChatBtn.addEventListener('click',resetChat);
els.clearBtn.addEventListener('click',()=>{resetChat();showToast('Chat cleared');});

function showWelcome(show){
  els.welcome.style.display=show?'flex':'none';
  els.chat.style.display=show?'none':'flex';
}

document.querySelectorAll('.domain-card').forEach(c=>{
  c.addEventListener('click',()=>{if(c.dataset.q) submitMsg(c.dataset.q);});
});

// ── TEXTAREA ─────────────────────────────────────────────────────────────────
els.userInput.addEventListener('input',()=>{
  const l=els.userInput.value.length;
  els.charCt.textContent=`${l}/2000`;
  els.sendBtn.disabled=l===0||state.isLoading;
  els.userInput.style.height='auto';
  els.userInput.style.height=Math.min(els.userInput.scrollHeight,150)+'px';
});
els.userInput.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!els.sendBtn.disabled)handleSend();}
});
els.sendBtn.addEventListener('click',handleSend);
function handleSend(){const t=els.userInput.value.trim();if(t&&!state.isLoading)submitMsg(t);}

// ── SUBMIT ───────────────────────────────────────────────────────────────────
async function submitMsg(text){
  if(!text||state.isLoading) return;
  if(!state.apiKey){showApiModal();return;}

  showWelcome(false);
  els.userInput.value='';els.userInput.style.height='auto';
  els.charCt.textContent='0/2000';els.sendBtn.disabled=true;
  state.lang=detectLang(text);

  addMsg('user',text);
  state.messages.push({role:'user',content:text});

  const typEl=showTyping();
  state.isLoading=true;

  try{
    const reply=await callGemini(text);
    typEl.remove();
    state.messages.push({role:'model',content:reply});
    addMsg('bot',reply);
  }catch(err){
    typEl.remove();
    const msg=err.message.includes('401')||err.message.includes('API_KEY')
      ?'Invalid API key — click ⚙️ to reconfigure.'
      :`Error: ${err.message}`;
    addMsg('bot',msg,true);
  }finally{
    state.isLoading=false;
    els.sendBtn.disabled=false;
    els.userInput.focus();
  }
}

// ── GEMINI API ───────────────────────────────────────────────────────────────
async function callGemini(text){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${state.apiKey}`;
  const history=state.messages.slice(-8).map(m=>({role:m.role==='bot'?'model':m.role,parts:[{text:m.content}]}));
  const body={
    system_instruction:{parts:[{text:SYSTEM}]},
    contents:[...history,{role:'user',parts:[{text}]}],
    generationConfig:{temperature:0.5,maxOutputTokens:2048,topP:0.9}
  };
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||`HTTP ${res.status}`);}
  const d=await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text||'No response received.';
}

// ── RENDER MESSAGES ──────────────────────────────────────────────────────────
function addMsg(role,content,isError=false){
  const wrap=document.createElement('div');
  wrap.className=`msg ${role}`;

  const av=document.createElement('div');
  av.className='msg-av';
  av.setAttribute('aria-hidden','true');
  av.innerHTML=role==='user'?'👤':'⚖️';

  const right=document.createElement('div');
  right.className='msg-right';

  if(role==='bot'&&!isError){
    const pill=document.createElement('div');
    pill.className='lang-pill';
    pill.innerHTML=`<span class="ldot"></span>${langLabel(state.lang)}`;
    right.appendChild(pill);
  }

  const bub=document.createElement('div');
  bub.className='bubble';
  if(isError) bub.style.borderColor='rgba(239,68,68,.3)';
  bub.innerHTML=role==='bot'?renderLegal(content):escapeHtml(content);

  const meta=document.createElement('div');
  meta.className='msg-meta';
  const time=document.createElement('span');
  time.className='msg-time';
  time.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const copyBtn=document.createElement('button');
  copyBtn.className='act-btn';
  copyBtn.textContent='📋 Copy';
  copyBtn.onclick=()=>{navigator.clipboard.writeText(content).then(()=>{copyBtn.textContent='✅ Copied!';setTimeout(()=>copyBtn.textContent='📋 Copy',2000);});};
  if(role==='bot'&&!isError){
    const speakBtn=document.createElement('button');
    speakBtn.className='act-btn';
    speakBtn.textContent='🔊 Listen';
    speakBtn.onclick=()=>speak(content);
    meta.appendChild(time);meta.appendChild(copyBtn);meta.appendChild(speakBtn);
  } else {meta.appendChild(time);meta.appendChild(copyBtn);}

  right.appendChild(bub);right.appendChild(meta);
  wrap.appendChild(av);wrap.appendChild(right);
  els.msgs.appendChild(wrap);
  requestAnimationFrame(()=>{els.chat.scrollTop=els.chat.scrollHeight;});
}

function escapeHtml(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── LEGAL CONTENT RENDERER ───────────────────────────────────────────────────
const SECTIONS=[
  {key:'⚖️ Legal Area:',cls:'lex-area'},
  {key:'🌍 Jurisdiction:',cls:'lex-jur'},
  {key:'📖 Short Answer:',cls:'lex-short'},
  {key:'📋 Detailed Explanation:',cls:'lex-detail'},
  {key:'📜 Applicable Laws',cls:'lex-law'},
  {key:'✅ Your Rights',cls:'lex-rights'},
  {key:'⏱ Deadlines',cls:'lex-deadline'},
  {key:'💰 Potential Costs:',cls:'lex-cost'},
  {key:'🚨 Important Warning:',cls:'lex-warn'},
  {key:'👨‍⚖️ Next Step:',cls:'lex-next'},
];

function renderLegal(text){
  // Split on bold headings **...**
  const parts=text.split(/(\*\*[^*]+\*\*:?)/g);
  let html='';let currentCls=null;let buf='';

  const flush=()=>{
    if(buf.trim()){
      if(currentCls){html+=`<div class="lex-block ${currentCls}">${renderInline(buf)}</div>`;
      }else{html+=renderInline(buf);}
      buf='';
    }
  };

  for(const part of parts){
    if(part.startsWith('**')&&part.endsWith('**')||part.match(/^\*\*[^*]+\*\*:/)){
      flush();
      const label=part.replace(/\*\*/g,'');
      const sec=SECTIONS.find(s=>label.includes(s.key.replace(':','').replace('**','')));
      currentCls=sec?sec.cls:null;
      html+=`<div class="lex-block-title">${renderInline(part)}</div>`;
    } else {buf+=part;}
  }
  flush();
  return html||renderInline(text);
}

function renderInline(t){
  t=t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  t=t.replace(/\*([^*]+?)\*/g,'<em>$1</em>');
  t=t.replace(/`([^`]+)`/g,'<code>$1</code>');
  t=t.replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
  // Lists
  const lines=t.split('\n');
  let out='';let inList=false;
  for(const l of lines){
    if(l.match(/^[\*\-]\s/)){if(!inList){out+='<ul>';inList=true;}out+=`<li>${l.slice(2)}</li>`;}
    else if(l.match(/^\d+\.\s/)){if(!inList){out+='<ol>';inList=true;}out+=`<li>${l.replace(/^\d+\.\s/,'')}</li>`;}
    else{if(inList){out+=inList==='ol'?'</ol>':'</ul>';inList=false;}
      if(l.trim()) out+=`<p>${l}</p>`; else if(out) out+='<br>';}
  }
  if(inList) out+='</ul>';
  return out||`<p>${t}</p>`;
}

// ── TYPING ───────────────────────────────────────────────────────────────────
function showTyping(){
  const w=document.createElement('div');w.className='msg bot';
  const av=document.createElement('div');av.className='msg-av';av.innerHTML='⚖️';
  const b=document.createElement('div');b.className='bubble';
  b.innerHTML='<div class="typing-wrap"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
  w.appendChild(av);w.appendChild(b);els.msgs.appendChild(w);
  els.chat.scrollTop=els.chat.scrollHeight;
  return w;
}

// ── SPEAK ────────────────────────────────────────────────────────────────────
function speak(text){
  if(!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g,' '));
  u.lang=state.lang==='fr'?'fr-FR':state.lang==='ar'?'ar-SA':'en-US';
  u.rate=0.9;window.speechSynthesis.speak(u);
  showToast('🔊 Reading aloud...');
}

// ── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg){
  els.toast.textContent=msg;els.toast.classList.add('show');
  setTimeout(()=>els.toast.classList.remove('show'),2500);
}

// ── API MODAL ─────────────────────────────────────────────────────────────────
function showApiModal(){
  if($('apiModal')) return;
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';overlay.id='apiModal';
  overlay.innerHTML=`
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="API Configuration">
      <div class="modal-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="2">
          <path d="M12 2L3 7l9 5 9-5-9-5z"/><path d="M3 17l9 5 9-5"/><path d="M3 12l9 5 9-5"/>
        </svg>
      </div>
      <h2>LexAI — API Setup</h2>
      <p>Enter your Google Gemini API key to activate the legal intelligence engine.</p>
      <label class="modal-label" for="apiKey">🔑 Google Gemini API Key</label>
      <input type="password" id="apiKey" class="modal-input" placeholder="AIza..." value="${state.apiKey}" autocomplete="off"/>
      <p class="modal-hint">Get a free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Google AI Studio →</a></p>
      <button class="modal-btn" id="apiSave">Activate LexAI ⚖️</button>
      <button class="modal-skip" id="apiSkip">Close without saving</button>
    </div>`;
  document.body.appendChild(overlay);
  $('apiSave').addEventListener('click',()=>{
    const k=$('apiKey').value.trim();
    if(!k){showToast('Please enter a valid API key');return;}
    state.apiKey=k;localStorage.setItem('lexai_key',k);overlay.remove();showToast('✅ API key saved!');
  });
  $('apiSkip').addEventListener('click',()=>overlay.remove());
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  setTimeout(()=>$('apiKey')?.focus(),80);
}
els.apiBtn.addEventListener('click',showApiModal);

// ── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){const m=$('apiModal');if(m)m.remove();}
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();resetChat();}
  if((e.ctrlKey||e.metaKey)&&e.key==='b'){e.preventDefault();toggleSidebar();}
});

// ── RESPONSIVE ───────────────────────────────────────────────────────────────
window.addEventListener('resize',()=>{
  if(window.innerWidth>768){const bd=document.querySelector('.sb-bd');if(bd)bd.classList.remove('on');}
});

// ── INIT ─────────────────────────────────────────────────────────────────────
(function init(){
  if(window.innerWidth<=768){els.sidebar.classList.add('closed');state.sidebarOpen=false;}
  showWelcome(true);
  if(!state.apiKey){
    const hint=document.createElement('div');
    hint.style.cssText='position:fixed;top:13px;right:90px;z-index:10;font-size:.7rem;color:#C9A84C;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.2);border-radius:20px;padding:4px 11px;cursor:pointer;';
    hint.textContent='🔑 Setup API Key';hint.addEventListener('click',showApiModal);
    document.body.appendChild(hint);
  }
})();
