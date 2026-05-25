// ── CONFIG (edit this to customize your AI) ──────────────────────────
const API_BASE    = 'http://127.0.0.1:11434/v1';
const API_KEY     = 'ollama';
const MODEL       = 'qwen2.5:3b';
const AI_NAME     = 'DEVCON';
const AI_AVATAR   = 'DV';
const BRAND_COLOR = '#0057B8';
const ACCENT_COLOR = '#00A8E8';
const AI_TONE     = null;   // set a string here to override the default system prompt
const SUGGESTIONS = null;   // set an array of { icon, label, desc, prompt } to override suggestion cards
// ─────────────────────────────────────────────────────────────────────
window.ACTIVE_MODEL = MODEL;

// ── TONE PRESETS ──────────────────────────────────────────────────────
const TONE_PRESETS = {
  default:  '',
  friendly: 'You are {name} — a warm, encouraging AI assistant. You celebrate curiosity, use simple language, add friendly emojis occasionally, and always make the user feel confident and supported. Keep answers clear and concise.',
  formal:   'You are {name} — a professional AI assistant. Communicate in clear, structured, formal language. No slang or emojis. Provide thorough, accurate, well-formatted answers.',
  taglish:  'Ikaw si {name} — isang AI assistant na nagsasalita ng Taglish (Tagalog-English mix). Maging palakaibiganin at natural sa pag-usap. Gamitin ang Filipino warmth habang nananatiling helpful at technical kung kinakailangan.',
  teacher:  'You are {name} — a patient, educational AI tutor. Break complex topics into clear steps, use analogies, ask clarifying questions, and prioritize helping the user understand rather than just giving answers.',
  strict:   'You are {name} — a precise, no-nonsense AI. Give direct, concise answers only. No filler phrases or excessive praise. Prioritize accuracy and brevity above all else.',
};

// ── STATE ─────────────────────────────────────────────────────────────
let messages = [];           // current session API messages [{role, content}]
let sessions = [];           // [{id, title, displayMessages, created}]
let currentSessionId = null;
let isStreaming = false;
let isDark = false;
let isConnected = false;

// ── SESSION MANAGEMENT ────────────────────────────────────────────────
function createSession(title) {
  const id = 'sess_' + Date.now();
  const session = { id, title: title || 'New conversation', displayMessages: [], created: new Date() };
  sessions.unshift(session);
  currentSessionId = id;
  renderHistory();
  return session;
}

function getCurrentSession() {
  return sessions.find(s => s.id === currentSessionId) || null;
}

function loadSession(id) {
  const session = sessions.find(s => s.id === id);
  if (!session) return;
  currentSessionId = id;
  messages = session.displayMessages.map(m => ({ role: m.role, content: m.content }));
  renderHistory();
  renderSessionMessages(session);
  if (window.innerWidth <= 640) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('visible');
  }
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!sessions.length) {
    list.innerHTML = `<div class="history-item active">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span class="history-item-title">New conversation</span>
    </div>`;
    return;
  }
  list.innerHTML = sessions.map(s => {
    const userCount = s.displayMessages.filter(m => m.role === 'user').length;
    const isActive = s.id === currentSessionId;
    return `<div class="history-item${isActive ? ' active' : ''}" onclick="loadSession('${s.id}')">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span class="history-item-title">${escHtml(s.title)}</span>
      ${userCount > 0 ? `<span class="history-item-badge">${userCount}</span>` : ''}
      <button class="history-item-delete" onclick="event.stopPropagation(); deleteSession('${s.id}')" title="Delete conversation">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>`;
  }).join('');
}

function deleteSession(id) {
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return;
  sessions.splice(idx, 1);
  if (currentSessionId === id) {
    if (sessions.length) {
      loadSession(sessions[Math.min(idx, sessions.length - 1)].id);
    } else {
      currentSessionId = null;
      messages = [];
      resetWelcomeScreen();
      renderHistory();
    }
  } else {
    renderHistory();
  }
}

function renderSessionMessages(session) {
  const chatArea = document.getElementById('chat-area');
  chatArea.innerHTML = '';

  if (!session.displayMessages.length) {
    resetWelcomeScreen();
    return;
  }

  const avatarLabel = window._AI_NAME_ACTIVE
    ? window._AI_NAME_ACTIVE.slice(0, 2).toUpperCase()
    : AI_AVATAR;

  for (const msg of session.displayMessages) {
    if (msg.role === 'user') {
      const row = document.createElement('div');
      row.className = 'message-row user';
      row.innerHTML = `<div class="avatar user">You</div><div class="bubble user">${escHtml(msg.content)}</div>`;
      chatArea.appendChild(row);
      const t = document.createElement('div');
      t.className = 'message-time user';
      t.textContent = msg.time || '';
      chatArea.appendChild(t);
    } else if (msg.role === 'assistant') {
      const row = document.createElement('div');
      row.className = 'message-row';
      row.innerHTML = `<div class="avatar ai">${avatarLabel}</div><div class="bubble ai">${formatContent(msg.content)}</div>`;
      chatArea.appendChild(row);
      const t = document.createElement('div');
      t.className = 'message-time';
      t.textContent = msg.time || '';
      chatArea.appendChild(t);
    }
  }

  document.getElementById('chat-title').textContent = session.title;
  scrollToBottom();
}

// ── PERSONALIZATION ───────────────────────────────────────────────────
const SETTINGS_KEY = 'barangayai_settings';

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); }
  catch { return {}; }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function applySettings(s) {
  if (s.brand_color) {
    const c = s.brand_color;
    document.documentElement.style.setProperty('--dc-blue', c);
    document.documentElement.style.setProperty('--dc-blue-dark',   shadeColor(c, -20));
    document.documentElement.style.setProperty('--dc-blue-mid',    shadeColor(c,  10));
    document.documentElement.style.setProperty('--dc-blue-deeper', scaleColor(c, 0.22));
    window._BRAND_COLOR_ACTIVE = c;
  }
  const name = s.ai_name || AI_NAME;
  window._AI_NAME_ACTIVE = name;
  document.getElementById('chat-title').textContent = name;
  const wt = document.querySelector('.welcome-title');
  if (wt) wt.textContent = name;
  const bn = document.querySelector('.brand-name');
  if (bn) bn.textContent = name.toUpperCase();
  const mh = document.querySelector('.modal-header-text h2');
  if (mh) mh.textContent = name.toUpperCase();
  if (s.ai_tone !== undefined) window._AI_TONE_ACTIVE = s.ai_tone;
  if (s.ai_knowledge !== undefined) window._AI_KNOWLEDGE_ACTIVE = s.ai_knowledge;
  window._GREETING_ACTIVE = s.welcome_greeting || null;
  const initials = name.slice(0, 2).toUpperCase();
  document.querySelectorAll('.avatar.ai').forEach(a => a.textContent = initials);
  const wi = document.querySelector('.welcome-icon');
  if (wi) wi.textContent = initials;
  const bl = document.querySelector('.brand-logo');
  if (bl) bl.textContent = initials;
  if (document.getElementById('welcome-screen')) resetWelcomeScreen();
}

function shadeColor(hex, pct) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + Math.round(2.55 * pct)));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + Math.round(2.55 * pct)));
  const b = Math.min(255, Math.max(0, (n & 0xff) + Math.round(2.55 * pct)));
  return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
}

function scaleColor(hex, factor) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8)  & 0xff) * factor);
  const b = Math.round((n & 0xff)         * factor);
  return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
}

function getAIAvatar() {
  const name = window._AI_NAME_ACTIVE || AI_NAME;
  return name.slice(0, 2).toUpperCase();
}

function setTonePreset(key, el) {
  const aiName = document.getElementById('settings-ai-name').value.trim() || AI_NAME;
  const prompt = (TONE_PRESETS[key] || '').replace(/\{name\}/g, aiName);
  document.getElementById('settings-ai-tone').value = prompt;
  document.querySelectorAll('.tone-preset-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
}

function detectActivePreset(currentTone) {
  const aiName = document.getElementById('settings-ai-name').value.trim() || AI_NAME;
  document.querySelectorAll('.tone-preset-chip').forEach(c => {
    const key = c.dataset.preset;
    const expected = (TONE_PRESETS[key] || '').replace(/\{name\}/g, aiName);
    c.classList.toggle('active', currentTone.trim() === expected.trim());
  });
}

function updateSettingsPreview() {
  const name    = document.getElementById('settings-ai-name').value.trim() || AI_NAME;
  const brand   = document.getElementById('settings-brand-color').value;
  const greeting = document.getElementById('settings-greeting').value.trim() || 'Good to see you! 👋';
  const prevAvatar  = document.getElementById('preview-avatar');
  const prevName    = document.getElementById('preview-name');
  const prevGreeting = document.getElementById('preview-greeting');
  if (prevAvatar) {
    prevAvatar.textContent = name.slice(0, 2).toUpperCase();
    prevAvatar.style.background = `linear-gradient(135deg, ${brand} 0%, ${brand}bb 100%)`;
  }
  if (prevName)    prevName.textContent    = name;
  if (prevGreeting) prevGreeting.textContent = greeting;
}

function openSettings() {
  const s = loadSettings();
  const nameInput   = document.getElementById('settings-ai-name');
  const brandInput  = document.getElementById('settings-brand-color');
  const toneInput   = document.getElementById('settings-ai-tone');
  const greetInput  = document.getElementById('settings-greeting');

  const knowledgeInput = document.getElementById('settings-ai-knowledge');
  nameInput.value      = s.ai_name          || AI_NAME;
  brandInput.value     = s.brand_color      || BRAND_COLOR;
  toneInput.value      = s.ai_tone          || AI_TONE || '';
  greetInput.value     = s.welcome_greeting || '';
  if (knowledgeInput) knowledgeInput.value = s.ai_knowledge || '';

  document.getElementById('settings-brand-color-label').textContent = brandInput.value;

  document.querySelectorAll('#brand-swatches .color-swatch').forEach(el =>
    el.classList.toggle('active', el.dataset.color === brandInput.value));

  document.getElementById('settings-modal').style.display = 'flex';
  updateSettingsPreview();
  detectActivePreset(toneInput.value);
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

function handleSettingsBackdrop(e) {
  if (e.target === document.getElementById('settings-modal')) closeSettings();
}

function previewColor(type, val) {
  document.getElementById('settings-brand-color-label').textContent = val;
  document.querySelectorAll('#brand-swatches .color-swatch').forEach(el =>
    el.classList.toggle('active', el.dataset.color === val));
  updateSettingsPreview();
}

function setSwatchColor(type, val, el) {
  document.getElementById('settings-brand-color').value = val;
  document.getElementById('settings-brand-color-label').textContent = val;
  document.querySelectorAll('#brand-swatches .color-swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  updateSettingsPreview();
}

function resetSettingsForm() {
  document.getElementById('settings-ai-name').value  = AI_NAME;
  document.getElementById('settings-brand-color').value = BRAND_COLOR;
  document.getElementById('settings-ai-tone').value  = AI_TONE || '';
  document.getElementById('settings-greeting').value = '';
  const ki = document.getElementById('settings-ai-knowledge');
  if (ki) ki.value = '';
  document.getElementById('settings-brand-color-label').textContent = BRAND_COLOR;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  document.querySelector(`#brand-swatches [data-color="${BRAND_COLOR}"]`)?.classList.add('active');
  document.querySelectorAll('.tone-preset-chip').forEach(c => c.classList.toggle('active', c.dataset.preset === 'default'));
  updateSettingsPreview();
}

function applyAndSaveSettings() {
  const s = {
    ai_name:          (document.getElementById('settings-ai-name').value.trim() || AI_NAME),
    brand_color:      document.getElementById('settings-brand-color').value,
    ai_tone:          document.getElementById('settings-ai-tone').value.trim(),
    welcome_greeting: document.getElementById('settings-greeting').value.trim(),
    ai_knowledge:     (document.getElementById('settings-ai-knowledge')?.value.trim() || ''),
  };
  saveSettings(s);
  applySettings(s);
  closeSettings();
  showToast('Settings saved!');
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'settings-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 300); }, 2200);
}

// ── MODAL ─────────────────────────────────────────────────────────────
function openModal() {
  document.getElementById('modal-backdrop').style.display = 'flex';
}
function closeModal() {
  document.getElementById('modal-backdrop').style.display = 'none';
}
function handleBackdropClick(e) {
  if (e.target === document.getElementById('modal-backdrop')) closeModal();
}

// ── MODEL SELECTOR ────────────────────────────────────────────────────
const MODEL_MAP = {
  qwen:  'qwen2.5:3b',
  qwen3: 'qwen3.5:0.8b',
};

function selectModel(id) {
  if (!MODEL_MAP[id]) return;
  window.ACTIVE_MODEL = MODEL_MAP[id];

  document.querySelectorAll('.model-opt').forEach(el => {
    el.classList.remove('active');
    const tag = el.querySelector('.active-tag');
    if (tag) tag.remove();
  });

  const btn = document.getElementById('model-opt-' + id);
  if (btn) {
    btn.classList.add('active');
    const tag = document.createElement('span');
    tag.className = 'active-tag';
    tag.textContent = 'Active';
    btn.appendChild(tag);
  }

  // Update subtitle
  const subtitle = document.getElementById('header-subtitle');
  if (subtitle) subtitle.textContent = `AI Sa Barangay · Ollama + ${MODEL_MAP[id]} · Local · Open Source`;

  showToast(`Switched to ${MODEL_MAP[id]}`);
}

// ── CONNECTIVITY CHECK ────────────────────────────────────────────────
async function checkConnectivity() {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 6000);
    await fetch(`${API_BASE}/models`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      signal: ctrl.signal
    });
    clearTimeout(timeout);
    setConnected(true);
    return;
  } catch {}

  try {
    const ctrl2 = new AbortController();
    const timeout2 = setTimeout(() => ctrl2.abort(), 8000);
    await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: window.ACTIVE_MODEL, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, stream: false }),
      signal: ctrl2.signal
    });
    clearTimeout(timeout2);
    setConnected(true);
    return;
  } catch {}

  setConnected(false);
}

function setConnected(ok) {
  isConnected = ok;

  const chip = document.getElementById('header-status-chip');
  const text = document.getElementById('header-status-text');
  chip.classList.toggle('disconnected', !ok);
  text.textContent = ok ? 'Ollama' : 'Offline';

  const card = document.getElementById('sidebar-wifi');
  const status = document.getElementById('sidebar-wifi-status');
  const statusText = document.getElementById('sidebar-wifi-text');
  card.className = 'sidebar-wifi ' + (ok ? 'connected' : 'disconnected');
  status.className = 'sidebar-wifi-status ' + (ok ? 'ok' : 'err');
  statusText.textContent = ok ? 'Connected · Model online' : 'Ollama not detected';

  document.getElementById('send-btn').disabled = false;
  document.getElementById('message-input').placeholder = ok
    ? 'Ask anything — local, private, free…'
    : 'Ollama not detected — is it running?';
}

checkConnectivity();
setInterval(checkConnectivity, 15000);

// ── UI HELPERS ────────────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('visible');
}

document.getElementById('overlay').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('visible');
});

function toggleTheme() {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '');
  const icon = document.getElementById('theme-icon');
  icon.innerHTML = isDark
    ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
    : '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function suggest(text) {
  document.getElementById('message-input').value = text;
  sendMessage();
}

function getTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── MARKDOWN RENDERER ─────────────────────────────────────────────────
function inlineFmt(text) {
  const codes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, c) => {
    codes.push(`<code>${escHtml(c)}</code>`);
    return `\x00i${codes.length - 1}\x00`;
  });
  text = escHtml(text);
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  text = text.replace(/~~(.+?)~~/g, '<s>$1</s>');
  text = text.replace(/\x00i(\d+)\x00/g, (_, n) => codes[+n]);
  return text;
}

function renderTable(lines) {
  const parseRow = l => l.split('|').slice(1, -1).map(c => c.trim());
  const isSep = row => row.length > 0 && row.every(c => /^:?-{1,}:?$/.test(c.trim()));
  const rows = lines.map(parseRow).filter(r => r.length > 0);
  if (!rows.length) return '';
  let thead = '', startIdx = 0;
  if (rows.length >= 2 && isSep(rows[1])) {
    thead = '<thead><tr>' + rows[0].map(c => `<th>${inlineFmt(c)}</th>`).join('') + '</tr></thead>';
    startIdx = 2;
  }
  const bodyRows = rows.slice(startIdx);
  const tbody = bodyRows.length
    ? '<tbody>' + bodyRows.map(r => '<tr>' + r.map(c => `<td>${inlineFmt(c)}</td>`).join('') + '</tr>').join('') + '</tbody>'
    : '';
  return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`;
}

function formatContent(rawText) {
  const codeBlocks = [];
  let text = rawText.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const label = lang ? `<div class="code-lang-label">${escHtml(lang)}</div>` : '';
    codeBlocks.push(`<div class="code-block">${label}<pre>${escHtml(code.trim())}</pre></div>`);
    return `\x00c${codeBlocks.length - 1}\x00`;
  });

  const lines = text.split('\n');
  const parts = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    if (/^\x00c\d+\x00$/.test(t)) { parts.push(t); i++; continue; }
    if (t === '') { parts.push('<div style="height:6px"></div>'); i++; continue; }

    const hm = t.match(/^(#{1,4}) (.+)/);
    if (hm) { parts.push(`<h${Math.min(hm[1].length + 1, 4)}>${inlineFmt(hm[2])}</h${Math.min(hm[1].length + 1, 4)}>`); i++; continue; }

    if (/^(---+|___+|\*\*\*+)$/.test(t)) { parts.push('<hr>'); i++; continue; }

    if (t.startsWith('> ')) {
      const bq = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) { bq.push(inlineFmt(lines[i].trim().slice(2))); i++; }
      parts.push(`<blockquote>${bq.join('<br>')}</blockquote>`);
      continue;
    }

    if (t.startsWith('|')) {
      const tblLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tblLines.push(lines[i]); i++; }
      parts.push(renderTable(tblLines));
      continue;
    }

    if (/^[-*•+] /.test(t)) {
      const items = [];
      while (i < lines.length && /^[-*•+] /.test(lines[i].trim())) {
        items.push(`<li>${inlineFmt(lines[i].trim().replace(/^[-*•+] /, ''))}</li>`);
        i++;
      }
      parts.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+[.)]\s/.test(t)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i].trim())) {
        items.push(`<li>${inlineFmt(lines[i].trim().replace(/^\d+[.)]\s/, ''))}</li>`);
        i++;
      }
      parts.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    parts.push(`<p>${inlineFmt(t)}</p>`);
    i++;
  }

  let html = parts.join('');
  html = html.replace(/\x00c(\d+)\x00/g, (_, n) => codeBlocks[+n]);
  return html;
}

// ── MESSAGE RENDERING ─────────────────────────────────────────────────
function hideWelcome() {
  const ws = document.getElementById('welcome-screen');
  if (ws) ws.remove();
}

function appendUserMessage(text) {
  const chatArea = document.getElementById('chat-area');
  hideWelcome();
  const row = document.createElement('div');
  row.className = 'message-row user';
  row.innerHTML = `<div class="avatar user">You</div><div class="bubble user">${escHtml(text)}</div>`;
  chatArea.appendChild(row);
  const time = document.createElement('div');
  time.className = 'message-time user';
  time.textContent = getTime();
  chatArea.appendChild(time);
  scrollToBottom();
}

const _thinkingPhrases = ['Thinking', 'Reading your message', 'Generating response', 'Putting it together'];

function appendTypingIndicator() {
  const chatArea = document.getElementById('chat-area');
  const row = document.createElement('div');
  row.className = 'message-row';
  row.id = 'typing-row';
  row.innerHTML = `
    <div class="avatar ai">${getAIAvatar()}</div>
    <div class="bubble ai thinking-bubble">
      <div class="thinking-spinner"></div>
      <span class="thinking-label" id="thinking-label">Thinking</span>
      <span class="thinking-model-tag">${window.ACTIVE_MODEL}</span>
    </div>`;
  chatArea.appendChild(row);

  let phraseIdx = 0, dotCount = 0;
  const labelEl = row.querySelector('#thinking-label');
  window._thinkingInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    if (dotCount === 0) phraseIdx = (phraseIdx + 1) % _thinkingPhrases.length;
    labelEl.textContent = _thinkingPhrases[phraseIdx] + '.'.repeat(dotCount || 1);
  }, 450);

  scrollToBottom();
}

function removeTypingIndicator() {
  clearInterval(window._thinkingInterval);
  const el = document.getElementById('typing-row');
  if (el) el.remove();
}

function appendMsgMeta(chatArea, elapsedMs, completionTokens, fullText) {
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const secs = (elapsedMs / 1000).toFixed(1) + 's';
  const tokens = completionTokens ?? (fullText ? Math.round(fullText.length / 4) : null);
  const parts = [secs];
  if (tokens) parts.push('~' + tokens + ' tokens');
  parts.push(window.ACTIVE_MODEL);
  meta.innerHTML = parts.map((p, i) =>
    i < parts.length - 1
      ? `<span>${p}</span><span class="msg-meta-dot">·</span>`
      : `<span>${p}</span>`
  ).join('');
  chatArea.appendChild(meta);
}

function appendAIMessage(text) {
  const chatArea = document.getElementById('chat-area');
  const row = document.createElement('div');
  row.className = 'message-row';
  row.innerHTML = `
    <div class="avatar ai">${getAIAvatar()}</div>
    <div class="bubble ai" id="ai-bubble-latest">${formatContent(text)}</div>`;
  chatArea.appendChild(row);
  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = getTime();
  chatArea.appendChild(time);
  scrollToBottom();
}

function appendError(msg) {
  const chatArea = document.getElementById('chat-area');
  const err = document.createElement('div');
  err.className = 'error-bubble';
  err.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${escHtml(msg)}`;
  chatArea.appendChild(err);
  scrollToBottom();
}

function scrollToBottom() {
  const chatArea = document.getElementById('chat-area');
  chatArea.scrollTop = chatArea.scrollHeight;
}

document.getElementById('chat-area').addEventListener('scroll', function() {
  const { scrollTop, scrollHeight, clientHeight } = this;
  const btn = document.getElementById('scroll-btn');
  const atBottom = scrollHeight - scrollTop - clientHeight < 80;
  btn.classList.toggle('visible', !atBottom && scrollHeight > clientHeight + 200);
});

// ── HISTORY ───────────────────────────────────────────────────────────
function updateHistory(firstMessage) {
  const session = getCurrentSession();
  if (session && session.title === 'New conversation') {
    session.title = firstMessage.length > 32 ? firstMessage.slice(0, 32) + '…' : firstMessage;
  }
  renderHistory();
  const titleEl = document.getElementById('chat-title');
  if (titleEl && session) titleEl.textContent = session.title;
}

// ── XHR FALLBACK ──────────────────────────────────────────────────────
function xhrFallback(payload) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/chat/completions`, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${API_KEY}`);
    xhr.timeout = 30000;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText).choices?.[0]?.message?.content || 'No response.'); }
        catch { reject(new Error('Parse error')); }
      } else { reject(new Error(`HTTP ${xhr.status}`)); }
    };
    xhr.onerror   = () => reject(new Error('XHR network error'));
    xhr.ontimeout = () => reject(new Error('XHR timeout'));
    xhr.send(JSON.stringify({ ...payload, stream: false }));
  });
}

// ── SEND MESSAGE ──────────────────────────────────────────────────────
async function sendMessage() {
  if (isStreaming) return;
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;
  isStreaming = true;

  // Ensure a session exists
  if (!currentSessionId) createSession();
  const session = getCurrentSession();

  const userTime = getTime();
  appendUserMessage(text);
  messages.push({ role: 'user', content: text });
  if (session) session.displayMessages.push({ role: 'user', content: text, time: userTime });

  appendTypingIndicator();

  const _runtimeName      = window._AI_NAME_ACTIVE || AI_NAME;
  const _runtimeTone      = (window._AI_TONE_ACTIVE !== undefined ? window._AI_TONE_ACTIVE : AI_TONE);
  const _runtimeKnowledge = window._AI_KNOWLEDGE_ACTIVE || '';
  const _basePrompt = _runtimeTone ||
    `You are ${_runtimeName} — an open source AI assistant built by the Filipino developer community. You run locally via Ollama and Qwen on school lab hardware. Help with programming, open source, AI/ML, local LLM setup, and Filipino tech topics. Be friendly and practical. You may use Filipino/Taglish warmth but stay clear and technical when needed.`;
  const systemPrompt = _runtimeKnowledge
    ? `${_basePrompt}\n\n## Your Knowledge & Abilities\n${_runtimeKnowledge}`
    : _basePrompt;

  const payload = {
    model: window.ACTIVE_MODEL,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    max_tokens: 1024,
    temperature: 0.7
  };

  const startTime = Date.now();

  // ── Streaming attempt ────────────────────────────────────────────────
  try {
    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({ ...payload, stream: true, stream_options: { include_usage: true } })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    removeTypingIndicator();

    const chatArea = document.getElementById('chat-area');
    const row = document.createElement('div');
    row.className = 'message-row';
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'avatar ai';
    avatarDiv.textContent = getAIAvatar();
    const bubble = document.createElement('div');
    bubble.className = 'bubble ai';
    bubble.id = 'ai-bubble-latest';
    row.appendChild(avatarDiv);
    row.appendChild(bubble);
    chatArea.appendChild(row);
    scrollToBottom();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let completionTokens = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          if (parsed.usage) completionTokens = parsed.usage.completion_tokens ?? parsed.usage.total_tokens ?? null;
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) { fullText += delta; bubble.innerHTML = formatContent(fullText); scrollToBottom(); }
        } catch {}
      }
    }

    if (!fullText) bubble.innerHTML = '<em style="color:var(--text-muted)">No response received.</em>';

    const aiTime = getTime();
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = aiTime;
    chatArea.appendChild(timeDiv);
    appendMsgMeta(chatArea, Date.now() - startTime, completionTokens, fullText);

    messages.push({ role: 'assistant', content: fullText });
    if (session) session.displayMessages.push({ role: 'assistant', content: fullText, time: aiTime });
    updateHistory(text);
    setConnected(true);

  } catch (streamErr) {
    removeTypingIndicator();

    // ── Non-streaming fallback ───────────────────────────────────────
    try {
      const res2 = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ ...payload, stream: false })
      });

      if (!res2.ok) throw new Error(`HTTP ${res2.status}: ${await res2.text()}`);

      const data = await res2.json();
      const aiText = data.choices?.[0]?.message?.content || 'No response.';
      const aiTime = getTime();
      appendAIMessage(aiText);
      const fallbackTokens = data.usage?.completion_tokens ?? data.usage?.total_tokens ?? null;
      appendMsgMeta(document.getElementById('chat-area'), Date.now() - startTime, fallbackTokens, aiText);
      messages.push({ role: 'assistant', content: aiText });
      if (session) session.displayMessages.push({ role: 'assistant', content: aiText, time: aiTime });
      updateHistory(text);
      setConnected(true);

    } catch (fetchErr) {
      // ── XHR last resort ─────────────────────────────────────────
      const msg = fetchErr.message || '';
      let errorData = {};

      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS') || msg.includes('Load failed')) {
        try {
          const xhrResult = await xhrFallback(payload);
          removeTypingIndicator();
          const xhrTime = getTime();
          appendAIMessage(xhrResult);
          appendMsgMeta(document.getElementById('chat-area'), Date.now() - startTime, null, xhrResult);
          messages.push({ role: 'assistant', content: xhrResult });
          if (session) session.displayMessages.push({ role: 'assistant', content: xhrResult, time: xhrTime });
          updateHistory(text);
          setConnected(true);
          isStreaming = false;
          document.getElementById('send-btn').disabled = false;
          document.getElementById('message-input').focus();
          return;
        } catch {
          errorData = {
            title: "Ollama isn't allowing browser requests",
            desc: "The AI model is running but your browser can't reach it because of a security setting. This is a one-line fix.",
            steps: [
              { text: "Stop Ollama if it's running — close the terminal or press Ctrl+C" },
              { text: 'Restart it with this command:', code: 'OLLAMA_ORIGINS=* ollama serve' },
              { text: 'Wait a few seconds, then try sending your message again' },
              { text: "If that doesn't work, ask your facilitator" }
            ]
          };
        }
      } else if (msg.includes('401')) {
        errorData = {
          title: "Ollama rejected the connection",
          desc: "Authorization error. Restart Ollama with the correct settings.",
          steps: [
            { text: 'Open a terminal and run:', code: 'OLLAMA_ORIGINS=* ollama serve' },
            { text: 'Refresh this page and try again' }
          ]
        };
      } else if (msg.includes('404')) {
        errorData = {
          title: "Model not found",
          desc: "Ollama is running but can't find the Qwen model.",
          steps: [
            { text: 'Open a terminal and run:', code: 'ollama list' },
            { text: 'If qwen2.5:3b is missing, pull it:', code: 'ollama pull qwen2.5:3b' },
            { text: 'Try again once the model finishes loading' }
          ]
        };
      } else if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
        errorData = {
          title: "The AI model crashed or is overloaded",
          desc: "Ollama returned a server error — the model may still be loading or your machine ran out of memory.",
          steps: [
            { text: 'Wait 10–15 seconds and try again' },
            { text: 'Try the lighter model:', code: 'ollama run qwen3.5:0.8b' },
            { text: 'Restart Ollama:', code: 'OLLAMA_ORIGINS=* ollama serve' }
          ]
        };
      } else if (msg.includes('ERR_CONNECTION_REFUSED') || msg.includes('ECONNREFUSED')) {
        errorData = {
          title: "Ollama is not running",
          desc: "Nothing is listening at the AI address. Start Ollama first.",
          steps: [
            { text: 'Open a terminal and run:', code: 'OLLAMA_ORIGINS=* ollama serve' },
            { text: 'Leave that terminal open, then try again' }
          ]
        };
      } else {
        errorData = {
          title: "Something went wrong",
          desc: "The AI couldn't be reached. Try these fixes one by one.",
          steps: [
            { text: 'Make sure Ollama is running:', code: 'OLLAMA_ORIGINS=* ollama serve' },
            { text: 'Check the model is installed:', code: 'ollama list' },
            { text: 'Try the API directly in your browser:', code: 'localhost:11434/v1/models' },
            { text: 'If nothing works, raise your hand — your facilitator can help' }
          ]
        };
      }

      removeTypingIndicator();
      const chatArea = document.getElementById('chat-area');
      const errId = 'err-' + Date.now();
      const err = document.createElement('div');
      err.className = 'error-bubble';
      err.id = errId;
      err.innerHTML = `
        <div class="error-bubble-top">
          <div class="error-bubble-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div>
            <div class="error-bubble-title">${escHtml(errorData.title)}</div>
            <div class="error-bubble-desc">${escHtml(errorData.desc)}</div>
          </div>
        </div>
        <div class="error-bubble-steps">
          <div class="error-bubble-steps-title">What to do next</div>
          ${errorData.steps.map((s, i) => `
          <div class="error-step">
            <div class="error-step-num">${i + 1}</div>
            <span>${escHtml(s.text)}${s.code ? ` <code>${escHtml(s.code)}</code>` : ''}</span>
          </div>`).join('')}
        </div>
        <button class="error-bubble-dismiss" onclick="document.getElementById('${errId}').remove()">Dismiss</button>`;
      chatArea.appendChild(err);
      scrollToBottom();
      setConnected(false);
    }
  } finally {
    isStreaming = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('message-input').focus();
  }
}

// ── WELCOME SCREEN ────────────────────────────────────────────────────
function resetWelcomeScreen() {
  const chatArea = document.getElementById('chat-area');
  chatArea.innerHTML = '';
  const ws = document.createElement('div');
  ws.className = 'welcome-screen';
  ws.id = 'welcome-screen';
  const greetings = ['Good to see you! 👋', 'Mabuhay! 👋', 'Welcome back! 👋', 'Hello, developer! 👋'];
  const greeting = window._GREETING_ACTIVE || greetings[Math.floor(Math.random() * greetings.length)];
  const _activeName = window._AI_NAME_ACTIVE || AI_NAME;
  ws.innerHTML = `
    <div class="logo-wrapper">
      <div class="welcome-icon">${(_activeName).slice(0, 2).toUpperCase()}</div>
      <div class="logo-tooltip">
        <div class="logo-tooltip-label">Powered by</div>
        <div class="logo-tooltip-brand">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/></svg>
          Alibaba Cloud
        </div>
      </div>
    </div>
    <div>
      <div class="welcome-greeting">${greeting}</div>
      <div class="welcome-title">${_activeName}</div>
      <div class="welcome-sub">Built by Filipino developers, running Qwen locally via Ollama. Open source, free to use, free to learn from, free to build on.</div>
    </div>
    <div class="community-desc">
      <div class="community-desc-inner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>
        <span>This is an <strong>open community AI project</strong> — built and maintained by Filipino developers. Fork it, customize it, make it yours.</span>
      </div>
    </div>
    <div class="community-desc">
      <div class="community-desc-inner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span>Runs on <strong>Ollama + Qwen 2.5 3B</strong> on your own machine. No cloud. No API fees. No data leaving this computer.</span>
      </div>
    </div>
    <div class="suggestion-grid" id="suggestion-grid-welcome">
      <button class="suggestion-card" onclick="suggest('What is DEVCON Barangay AI Code Camps? What will I learn and build today?')">
        <span class="suggestion-card-icon">🏕️</span>
        <div class="suggestion-card-label">About Barangay AI</div>
        <div class="suggestion-card-desc">What is this project?</div>
      </button>
      <button class="suggestion-card" onclick="suggest('I am a beginner. Give me a simple first coding exercise — write a Python function to call a local Ollama API endpoint and print the response.')">
        <span class="suggestion-card-icon">💻</span>
        <div class="suggestion-card-label">Start Coding</div>
        <div class="suggestion-card-desc">Beginner first exercise</div>
      </button>
      <button class="suggestion-card" onclick="suggest('Please check my grammar and suggest improvements. Here is my text: [paste your text here]')">
        <span class="suggestion-card-icon">✍️</span>
        <div class="suggestion-card-label">Grammar Checker</div>
        <div class="suggestion-card-desc">Fix and improve your writing</div>
      </button>
      <button class="suggestion-card" onclick="suggest('Please review my code, suggest improvements, and explain any issues you find. Here is my code: [paste your code here]')">
        <span class="suggestion-card-icon">🔍</span>
        <div class="suggestion-card-label">Code Review Buddy</div>
        <div class="suggestion-card-desc">Review and improve your code</div>
      </button>
      <button class="suggestion-card" onclick="suggest('How does a local AI model work? Explain what Ollama does and what Qwen is, using simple analogies a high school student would understand.')">
        <span class="suggestion-card-icon">🧠</span>
        <div class="suggestion-card-label">How It Works</div>
        <div class="suggestion-card-desc">Simple explanation</div>
      </button>
      <button class="suggestion-card" onclick="suggest('How do I contribute to an open source project on GitHub as a complete beginner? Walk me through forking a repo and opening a pull request step by step.')">
        <span class="suggestion-card-icon">🤝</span>
        <div class="suggestion-card-label">Contribute</div>
        <div class="suggestion-card-desc">Fork, edit, pull request</div>
      </button>
    </div>`;
  chatArea.appendChild(ws);
  document.getElementById('chat-title').textContent = window._AI_NAME_ACTIVE || AI_NAME;

  // Apply custom suggestions if configured
  if (SUGGESTIONS) {
    const grid = ws.querySelector('#suggestion-grid-welcome');
    if (grid) {
      grid.innerHTML = SUGGESTIONS.map(s => `
        <button class="suggestion-card" onclick="suggest(${JSON.stringify(s.prompt)})">
          <span class="suggestion-card-icon">${s.icon}</span>
          <div class="suggestion-card-label">${s.label}</div>
          <div class="suggestion-card-desc">${s.desc}</div>
        </button>`).join('');
    }
  }
}

// ── CHAT ACTIONS ──────────────────────────────────────────────────────
function clearChat() {
  messages = [];
  const session = getCurrentSession();
  if (session) { session.displayMessages = []; session.title = 'New conversation'; }
  resetWelcomeScreen();
  renderHistory();
}

function newChat() {
  messages = [];
  createSession();
  resetWelcomeScreen();
  if (window.innerWidth <= 640) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('visible');
  }
}

// ── INIT ──────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  document.documentElement.style.setProperty('--dc-blue', BRAND_COLOR);
  document.documentElement.style.setProperty('--dc-accent', ACCENT_COLOR);

  const titleEl = document.getElementById('chat-title');
  if (titleEl) titleEl.textContent = AI_NAME;
  const welcomeTitleEl = document.querySelector('.welcome-title');
  if (welcomeTitleEl) welcomeTitleEl.textContent = AI_NAME;

  const saved = loadSettings();
  if (Object.keys(saved).length) applySettings(saved);

  if (SUGGESTIONS) {
    const grid = document.querySelector('.suggestion-grid');
    if (grid) {
      grid.innerHTML = SUGGESTIONS.map(s => `
        <button class="suggestion-card" onclick="suggest(${JSON.stringify(s.prompt)})">
          <span class="suggestion-card-icon">${s.icon}</span>
          <div class="suggestion-card-label">${s.label}</div>
          <div class="suggestion-card-desc">${s.desc}</div>
        </button>`).join('');
    }
  }

  const greetings = ['Good to see you! 👋', 'Mabuhay! 👋', 'Welcome! 👋', 'Hello, developer! 👋'];
  const el = document.getElementById('welcome-greeting');
  if (el) el.textContent = window._GREETING_ACTIVE || greetings[Math.floor(Math.random() * greetings.length)];

  // Create the initial session
  createSession();

  openModal();
  document.getElementById('message-input').focus();
});
