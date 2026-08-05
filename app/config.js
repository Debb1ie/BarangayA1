// ── CONFIG (edit this to customize your AI) ──────────────────────────
const API_BASE    = 'http://127.0.0.1:11434/v1';
const API_KEY     = 'ollama';
const MODEL       = 'qwen2.5:3b';
const AI_NAME     = 'DEVCON';
const AI_AVATAR   = 'DV';
const BRAND_COLOR = '#4F46E5';
const ACCENT_COLOR = '#00A8E8';
const AI_TONE     = null;   // set a string here to override the default system prompt
const SUGGESTIONS = null;   // set an array of { icon, label, desc, prompt } to override suggestion cards
const CONTEXT_WINDOW = 32768; // model context window (tokens) — used for the "context used" stat
// ─────────────────────────────────────────────────────────────────────
window.ACTIVE_MODEL = null;       // no model is selected by default — the user must pick one
window.ACTIVE_BASE  = API_BASE;   // default endpoint used for discovery; switched when a model is selected
window.ACTIVE_KEY   = API_KEY;

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
let _KB_DISABLED = new Set(); // names of sources excluded from the model's context
let _modelWarm = false;      // true after first successful model response in this session

