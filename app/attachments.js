// ── CHAT ATTACHMENTS ──────────────────────────────────────────────────
// Per-message photos/docs — attach via the composer's paperclip or drag onto
// the input area. Deliberately separate from the Sources/training pipeline
// (app/training.js): these answer "what's in this file/photo" for the
// message being sent right now, they are never chunked into the RAG index,
// never saved to the knowledge base, and don't outlive the turn they were
// sent on. That also makes them safe to leave visitor-ok (see attach-btn in
// index.html) — unlike "Add file", nothing here changes the AI or persists.
//
// Docs reuse the exact extractors training.js already has (extractPdfText,
// extractDocxText) and the same allowed-extension lists, so "what file types
// work" stays answered in exactly one place. Images are new: read as a data
// URL and, at send time (app/thinking.js), turned into an OpenAI-vision-style
// `image_url` content part. Whether that's actually *seen* depends on the
// selected model — most of the defaults this app ships (qwen2.5, gemma3,
// llama3.2 1B/3B, the Groq cloud models) are text-only, so handleAttachFiles
// warns about that up front rather than let the request silently ignore it.

const ATTACH_IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
const ATTACH_MAX_FILES = 4;
const ATTACH_IMAGE_MAX_BYTES = 5 * 1024 * 1024;  // 5 MB — keeps the base64 request body sane over a cloud API
const ATTACH_DOC_TEXT_CAP = 20000;               // chars spliced into the prompt per doc — this rides one message, unlike Sources' 200 KB cap which gets chunked/RAG'd

let _pendingAttachments = [];   // [{ kind: 'image', name, size, dataURL } | { kind: 'doc', name, size, text }]

function triggerAttachPicker() {
  document.getElementById('chat-attach-input')?.click();
}

async function handleAttachFileInput(input) {
  await handleAttachFiles(input.files);
  input.value = '';   // so picking the exact same file again still fires onchange
}

function handleComposerDragOver(e) {
  e.preventDefault();
  document.getElementById('input-area')?.classList.add('drag-over');
}

function handleComposerDragLeave(e) {
  e.preventDefault();
  // Child elements re-fire dragenter/dragleave as the pointer crosses them;
  // only actually leaving the container should drop the highlight.
  if (e.currentTarget.contains(e.relatedTarget)) return;
  document.getElementById('input-area')?.classList.remove('drag-over');
}

async function handleComposerDrop(e) {
  e.preventDefault();
  document.getElementById('input-area')?.classList.remove('drag-over');
  if (e.dataTransfer?.files?.length) await handleAttachFiles(e.dataTransfer.files);
}

// Safety net for drags that never cleanly fire a dragleave on #input-area —
// dropped outside the browser window, cancelled with Escape, or released on
// the sidebar/browser chrome. Without this the highlight class has no event
// left to remove it and stays lit until the next full drag cycle over the
// composer. 'dragend' fires on every drag regardless of how it ended;
// 'drop' anywhere outside our own zone also means it's safe to clear.
window.addEventListener('dragend', () => {
  document.getElementById('input-area')?.classList.remove('drag-over');
});
document.addEventListener('drop', (e) => {
  const inputArea = document.getElementById('input-area');
  if (inputArea && !inputArea.contains(e.target)) {
    // Also stops Chrome's default "navigate to the dropped file" behavior
    // when someone drops a file anywhere else on the page by mistake.
    e.preventDefault();
    inputArea.classList.remove('drag-over');
  }
});
document.addEventListener('dragover', (e) => {
  const inputArea = document.getElementById('input-area');
  if (inputArea && !inputArea.contains(e.target)) e.preventDefault();
});

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(file);
  });
}

async function handleAttachFiles(fileList) {
  const files = Array.from(fileList || []);
  const skipped = [];
  let addedImages = 0;

  for (const file of files) {
    if (_pendingAttachments.length >= ATTACH_MAX_FILES) {
      skipped.push(`${file.name} (max ${ATTACH_MAX_FILES} attachments per message)`);
      continue;
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isImage = file.type.startsWith('image/') || ATTACH_IMAGE_EXT.includes(ext);

    try {
      if (isImage) {
        // The hosted /api proxy (window.ACTIVE_KIND === 'api') caps request
        // size well below a real photo on purpose — it's a public,
        // unauthenticated endpoint spending the owner's key — and none of
        // the cloud models it currently offers support vision anyway.
        // Rejecting up front beats letting someone attach a photo that
        // *looks* attached and then silently never reaches the model.
        if (window.ACTIVE_KIND === 'api') {
          skipped.push(`${file.name} (this model runs in the cloud and can't see photos — pull a vision model like llama3.2-vision or qwen2.5vl with Ollama and select it locally)`);
          continue;
        }
        if (file.size > ATTACH_IMAGE_MAX_BYTES) { skipped.push(`${file.name} (too large, max 5 MB)`); continue; }
        const dataURL = await readFileAsDataURL(file);
        _pendingAttachments.push({ kind: 'image', name: file.name, size: file.size, dataURL });
        addedImages++;
      } else if (TRAINING_PDF_EXT.includes(ext) || TRAINING_DOCX_EXT.includes(ext) || TRAINING_TEXT_EXT.includes(ext)) {
        let text;
        if (TRAINING_PDF_EXT.includes(ext)) text = await extractPdfText(file);
        else if (TRAINING_DOCX_EXT.includes(ext)) text = await extractDocxText(file);
        else text = await file.text();
        if (!text || !text.trim()) { skipped.push(`${file.name} (no extractable text)`); continue; }
        if (text.length > ATTACH_DOC_TEXT_CAP) text = text.slice(0, ATTACH_DOC_TEXT_CAP) + '\n…[truncated]';
        _pendingAttachments.push({ kind: 'doc', name: file.name, size: file.size, text });
      } else if (TRAINING_CONVERTIBLE_EXT.includes(ext)) {
        skipped.push(`${file.name} (.${ext} can't be read — open it and "Save As" .docx or .pdf)`);
      } else {
        skipped.push(`${file.name} (unsupported — try a photo, PDF, Word doc, or text file)`);
      }
    } catch (err) {
      console.error('Attachment read error:', err);
      skipped.push(`${file.name} (could not be read)`);
    }
  }

  renderAttachmentPreview();
  if (addedImages) {
    showToast(`${addedImages} image${addedImages !== 1 ? 's' : ''} attached — only works if your model supports vision; most of the default models here are text-only.`);
  }
  if (skipped.length) showToast(`Skipped: ${skipped.join(', ')}`);
}

function removeAttachment(index) {
  _pendingAttachments.splice(index, 1);
  renderAttachmentPreview();
}

function clearAttachments() {
  _pendingAttachments = [];
  renderAttachmentPreview();
}

// Shared markup for both the live composer preview and history replay
// (sessions.js's renderSessionMessages) so a reopened conversation shows the
// same chips it did the moment they were sent. `removable` adds the little
// "×" — only meaningful on the pending-preview copy, never on sent history.
function attachmentChipsHTML(attachments, removable) {
  if (!attachments || !attachments.length) return '';
  const chips = attachments.map((a, i) => {
    const removeBtn = removable
      ? `<button type="button" class="attach-chip-remove" onclick="removeAttachment(${i})" title="Remove">×</button>`
      : '';
    if (a.kind === 'image') {
      return `<span class="attach-chip attach-chip-image" title="${escHtml(a.name)}">
        <img src="${a.dataURL}" alt="${escHtml(a.name)}">${removeBtn}
      </span>`;
    }
    return `<span class="attach-chip attach-chip-doc" title="${escHtml(a.name)}">
      ${ICON_DOC}<span class="attach-chip-name">${escHtml(a.name)}</span>${removeBtn}
    </span>`;
  }).join('');
  return `<div class="attach-chip-row">${chips}</div>`;
}

function renderAttachmentPreview() {
  const el = document.getElementById('attach-preview');
  if (!el) return;
  el.innerHTML = attachmentChipsHTML(_pendingAttachments, true);
}
