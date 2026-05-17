'use strict';

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────
const SYSTEM = `You are LexAI, an expert legal assistant specialized in answering law questions clearly and accessibly. You are professional, precise, and always cite legal sources.

CORE RULES:
- Always identify the jurisdiction first (ask if unsure)
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
6. For Morocco → cite Moudawwana (Code de la famille), Code du travail (Loi 65-99), Code pénal (Dahir 1-59-413)
7. If the user specifies a jurisdiction preference, prioritize that jurisdiction's laws`;

// ── DOMAIN CARDS ──────────────────────────────────────────────────────────
const DOMAIN_CARDS = [
  {icon:'🔒',title:'Criminal Law',hint:'Rights, defense, bail',q:"What are my Miranda rights if I'm arrested in the USA?"},
  {icon:'📝',title:'Civil & Contracts',hint:'Disputes, damages, torts',q:'I have a breach of contract dispute in the UK. What are my options?'},
  {icon:'👨‍👩‍👧',title:'Family Law',hint:'Divorce, custody, alimony',q:'How does divorce and child custody work in France?'},
  {icon:'💼',title:'Labor Law',hint:'Termination, discrimination',q:"I was wrongfully terminated. What are my legal rights in Canada?"},
  {icon:'🏠',title:'Real Estate',hint:'Landlord, eviction, leases',q:"My landlord won't return my security deposit. What can I do?"},
  {icon:'🏢',title:'Business Law',hint:'LLC, contracts, IP',q:'How do I form an LLC and what are the legal requirements?'},
  {icon:'🌍',title:'Immigration',hint:'Visas, green cards',q:'I need to understand the green card process.'},
  {icon:'💰',title:'Tax Law',hint:'Audits, filings',q:'I received an IRS audit notice. What should I do?'},
  {icon:'⚖️',title:'Constitutional',hint:'Rights, amendments',q:'I believe my constitutional rights were violated by police.'},
  {icon:'🕌',title:'القانون المغربي',hint:'Droit marocain & islamique',q:'كيفاش نرفع دعوى قضائية في المغرب ضد صاحب الشغل؟'},
];

const MODELS = [
  {id:'gemini-2.0-flash',label:'Gemini 2.0 Flash',desc:'Fast & balanced'},
  {id:'gemini-2.0-flash-lite',label:'Gemini 2.0 Flash Lite',desc:'Lightning fast'},
  {id:'gemini-1.5-pro',label:'Gemini 1.5 Pro',desc:'Most powerful'},
  {id:'gemini-1.5-flash',label:'Gemini 1.5 Flash',desc:'Fast, good quality'},
];

const THEMES = [
  {id:'dark',icon:'🌙',label:'Dark'},
  {id:'gold',icon:'🌟',label:'Gold'},
  {id:'light',icon:'☀️',label:'Light'},
  {id:'midnight',icon:'🌌',label:'Midnight'},
];

// ── STATE ─────────────────────────────────────────────────────────────────
const state = {
  apiKey: localStorage.getItem('lexai_key') || '',
  model: localStorage.getItem('lexai_model') || 'gemini-2.0-flash',
  theme: localStorage.getItem('lexai_theme') || 'dark',
  jurisdiction: localStorage.getItem('lexai_jurisdiction') || 'auto',
  messages: [],
  conversations: JSON.parse(localStorage.getItem('lexai_convs') || '[]'),
  currentConvId: null,
  isLoading: false,
  sidebarOpen: window.innerWidth > 768,
  lang: 'en',
  streamingContent: '',
  abortController: null,
};

// ── DOM REFS ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const els = {
  app: $('app'),
  sidebar: $('sidebar'), menuBtn: $('menuBtn'), sidebarClose: $('sidebarClose'),
  newChatBtn: $('newChatBtn'), clearBtn: $('clearBtn'), apiBtn: $('apiBtn'),
  exportBtn: $('exportBtn'),
  welcome: $('welcome'), chat: $('chat'), msgs: $('msgs'), suggestions: $('suggestions'),
  userInput: $('userInput'), sendBtn: $('sendBtn'), charCt: $('charCt'),
  toast: $('toast'), convList: $('convList'),
  wcDomains: $('wcDomains'),
  settingsModal: $('settingsModal'), settingsClose: $('settingsClose'),
  apiKeyInput: $('apiKey'), modelSelect: $('modelSelect'),
  jurisdictionSelect: $('jurisdictionSelect'), themeOptions: $('themeOptions'),
  settingsSave: $('settingsSave'),
};

// ── LANG DETECT ───────────────────────────────────────────────────────────
function detectLang(t){
  if(/[\u0600-\u06FF]/.test(t)) return 'ar';
  if(/\b(je|mon|ma|votre|comment|est-ce|pouvez|bonjour|merci|droit|loi|suis|ai|êtes|nous|vous|il|elle|ils|le|la|les|une|des|sur|dans|avec|pour|par|pas|plus|très|bien|être|avoir|faire|peut|vouloir|savoir|devoir|falloir)\b/i.test(t)) return 'fr';
  return 'en';
}
function langLabel(l){return{en:'English',fr:'Français',ar:'العربية'}[l]||l}

// ── THEME ─────────────────────────────────────────────────────────────────
function applyTheme(t){
  state.theme = t;
  document.body.setAttribute('data-theme', t);
  localStorage.setItem('lexai_theme', t);
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === t);
  });
}
function initThemeBtn(){
  els.themeOptions.innerHTML = THEMES.map(t =>
    `<button class="theme-btn${t.id === state.theme ? ' active' : ''}" data-theme="${t.id}" title="${t.label}">${t.icon}</button>`
  ).join('');
  els.themeOptions.addEventListener('click', e => {
    const btn = e.target.closest('.theme-btn');
    if(btn) applyTheme(btn.dataset.theme);
  });
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────
function toggleSidebar(force){
  state.sidebarOpen = force !== undefined ? force : !state.sidebarOpen;
  els.sidebar.classList.toggle('closed', !state.sidebarOpen);
  let bd = document.querySelector('.sb-bd');
  if(!bd){
    bd = document.createElement('div');
    bd.className = 'sb-bd';
    document.body.appendChild(bd);
    bd.addEventListener('click', () => toggleSidebar(false));
  }
  bd.classList.toggle('on', state.sidebarOpen && window.innerWidth <= 768);
}
els.menuBtn.addEventListener('click', () => toggleSidebar());
els.sidebarClose.addEventListener('click', () => toggleSidebar(false));

document.querySelectorAll('.sb-item').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.sb-item').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    if(b.dataset.q) submitMsg(b.dataset.q);
    if(window.innerWidth <= 768) toggleSidebar(false);
  });
});

// ── CONVERSATION MANAGEMENT ───────────────────────────────────────────────
function saveConvs(){
  localStorage.setItem('lexai_convs', JSON.stringify(state.conversations));
  renderConvList();
}

function renderConvList(){
  els.convList.innerHTML = '';
  if(state.conversations.length === 0){
    els.convList.innerHTML = '<div style="font-size:.75rem;color:var(--t3);padding:8px 10px;text-align:center">No saved consultations</div>';
    return;
  }
  state.conversations.forEach(c => {
    const div = document.createElement('div');
    div.className = `conv-item${c.id === state.currentConvId ? ' active' : ''}`;
    div.innerHTML = `
      <span class="conv-icon">💬</span>
      <span class="conv-title">${escapeHtml(c.title)}</span>
      <button class="conv-del" data-id="${c.id}" title="Delete">✕</button>
    `;
    div.addEventListener('click', e => {
      if(e.target.closest('.conv-del')) return;
      loadConv(c.id);
    });
    div.querySelector('.conv-del').addEventListener('click', e => {
      e.stopPropagation();
      deleteConv(c.id);
    });
    els.convList.appendChild(div);
  });
}

function saveCurrentConv(){
  if(state.messages.length < 2) return;
  const firstUser = state.messages.find(m => m.role === 'user');
  const title = firstUser ? firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? '…' : '') : 'Consultation';
  const now = Date.now();
  if(!state.currentConvId){
    state.currentConvId = `conv_${now}`;
  }
  const existing = state.conversations.findIndex(c => c.id === state.currentConvId);
  const conv = {id: state.currentConvId, title, model: state.model, messages: state.messages.slice(), updatedAt: now};
  if(existing >= 0){
    state.conversations[existing] = conv;
  } else {
    state.conversations.unshift(conv);
    if(state.conversations.length > 50) state.conversations.pop();
  }
  saveConvs();
}

function loadConv(id){
  const conv = state.conversations.find(c => c.id === id);
  if(!conv) return;
  state.currentConvId = id;
  state.messages = conv.messages.slice();
  state.model = conv.model || state.model;
  renderConvList();
  showWelcome(false);
  els.msgs.innerHTML = '';
  state.messages.forEach(m => addMsg(m.role, m.content, false, true));
  if(window.innerWidth <= 768) toggleSidebar(false);
}

function deleteConv(id){
  if(!confirm('Delete this consultation?')) return;
  state.conversations = state.conversations.filter(c => c.id !== id);
  if(state.currentConvId === id){
    state.currentConvId = null;
    resetChat();
  }
  saveConvs();
}

// ── CHAT RESET ────────────────────────────────────────────────────────────
function resetChat(){
  state.messages = [];
  state.currentConvId = null;
  state.streamingContent = '';
  if(state.abortController) { state.abortController.abort(); state.abortController = null; }
  els.msgs.innerHTML = '';
  els.suggestions.classList.remove('show');
  els.suggestions.innerHTML = '';
  showWelcome(true);
}
els.newChatBtn.addEventListener('click', resetChat);
els.clearBtn.addEventListener('click', () => {
  resetChat();
  showToast('Chat cleared');
});

// ── WELCOME ───────────────────────────────────────────────────────────────
function showWelcome(show){
  els.welcome.style.display = show ? 'flex' : 'none';
  els.chat.style.display = show ? 'none' : 'flex';
}

function renderDomainCards(){
  els.wcDomains.innerHTML = DOMAIN_CARDS.map(d =>
    `<button class="domain-card" data-q="${escapeHtml(d.q)}">
      <span class="dc-icon">${d.icon}</span>
      <span class="dc-title">${escapeHtml(d.title)}</span>
      <span class="dc-hint">${escapeHtml(d.hint)}</span>
    </button>`
  ).join('');
  els.wcDomains.addEventListener('click', e => {
    const card = e.target.closest('.domain-card');
    if(card && card.dataset.q) submitMsg(card.dataset.q);
  });
}

// ── TEXTAREA ──────────────────────────────────────────────────────────────
els.userInput.addEventListener('input', () => {
  const l = els.userInput.value.length;
  els.charCt.textContent = `${l}/4000`;
  els.sendBtn.disabled = l === 0 || state.isLoading;
  els.userInput.style.height = 'auto';
  els.userInput.style.height = Math.min(els.userInput.scrollHeight, 150) + 'px';
});
els.userInput.addEventListener('keydown', e => {
  if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); if(!els.sendBtn.disabled) handleSend(); }
});
els.sendBtn.addEventListener('click', handleSend);
function handleSend(){
  const t = els.userInput.value.trim();
  if(t && !state.isLoading) submitMsg(t);
}

// ── SUBMIT ────────────────────────────────────────────────────────────────
async function submitMsg(text){
  if(!text || state.isLoading) return;
  if(!state.apiKey){ showSettings(); showToast('🔑 Configure your API key first'); return; }

  showWelcome(false);
  els.userInput.value = ''; els.userInput.style.height = 'auto';
  els.charCt.textContent = '0/4000'; els.sendBtn.disabled = true;
  state.lang = detectLang(text);

  // Build jurisdiction context
  let jurText = '';
  if(state.jurisdiction && state.jurisdiction !== 'auto'){
    const jurNames = {us:'United States',uk:'United Kingdom',fr:'France',ma:'Morocco',
      de:'Germany',ca:'Canada',au:'Australia',ae:'UAE'};
    jurText = `\n\nThe user has indicated they are asking about ${jurNames[state.jurisdiction] || state.jurisdiction} law. Prioritize this jurisdiction in your answer.`;
  }

  const fullText = text + jurText;
  addMsg('user', fullText);
  state.messages.push({role:'user', content: fullText});

  const typEl = showTyping();
  state.isLoading = true;

  try{
    await streamGemini(fullText);
    typEl.remove();
    state.messages.push({role:'model', content: state.streamingContent});
    finalizeStreamMsg(state.streamingContent);
    saveCurrentConv();
    renderConvList();
    addSuggestions(text);
  }catch(err){
    typEl.remove();
    if(err.name === 'AbortError') return;
    const msg = err.message.includes('401') || err.message.includes('API_KEY') || err.message.includes('not valid')
      ? 'Invalid API key — click ⚙️ to reconfigure.'
      : err.message.includes('quota') || err.message.includes('429')
      ? 'API quota exceeded. Please wait and retry.'
      : `Error: ${err.message}`;
    addMsg('bot', msg, true);
  }finally{
    state.isLoading = false;
    state.streamingContent = '';
    els.sendBtn.disabled = false;
    els.userInput.focus();
  }
}

// ── GEMINI STREAMING ──────────────────────────────────────────────────────
async function streamGemini(text){
  state.streamingContent = '';
  state.abortController = new AbortController();

  const history = state.messages.slice(-12, -1).map(m => ({
    role: m.role === 'bot' ? 'model' : m.role,
    parts: [{text: m.content}]
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:streamGenerateContent?alt=sse&key=${state.apiKey}`;

  const body = {
    system_instruction: {parts: [{text: SYSTEM}]},
    contents: [...history, {role: 'user', parts: [{text}]}],
    generationConfig: {temperature: 0.5, maxOutputTokens: 4096, topP: 0.9},
    safetySettings: [
      {category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE'},
      {category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE'},
      {category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE'},
      {category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE'},
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
    signal: state.abortController.signal,
  });

  if(!res.ok){
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let firstChunk = true;

  while(true){
    const {done, value} = await reader.read();
    if(done) break;

    buffer += decoder.decode(value, {stream: true});
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for(const line of lines){
      if(!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if(!jsonStr || jsonStr === '[DONE]') continue;

      try{
        const data = JSON.parse(jsonStr);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if(text){
          if(firstChunk){ addMsg('bot', ''); firstChunk = false; }
          state.streamingContent += text;
          updateStreamingMsg(state.streamingContent);
        }
      }catch(e){ /* skip unparseable chunks */ }
    }
  }
}

// ── RENDER ─────────────────────────────────────────────────────────────────
function addMsg(role, content, isError = false, skipRender = false){
  if(skipRender) return;

  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  wrap.id = role === 'bot' && !isError && !content ? 'streamMsg' : '';

  const av = document.createElement('div');
  av.className = 'msg-av';
  av.innerHTML = role === 'user' ? '👤' : '⚖️';

  const right = document.createElement('div');
  right.className = 'msg-right';

  if(role === 'bot' && !isError && content){
    const pill = document.createElement('div');
    pill.className = 'lang-pill';
    pill.innerHTML = `<span class="ldot"></span> ${langLabel(state.lang)}`;
    right.appendChild(pill);
  }

  const bub = document.createElement('div');
  bub.className = 'bubble';
  if(isError) bub.style.borderColor = 'rgba(239,68,68,.3)';
  if(content) bub.innerHTML = role === 'bot' && !isError ? renderLegal(content) : escapeHtml(content);

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '4px';

  if(content){
    const copyBtn = document.createElement('button');
    copyBtn.className = 'act-btn';
    copyBtn.textContent = '📋';
    copyBtn.title = 'Copy';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(content).then(() => {
        copyBtn.textContent = '✅';
        setTimeout(() => copyBtn.textContent = '📋', 2000);
      });
    };
    actions.appendChild(copyBtn);
  }

  if(role === 'bot' && !isError && content){
    const speakBtn = document.createElement('button');
    speakBtn.className = 'act-btn';
    speakBtn.textContent = '🔊';
    speakBtn.title = 'Listen';
    speakBtn.onclick = () => speak(content);
    actions.appendChild(speakBtn);
  }

  meta.appendChild(time);
  meta.appendChild(actions);
  right.appendChild(bub); right.appendChild(meta);
  wrap.appendChild(av); wrap.appendChild(right);
  els.msgs.appendChild(wrap);
  requestAnimationFrame(() => { els.chat.scrollTop = els.chat.scrollHeight; });
}

function updateStreamingMsg(content){
  const el = document.getElementById('streamMsg');
  if(!el){
    addMsg('bot', '');
    return;
  }
  const bub = el.querySelector('.bubble');
  if(bub) bub.innerHTML = renderLegal(content) || '<em>…</em>';
  requestAnimationFrame(() => { els.chat.scrollTop = els.chat.scrollHeight; });
}

function finalizeStreamMsg(content){
  const el = document.getElementById('streamMsg');
  if(!el) return;
  el.id = '';
  const bub = el.querySelector('.bubble');
  if(bub) bub.innerHTML = renderLegal(content);

  // Add meta actions if missing
  if(!el.querySelector('.msg-meta')){
    const right = el.querySelector('.msg-right');
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '4px';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'act-btn'; copyBtn.textContent = '📋'; copyBtn.title = 'Copy';
    copyBtn.onclick = () => { navigator.clipboard.writeText(content).then(() => { copyBtn.textContent = '✅'; setTimeout(() => copyBtn.textContent = '📋', 2000); }); };
    actions.appendChild(copyBtn);
    const speakBtn = document.createElement('button');
    speakBtn.className = 'act-btn'; speakBtn.textContent = '🔊'; speakBtn.title = 'Listen';
    speakBtn.onclick = () => speak(content);
    actions.appendChild(speakBtn);
    meta.appendChild(time); meta.appendChild(actions);
    right?.appendChild(meta);
  }
}

function escapeHtml(t){
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

// ── LEGAL RENDERER ────────────────────────────────────────────────────────
const SECTIONS = [
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
  const parts = text.split(/(\*\*[^*]+\*\*:?)/g);
  let html = ''; let currentCls = null; let buf = '';

  const flush = () => {
    if(buf.trim()){
      if(currentCls){
        html += `<div class="lex-block ${currentCls}">${renderInline(buf)}</div>`;
      } else {
        html += renderInline(buf);
      }
      buf = '';
    }
  };

  for(const part of parts){
    if(part.startsWith('**') && (part.endsWith('**') || part.match(/^\*\*[^*]+\*\*:/))){
      flush();
      const label = part.replace(/\*\*/g, '').replace(/:$/, '').trim();
      const sec = SECTIONS.find(s => label.includes(s.key.replace('**','').replace(':','').trim()));
      currentCls = sec ? sec.cls : null;
      html += `<div class="lex-block-title">${renderInline(part)}</div>`;
    } else {
      buf += part;
    }
  }
  flush();
  return html || renderInline(text);
}

function renderInline(t){
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const lines = t.split('\n');
  let out = ''; let inList = false; let listType = '';
  for(const l of lines){
    if(l.match(/^[\*\-]\s/)){
      if(!inList){ out += '<ul>'; inList = true; listType = 'ul'; }
      out += `<li>${l.slice(2)}</li>`;
    } else if(l.match(/^\d+\.\s/)){
      if(!inList){ out += '<ol>'; inList = true; listType = 'ol'; }
      out += `<li>${l.replace(/^\d+\.\s/,'')}</li>`;
    } else {
      if(inList){ out += listType === 'ol' ? '</ol>' : '</ul>'; inList = false; }
      if(l.trim()) out += `<p>${l}</p>`;
      else if(out) out += '<br>';
    }
  }
  if(inList) out += listType === 'ol' ? '</ol>' : '</ul>';
  return out || `<p>${t}</p>`;
}

// ── SUGGESTIONS ───────────────────────────────────────────────────────────
function addSuggestions(userText){
  const topics = [
    'Can you explain this in more detail?',
    'What are the deadlines for this?',
    'What documents do I need?',
    'How much does this typically cost?',
    'What happens if I do nothing?',
  ];
  els.suggestions.innerHTML = topics.map(t =>
    `<button class="suggestion-chip">${escapeHtml(t)}</button>`
  ).join('');
  els.suggestions.classList.add('show');
  els.suggestions.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => submitMsg(chip.textContent));
  });
}

// ── TYPING ────────────────────────────────────────────────────────────────
function showTyping(){
  const w = document.createElement('div');
  w.className = 'msg bot';
  w.id = 'typingIndicator';
  const av = document.createElement('div');
  av.className = 'msg-av';
  av.innerHTML = '⚖️';
  const b = document.createElement('div');
  b.className = 'bubble';
  b.innerHTML = '<div class="typing-wrap"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
  w.appendChild(av); w.appendChild(b);
  els.msgs.appendChild(w);
  els.chat.scrollTop = els.chat.scrollHeight;
  return w;
}

// ── SPEAK ─────────────────────────────────────────────────────────────────
function speak(text){
  if(!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, ' '));
  u.lang = state.lang === 'fr' ? 'fr-FR' : state.lang === 'ar' ? 'ar-SA' : 'en-US';
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
  showToast('🔊 Reading aloud...');
}

// ── EXPORT ────────────────────────────────────────────────────────────────
function exportChat(){
  if(state.messages.length === 0){ showToast('Nothing to export'); return; }
  let md = `# LexAI — Legal Consultation\n\n**Date:** ${new Date().toLocaleString()}\n**Model:** ${state.model}\n**Language:** ${langLabel(state.lang)}\n\n---\n\n`;
  state.messages.forEach(m => {
    const role = m.role === 'user' ? '👤 **You**' : '⚖️ **LexAI**';
    md += `${role}:\n${m.content}\n\n`;
  });
  const blob = new Blob([md], {type: 'text/markdown;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lexai-${new Date().toISOString().slice(0,10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📄 Exported as Markdown');
}
els.exportBtn.addEventListener('click', exportChat);

// ── TOAST ─────────────────────────────────────────────────────────────────
function showToast(msg){
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(els.toast._t);
  els.toast._t = setTimeout(() => els.toast.classList.remove('show'), 2500);
}

// ── SETTINGS ──────────────────────────────────────────────────────────────
function showSettings(){
  els.apiKeyInput.value = state.apiKey;
  els.modelSelect.value = state.model;
  els.jurisdictionSelect.value = state.jurisdiction;
  initThemeBtn();
  applyTheme(state.theme);
  els.settingsModal.classList.remove('hidden');
}
els.apiBtn.addEventListener('click', showSettings);
els.settingsClose.addEventListener('click', () => els.settingsModal.classList.add('hidden'));
els.settingsModal.addEventListener('click', e => {
  if(e.target === els.settingsModal) els.settingsModal.classList.add('hidden');
});

els.settingsSave.addEventListener('click', () => {
  const key = els.apiKeyInput.value.trim();
  if(key){
    state.apiKey = key;
    localStorage.setItem('lexai_key', key);
  }
  state.model = els.modelSelect.value;
  state.jurisdiction = els.jurisdictionSelect.value;
  localStorage.setItem('lexai_model', state.model);
  localStorage.setItem('lexai_jurisdiction', state.jurisdiction);
  els.settingsModal.classList.add('hidden');
  showToast('✅ Settings saved');
});

// ── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){
    if(!els.settingsModal.classList.contains('hidden')){ els.settingsModal.classList.add('hidden'); return; }
  }
  if((e.ctrlKey || e.metaKey) && e.key === 'k'){ e.preventDefault(); resetChat(); }
  if((e.ctrlKey || e.metaKey) && e.key === 'b'){ e.preventDefault(); toggleSidebar(); }
  if((e.ctrlKey || e.metaKey) && e.key === 'e'){ e.preventDefault(); exportChat(); }
  if((e.ctrlKey || e.metaKey) && e.key === ','){ e.preventDefault(); showSettings(); }
});

// ── NETWORK ───────────────────────────────────────────────────────────────
window.addEventListener('online', () => showToast('🌐 Connection restored'));
window.addEventListener('offline', () => showToast('⚠️ Connection lost — offline'));

// ── RESPONSIVE ────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  if(window.innerWidth > 768){
    const bd = document.querySelector('.sb-bd');
    if(bd) bd.classList.remove('on');
  }
});

// ── INIT ──────────────────────────────────────────────────────────────────
(function init(){
  if(window.innerWidth <= 768){
    els.sidebar.classList.add('closed');
    state.sidebarOpen = false;
  }
  applyTheme(state.theme);
  renderDomainCards();
  renderConvList();
  showWelcome(true);

  if(!state.apiKey){
    setTimeout(showSettings, 500);
    showToast('🔑 Configure your API key to start');
  }
})();
