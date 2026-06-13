class MarkdownEditor {
  constructor(textarea, previewEl, options = {}) {
    this.textarea = textarea;
    this.preview = previewEl;
    this.autoSaveCallback = options.autoSave || null;
    this.autoSaveDelay = options.autoSaveDelay || 1500;
    this.autoSaveTimer = null;
    this.init();
  }
  init() {
    this.textarea.addEventListener('input', () => { this.renderPreview(); this.scheduleAutoSave(); });
    this.textarea.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); this.insertAtCursor('  '); } });
  }
  setContent(rawMarkdown) { this.textarea.value = rawMarkdown || ''; this.renderPreview(); }
  getContent() { return this.textarea.value; }
  insertAtCursor(text) {
    const s = this.textarea.selectionStart, e = this.textarea.selectionEnd, v = this.textarea.value;
    this.textarea.value = v.substring(0,s) + text + v.substring(e);
    this.textarea.selectionStart = this.textarea.selectionEnd = s + text.length;
    this.textarea.focus(); this.renderPreview(); this.scheduleAutoSave();
  }
  insertAround(before, after, defaultText) {
    const s = this.textarea.selectionStart, e = this.textarea.selectionEnd;
    const sel = this.textarea.value.substring(s,e) || defaultText;
    const v = this.textarea.value;
    this.textarea.value = v.substring(0,s) + before + sel + after + v.substring(e);
    this.textarea.selectionStart = s + before.length;
    this.textarea.selectionEnd = s + before.length + sel.length;
    this.textarea.focus(); this.renderPreview(); this.scheduleAutoSave();
  }
  insertFormatting(type) {
    switch(type) {
      case 'bold': this.insertAround('**','**','bold text'); break;
      case 'italic': this.insertAround('_','_','italic text'); break;
      case 'code-inline': this.insertAround('`','`','code'); break;
      case 'code-block': this.insertAtCursor('\n```\ncode\n```\n'); break;
      case 'latex-inline': this.insertAround('$','$','\\sqrt{x}'); break;
      case 'latex-display': this.insertAtCursor('\n$$\\frac{x}{y}$$\n'); break;
      case 'question': this.insertAround('?','?','your question'); break;
    }
  }
  insertHeading(level) {
    const s = this.textarea.selectionStart, v = this.textarea.value;
    let ls = v.lastIndexOf('\n',s-1)+1;
    const le = v.indexOf('\n',s); const cl = v.substring(ls, le===-1?v.length:le);
    const clean = cl.replace(/^#{1,6}\s*/,'');
    const nl = '#'.repeat(level)+' '+clean;
    this.textarea.value = v.substring(0,ls)+nl+v.substring(le===-1?v.length:le);
    this.textarea.selectionStart = this.textarea.selectionEnd = ls+nl.length;
    this.textarea.focus(); this.renderPreview(); this.scheduleAutoSave();
  }
  renderPreview() {
    let raw = this.textarea.value;
    let processed = raw.replace(/\?([^?\n]+)\?/g, '<div class="question-block">$1</div>');
    processed = processed.replace(/\$\$([^$]+)\$\$/g, (m,f) => {
      try { return '<div class="katex-display">'+katex.renderToString(f,{displayMode:true,throwOnError:false})+'</div>'; } catch(e) { return '<code>'+m+'</code>'; }
    });
    processed = processed.replace(/(?<!\$)\$(?!\$)([^$\n]+)(?<!\$)\$(?!\$)/g, (m,f) => {
      try { return katex.renderToString(f,{displayMode:false,throwOnError:false}); } catch(e) { return '<code>'+m+'</code>'; }
    });
    let html;
    try { html = marked.parse(processed); } catch(e) { html = '<p>'+raw.replace(/</g,'&lt;')+'</p>'; }
    this.preview.innerHTML = html;
    this.preview.querySelectorAll('.question-block').forEach(b => {
      b.addEventListener('click', () => { const t = b.textContent.trim(); if (t && window.sendMessage) window.sendMessage(t); });
    });
  }
  scheduleAutoSave() {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => { if (this.autoSaveCallback) this.autoSaveCallback(this.textarea.value); }, this.autoSaveDelay);
  }
}
window.MarkdownEditor = MarkdownEditor;
