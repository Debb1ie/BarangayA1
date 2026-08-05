# Barangay AI

A polished, fully client-side AI chat app by **DEVCON.PH** — built to run on top of a **local** large language model so anyone can have a private, offline-capable AI assistant. No accounts, no cloud, no server. Just a handful of files and your browser.

Built for DEVCON camps and barangay-level digital literacy: open one HTML file, point it at a local model, and start chatting — in English, Filipino, Taglish, or your own regional language.

---

## Features

- **Local-first AI chat** — talks to any OpenAI-compatible endpoint (designed for [Ollama](https://ollama.com) running on your own machine).
- **Conversation history** — multiple sessions, saved durably in your browser via SQLite (sql.js + IndexedDB). Your chats never leave your device.
- **Filipino language support** — reply in **English, Filipino (Tagalog), Taglish, Bisaya, Hiligaynon, or Ilocano**, with grammar rules tuned to keep responses natural and free of Indonesian/Malay contamination.
- **Customizable persona** — name your AI, pick a tone (friendly, formal, teacher, strict), or write your own system prompt. There's even an AI-assisted prompt expander.
- **Teach it your docs** — upload `.txt`, `.md`, `.json`, `.csv`, `.log`, `.pdf`, or `.docx` files as knowledge the AI can draw on.
- **Web search** — optional live web results via [Tavily](https://tavily.com) (bring your own API key).
- **Onboarding flow + Camp Guidebook** — a friendly first-run experience and an in-app guide.
- **Dark mode**, markdown rendering, streaming responses, context-usage stats, and a collapsible sidebar.

---

## Quick start

### 1. Install Ollama and pull a model

Download Ollama from [ollama.com](https://ollama.com), then pull the default model:

```bash
ollama pull qwen2.5:3b
```

Make sure Ollama is running — it serves an OpenAI-compatible API at `http://127.0.0.1:11434/v1`.

### 2. Open the app

Because the app loads its CSS and JS as separate files (`styles.css`, `db.js`, `rag.js`, `app/*.js`), open it through a local web server rather than `file://` (browsers block script loading from `file://`):

```bash
# from the project folder — pick whichever you have
python -m http.server 8000
# then visit http://localhost:8000

# or, with Node installed:
npx serve .
```

Then open the served URL and **pick a model** when prompted. That's it.

> No model is selected by default — choose one from the model picker after the app discovers what Ollama has available.

---

## Configuration

All defaults live in the **CONFIG block at the top of [`app/config.js`](app/config.js)** — edit it to customize your build:

```js
const API_BASE     = 'http://127.0.0.1:11434/v1';  // your local model endpoint
const API_KEY      = 'ollama';                       // any value works for Ollama
const MODEL        = 'qwen2.5:3b';                   // default model id
const AI_NAME      = 'DEVCON';                        // display name
const AI_AVATAR    = 'DV';                            // avatar initials
const BRAND_COLOR  = '#4F46E5';
const ACCENT_COLOR = '#00A8E8';
const AI_TONE      = null;   // set a string to override the default system prompt
const SUGGESTIONS  = null;   // set an array of suggestion cards to override defaults
const CONTEXT_WINDOW = 32768; // model context window, used for the "context used" stat
```

Most settings (tone, language, max tokens, web search key, training files, custom system prompt) can also be changed at runtime in **Settings** inside the app — those are saved to your browser.

### Using a different backend

Any OpenAI-compatible server works. Point `API_BASE` at it and set `API_KEY` appropriately (e.g. LM Studio, llama.cpp server, or a remote OpenAI-compatible gateway).

### Enabling web search

Web search is off until you add a key. Get one from [Tavily](https://tavily.com), then paste it into **Settings → Model → Tavily API key**.

---

## Project structure

```
barangayAI/
├── index.html          # markup only
├── styles.css          # all CSS
├── app/                # app logic, split by feature — loaded in this order via <script> tags
│   ├── config.js       # CONFIG block, tone presets, in-memory state
│   ├── sessions.js     # session list — create/load/switch/persist
│   ├── settings.js     # settings modal — personalization, personas, language picker
│   ├── training.js     # training tab + sidebar sources panel (RAG knowledge sources)
│   ├── onboarding.js   # welcome modal + Camp Guidebook
│   ├── models.js       # model selector, endpoint manager, connectivity checks
│   ├── chat.js         # send/stream, markdown rendering, message rendering, history
│   ├── thinking.js     # deep-thinking toggle + display
│   └── init.js         # welcome screen, chat actions, app bootstrap (window 'load')
├── db.js               # SQLite persistence layer (sql.js + IndexedDB)
├── rag.js              # local knowledge retrieval — chunking + TF-IDF similarity, no embedding model
├── assets/logos/        # vendor + brand logos shown in the model picker and welcome screen
└── README.md
```

No build step. No framework. No bundler. Just more files instead of one — open any of them, edit, refresh. Script tags load in dependency order (`config.js` first, `init.js` last); if you add a file, add its `<script>` tag in `index.html` in the right spot.

### External libraries (loaded from CDN)

- [sql.js](https://sql.js.org) — SQLite compiled to WASM, for chat persistence
- [pdf.js](https://mozilla.github.io/pdf.js/) — extracting text from uploaded PDFs
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) — extracting text from `.docx` files

An internet connection is needed the first time to fetch these (and for web search / fonts). The AI model itself runs entirely locally.

---

## Privacy

Everything stays on your device. Conversations are stored in your browser's IndexedDB, and prompts go only to your local model. The only network calls leave your machine if you explicitly enable **web search** (to Tavily) or when CDN libraries and Google Fonts load.

---

## Troubleshooting

- **"Can't connect" / no models found** — make sure Ollama is running and you've pulled a model (`ollama list`). Test the API directly in your browser: `http://localhost:11434/v1/models`.
- **Blank page / scripts not loading** — you opened `index.html` via `file://`. Serve it over a local web server instead (see Quick start).
- **Responses are slow** — small models like `qwen2.5:3b` are chosen for low-end hardware. Larger models are smarter but need more RAM/GPU.

---

## License

Released under the [MIT License](LICENSE) — free to use, modify, fork, and share. Perfect for camps and classrooms.

---

Made with 💙 by [DEVCON.PH](https://devcon.ph)
