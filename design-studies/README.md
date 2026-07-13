# Design Studies — Round 2 (NotebookLM series)

Three static HTML mockups exploring a **NotebookLM-inspired layout** for Barangay AI:
custom sources and chat history become first-class citizens on the left side —
the key differentiator vs Gemini — with a cleaner overall look.

**No app logic changed.** These are visual studies only; `index.html`, `app.js`,
and `db.js` in the repo root are untouched. Open `design-studies/index.html`
in a browser to compare all three.

| Study | File | Layout | Theme |
|---|---|---|---|
| 1 · Tri-Panel | `study-1-tripanel.html` | Sources + chats (left) / grounded chat (center) / Studio tools (right) — floating panels like NotebookLM | Light |
| 2 · Icon Rail | `study-2-rail.html` | Slim icon rail + one panel that switches Chats ↔ Sources; flat document-style answers with cited-source chips | Light |
| 3 · Dark Focus | `study-3-dark.html` | Unified sidebar (search + collapsible History/Sources groups); redesigned welcome state with hero composer | Dark |

## What every study keeps (same functionality, new skin)

- **Custom sources** — the Training files feature, promoted out of the settings modal
  into a visible panel with per-source checkboxes and an "Add source" action
- **Chat history** on the left, with active state and message counts
- **Grounded answers** with inline `[1]`-style citations pointing back at sources
- **Local-first identity** — Ollama + qwen2.5:3b model badge, connection status
  (localhost endpoint, matching the app's "Local · Open Source" card), "100% offline" messaging
- **Composer tools** — source count chip, web search toggle, EN·FIL language, thinking toggle
- **Taglish** content and DEVCON blue (`#0057B8` → `#00A8E8`) branding
- Message actions (copy / retry / stats), follow-up suggestion chips, code blocks

## Design moves for the "cleaner look"

- Inter typeface, one accent color, fewer borders and badges
- WiFi banner removed — status collapses into a small footer/rail indicator
- More whitespace, soft canvas background with floating panels (Study 1)
- AI answers without heavy bubbles (Study 2) — reads like a document, like NotebookLM
- Suggestion chips → intent cards with one-line descriptions (Study 3)
