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

// RAG chunking/retrieval lives in rag.js (window.BarangayRAG) — see
// handleTrainingFiles() below for chunking at upload time and sendMessage()
// for retrieval at query time.

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
      const chunks = window.BarangayRAG.chunkText(content);
      draft.push({ name: file.name, size: file.size, content, chunks, addedAt: Date.now() });
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

// ── SOURCES PANEL (sidebar) — same store as Settings → Training ───────
// window._TRAINING_FILES_MASTER holds every saved source; _KB_DISABLED is
// the set of names excluded from the model's context. applySettings()
// recomputes window._TRAINING_FILES_ACTIVE (what sendMessage() actually
// reads) as master minus disabled every time either one changes.

function loadKBDisabled() {
  let raw = null;
  try { if (window.BarangayDB) raw = window.BarangayDB.dbGetItem('kb_disabled_sources', null); } catch (e) {}
  _KB_DISABLED = new Set(Array.isArray(raw) ? raw : []);
}
function saveKBDisabled() {
  try { if (window.BarangayDB) window.BarangayDB.dbSetItem('kb_disabled_sources', [..._KB_DISABLED]); } catch (e) {}
}
function persistKBMaster() {
  if (!window.BarangayDB) return;
  const s = window.BarangayDB.dbLoadSettings() || {};
  s.training_files = window._TRAINING_FILES_MASTER || [];
  window.BarangayDB.dbSaveSettings(s);
}

// ── DEFAULT (SEEDED) SOURCE ────────────────────────────────────────────
// Ships one source out of the box so every fork/clone already has grounded
// answers without anyone uploading a file first. PLACEHOLDER content until
// a real PDF is dropped in — swap PLACEHOLDER_SOURCE.content for real
// extracted text (see extractPdfText) when the actual document is ready.
const PLACEHOLDER_SOURCE = {
  name: 'devcon-barangay-ai-overview.pdf',
  content: `DEVCON Barangay AI — Overview

DEVCON Barangay AI is a learning project that teaches people how to run a
local, private AI assistant on their own computer using Ollama — no cloud
account, no API bill, and no internet connection required once a model is
downloaded.

What it does
The app is a chat interface, similar to ChatGPT, that talks to a small
open-source language model (such as Qwen, Llama, or Gemma) running on the
user's own machine. Conversations, settings, and uploaded sources are all
stored locally in the browser — nothing is sent to a third party unless the
user explicitly adds a cloud API endpoint.

Sources & grounding
Users can upload their own reference files (text, markdown, JSON, CSV, PDF,
or Word documents) as "Sources." The app chunks each file and retrieves the
most relevant passages for every question, so the AI's answers can be
grounded in that material instead of relying only on what the model
memorized during training.

This entry is a placeholder shipped with the project so the Sources panel
isn't empty on first run — replace it with a real PDF for your own content.`,
};

// Seeds the placeholder source only on a genuinely fresh install, gated by
// its own `sources_seeded` flag rather than an empty training_files array —
// dbLoadSettings() always returns training_files as [] when the table is
// empty, so an empty-array check can't tell "never seeded" apart from "user
// deleted the seed". The flag can, and this only ever fires once per DB.
// Also skips anyone who already has real sources saved (pre-dates this
// flag) so an update never injects a surprise file into an existing library.
function seedDefaultSourcesIfNeeded(settings) {
  if (settings.sources_seeded || !window.BarangayDB) return false;
  if (Array.isArray(settings.training_files) && settings.training_files.length) return false;
  const content = PLACEHOLDER_SOURCE.content;
  window._TRAINING_FILES_MASTER = [{
    name: PLACEHOLDER_SOURCE.name,
    size: content.length,
    content,
    chunks: window.BarangayRAG ? window.BarangayRAG.chunkText(content) : [],
    addedAt: Date.now(),
  }];
  window.BarangayDB.dbSaveSettings(Object.assign({}, settings, {
    training_files: window._TRAINING_FILES_MASTER,
    sources_seeded: true,
  }));
  return true;
}
function kbEmoji(name) {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return '📕';
  if (ext === 'md' || ext === 'markdown') return '📘';
  if (ext === 'csv') return '📗';
  if (ext === 'doc' || ext === 'docx') return '📙';
  if (ext === 'json' || ext === 'log') return '📒';
  return '📄';
}

function sidebarTab(tab) {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  sb.dataset.tab = tab;
  sb.classList.remove('collapsed'); // picking a tab implies wanting to see it
  document.querySelectorAll('.rail-btn[data-railtab]').forEach(b => b.classList.toggle('active', b.dataset.railtab === tab));
  document.querySelectorAll('.seg-tabs button').forEach(b => b.classList.toggle('on', b.dataset.segtab === tab));
}

function addSourceClick() {
  document.getElementById('kb-file-input')?.click();
}

// Reuses app's own extraction pipeline (PDF/DOCX/text + quota checks) by
// pointing its draft array at a copy of the current master list.
async function handleSourceFiles(fileList) {
  if (!fileList || !fileList.length) return;
  const priorDraft = window._TRAINING_FILES_DRAFT;
  window._TRAINING_FILES_DRAFT = (window._TRAINING_FILES_MASTER || []).slice();
  try {
    await handleTrainingFiles(fileList);
    window._TRAINING_FILES_MASTER = (window._TRAINING_FILES_DRAFT || []).slice();
  } finally {
    window._TRAINING_FILES_DRAFT = priorDraft;
  }
  window._TRAINING_FILES_ACTIVE = window._TRAINING_FILES_MASTER.filter(f => !_KB_DISABLED.has(f.name));
  persistKBMaster();
  renderSourcesPanel();
}

function toggleSource(name, on) {
  if (on) _KB_DISABLED.delete(name); else _KB_DISABLED.add(name);
  window._TRAINING_FILES_ACTIVE = (window._TRAINING_FILES_MASTER || []).filter(f => !_KB_DISABLED.has(f.name));
  saveKBDisabled();
  renderSourcesPanel();
}

function removeSource(name) {
  window._TRAINING_FILES_MASTER = (window._TRAINING_FILES_MASTER || []).filter(f => f.name !== name);
  _KB_DISABLED.delete(name);
  window._TRAINING_FILES_ACTIVE = window._TRAINING_FILES_MASTER.filter(f => !_KB_DISABLED.has(f.name));
  saveKBDisabled();
  persistKBMaster();
  renderSourcesPanel();
  showToast('Source removed');
}

function renderSourcesPanel() {
  const list = document.getElementById('kb-list');
  if (!list) return;
  const master = window._TRAINING_FILES_MASTER || [];
  list.innerHTML = '';

  if (!master.length) {
    const empty = document.createElement('div');
    empty.className = 'kb-empty';
    empty.textContent = 'No sources yet. Add files to ground answers in your own content.';
    list.appendChild(empty);
  }

  master.forEach(f => {
    const off = _KB_DISABLED.has(f.name);
    const row = document.createElement('div');
    row.className = 'kb-item' + (off ? ' off' : '');

    const icon = document.createElement('span');
    icon.className = 'kb-ico';
    icon.textContent = kbEmoji(f.name);

    const meta = document.createElement('span');
    meta.className = 'kb-meta';
    const nm = document.createElement('b');
    nm.textContent = f.name;
    nm.title = f.name;
    const sz = document.createElement('i');
    sz.textContent = formatBytes(f.size || 0);
    meta.appendChild(nm);
    meta.appendChild(sz);

    const del = document.createElement('button');
    del.className = 'kb-del';
    del.title = 'Remove source';
    del.textContent = '✕';
    del.addEventListener('click', ev => { ev.stopPropagation(); removeSource(f.name); });

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !off;
    cb.title = off ? 'Excluded from the model’s context' : 'Included in the model’s context';
    cb.addEventListener('click', ev => ev.stopPropagation());
    cb.addEventListener('change', () => toggleSource(f.name, cb.checked));

    row.appendChild(icon);
    row.appendChild(meta);
    row.appendChild(del);
    row.appendChild(cb);
    row.addEventListener('click', () => { cb.checked = !cb.checked; toggleSource(f.name, cb.checked); });
    list.appendChild(row);
  });

  const activeN = master.filter(f => !_KB_DISABLED.has(f.name)).length;
  const total = document.getElementById('kb-total');
  if (total) total.textContent = master.length ? `${activeN}/${master.length}` : '';
  const segSrc = document.querySelector('.seg-tabs [data-segtab="sources"]');
  if (segSrc) segSrc.textContent = master.length ? `Sources · ${master.length}` : 'Sources';
  syncToolsIndicator();
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'settings-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 300); }, 2200);
}

