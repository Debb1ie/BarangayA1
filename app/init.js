// ── WELCOME SCREEN ────────────────────────────────────────────────────
function resetWelcomeScreen() {
  const main = document.querySelector('.main');
  if (main) main.classList.add('welcome-mode');
  // Back at the welcome screen (new chat, or the last conversation was
  // deleted) — reopen the sidebar on desktop; it auto-collapses again once
  // a message actually gets sent (see hideWelcome()).
  const sb = document.getElementById('sidebar');
  if (sb && window.innerWidth > 640) sb.classList.remove('collapsed');
  const chatArea = document.getElementById('chat-area');
  chatArea.innerHTML = '';
  const ws = document.createElement('div');
  ws.className = 'welcome-screen';
  ws.id = 'welcome-screen';
  const greetings = ['Good to see you! 👋', 'Mabuhay! 👋', 'Welcome back! 👋', 'Hello, developer! 👋'];
  const greeting = window._GREETING_ACTIVE || greetings[Math.floor(Math.random() * greetings.length)];
  const _activeName = window._AI_NAME_ACTIVE || AI_NAME;
  ws.innerHTML = `
    <img class="welcome-icon" src="assets/logos/17_logo.png" alt="DEVCON 17">
    <div class="welcome-hero">
      <div class="welcome-title">${_activeName}</div>
      <div class="welcome-greeting">${greeting}</div>
    </div>
    <div class="welcome-brief">Built by Filipino developers · 100% local, no cloud</div>
    <div class="suggestion-chips" id="suggestion-grid-welcome">
      <button class="suggestion-chip" onclick="suggest('What is DEVCON Barangay AI Code Camps? What will I learn and build today?')">
        <span class="suggestion-chip-icon">🏕️</span> About Barangay AI
      </button>
      <button class="suggestion-chip" onclick="suggest('I am a beginner. Give me a simple first coding exercise — write a Python function to call a local Ollama API endpoint and print the response.')">
        <span class="suggestion-chip-icon">💻</span> Start Coding
      </button>
      <button class="suggestion-chip" onclick="suggest('Please check my grammar and suggest improvements. Here is my text: [paste your text here]')">
        <span class="suggestion-chip-icon">✍️</span> Grammar Check
      </button>
      <button class="suggestion-chip" onclick="suggest('Please review my code, suggest improvements, and explain any issues you find. Here is my code: [paste your code here]')">
        <span class="suggestion-chip-icon">🔍</span> Code Review
      </button>
      <button class="suggestion-chip" onclick="suggest('How does a local AI model work? Explain what Ollama does and what Qwen is, using simple analogies a high school student would understand.')">
        <span class="suggestion-chip-icon">🧠</span> How It Works
      </button>
      <button class="suggestion-chip" onclick="suggest('How do I contribute to an open source project on GitHub as a complete beginner? Walk me through forking a repo and opening a pull request step by step.')">
        <span class="suggestion-chip-icon">🤝</span> Contribute
      </button>
    </div>`;
  chatArea.appendChild(ws);
  document.getElementById('chat-title').textContent = window._AI_NAME_ACTIVE || AI_NAME;

  // Apply custom suggestions if configured
  if (SUGGESTIONS) {
    const grid = ws.querySelector('#suggestion-grid-welcome');
    if (grid) {
      grid.innerHTML = SUGGESTIONS.map(s => `
        <button class="suggestion-chip" onclick="suggest(${JSON.stringify(s.prompt)})">
          <span class="suggestion-chip-icon">${s.icon}</span> ${s.label}
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
  // The inline head script already resolved data-theme before first paint;
  // sync the in-memory flag + icons to match (default is dark).
  isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  syncThemeIcon();
  sidebarTab('chats');

  if (window.BarangayDB) await window.BarangayDB.initDB();
  loadKBDisabled();
  initModelRegistry();   // restore saved endpoints + discover live local models
  document.documentElement.style.setProperty('--dc-blue', BRAND_COLOR);
  document.documentElement.style.setProperty('--dc-accent', ACCENT_COLOR);

  const titleEl = document.getElementById('chat-title');
  if (titleEl) titleEl.textContent = AI_NAME;
  const welcomeTitleEl = document.querySelector('.welcome-title');
  if (welcomeTitleEl) welcomeTitleEl.textContent = AI_NAME;

  let saved = loadSettings();
  if (seedDefaultSourcesIfNeeded(saved)) saved = loadSettings();
  if (Object.keys(saved).length) applySettings(saved);
  else renderSourcesPanel();

  if (SUGGESTIONS) {
    const grid = document.querySelector('.suggestion-chips');
    if (grid) {
      grid.innerHTML = SUGGESTIONS.map(s => `
        <button class="suggestion-chip" onclick="suggest(${JSON.stringify(s.prompt)})">
          <span class="suggestion-chip-icon">${s.icon}</span> ${s.label}
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
      messages = rebuildApiMessages(session.displayMessages);
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
