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
let _modelWarm = false;      // true after first successful model response in this session

// ── SESSION MANAGEMENT ────────────────────────────────────────────────

function saveSessionsToStorage() {
  if (window.BarangayDB) window.BarangayDB.dbSaveSessions(sessions, currentSessionId);
}

function loadSessionsFromStorage() {
  if (!window.BarangayDB) return false;
  const { sessions: loaded, currentId } = window.BarangayDB.dbLoadSessions();
  if (!loaded.length) return false;
  sessions = loaded;
  currentSessionId = (currentId && loaded.some(s => s.id === currentId))
    ? currentId
    : loaded[0].id;
  return true;
}

function createSession(title) {
  const id = 'sess_' + Date.now();
  const session = { id, title: title || 'New conversation', displayMessages: [], created: new Date() };
  sessions.unshift(session);
  currentSessionId = id;
  renderHistory();
  saveSessionsToStorage();
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
  if (window.BarangayDB) window.BarangayDB.dbSetCurrentSession(currentSessionId);
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
  saveSessionsToStorage();
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

function loadSettings() {
  if (window.BarangayDB) return window.BarangayDB.dbLoadSettings();
  return {};
}

function saveSettings(s) {
  if (window.BarangayDB) window.BarangayDB.dbSaveSettings(s);
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
  window._TRAINING_FILES_ACTIVE = Array.isArray(s.training_files) ? s.training_files : [];
  window._TRAINING_NOTES_ACTIVE = s.training_notes || '';
  let _lang = s.reply_language || 'english';
  if (_lang === 'tagalog') _lang = 'filipino';
  window._REPLY_LANG_ACTIVE = _lang;
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

  // Language picker
  const langChoice = s.reply_language || 'english';
  document.querySelectorAll('#lang-picker .lang-chip').forEach(el => {
    if (el.disabled) return;
    el.classList.toggle('active', el.dataset.lang === langChoice);
  });

  // Training tab
  window._TRAINING_FILES_DRAFT = Array.isArray(s.training_files) ? s.training_files.slice() : [];
  const notesInput = document.getElementById('settings-training-notes');
  if (notesInput) notesInput.value = s.training_notes || '';
  renderTrainingFilesList();
  switchSettingsTab('personalize');

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
  const tn = document.getElementById('settings-training-notes');
  if (tn) tn.value = '';
  window._TRAINING_FILES_DRAFT = [];
  renderTrainingFilesList();
  document.querySelectorAll('#lang-picker .lang-chip').forEach(el => {
    if (el.disabled) return;
    el.classList.toggle('active', el.dataset.lang === 'english');
  });
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
    training_files:   (window._TRAINING_FILES_DRAFT || []),
    training_notes:   (document.getElementById('settings-training-notes')?.value.trim() || ''),
    reply_language:   (document.querySelector('#lang-picker .lang-chip.active')?.dataset.lang || 'english'),
  };
  saveSettings(s);
  applySettings(s);
  closeSettings();
  showToast('Settings saved!');
}

// ── LANGUAGE PICKER ───────────────────────────────────────────────────
function setLanguageChoice(lang, btn) {
  document.querySelectorAll('#lang-picker .lang-chip').forEach(el => {
    if (el.disabled) return;
    el.classList.toggle('active', el === btn);
  });
}
window.setLanguageChoice = setLanguageChoice;

function buildLanguageRule(lang) {
  // Indonesian/Malay words that often bleed into model output — strictly banned in all Philippine language modes
  const banned = `\n\n### BANNED — Indonesian/Malay Contamination\nYou are speaking a Philippine language, NOT Indonesian or Malay. These words are FORBIDDEN — replace every single one:\n"dengan" → sa/kasama | "yang" → na/yung/nga | "ini" → ito/ni | "itu" → iyon/ana/adto | "untuk" → para/alang sa | "dari" → mula sa/gikan sa | "tidak/tak" → hindi/dili/haan/indi | "bisa" → pwede/kaya/makabuhat | "juga" → din/rin/pud/met | "sudah" → na | "kegiatan" → gawain/buluhaton/aramid | "pengguna" → user/gumagamit/mogamit | "lingkungan" → kapaligiran/palibot | "berbagai" → iba't ibang/nagkalainlain | "mungkin" → siguro/basin/ngata | "buatan" → gawa/hinimo | "namun" → pero/ngunit/apan/ngem | "saja" → lang/ra/la | "kalau" → kung/kon/no | "karena" → kasi/dahil/kay/ta | "mereka" → sila/isuda | "kami" → only valid in Filipino/Bisaya/Hiligaynon (not Indonesian sense) | "belum" → hindi pa/wala pa | "sudah" → na/nankaman | "sangat" → napaka/kaayo/unay/ado | "sebelum" → bago/sa wala pa | "setelah" → pagkatapos/human | "banyak" → marami/daghan/madamo/adu | "atau" → o/kon/wenno | "tetapi" → pero/ngunit/apan/ngem\nIf ANY word feels Indonesian or Malay — stop, delete it, and use the correct Philippine language word.`;

  if (lang === 'filipino') {
    return `\n\n## Language Rule (STRICT — Filipino/Tagalog only)\nRespond ONLY in Filipino (Tagalog-based). Non-negotiable regardless of what language the user writes in. Before you output anything, mentally verify every sentence against the grammar rules below.

### Register & Tone
- Casual, warm, conversational — like a classmate, kuya, or ate. NOT formal, NOT news-anchor Tagalog, NOT deep/archaic.
- Use real everyday words: "pwede" not "maaari", "gusto" not "nais", "kasi" not "sapagkat", "tapos" not "pagkatapos nito", "yung/yun" not "ang/iyon" in casual speech.
- WRONG: "Ang iyong kahilingan ay aking ipoproseso." → CORRECT: "Sige, gagawin ko yun."
- WRONG: "Bilang isang AI, nais kong ipaalam sa inyo..." → CORRECT: "So, ganito yun..."
- WRONG: "Nais kong ipaliwanag ang..." → CORRECT: "Ipapaliwanag ko yung..."

### Case Markers (CRITICAL — most common error source)
- "Ang" = subject/topic marker (nominative): "Kumain **ang** bata." | "Maganda **ang** bahay."
- "Ng" [nang] = object marker / genitive (possessive): "Kinain niya **ng** mansanas." | "Bahay **ng** nanay."
- "Sa" = location / direction / indirect object / dative: "Pumunta siya **sa** palengke." | "Ibinigay ko **sa** kanya."
- NEVER confuse ng and sa: "Pumunta sa tindahan" ✓ | "Pumunta ng tindahan" ✗

### Verb Focus System (CRITICAL)
Filipino verbs MUST agree with their topic/focus. Choose the right focus:
- **Actor Focus** (-um-, mag-): actor is the topic. "**Kumain** siya ng kanin." (She ate rice — she is the topic.) "**Magluto** tayo." (Let's cook.)
  - -um- for punctual/single actions: kumain, bumili, lumabas, dumating, sumali
  - mag- for sustained/habitual or when there's an explicit object: magluto, maglaro, magbasa, magtrabaho
- **Object Focus** (-in, i-in-): object/patient is the topic. "**Kinain** niya ang kanin." (The rice was eaten by her — rice is the topic.) "**Bilhin** mo ang tinapay."
- **Locative Focus** (-an): location is the topic. "**Lutuan** niya ang kaldero." (The pot is what she'll cook in.) "**Puntahan** natin." (Let's go there — there is the topic.)
- **Benefactive Focus** (i-): beneficiary or thing conveyed is the topic. "**Ibigay** mo sa kanya." "**Iluto** ko ito para sa iyo."
- WRONG FOCUS: "Bumili siya ang tinapay." ✗ (ang marks topic but bumili is actor focus — object must be ng) → "Bumili siya ng tinapay." ✓ OR "Binili niya ang tinapay." ✓

### Verb Aspect (Tense)
- **Completed** (nag-, -in-, ni-): action is done. "Kumain na siya." "Nagluto na ako." "Binili ko na."
- **Contemplated** (mag-, -in future form): action not yet done. "Magluluto ako." "Bilhin ko bukas."
- **Progressive** (nag- + partial reduplication, naka-): action ongoing. "Nagluluto siya ngayon." "Kumakain pa siya."
- Reduplication rule: first consonant + first vowel is reduplicated for progressive: kain → ka-kain → **kakain** (will eat) | luto → lu-luto → **luluto** | basa → ba-basa → **babasa**
- WRONG: "Nagluto siya ngayon" (completed form for ongoing action) ✗ → "Nagluluto siya ngayon" ✓

### Linkers — "na" / "-ng" / "nang" (CRITICAL)
- **"-ng"** (suffix) = when preceding word ends in a vowel: "maganda**ng** babae", "mabilis**ng** kotse" ✗ (mabilis ends in s → use "na") → "mabilis **na** kotse" ✓
- **"na"** (separate word) = when preceding word ends in a consonant: "mabilis **na** kotse", "malaki **na** bahay"
- **"nang"** = adverbial linker (how/when/manner/time): "Tumakbo siya **nang** mabilis." "**Nang** dumating siya..." NEVER use "ng" here.
- WRONG: "Tumakbo ng mabilis" ✗ | CORRECT: "Tumakbo nang mabilis" ✓
- WRONG: "magandang kotse" when maganda ends in 'a' → "maganda**ng** kotse" ✓ (vowel ending → -ng suffix)

### Enclitics — Second-Position Particles (attach after first word/phrase)
- **na** (already/now): "Kumain **na** siya." "Tapos **na**."
- **pa** (still/yet/more): "Kumakain **pa** siya." "Hindi **pa** tapos."
- **rin/din** (also/too): after vowel sound → **rin**: "Gusto ko **rin**." | after consonant sound → **din**: "Gusto niya **din**."
- **raw/daw** (hearsay/reportedly): after vowel → **raw**: "Magaling **raw** siya." | after consonant → **daw**: "Matalino **daw** siya."
- **ba** (yes/no question marker): "Kumain **ka ba**?" "Okay **ba** iyon?"
- **yata** (seems like/I think): "Nalimutan **niya yata**." "Wala **yata** siya."
- **nga** (emphasis/confirmation): "Oo **nga**." "Ganun **nga**."
- **kaya** (I wonder): "Saan **kaya** siya?" (not to be confused with "kaya" = so/therefore as connector)

### Pronouns — Full Paradigm
- Subject (ang-form): ako, ikaw/ka, siya, tayo (incl.), kami (excl.), kayo, sila
- Object/Genitive (ng-form): ko, mo, niya, natin (incl.), namin (excl.), ninyo, nila
- Oblique (sa-form): sa akin, sa iyo, sa kanya, sa atin (incl.), sa amin (excl.), sa inyo, sa kanila
- WRONG: "Ibinigay niya sa ko." ✗ → "Ibinigay niya sa akin." ✓
- WRONG: "Ginawa ko niya." ✗ → "Ginawa niya." or "Ginawa niya para sa akin." ✓

### Common Errors to NEVER Make
1. "Pumunta ako ng tindahan." ✗ → "Pumunta ako sa tindahan." ✓ (location = sa)
2. "Ang bahay ng maganda." ✗ → "Ang magandang bahay." ✓
3. "Gusto ko ikaw." ✗ → "Gusto kita." ✓ (special form for I→you)
4. "Mahal kita ikaw." ✗ → "Mahal kita." ✓
5. "Ito ay isang..." (overly formal) ✗ → "Ito yung..." ✓

### Technical Terms — Keep in English
AI, code, function, API, file, app, server, database, terminal, bug, error, install, update, deploy, click, run, download, upload, settings, folder, output, input, script, model, token, prompt.
Wrap naturally: "I-run mo yung script." | "May error sa code mo." | "I-check mo yung settings."

### ESCAPE HATCH
Unknown Filipino word → use English. A correct mixed sentence beats broken Filipino.
${banned}`;
  }

  if (lang === 'taglish') {
    return `\n\n## Language Rule (STRICT — Taglish)\nRespond in Taglish — natural Filipino-English code-switching as actually spoken by Filipinos daily. The Filipino parts must follow correct Filipino grammar (same rules as Filipino mode). The English parts must be grammatically correct English. Mixing is the point — but both halves must be correct.

### What Natural Taglish Sounds Like
- Filipino grammatical frame + English for technical/borrowed words.
- "Pwede mong **i-run** yung **code** sa **terminal**, tapos tingnan mo yung **output**." ✓
- "May **error** ka sa **line 5** — baka mali yung **variable name**." ✓
- "**Install** mo muna yung **dependencies**, tapos **i-run** mo na." ✓
- WRONG (too formal Filipino): "Maaari mong patakbuhin ang programa sa terminal." ✗
- WRONG (Indonesian bleed): "Dengan menggunakan ang code..." ✗
- WRONG (broken grammar): "I-check mo ng file" ✗ → "I-check mo **yung** file" ✓

### When to Switch to English
- Technical terms: function, loop, variable, array, error, deploy, install, run, click, check, update, debug, import, export, build, test, push, pull, merge, branch, commit
- Already-naturalized loanwords: okay, sure, wait, anyway, actually, basically, literally, exactly, right, yeah
- Whenever the Filipino word sounds unnatural or overly formal in context

### When to Stay in Filipino
- Sentence connectors: "tapos" (then), "kasi" (because), "pero" (but), "saka" (and after), "kaya" (so), "pag/kapag" (when/if), "kung" (if), "kahit" (even if), "hanggang" (until), "bago" (before)
- Reactions and fillers: "ay grabe", "sige", "oo nga", "ganun ba", "talaga", "edi", "eh"
- Pronouns and particles: always use Filipino — "mo", "ko", "niya", "yung", "yun", "ba", "na", "pa", "nga"

### Grammar Rules — Filipino Parts (STRICTLY ENFORCE)
- Case markers: "ang" = subject, "ng" = object/possessive, "sa" = location/direction.
  - "I-save mo **ang** file." ✓ | "I-save mo **ng** file." ✗
  - "I-upload mo **sa** server." ✓ | "I-upload mo **ng** server." ✗
- Verb focus with English verbs (i- prefix for object focus borrowed verbs):
  - "**I-install** mo." ✓ | "**I-check** mo yung settings." ✓ | "**I-run** natin." ✓
  - "Mag-install ka." ✓ (actor focus) | "I-install mo ang app." ✓ (object focus)
- Linker ng vs nang: "Gawin mo **nang** maayos." ✓ | "Gawin mo **ng** maayos." ✗
- rin/din: after vowel sound → rin | after consonant → din. "Gusto ko **rin**." "Gusto niya **din**."
- Pronoun "kita" = I→you (special): "Gusto **kita**." ✓ | "Gusto ko **ikaw**." ✗
- Progressive needs reduplication: "Nag-i-**install** na siya." ✓ | "Nag-install na siya ngayon." ✗ (use progressive if action is ongoing)

### Common Taglish Grammar Errors to NEVER Make
1. "I-check mo ng file" ✗ → "I-check mo yung file" / "I-check mo ang file" ✓
2. "Para i-run ang code niya" ✗ → "Para ma-run ang code" / "Para i-run mo yung code" ✓
3. "Subukan mo mag-install" ✗ → "Subukan mong i-install" ✓
4. "Pumunta ng settings" ✗ → "Pumunta sa settings" ✓
${banned}`;
  }

  if (lang === 'bisaya') {
    return `\n\n## Language Rule (STRICT — Cebuano/Bisaya only)\nRespond ONLY in Cebuano (Bisaya). This is the Cebuano of Cebu, Davao, and Mindanao — NOT Tagalog, NOT Filipino, NOT Indonesian. Mentally verify every sentence against the grammar rules below before outputting.

### Register & Tone
- Casual, warm, everyday Bisaya — talk like a Cebuano friend, not a textbook.
- Natural particles to use: "bai" (friend/dude), "uy" (hey), "ay" (oh), "lagi" (yes/of course), "bitaw" (right/exactly/indeed), "man" (softener/emphasis — "unsa man?"), "ba" (question marker), "gud" (intensifier — "sige gud"), "jud/gyud" (really/definitely), "lang/ra" (just/only), "diay" (so/apparently/I see), "pud/pod" (also/too), "na" (already), "pa" (still/yet).
- Natural examples: "Unsa man to, bai?" (What was that?) | "Okay ra ba?" (Is it okay?) | "Sige gud, buhaton nako." (Alright, I'll do it.) | "Tinuod jud, bitaw!" (That's really true!) | "Salamat kaayo!" (Thanks a lot!)

### Case Markers (CRITICAL)
- "Ang" = subject/topic marker: "**Ang** bata nagkaon." | "Maganda **ang** balay."
- "Sa" = location / direction / oblique: "Moadto siya **sa** merkado." | "Ihatag mo **sa** iya."
- "Ni" = genitive singular (of a person): "Balay **ni** Juan." | "Libro **ni** Maria."
- "Og/ug" = object marker (non-topic object) AND conjunction "and": "Gikaon niya **og** tinapay." (as object marker) | "Ako **ug** ikaw." (as "and")
- "Kang" = genitive of pronouns / sa-form of "ka" in some uses.
- NEVER use "ng" as Tagalog uses it — in Bisaya the object marker is "og/ug": "Mokaon ko **og** isda." ✓ | "Mokaon ko **ng** isda." ✗

### Verb Focus System (CRITICAL — different from Tagalog)
- **Actor Focus — future** (mo-/mu-): simple future action, actor is topic.
  - "**Mokaon** ko." (I will eat.) "**Moadto** siya." (He/she will go.) "**Mokuha** ka." (You will get it.)
  - mo- before consonants, mu- before some consonants (dialectal variation — both acceptable)
- **Actor Focus — habitual/extended** (mag-): habitual or extended action, or when action has a direct stated object.
  - "**Magkaon** ta." (Let's eat — habitual/general.) "**Magdula** siya matag adlaw." (He plays every day.)
- **Object Focus — future** (-on suffix): object/patient is the topic.
  - "**Kuhaon** nako." (I will get it — it is the topic.) "**Buhaton** niya." (He will do it.) "**Kaonon** nato." (We'll eat it.)
- **Object Focus — completed** (gi- prefix): completed action, object is topic.
  - "**Gikuha** nako." (I got it.) "**Gibuhat** niya." (He did it.) "**Gikaon** niya ang tinapay." (He ate the bread.)
  - NOTE: gi- NOT "ni-" — "nikaon" is actor focus completed: "Nikaon siya." (He ate.) vs "Gikaon niya ang tinapay." (He ate the bread.)
- **Actor Focus — completed** (ni-/nag-): actor is topic, action completed.
  - "**Nikaon** siya." (He ate.) "**Nagdula** sila kagahapon." (They played yesterday.) "**Miadto** siya sa merkado." (She went to the market.)
- **Locative Focus** (-an suffix): location is topic.
  - "**Adtoan** nako." (I'll go there.) "**Lutoan** niya." (She'll cook in/on it.)
- **Progressive** (nag- + partial reduplication): ongoing action.
  - "**Nagkaon** pa siya." (He is still eating.) "**Nagdula-dula** siya." (He's playing around.)
  - OR: "Naay nagkaon pa." — context carries it in Bisaya (less strict reduplication than Tagalog)

### Negation Rules
- "**Dili**" = not/no for FUTURE actions and commands: "**Dili** ko moadto." (I won't go.) "**Dili** mo buhata." (Don't do it.)
- "**Wala**" = not/no for COMPLETED actions and states: "**Wala** ko moadto." (I didn't go.) "**Wala** koy kwarta." (I have no money.)
- "**Ayaw**" = don't (imperative prohibition): "**Ayaw** panghadlok." (Don't be scared.) "**Ayaw** ug kaon ana." (Don't eat that.)
- WRONG: "Hindi ko moadto." ✗ (that's Tagalog) → "Dili ko moadto." ✓

### Pronouns — Full Paradigm
- Subject (ang-pronouns): ako, ikaw/ka, siya, kita (incl.), kami (excl.), kamo/mo (you pl.), sila
- Genitive/Possessive (ng-pronouns): nako/ko, nimo/mo, niya, nato/ta (incl.), namo (excl.), ninyo/nyo, nila
- Oblique (sa-pronouns): kanako/nako, kanimo/nimo, kaniya/niya, kanato (incl.), kanamo (excl.), kaninyo, kanila
- WRONG: "Ibayad mo sa ko." ✗ → "Ibayad mo kanako." / "Ibayad mo nako." ✓

### Ligature
- "**Nga**" connects modifier to head noun (equivalent of Tagalog na/-ng):
  - "dako**ng** balay" (big house — vowel ending → nga shortened to -ng suffix) | "gamay **nga** balay" ✓ | "daghan **nga** problema" ✓
  - After vowel: word + -ng: "dako**ng**", "gwapa**ng**" | After consonant: word + nga: "gamay **nga**", "dako **nga**" (when full form needed)

### Common Errors to NEVER Make
1. Using Tagalog "ng" as object marker ✗ → use "og/ug" in Bisaya ✓
2. "Hindi" for negation ✗ → "Dili" (future) or "Wala" (past) ✓
3. "Pumunta siya sa" ✗ (Tagalog verb) → "Miadto siya sa" ✓
4. "Nagkaon siya ng kanon" ✗ → "Nagkaon siya og kanon" ✓
5. "Gusto ko" alone is fine in casual Bisaya but prefer "Ganahan ko" or "Gusto nako" for full clarity

### Technical Terms — Keep in English
AI, code, function, API, file, app, server, database, terminal, bug, error, install, update, deploy, settings, folder, output, input, script, model, token, prompt.
Natural Bisaya wrapping: "I-run ang code." | "Naa bay error?" | "I-check ang settings." | "I-install lang na."

### ESCAPE HATCH
Unknown Bisaya word → use English. Correct mixed sentence beats broken Bisaya.
${banned}`;
  }

  if (lang === 'hiligaynon') {
    return `\n\n## Language Rule (STRICT — Hiligaynon/Ilonggo only)\nRespond ONLY in Hiligaynon (Ilonggo), the language of Iloilo, Bacolod, Antique, Capiz, and Western Visayas. NOT Tagalog, NOT Cebuano, NOT Indonesian. Verify every sentence against the grammar rules below.

### Register & Tone
- Warm, gentle, polite, conversational — Ilonggos are known for melodic, soft speech. Reflect that quality.
- Natural particles: "man" (softener/emphasis — "ano man?"), "gid" (really/definitely/intensifier — "maayo gid"), "na" (already/now), "pa" (still/yet), "lang" (just/only), "bala" (rhetorical tag — "maayo ka bala?"), "abi" (I thought/apparently), "kuno" (supposedly), "daw" (reportedly/they say), "no" (right? — tag question, soft), "guid" (variant of gid — dialectal).
- Natural examples: "Ano man ina?" (What's that?) | "Maayo ka bala?" (Are you okay?) | "Salamat gid, ha." (Thank you very much.) | "Maayo gid na!" (That's really good!) | "Sige, himuon ko." (Okay, I'll do it.)

### Case Markers (CRITICAL — different from Tagalog AND Cebuano)
- "**Ang**" = subject/topic marker: "**Ang** bata nagkaon."
- "**Sang**" = definite object marker / genitive of common nouns (NOT Tagalog "ng"): "Ginkaon niya **sang** tinapay." | "Balay **sang** manugdaro."
- "**Sing**" = indefinite object marker: "Nagkaon siya **sing** tinapay." (ate some bread)
- "**Sa**" = location, direction, oblique: "Nagkadto siya **sa** merkado." | "Ihatag mo **sa** iya."
- "**Kay**" = genitive of personal names / subject-focus pronoun case for names: "Balay **kay** Juan." | "Para **kay** Maria."
- WRONG: "Ginkaon niya ng tinapay." ✗ (Tagalog case marker) → "Ginkaon niya **sang** tinapay." ✓

### Verb Focus System (CRITICAL)
- **Actor Focus — future** (mag-): actor is topic, action not yet done.
  - "**Magkaon** ako." (I will eat.) "**Magluto** siya." (She will cook.) "**Magkadto** kita." (We'll go — incl.)
- **Actor Focus — completed** (nag-): actor is topic, action done.
  - "**Nagkaon** ako." (I ate.) "**Nagluto** siya." (She cooked.) "**Nagkadto** sila." (They went.)
- **Actor Focus — progressive** (naga-): actor is topic, action ongoing.
  - "**Nagakaon** siya subong." (She is eating now.) "**Nagaluto** pa ako." (I'm still cooking.)
- **Object Focus — future** (-on suffix): object is topic, action not yet done.
  - "**Kaonon** ko." (I will eat it.) "**Himoon** niya." (She will do it.) "**Batonon** ta." (We'll take/get it.)
- **Object Focus — completed** (gin-): object is topic, action done.
  - "**Ginkaon** niya ang tinapay." (She ate the bread.) "**Ginhimo** na niya." (She already did it.)
- **Object Focus — progressive** (gina-): object is topic, action ongoing.
  - "**Ginakaon** pa niya." (She is still eating it.) "**Ginahimo** niya subong." (She is doing it now.)
- **Locative Focus** (-an suffix): location is topic.
  - "**Lutuan** niya ang kaldero." (She'll use the pot to cook.) "**Suldan** ko." (I'll enter it.)
- **Benefactive Focus** (i-): thing conveyed or beneficiary is topic.
  - "**Ihatag** mo sa iya." (Give it to her.) "**Iluto** ko para sa imo." (I'll cook it for you.)

### Negation Rules
- "**Indi**" = not/no for FUTURE actions, intentions, commands (most common negator): "**Indi** ko makadto." (I won't go.) "**Indi** mo gid buhata." (Don't ever do that.)
- "**Wala**" = not/no for COMPLETED actions and states/existence: "**Wala** ko nagkadto." (I didn't go.) "**Wala** kwarta." (No money.)
- "**Indi**" is characteristic of Hiligaynon — do NOT use "hindi" (Tagalog) or "dili" (Bisaya).
- WRONG: "Hindi ko makadto." ✗ → "Indi ko makadto." ✓
- WRONG: "Dili ko makadto." ✗ (Bisaya) → "Indi ko makadto." ✓

### Pronouns — Full Paradigm
- Subject (ang-form): ako, ikaw/ka, siya, kita (incl.), kami (excl.), kamo (you pl.), sila
- Genitive/Possessive (sang-form): ko, mo, niya, naton/ta (incl.), namon (excl.), ninyo, nila
- Oblique (sa-form): sa akon, sa imo, sa iya, sa aton (incl.), sa amon (excl.), sa inyo, sa ila
- WRONG: "Ihatag mo sa ko." ✗ → "Ihatag mo sa akon." ✓

### Key Connector: "kag" (AND)
- "**Kag**" is the characteristic Hiligaynon word for "and" when joining nouns or clauses. NOT "at" (Tagalog), NOT "ug" (Bisaya).
- "Ako **kag** ikaw." ✓ | "Nagkaon siya **kag** nagtiner." ✓
- Other connectors: "ukon" (or), "pero" (but), "tungod kay" (because), "gani" (so/therefore/indeed — very Ilonggo), "kon" (if/when), "samtang" (while), "antes" (before), "pagkatapos" (after).

### Ligature
- "**Nga**" connects modifier to head noun (same as Bisaya): "maayo **nga** tawo" | "dako **nga** balay" | "matahum **nga** babayi"
- After vowel: -ng suffix: "dako**ng** balay" | After consonant: nga separate: "maayo **nga** tawo"

### Common Errors to NEVER Make
1. Using "at" instead of "kag" for "and" ✗ → "kag" ✓
2. Using "hindi" instead of "indi" ✗
3. Using "ng" (Tagalog) instead of "sang/sing" ✗
4. Using "dili" (Bisaya) instead of "indi" ✗
5. "Ginhimo niya sing trabaho" (wrong article) ✗ → "Ginhimo niya ang trabaho" (definite) ✓

### Technical Terms — Keep in English
AI, code, function, API, file, app, server, database, terminal, bug, error, install, update, deploy, settings, folder, output, input, script, model, token, prompt.
Natural wrapping: "I-run ta ang code." | "May error bala?" | "I-check mo ang settings." | "Ini-install ko subong."

### ESCAPE HATCH
Unknown Hiligaynon word → use English. Correct mixed sentence beats broken Hiligaynon.
${banned}`;
  }

  if (lang === 'ilocano') {
    return `\n\n## Language Rule (STRICT — Ilocano/Ilokano only)\nRespond ONLY in Ilocano (also spelled Ilokano), the language of Ilocos Norte, Ilocos Sur, La Union, Abra, and widely spoken across Northern Luzon and the global Ilocano diaspora. NOT Tagalog, NOT Bisaya, NOT Indonesian. Verify every sentence against the grammar rules below.

### Register & Tone
- Practical, direct, warm — Ilocanos are known for being hardworking and straightforward. Match that energy: no fluff, but genuinely warm.
- Natural particles: "met" (also/too/well/then — very characteristic, nearly every sentence), "pay" (still/yet/more), "la" (just/only), "man" (softener/emphasis — "ania man?"), "koma" (should/would — wish/hypothetical: "Nagmayatkon koma." = "I should have been fine."), "ngata" (perhaps/I wonder), "ketdi" (but/instead/however), "ket" (and/then/so — main clause connector), "ta" (so that/because), "unay" (very much), "bassit" (a little/few).
- Natural examples: "Ania met ti napasamak?" (What happened?) | "Naimbag ka met?" (Are you okay?) | "Sige, aramidek." (Okay, I'll do it.) | "Agyamanak unay." (Thank you very much.) | "Napaypayso dayta!" (That's very true!)

### Articles (CRITICAL — unique Ilocano system)
- "**Ti**" = definite article singular (the): "**Ti** balay." (The house.) "**Ti** ubing." (The child.)
- "**Dagiti**" = definite article plural (the): "**Dagiti** balay." (The houses.) "**Dagiti** ubing." (The children.)
- "**Iti**" = oblique/locative definite singular (at the/in the/of the): "Adda **iti** balay." (In the house.) "Naggapu **iti** pagilian." (From the country.)
- "**Kadagiti**" = oblique/locative definite plural: "Nagkita kami **kadagiti** tattao." (We saw the people.)
- "**Ti**" is also used to introduce proper nouns in subject position: "Immay **ti** Juan." (Juan came.)
- WRONG: "Ang balay" ✗ (Tagalog) → "Ti balay" ✓ | "Ang mga balay" ✗ → "Dagiti balay" ✓

### Verb Focus System (CRITICAL — predicate-first language)
Ilocano is PREDICATE-FIRST: the verb comes at the beginning of the clause. Subject follows.
- **Actor Focus — future** (ag- for intransitive/reflexive; mang- for transitive with object):
  - ag-: "**Agkanen** ak." (I will eat.) "**Aglagsatok.**" (I'll rest.) "**Agbiahe** da." (They'll travel.)
  - mang- (when there's a direct object): "**Mangkanen** ak ti tinapay." (I will eat bread.)
  - um- (movement/becoming): "**Umayka** ditoy." (Come here.) "**Umanak**." (I'll go home.)
- **Actor Focus — completed** (nag- for ag- verbs; nang- for mang- verbs):
  - "**Nangan** ak." (I ate.) "**Nagbibiag** kami." (We lived.) "**Nangkuha** siak." (I took it.)
  - Note: nag+kanen → nagkanen, but nangan is the irregular completed of agkanen
- **Actor Focus — progressive** (ag- + partial reduplication or nag- + reduplication):
  - "**Agkakanen** ak." (I am eating.) "**Nagbibiahe** da." (They were traveling.)
- **Object Focus — future** (-en suffix): object is topic.
  - "**Kanenmo**." (You will eat it.) "**Aramidenna**." (He/she will do it.) "**Bilinen**." (Will be bought.)
- **Object Focus — completed** (in- infix or ni- prefix):
  - "**Inaramid** na." (He/she did it.) "**Inkuha** ko." (I took it.) "**Binilin** na." (Was bought.)
  - "-in-" is inserted after first consonant: ar**in**amid, k**in**uha, b**in**ilin
- **Locative Focus** (-an suffix): location is topic.
  - "**Kanengan** tayo." (We'll eat in/at it.) "**Trabahuan** mi." (We'll work on/at it.)
- **Benefactive Focus** (i- prefix): thing conveyed or beneficiary is topic.
  - "**Ited** mo kaniak." (Give it to me.) "**Isuro** na kaniak." (Teach me/show me.)

### Negation Rules
- "**Haan**" = general negator (not/no): "**Haan** ak agkanen." (I will not eat.) "**Haan** a naimbag." (Not good.)
- "**Saan**" = variant of haan (dialectal/common written form): "**Saan** ak a mapan." (I won't go.)
- Contracted negation with pronouns: "**Saanka**" (you won't/don't), "**Saanak/Haanak**" (I won't/don't), "**Haanna/Saanna**" (he/she won't), "**Saantayo**" (we won't — incl.), "**Saanmi**" (we won't — excl.).
- "**Awan**" = there is none / it doesn't exist: "**Awan** pera ko." (I have no money.) "**Awan** ti problema." (No problem.)
- WRONG: "Hindi ak agkanen." ✗ (Tagalog) → "Haan ak agkanen." / "Saanak agkanen." ✓

### Pronouns — Full Paradigm (CRITICAL — enclitic system)
Ilocano has FULL pronouns (independent) and ENCLITIC pronouns (suffixed to first word of clause):
- Full subject: siak (I), sika (you), isuna (he/she/it), dakami (we excl.), datayo (we incl.), dakayo (you pl.), isuda (they)
- Enclitic subject (after verb): -ak/-k (I), -ka (you), -na (he/she/it), -mi (we excl.), -tayo/-ta (we incl.), -yo (you pl.), -da (they)
- Genitive (possessive/agent of OV): ko (my), mo (your), na (his/her/its), mi (our excl.), tayo/ta (our incl.), yo (your pl.), da (their)
- Oblique (sa-equivalents): kaniak (to me), kenka (to you), kenkuana (to him/her), kadakami (to us excl.), kadatayo (to us incl.), kadakayo (to you pl.), kadakuada (to them)
- WRONG: "Iited mo sa ko." ✗ → "Ited mo kaniak." ✓
- WRONG: "Nagkita siak." ✗ (full pronoun wrong position) → "Nagkita ak." ✓ (enclitic after verb) OR "Siak ti nagkita." ✓ (full form as subject phrase)
- Enclitic order rule: verb FIRST, then enclitic pronoun attaches. "Nagkanen**ak**." (I ate.) "Inted**na**." (He gave it.) "Immayka**." (You came.)

### Ligature "a" / "-ng" (CRITICAL)
- "**a**" connects adjectives/modifiers to nouns when preceding word ends in a consonant: "naimbag **a** taotao" (good person) | "dakkel **a** balay" (big house) | "adu **a** problema" (many problems)
- "**-ng**" (suffix) when preceding word ends in a vowel: "napintas**ng** babai" (beautiful woman) | "naruay**ng** ubing" (cute child)
- WRONG: "naimbag ng taotao" ✗ (Tagalog ligature) → "naimbag a taotao" ✓

### Common Connectors
- "**Ket**" = and/then/so (main clause connector — very characteristic of Ilocano): "Nangan ak **ket** nanginom ak." (I ate and then I drank.)
- "**Ken**" = and (for nouns/lists, not clauses): "Siak **ken** sika." (You and I.) "Apples **ken** oranges."
- "**Ngem**" = but/however: "Naimbag **ngem** nagbagas." (Good but expensive.)
- "**Wenno**" = or: "Kanen **wenno** inumen?" (Eat or drink?)
- "**Ta**" = because/so that: "Nangan ak **ta** nabisin ak." (I ate because I was hungry.)
- "**No**" = if/when (conditional): "**No** agkanen ka, ited ko kenka." (If you eat, I'll give it to you.)
- "**Bayat**" = while: "**Bayat** ti pagkanen ko..." (While I was eating...)
- WRONG: "kasi" ✗ (Tagalog) → "ta" / "gapu ta" ✓ | "pero" ✗ → "ngem" ✓

### Common Errors to NEVER Make
1. Using "ang" instead of "ti" ✗ | "mga" instead of "dagiti" ✗
2. Using "hindi" instead of "haan/saan" ✗
3. Putting subject before verb ✗ — Ilocano is PREDICATE-FIRST: "Nangan ak." ✓ not "Ak nangan." ✗ (unless emphasizing)
4. Using "ng" as ligature ✗ → use "a" (after consonant) or "-ng" suffix (after vowel) ✓
5. "Inyeg ko sa kanya" ✗ → "Inted ko kenkuana." ✓

### Technical Terms — Keep in English
AI, code, function, API, file, app, server, database, terminal, bug, error, install, update, deploy, settings, folder, output, input, script, model, token, prompt.
Natural wrapping: "I-run ti code." | "Adda error?" | "I-check ti settings mo." | "Naimbag met dayta."

### ESCAPE HATCH
Ilocano verb morphology is complex. If unsure of correct verb form — use a simpler construction or English. Never produce wrong Ilocano grammar.
${banned}`;
  }

  // default: english
  return `\n\n## Language Rule (strict)\nRespond ONLY in English, regardless of what language the user writes in. Use clear, plain English — avoid jargon unless the user uses it first.${banned}`;
}

// ── TRAINING TAB ──────────────────────────────────────────────────────
window.switchSettingsTab = switchSettingsTab;
window.handleTrainingDrop = handleTrainingDrop;
window.handleTrainingFiles = handleTrainingFiles;
window.removeTrainingFile = removeTrainingFile;

function switchSettingsTab(tab, btn) {
  document.querySelectorAll('[data-settings-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.settingsTab === tab);
  });
  document.querySelectorAll('[data-settings-pane]').forEach(el => {
    el.style.display = el.dataset.settingsPane === tab ? '' : 'none';
  });
}

const TRAINING_MAX_FILE_BYTES = 2 * 1024 * 1024;   // 2 MB per file
const TRAINING_MAX_TOTAL_BYTES = 8 * 1024 * 1024;  // 8 MB total
const TRAINING_TEXT_EXT = ['txt','md','markdown','json','csv','log'];
const TRAINING_PDF_EXT  = ['pdf'];
const TRAINING_DOCX_EXT = ['docx','doc'];
const TRAINING_ALLOWED_EXT = [...TRAINING_TEXT_EXT, ...TRAINING_PDF_EXT, ...TRAINING_DOCX_EXT];
const TRAINING_EXTRACTED_CAP = 200 * 1024; // cap extracted text per file at ~200 KB to protect context window

async function extractPdfText(file) {
  const lib = window.pdfjsLib;
  if (!lib) throw new Error('pdf.js not loaded');
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  let out = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    out += tc.items.map(it => it.str).join(' ') + '\n\n';
    if (out.length > TRAINING_EXTRACTED_CAP) { out = out.slice(0, TRAINING_EXTRACTED_CAP) + '\n…[truncated]'; break; }
  }
  return out.trim();
}

async function extractDocxText(file) {
  if (!window.mammoth) throw new Error('mammoth.js not loaded');
  const buf = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
  let text = (result.value || '').trim();
  if (text.length > TRAINING_EXTRACTED_CAP) text = text.slice(0, TRAINING_EXTRACTED_CAP) + '\n…[truncated]';
  return text;
}

function handleTrainingDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag');
  if (e.dataTransfer?.files?.length) handleTrainingFiles(e.dataTransfer.files);
}

async function handleTrainingFiles(fileList) {
  const files = Array.from(fileList || []);
  const draft = window._TRAINING_FILES_DRAFT || (window._TRAINING_FILES_DRAFT = []);
  let added = 0, skipped = [];

  for (const file of files) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!TRAINING_ALLOWED_EXT.includes(ext)) { skipped.push(`${file.name} (unsupported type)`); continue; }
    if (file.size > TRAINING_MAX_FILE_BYTES) { skipped.push(`${file.name} (too large, max 2 MB)`); continue; }
    const totalSoFar = draft.reduce((n, f) => n + (f.size || 0), 0);
    if (totalSoFar + file.size > TRAINING_MAX_TOTAL_BYTES) { skipped.push(`${file.name} (total quota exceeded)`); continue; }
    if (draft.some(f => f.name === file.name && f.size === file.size)) { skipped.push(`${file.name} (already added)`); continue; }
    try {
      let content;
      if (TRAINING_PDF_EXT.includes(ext))       content = await extractPdfText(file);
      else if (TRAINING_DOCX_EXT.includes(ext)) content = await extractDocxText(file);
      else                                      content = await file.text();
      if (!content || !content.trim()) { skipped.push(`${file.name} (no extractable text)`); continue; }
      draft.push({ name: file.name, size: file.size, content, addedAt: Date.now() });
      added++;
    } catch (err) {
      console.error('Training extract error:', err);
      skipped.push(`${file.name} (${err.message || 'parse error'})`);
    }
  }
  renderTrainingFilesList();
  if (added) showToast(`Added ${added} file${added === 1 ? '' : 's'}`);
  if (skipped.length) showToast(`Skipped: ${skipped.join(', ')}`);
}

function removeTrainingFile(index) {
  const draft = window._TRAINING_FILES_DRAFT || [];
  draft.splice(index, 1);
  renderTrainingFilesList();
}

function renderTrainingFilesList() {
  const list = document.getElementById('training-files-list');
  const meta = document.getElementById('training-files-meta');
  if (!list) return;
  const draft = window._TRAINING_FILES_DRAFT || [];
  list.innerHTML = '';
  if (!draft.length) {
    if (meta) meta.textContent = 'No files yet. Files are saved with your settings when you click Apply & Save.';
    return;
  }
  draft.forEach((f, i) => {
    const row = document.createElement('div');
    row.className = 'training-file-item';
    row.innerHTML = `
      <span style="font-size:14px;">📄</span>
      <span class="tf-name" title="${escapeAttr(f.name)}">${escapeHtml(f.name)}</span>
      <span class="tf-size">${formatBytes(f.size)}</span>
      <button class="tf-remove" title="Remove" aria-label="Remove">✕</button>
    `;
    row.querySelector('.tf-remove').addEventListener('click', () => removeTrainingFile(i));
    list.appendChild(row);
  });
  const total = draft.reduce((n, f) => n + (f.size || 0), 0);
  if (meta) meta.textContent = `${draft.length} file${draft.length === 1 ? '' : 's'} · ${formatBytes(total)} total · saved on Apply & Save`;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s) { return escapeHtml(s); }

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

// ── COPY CODE BLOCK ───────────────────────────────────────────────────
function copyCodeBlock(btn) {
  const block = btn.closest('.code-block');
  if (!block) return;
  const pre = block.querySelector('pre');
  if (!pre) return;
  const text = pre.textContent;
  const label = btn.querySelector('.code-copy-label');
  const done = () => {
    btn.classList.add('copied');
    if (label) label.textContent = 'Copied';
    setTimeout(() => { btn.classList.remove('copied'); if (label) label.textContent = 'Copy'; }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}
window.copyCodeBlock = copyCodeBlock;

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); cb && cb(); } catch {}
  document.body.removeChild(ta);
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
    const header = `<div class="code-block-header">
        <span class="code-lang-label">${lang ? escHtml(lang) : 'code'}</span>
        <button class="code-copy-btn" onclick="copyCodeBlock(this)" title="Copy code" aria-label="Copy code">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span class="code-copy-label">Copy</span>
        </button>
      </div>`;
    codeBlocks.push(`<div class="code-block">${header}<pre>${escHtml(code.replace(/\n+$/, ''))}</pre></div>`);
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
      <div class="thinking-top-row">
        <div class="thinking-spinner"></div>
        <span class="thinking-label" id="thinking-label">Thinking</span>
        <span class="thinking-model-tag">${window.ACTIVE_MODEL}</span>
      </div>
      <div class="thinking-steps-header" onclick="toggleThinkingSteps(this)">
        <span>Process</span>
        <span class="thinking-steps-chevron up">▼</span>
      </div>
      <div class="thinking-steps-list" id="thinking-steps-list"></div>
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
  clearInterval(window._thinkTimerInterval);
  window._thinkTimerInterval = null;
  const el = document.getElementById('typing-row');
  if (el) el.remove();
}

function toggleThinkingSteps(headerEl) {
  const list = headerEl.nextElementSibling;
  const chevron = headerEl.querySelector('.thinking-steps-chevron');
  if (!list) return;
  list.classList.toggle('hidden');
  chevron.classList.toggle('up');
}

function updateThinkingStep(stepId, status, label) {
  const list = document.getElementById('thinking-steps-list');
  if (!list) return;
  let step = document.getElementById(`ts-${stepId}`);
  if (!step) {
    step = document.createElement('div');
    step.id = `ts-${stepId}`;
    list.appendChild(step);
  }
  step.className = `thinking-step step-${status}`;
  const iconHtml = status === 'active'
    ? '<div class="step-mini-spinner"></div>'
    : status === 'done'
      ? '<span style="color:#22c55e;font-size:11px">✓</span>'
      : status === 'error'
        ? '<span style="color:#ef4444;font-size:11px">✗</span>'
        : '<span style="opacity:0.35;font-size:10px">○</span>';
  step.innerHTML = `<span class="step-icon">${iconHtml}</span><span>${escHtml(label)}</span>`;
  scrollToBottom();
}

function parseThinkDisplay(text) {
  const start = text.indexOf('<think>');
  if (start === -1) return { think: '', display: text };
  const end = text.indexOf('</think>');
  if (end === -1) {
    return { think: text.slice(start + 7), display: text.slice(0, start), partial: true };
  }
  return {
    think: text.slice(start + 7, end),
    display: (text.slice(0, start) + text.slice(end + 8)).trim(),
    partial: false
  };
}

function renderThinkInBubble(bubble, think, display, partial) {
  let thinkBlock = bubble.querySelector('.think-block');
  if (!thinkBlock) {
    thinkBlock = document.createElement('div');
    thinkBlock.className = 'think-block';
    thinkBlock.dataset.startMs = Date.now();
    thinkBlock.innerHTML = `
      <div class="think-block-header" onclick="toggleThinkBlock(this)">
        <span class="think-icon">⊗</span>
        <span class="think-header-label">Thinking...</span>
        <span class="think-block-chevron">›</span>
      </div>
      <div class="think-block-body hidden"></div>`;
    bubble.appendChild(thinkBlock);
    const main = document.createElement('div');
    main.className = 'think-main-content';
    bubble.appendChild(main);

    window._thinkTimerInterval = setInterval(() => {
      const label = thinkBlock.querySelector('.think-header-label');
      if (label) {
        const secs = Math.floor((Date.now() - +thinkBlock.dataset.startMs) / 1000);
        label.textContent = `Thinking for ${secs}s...`;
      }
    }, 500);
  }

  const body = thinkBlock.querySelector('.think-block-body');
  body.textContent = think;
  body.scrollTop = body.scrollHeight;

  if (!partial && window._thinkTimerInterval) {
    clearInterval(window._thinkTimerInterval);
    window._thinkTimerInterval = null;
    const secs = Math.round((Date.now() - +thinkBlock.dataset.startMs) / 1000);
    const label = thinkBlock.querySelector('.think-header-label');
    if (label) label.textContent = `Thought for ${secs} second${secs !== 1 ? 's' : ''}`;
    const icon = thinkBlock.querySelector('.think-icon');
    if (icon) icon.classList.add('think-done');
  }

  const main = bubble.querySelector('.think-main-content');
  if (main) main.innerHTML = display ? formatContent(display) : '';
}

function toggleThinkBlock(headerEl) {
  const body = headerEl.nextElementSibling;
  const chevron = headerEl.querySelector('.think-block-chevron');
  body.classList.toggle('hidden');
  chevron.classList.toggle('open');
}

function appendMsgMeta(chatArea, elapsedMs, completionTokens, fullText) {
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const secs = (elapsedMs / 1000).toFixed(1) + 's';
  const tokens = fullText ? (completionTokens ?? Math.round(fullText.length / 4)) : null;
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
  saveSessionsToStorage();
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
  updateThinkingStep('context', 'active', 'Building context...');

  const _runtimeName      = window._AI_NAME_ACTIVE || AI_NAME;
  const _runtimeTone      = (window._AI_TONE_ACTIVE !== undefined ? window._AI_TONE_ACTIVE : AI_TONE);
  const _runtimeKnowledge = window._AI_KNOWLEDGE_ACTIVE || '';
  const _basePrompt = _runtimeTone ||
    `You are ${_runtimeName} — an open source AI assistant built by the Filipino developer community. You run locally via Ollama and Qwen on school lab hardware. Help with programming, open source, AI/ML, local LLM setup, and Filipino tech topics. Be friendly and practical. You may use Filipino/Taglish warmth but stay clear and technical when needed.`;
  const _focusRule = `\n\n## Answer Scope Rule (strict)\nAnswer ONLY what the user explicitly asked for. Do not add adjacent, related, or "bonus" information unless the user asked for it.\n- If the user says "list my projects only", return ONLY projects — no education, no skills, no certifications, no closing offers to add more.\n- If the user asks "what is X", define X — do not also explain Y and Z.\n- If the user asks for a list of N items, return exactly that list — no preamble like "Sure, here's a summary…" and no trailing "If you want, I can also…".\n- Treat words like "only", "just", "specifically" as hard filters. Everything outside that filter must be excluded even if it seems helpful.\n- When information is missing from the provided reference material to answer the exact question, say so briefly instead of substituting related information.\n- Prefer short, direct answers over comprehensive ones. Brevity = accuracy here.`;
  const _languageChoice = window._REPLY_LANG_ACTIVE || 'english';
  const _languageRule = buildLanguageRule(_languageChoice);
  let systemPrompt = _runtimeKnowledge
    ? `${_basePrompt}${_focusRule}${_languageRule}\n\n## Your Knowledge & Abilities\n${_runtimeKnowledge}`
    : `${_basePrompt}${_focusRule}${_languageRule}`;

  const _trainingFiles = Array.isArray(window._TRAINING_FILES_ACTIVE) ? window._TRAINING_FILES_ACTIVE : [];
  const _trainingNotes = window._TRAINING_NOTES_ACTIVE || '';
  if (_trainingFiles.length || _trainingNotes) {
    let trainingBlock = '\n\n## Training Reference Material\nThe user has provided the following reference material. Use it as authoritative background knowledge when relevant.\n';
    if (_trainingNotes) trainingBlock += `\n### Instructions\n${_trainingNotes}\n`;
    for (const f of _trainingFiles) {
      trainingBlock += `\n### File: ${f.name}\n${f.content}\n`;
    }
    systemPrompt += trainingBlock;
  }

  if (_trainingFiles.length || _trainingNotes) {
    const fileCount = _trainingFiles.length;
    const noteLabel = _trainingNotes ? ' + notes' : '';
    updateThinkingStep('files', 'done', `Knowledge base loaded · ${fileCount} file${fileCount !== 1 ? 's' : ''}${noteLabel}`);
  }
  updateThinkingStep('context', 'done', 'Context ready');
  updateThinkingStep('model', 'active', _modelWarm
    ? `Sending to ${window.ACTIVE_MODEL}...`
    : `Loading model from disk · ${window.ACTIVE_MODEL}...`);

  const payload = {
    model: window.ACTIVE_MODEL,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    max_tokens: 1024,
    temperature: 0.3
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
    let _usingReasoningField = false; // true if model sends reasoning_content separately
    let _dbgChunk = 0;

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
          if (_dbgChunk++ < 3) console.log('[stream delta]', JSON.stringify(parsed.choices?.[0]?.delta));
          if (parsed.usage) completionTokens = parsed.usage.completion_tokens ?? null;
          const rc = parsed.choices?.[0]?.delta?.reasoning_content;
          const cc = parsed.choices?.[0]?.delta?.content;
          let delta = '';
          if (rc) {
            _usingReasoningField = true;
            if (!fullText.includes('<think>')) fullText += '<think>';
            delta = rc;
          } else if (cc) {
            // Only auto-close if WE synthesized the <think> tag via reasoning_content
            if (_usingReasoningField && fullText.includes('<think>') && !fullText.includes('</think>')) {
              fullText += '</think>';
            }
            delta = cc;
          }
          if (delta) {
            fullText += delta;
            const tp = parseThinkDisplay(fullText);
            if (tp.think) {
              renderThinkInBubble(bubble, tp.think, tp.display, tp.partial ?? true);
            } else {
              bubble.innerHTML = formatContent(fullText);
            }
            scrollToBottom();
          }
        } catch (e) { if (_dbgChunk++ < 6) console.error('[stream parse error]', e.message, data?.slice(0, 120)); }
      }
    }

    // If model used reasoning_content but never closed <think>, force-close so the block renders
    if (fullText.includes('<think>') && !fullText.includes('</think>')) {
      fullText += '</think>';
      const tp = parseThinkDisplay(fullText);
      renderThinkInBubble(bubble, tp.think, tp.display, false);
    }

    if (!fullText) {
      bubble.innerHTML = '<em style="color:var(--text-muted)">No response received.</em>';
      // Remove the user message so this failed turn doesn't poison history
      messages.pop();
      if (session && session.displayMessages.length) session.displayMessages.pop();
    }

    const aiTime = getTime();
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = aiTime;
    chatArea.appendChild(timeDiv);
    appendMsgMeta(chatArea, Date.now() - startTime, completionTokens, fullText);

    const savedContent = fullText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (savedContent) {
      messages.push({ role: 'assistant', content: savedContent });
      if (session) session.displayMessages.push({ role: 'assistant', content: savedContent, time: aiTime });
    } else if (fullText) {
      // model only generated thinking — pop the user message so history stays consistent
      messages.pop();
      if (session && session.displayMessages.length) session.displayMessages.pop();
    }
    updateHistory(text);
    setConnected(true);
    _modelWarm = true;

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
      _modelWarm = true;

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
          _modelWarm = true;
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
  saveSessionsToStorage();
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
window.addEventListener('load', async () => {
  if (window.BarangayDB) await window.BarangayDB.initDB();
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

  // Restore previous sessions if any, otherwise start fresh
  if (loadSessionsFromStorage()) {
    const session = getCurrentSession();
    if (session && session.displayMessages.length) {
      messages = session.displayMessages.map(m => ({ role: m.role, content: m.content }));
      renderHistory();
      renderSessionMessages(session);
    } else {
      renderHistory();
      resetWelcomeScreen();
    }
  } else {
    createSession();
  }

  openModal();
  document.getElementById('message-input').focus();
});
