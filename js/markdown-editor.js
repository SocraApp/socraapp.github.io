/**
 * Socra Markdown Editor — Obsidian-style Live Preview
 *
 * Architecture:
 * - rawMarkdown is the source of truth (always)
 * - beforeinput is intercepted; all edits update rawMarkdown + cursorPos
 * - Custom renderer outputs HTML with syntax wrapped in <span class="md-syntax">
 * - Syntax spans are hidden by CSS (font-size:0) and shown when cursor is on that line/element
 * - Cursor marker (<span id="cursor-marker">) is placed during rendering and resolved after
 *
 * Behavior (mimics Obsidian Live Preview):
 * - Block syntax (# heading, > blockquote, - list): hidden when cursor is OFF that line
 * - Inline syntax (**bold**, *italic*, `code`, $math$): hidden when cursor is OUTSIDE that element
 * - Formatting (heading size, bold weight, italic style) is ALWAYS visible
 * - LaTeX renders when complete ($...$ closed), raw source shows when cursor enters
 * - Fenced code blocks (``` ... ```): rendered as code blocks, syntax hidden when cursor is outside
 */
class MarkdownEditor {
  constructor(textarea, previewEl, options = {}) {
    this.rawMarkdown = '';
    this.cursorPos = 0;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.editorEl = null;
    this.autoSaveCallback = options.autoSave || null;
    this.autoSaveDelay = options.autoSaveDelay || 1500;
    this.autoSaveTimer = null;
    this.isComposing = false;
    this.lastSavedContent = '';
    this.activeLineIndex = -1;
    this.activeElementId = null;
    this.cursorLineIndex = -1;
    this.init();
  }

  init() {
    const editorSplit = document.querySelector('.editor-split');
    if (!editorSplit) return;
    editorSplit.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'live-editor-wrapper';

    this.editorEl = document.createElement('div');
    this.editorEl.className = 'live-editor';
    this.editorEl.contentEditable = 'true';
    this.editorEl.spellcheck = true;
    this.editorEl.setAttribute('role', 'textbox');
    this.editorEl.setAttribute('aria-multiline', 'true');

    wrapper.appendChild(this.editorEl);
    editorSplit.appendChild(wrapper);

    // Intercept all input before it reaches the browser
    this.editorEl.addEventListener('beforeinput', (e) => this.handleBeforeInput(e));

    // IME composition support
    this.editorEl.addEventListener('compositionstart', () => { this.isComposing = true; });
    this.editorEl.addEventListener('compositionend', () => {
      this.isComposing = false;
      this.reconcile();
    });

    // Fallback for unhandled input types
    this.editorEl.addEventListener('input', (e) => {
      if (this.isComposing) return;
      // If beforeinput didn't handle it, reconcile from DOM
    });

    // Paste as plain text
    this.editorEl.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      this.deleteSelection();
      this.rawInsertText(text);
      this.render();
      this.scheduleAutoSave();
    });

    // Tab key
    this.editorEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.deleteSelection();
        this.rawInsertText('  ');
        this.render();
        this.scheduleAutoSave();
      }
    });

    // Cursor movement detection
    document.addEventListener('selectionchange', () => {
      if (this.editorEl === document.activeElement || this.editorEl.contains(document.activeElement)) {
        requestAnimationFrame(() => this.onCursorChange());
      }
    });

    this.editorEl.addEventListener('focus', () => this.onCursorChange());
    this.editorEl.addEventListener('blur', () => this.hideAllSyntax());

    // Click on rendered elements (question blocks → send to AI)
    this.editorEl.addEventListener('click', (e) => {
      const qb = e.target.closest('.question-block');
      if (qb) {
        const text = qb.textContent.trim();
        if (text && window.sendMessage) window.sendMessage(text);
      }
    });
  }

  // ═══════════════════════════════════════════
  // INPUT HANDLING
  // ═══════════════════════════════════════════

  handleBeforeInput(e) {
    if (this.isComposing) return;

    // For unhandled types, let browser do it and reconcile after
    const handled = ['insertText', 'deleteContentBackward', 'deleteContentForward',
      'insertParagraph', 'insertLineBreak', 'deleteWordBackward', 'deleteWordForward',
      'deleteByCut', 'deleteContent', 'insertReplacementText', 'deleteHardLineBackward',
      'deleteHardLineForward', 'deleteSoftLineBackward', 'deleteSoftLineForward'];

    if (!handled.includes(e.inputType)) return;

    e.preventDefault();

    // Sync cursor position from DOM before processing
    this.syncCursorFromDOM();

    switch (e.inputType) {
      case 'insertText':
        this.deleteSelection();
        this.rawInsertText(e.data || '');
        break;
      case 'deleteContentBackward':
        if (this.hasSelection()) {
          this.deleteSelection();
        } else {
          this.rawDeleteBackward();
        }
        break;
      case 'deleteContentForward':
        if (this.hasSelection()) {
          this.deleteSelection();
        } else {
          this.rawDeleteForward();
        }
        break;
      case 'insertParagraph':
      case 'insertLineBreak':
        this.deleteSelection();
        this.rawInsertText('\n');
        break;
      case 'deleteWordBackward':
        if (this.hasSelection()) {
          this.deleteSelection();
        } else {
          this.rawDeleteWordBackward();
        }
        break;
      case 'deleteWordForward':
        if (this.hasSelection()) {
          this.deleteSelection();
        } else {
          this.rawDeleteWordForward();
        }
        break;
      case 'deleteByCut':
      case 'deleteContent':
      case 'deleteHardLineBackward':
      case 'deleteHardLineForward':
      case 'deleteSoftLineBackward':
      case 'deleteSoftLineForward':
        if (this.hasSelection()) {
          this.deleteSelection();
        } else {
          this.rawDeleteCurrentLine();
        }
        break;
      case 'insertReplacementText':
        this.deleteSelection();
        this.rawInsertText(e.data || '');
        break;
    }

    this.render();
    this.scheduleAutoSave();
  }

  // After IME composition ends, sync from DOM
  reconcile() {
    const text = this.extractText();
    if (text !== this.rawMarkdown) {
      this.rawMarkdown = text;
      this.cursorPos = this.getOffsetFromDOM();
      this.render();
      this.scheduleAutoSave();
    }
  }

  // ═══════════════════════════════════════════
  // SELECTION MANAGEMENT
  // ═══════════════════════════════════════════

  hasSelection() {
    return this.selectionStart !== this.selectionEnd;
  }

  deleteSelection() {
    if (this.selectionStart === this.selectionEnd) return;
    const start = Math.min(this.selectionStart, this.selectionEnd);
    const end = Math.max(this.selectionStart, this.selectionEnd);
    this.rawMarkdown = this.rawMarkdown.substring(0, start) + this.rawMarkdown.substring(end);
    this.cursorPos = start;
    this.selectionStart = start;
    this.selectionEnd = start;
  }

  // Sync cursor and selection from the DOM
  syncCursorFromDOM() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const startPos = this.calcPosFromDOMNode(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);

    if (sel.isCollapsed) {
      this.cursorPos = startPos;
      this.selectionStart = startPos;
      this.selectionEnd = startPos;
    } else {
      const endPos = this.calcPosFromDOMNode(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
      this.cursorPos = startPos;
      this.selectionStart = startPos;
      this.selectionEnd = endPos;
    }
  }

  // ═══════════════════════════════════════════
  // RAW MARKDOWN MANIPULATION
  // ═══════════════════════════════════════════

  rawInsertText(text) {
    this.rawMarkdown = this.rawMarkdown.substring(0, this.cursorPos) + text + this.rawMarkdown.substring(this.cursorPos);
    this.cursorPos += text.length;
    this.selectionStart = this.cursorPos;
    this.selectionEnd = this.cursorPos;
  }

  rawDeleteBackward() {
    if (this.cursorPos > 0) {
      this.rawMarkdown = this.rawMarkdown.substring(0, this.cursorPos - 1) + this.rawMarkdown.substring(this.cursorPos);
      this.cursorPos--;
      this.selectionStart = this.cursorPos;
      this.selectionEnd = this.cursorPos;
    }
  }

  rawDeleteForward() {
    if (this.cursorPos < this.rawMarkdown.length) {
      this.rawMarkdown = this.rawMarkdown.substring(0, this.cursorPos) + this.rawMarkdown.substring(this.cursorPos + 1);
      this.selectionStart = this.cursorPos;
      this.selectionEnd = this.cursorPos;
    }
  }

  rawDeleteWordBackward() {
    let pos = this.cursorPos - 1;
    while (pos > 0 && this.rawMarkdown[pos] === ' ') pos--;
    while (pos > 0 && this.rawMarkdown[pos - 1] !== ' ' && this.rawMarkdown[pos - 1] !== '\n') pos--;
    this.rawMarkdown = this.rawMarkdown.substring(0, pos) + this.rawMarkdown.substring(this.cursorPos);
    this.cursorPos = Math.max(0, pos);
    this.selectionStart = this.cursorPos;
    this.selectionEnd = this.cursorPos;
  }

  rawDeleteWordForward() {
    let pos = this.cursorPos;
    while (pos < this.rawMarkdown.length && this.rawMarkdown[pos] === ' ') pos++;
    while (pos < this.rawMarkdown.length && this.rawMarkdown[pos] !== ' ' && this.rawMarkdown[pos] !== '\n') pos++;
    this.rawMarkdown = this.rawMarkdown.substring(0, this.cursorPos) + this.rawMarkdown.substring(pos);
    this.selectionStart = this.cursorPos;
    this.selectionEnd = this.cursorPos;
  }

  rawDeleteCurrentLine() {
    const lineStart = this.rawMarkdown.lastIndexOf('\n', this.cursorPos - 1) + 1;
    let lineEnd = this.rawMarkdown.indexOf('\n', this.cursorPos);
    if (lineEnd === -1) lineEnd = this.rawMarkdown.length;
    const deleteFrom = lineStart > 0 ? lineStart : 0;
    this.rawMarkdown = this.rawMarkdown.substring(0, deleteFrom) + this.rawMarkdown.substring(lineEnd);
    this.cursorPos = deleteFrom;
    this.selectionStart = this.cursorPos;
    this.selectionEnd = this.cursorPos;
  }

  // ═══════════════════════════════════════════
  // RENDERING ENGINE
  // ═══════════════════════════════════════════

  render() {
    const html = this.renderDocument(this.rawMarkdown, this.cursorPos);
    this.editorEl.innerHTML = html;
    this.placeCursorAtMarker();
    this.onCursorChange();
  }

  renderDocument(raw, cursorPos) {
    if (!raw && cursorPos === 0) {
      return '<div class="md-line" data-line="0"><br></div>';
    }

    const lines = raw.split('\n');
    let html = '';
    let charPos = 0;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const lineStart = charPos;

      // ── Fenced code block: ``` or ~~~ ──
      const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)/);
      if (fenceMatch) {
        const fenceChar = fenceMatch[1][0];
        const fenceLen = fenceMatch[1].length;
        const info = fenceMatch[2].trim();
        let j = i + 1;

        // Find closing fence
        while (j < lines.length) {
          const closeMatch = lines[j].match(new RegExp('^' + fenceChar + '{' + fenceLen + ',}\\s*$'));
          if (closeMatch) break;
          j++;
        }

        const hasClose = j < lines.length;

        // Opening fence line
        html += `<div class="md-line md-code-fence-line" data-line="${i}">`;
        html += this.mkSyntax('code-fence-open', i, line, lineStart, lineStart + line.length, cursorPos);
        if (info) {
          html += `<span class="md-code-lang">${this.esc(info)}</span>`;
        }
        html += '</div>';

        // Code content lines
        let codeCharPos = lineStart + line.length + 1;
        for (let k = i + 1; k < j; k++) {
          html += `<div class="md-line md-code-line" data-line="${k}">`;
          html += this.renderCodeContent(lines[k], k, codeCharPos, cursorPos);
          html += '</div>';
          codeCharPos += lines[k].length + 1;
        }

        // Closing fence line
        if (hasClose) {
          html += `<div class="md-line md-code-fence-line" data-line="${j}">`;
          html += this.mkSyntax('code-fence-close', j, lines[j], codeCharPos, codeCharPos + lines[j].length, cursorPos);
          html += '</div>';
          charPos = codeCharPos + lines[j].length + 1;
          i = j + 1;
        } else {
          charPos = codeCharPos;
          i = j;
        }
        continue;
      }

      // ── Regular line ──
      html += `<div class="md-line" data-line="${i}">`;
      html += this.renderLine(line, i, lineStart, cursorPos);
      html += '</div>';

      charPos += line.length + 1;
      i++;
    }

    return html;
  }

  // Render a line of code inside a fenced code block (no inline formatting)
  renderCodeContent(line, lineIndex, lineStart, cursorPos) {
    let html = '';
    let pos = lineStart;
    for (let i = 0; i < line.length; i++) {
      if (pos === cursorPos) {
        html += '<span id="cursor-marker"></span>';
      }
      html += this.esc(line[i]);
      pos++;
    }
    if (pos === cursorPos) {
      html += '<span id="cursor-marker"></span>';
    }
    if (!line && cursorPos === lineStart) {
      html += '<span id="cursor-marker"></span>';
    }
    if (!line) html += '<br>';
    return `<code class="md-code-block-content">${html}</code>`;
  }

  renderLine(line, lineIndex, lineStart, cursorPos) {
    // Heading: # text
    const headingMatch = line.match(/^(#{1,6})\s(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const prefixLen = headingMatch[1].length + 1;
      const content = headingMatch[2];
      let html = this.mkSyntax('heading', lineIndex, headingMatch[1] + ' ', lineStart, lineStart + prefixLen, cursorPos);
      html += `<span class="md-h${level}">`;
      html += this.renderInline(content, lineIndex, lineStart + prefixLen, cursorPos);
      html += '</span>';
      return html;
    }

    // Horizontal rule: --- or *** or ___
    if (line.match(/^(-{3,}|\*{3,}|_{3,})\s*$/)) {
      let html = this.mkSyntax('hr', lineIndex, line, lineStart, lineStart + line.length, cursorPos);
      html += '<hr>';
      return html;
    }

    // Blockquote: > text
    if (line.match(/^>\s/)) {
      let html = this.mkSyntax('blockquote', lineIndex, '> ', lineStart, lineStart + 2, cursorPos);
      html += '<blockquote class="md-blockquote">';
      html += this.renderInline(line.substring(2), lineIndex, lineStart + 2, cursorPos);
      html += '</blockquote>';
      return html;
    }

    // Unordered list: - item or * item or + item
    const ulMatch = line.match(/^([-*+])\s(.*)$/);
    if (ulMatch) {
      let html = this.mkSyntax('list', lineIndex, ulMatch[1] + ' ', lineStart, lineStart + 2, cursorPos);
      html += '<span class="md-list-item">';
      html += this.renderInline(ulMatch[2], lineIndex, lineStart + 2, cursorPos);
      html += '</span>';
      return html;
    }

    // Ordered list: 1. item
    const olMatch = line.match(/^(\d+\.)\s(.*)$/);
    if (olMatch) {
      const prefixLen = olMatch[1].length + 1;
      let html = this.mkSyntax('olist', lineIndex, olMatch[1] + ' ', lineStart, lineStart + prefixLen, cursorPos);
      html += '<span class="md-list-item md-ol-item">';
      html += this.renderInline(olMatch[2], lineIndex, lineStart + prefixLen, cursorPos);
      html += '</span>';
      return html;
    }

    // Empty line
    if (!line) {
      let html = '';
      if (cursorPos === lineStart) html += '<span id="cursor-marker"></span>';
      html += '<br>';
      return html;
    }

    // Regular paragraph
    return this.renderInline(line, lineIndex, lineStart, cursorPos);
  }

  renderInline(text, lineIndex, basePos, cursorPos) {
    let html = '';
    let i = 0;
    let pos = basePos;

    while (i < text.length) {
      let match;

      // ── 3+ backticks: output literally, don't parse as inline code ──
      if ((match = text.substring(i).match(/^`{3,}/))) {
        for (let ci = 0; ci < match[0].length; ci++) {
          if (pos === cursorPos) {
            html += '<span id="cursor-marker"></span>';
          }
          html += this.esc(text[i + ci]);
          pos++;
        }
        i += match[0].length;
        continue;
      }

      // Display LaTeX: $$...$$
      if ((match = text.substring(i).match(/^\$\$([^$]+)\$\$/))) {
        const elId = `${lineIndex}-${pos}`;
        html += this.mkSyntaxInline('latex-display', lineIndex, elId, '$$', pos, pos + 2, cursorPos);
        try {
          const rendered = katex.renderToString(match[1], { displayMode: true, throwOnError: false });
          html += `<span class="md-katex md-katex-display md-element" data-element="${elId}">${rendered}</span>`;
        } catch (e) {
          html += `<code class="md-element" data-element="${elId}">${this.esc(match[1])}</code>`;
        }
        html += this.mkSyntaxInline('latex-display', lineIndex, elId, '$$', pos + 2 + match[1].length, pos + match[0].length, cursorPos);
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Inline LaTeX: $...$
      if ((match = text.substring(i).match(/^\$([^$\n]+)\$/))) {
        const elId = `${lineIndex}-${pos}`;
        html += this.mkSyntaxInline('latex-inline', lineIndex, elId, '$', pos, pos + 1, cursorPos);
        try {
          const rendered = katex.renderToString(match[1], { displayMode: false, throwOnError: false });
          html += `<span class="md-katex md-katex-inline md-element" data-element="${elId}">${rendered}</span>`;
        } catch (e) {
          html += `<code class="md-element" data-element="${elId}">${this.esc(match[1])}</code>`;
        }
        html += this.mkSyntaxInline('latex-inline', lineIndex, elId, '$', pos + 1 + match[1].length, pos + match[0].length, cursorPos);
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Bold+Italic: ***text***
      if ((match = text.substring(i).match(/^\*\*\*(.+?)\*\*\*/))) {
        const elId = `${lineIndex}-${pos}`;
        html += this.mkSyntaxInline('bolditalic', lineIndex, elId, '***', pos, pos + 3, cursorPos);
        html += `<strong><em class="md-element" data-element="${elId}">`;
        html += this.renderTextWithCursor(match[1], pos + 3, cursorPos);
        html += '</em></strong>';
        html += this.mkSyntaxInline('bolditalic', lineIndex, elId, '***', pos + 3 + match[1].length, pos + match[0].length, cursorPos);
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Bold: **text**
      if ((match = text.substring(i).match(/^\*\*(.+?)\*\*/))) {
        const elId = `${lineIndex}-${pos}`;
        html += this.mkSyntaxInline('bold', lineIndex, elId, '**', pos, pos + 2, cursorPos);
        html += `<strong class="md-element" data-element="${elId}">`;
        html += this.renderTextWithCursor(match[1], pos + 2, cursorPos);
        html += '</strong>';
        html += this.mkSyntaxInline('bold', lineIndex, elId, '**', pos + 2 + match[1].length, pos + match[0].length, cursorPos);
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Italic: *text*
      if ((match = text.substring(i).match(/^\*(.+?)\*/))) {
        const elId = `${lineIndex}-${pos}`;
        html += this.mkSyntaxInline('italic', lineIndex, elId, '*', pos, pos + 1, cursorPos);
        html += `<em class="md-element" data-element="${elId}">`;
        html += this.renderTextWithCursor(match[1], pos + 1, cursorPos);
        html += '</em>';
        html += this.mkSyntaxInline('italic', lineIndex, elId, '*', pos + 1 + match[1].length, pos + match[0].length, cursorPos);
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Italic: _text_
      if ((match = text.substring(i).match(/^_(.+?)_/))) {
        const elId = `${lineIndex}-${pos}`;
        html += this.mkSyntaxInline('italic', lineIndex, elId, '_', pos, pos + 1, cursorPos);
        html += `<em class="md-element" data-element="${elId}">`;
        html += this.renderTextWithCursor(match[1], pos + 1, cursorPos);
        html += '</em>';
        html += this.mkSyntaxInline('italic', lineIndex, elId, '_', pos + 1 + match[1].length, pos + match[0].length, cursorPos);
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Strikethrough: ~~text~~
      if ((match = text.substring(i).match(/^~~(.+?)~~/))) {
        const elId = `${lineIndex}-${pos}`;
        html += this.mkSyntaxInline('strike', lineIndex, elId, '~~', pos, pos + 2, cursorPos);
        html += `<del class="md-element" data-element="${elId}">`;
        html += this.renderTextWithCursor(match[1], pos + 2, cursorPos);
        html += '</del>';
        html += this.mkSyntaxInline('strike', lineIndex, elId, '~~', pos + 2 + match[1].length, pos + match[0].length, cursorPos);
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Inline code: `text` — content must not contain backticks
      if ((match = text.substring(i).match(/^`([^`]+)`/))) {
        const elId = `${lineIndex}-${pos}`;
        html += this.mkSyntaxInline('code', lineIndex, elId, '`', pos, pos + 1, cursorPos);
        html += `<code class="md-element" data-element="${elId}">`;
        html += this.renderTextWithCursor(match[1], pos + 1, cursorPos);
        html += '</code>';
        html += this.mkSyntaxInline('code', lineIndex, elId, '`', pos + 1 + match[1].length, pos + match[0].length, cursorPos);
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Question block: ?text?
      if ((match = text.substring(i).match(/^\?([^?\n]+)\?/))) {
        const elId = `${lineIndex}-${pos}`;
        html += this.mkSyntaxInline('question', lineIndex, elId, '?', pos, pos + 1, cursorPos);
        html += `<span class="question-block md-element" data-element="${elId}">`;
        html += this.renderTextWithCursor(match[1], pos + 1, cursorPos);
        html += '</span>';
        html += this.mkSyntaxInline('question', lineIndex, elId, '?', pos + 1 + match[1].length, pos + match[0].length, cursorPos);
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Link: [text](url)
      if ((match = text.substring(i).match(/^\[([^\]]+)\]\(([^)]+)\)/))) {
        const elId = `${lineIndex}-${pos}`;
        html += this.mkSyntaxInline('link', lineIndex, elId, '[', pos, pos + 1, cursorPos);
        html += `<a class="md-element md-link" data-element="${elId}" href="${this.esc(match[2])}">`;
        html += this.renderTextWithCursor(match[1], pos + 1, cursorPos);
        html += '</a>';
        html += this.mkSyntaxInline('link', lineIndex, elId, '](' + match[2] + ')', pos + 1 + match[1].length, pos + match[0].length, cursorPos);
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Regular character — with cursor marker if needed
      if (pos === cursorPos) {
        html += '<span id="cursor-marker"></span>';
      }
      html += this.esc(text[i]);
      pos++;
      i++;
    }

    // Cursor at end of line
    if (pos === cursorPos) {
      html += '<span id="cursor-marker"></span>';
    }

    return html;
  }

  renderTextWithCursor(text, basePos, cursorPos) {
    let html = '';
    for (let ci = 0; ci < text.length; ci++) {
      if (basePos + ci === cursorPos) {
        html += '<span id="cursor-marker"></span>';
      }
      html += this.esc(text[ci]);
    }
    if (basePos + text.length === cursorPos) {
      html += '<span id="cursor-marker"></span>';
    }
    return html;
  }

  // Create a block-level syntax span (# heading, > blockquote, etc.)
  mkSyntax(type, lineIndex, text, from, to, cursorPos) {
    const cursorInSyntax = cursorPos >= from && cursorPos <= to;
    let html = `<span class="md-syntax md-block-syntax" data-line="${lineIndex}" data-type="${type}">`;
    if (cursorInSyntax) html += '<span id="cursor-marker"></span>';
    html += this.esc(text);
    html += '</span>';
    return html;
  }

  // Create an inline syntax span (**, *, `, $, etc.)
  mkSyntaxInline(type, lineIndex, elementId, text, from, to, cursorPos) {
    const cursorInSyntax = cursorPos >= from && cursorPos <= to;
    let html = `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elementId}" data-type="${type}">`;
    if (cursorInSyntax) html += '<span id="cursor-marker"></span>';
    html += this.esc(text);
    html += '</span>';
    return html;
  }

  esc(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  // ═══════════════════════════════════════════
  // CURSOR MANAGEMENT
  // ═══════════════════════════════════════════

  placeCursorAtMarker() {
    const marker = this.editorEl.querySelector('#cursor-marker');
    if (!marker) {
      this.placeCursorAtEnd();
      return;
    }

    const range = document.createRange();
    const sel = window.getSelection();

    try {
      range.setStartAfter(marker);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {
      this.placeCursorAtEnd();
    }

    marker.remove();
  }

  placeCursorAtEnd() {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(this.editorEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  onCursorChange() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    let node = range.startContainer;

    let lineIndex = -1;
    let elementId = null;

    while (node && node !== this.editorEl) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.dataset && node.dataset.line !== undefined) {
          lineIndex = parseInt(node.dataset.line);
        }
        if (node.dataset && node.dataset.element !== undefined) {
          elementId = node.dataset.element;
        }
      }
      node = node.parentNode;
    }

    if (lineIndex === -1) {
      const lineEl = range.startContainer.parentElement?.closest?.('.md-line');
      if (lineEl && lineEl.dataset.line !== undefined) {
        lineIndex = parseInt(lineEl.dataset.line);
      }
    }

    this.cursorLineIndex = lineIndex;
    this.activeElementId = elementId;

    // Update syntax visibility
    this.editorEl.querySelectorAll('.md-syntax').forEach(el => {
      const elLine = parseInt(el.dataset.line ?? '-1');
      const elElement = el.dataset.element;

      if (el.classList.contains('md-block-syntax')) {
        el.classList.toggle('md-active', elLine === lineIndex);
      } else if (el.classList.contains('md-inline-syntax')) {
        const sameLine = elLine === lineIndex;
        const sameElement = !elElement || elElement === elementId;
        el.classList.toggle('md-active', sameLine && sameElement);
      }
    });

    this.updateCursorPosFromDOM();
  }

  /**
   * Calculate raw markdown position from a DOM node + offset.
   *
   * Strategy:
   * 1. Find the .md-line ancestor of the cursor node
   * 2. Calculate line start position from line index
   * 3. Count text characters within the line before the cursor
   * 4. Combine to get absolute position in rawMarkdown
   */
  calcPosFromDOMNode(targetNode, targetOffset) {
    // Step 1: Find the md-line ancestor
    let lineEl = null;
    let node = targetNode;

    while (node && node !== this.editorEl) {
      if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('md-line')) {
        lineEl = node;
        break;
      }
      node = node.parentNode;
    }

    if (!lineEl) {
      return this.cursorPos;
    }

    // Step 2: Calculate line start from line index
    const lineIndex = parseInt(lineEl.dataset.line);
    const lines = this.rawMarkdown.split('\n');
    let lineStart = 0;
    for (let i = 0; i < lineIndex && i < lines.length; i++) {
      lineStart += lines[i].length + 1;
    }

    // Step 3: Count text characters within the line before the cursor
    let offsetInLine = 0;
    let found = false;

    // Special case: targetNode IS the line div itself
    if (targetNode === lineEl) {
      const children = lineEl.childNodes;
      for (let j = 0; j < targetOffset && j < children.length; j++) {
        offsetInLine += this.getTextLength(children[j]);
      }
      return lineStart + offsetInLine;
    }

    const countIn = (container) => {
      if (found) return;
      const children = container.childNodes;
      for (let ci = 0; ci < children.length; ci++) {
        if (found) return;
        const child = children[ci];

        if (child === targetNode && child.nodeType === Node.TEXT_NODE) {
          offsetInLine += targetOffset;
          found = true;
          return;
        }

        if (child === targetNode && child.nodeType === Node.ELEMENT_NODE) {
          for (let j = 0; j < targetOffset && j < child.childNodes.length; j++) {
            offsetInLine += this.getTextLength(child.childNodes[j]);
          }
          found = true;
          return;
        }

        if (child.nodeType === Node.TEXT_NODE) {
          offsetInLine += child.textContent.length;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.contains(targetNode)) {
            countIn(child);
            return;
          }
          offsetInLine += child.textContent.length;
        }
      }
    };

    countIn(lineEl);

    if (found) {
      return lineStart + offsetInLine;
    }

    return lineStart;
  }

  getTextLength(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.length;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      return node.textContent.length;
    }
    return 0;
  }

  updateCursorPosFromDOM() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const startPos = this.calcPosFromDOMNode(range.startContainer, range.startOffset);

    if (sel.isCollapsed) {
      this.cursorPos = startPos;
      this.selectionStart = startPos;
      this.selectionEnd = startPos;
    } else {
      const endPos = this.calcPosFromDOMNode(range.endContainer, range.endOffset);
      this.cursorPos = startPos;
      this.selectionStart = startPos;
      this.selectionEnd = endPos;
    }
  }

  hideAllSyntax() {
    this.editorEl.querySelectorAll('.md-syntax.md-active').forEach(el => {
      el.classList.remove('md-active');
    });
  }

  // Extract raw markdown from DOM (for reconcile after IME)
  extractText() {
    let text = '';
    const lines = this.editorEl.querySelectorAll(':scope > .md-line');
    lines.forEach((line, i) => {
      if (i > 0) text += '\n';
      text += line.textContent;
    });
    return text;
  }

  getOffsetFromDOM() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return this.cursorPos;

    const range = sel.getRangeAt(0);
    return this.calcPosFromDOMNode(range.startContainer, range.startOffset);
  }

  // ═══════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════

  setContent(rawMarkdown) {
    this.rawMarkdown = rawMarkdown || '';
    this.cursorPos = this.rawMarkdown.length;
    this.selectionStart = this.cursorPos;
    this.selectionEnd = this.cursorPos;
    this.lastSavedContent = this.rawMarkdown;
    this.render();
  }

  getContent() {
    return this.rawMarkdown;
  }

  insertAtCursor(text) {
    this.deleteSelection();
    this.rawInsertText(text);
    this.render();
    this.scheduleAutoSave();
  }

  insertAround(before, after, defaultText) {
    this.deleteSelection();
    const text = before + defaultText + after;
    this.rawInsertText(text);
    this.cursorPos -= after.length + defaultText.length;
    this.selectionStart = this.cursorPos;
    this.selectionEnd = this.cursorPos;
    this.render();
    this.scheduleAutoSave();
  }

  insertFormatting(type) {
    switch (type) {
      case 'bold': this.insertAround('**', '**', 'bold text'); break;
      case 'italic': this.insertAround('*', '*', 'italic text'); break;
      case 'code-inline': this.insertAround('`', '`', 'code'); break;
      case 'code-block': this.insertAtCursor('\n```\ncode\n```\n'); break;
      case 'latex-inline': this.insertAround('$', '$', '\\sqrt{x}'); break;
      case 'latex-display': this.insertAtCursor('\n$$\\frac{x}{y}$$\n'); break;
      case 'question': this.insertAround('?', '?', 'your question'); break;
    }
  }

  insertHeading(level) {
    const lineStart = this.rawMarkdown.lastIndexOf('\n', this.cursorPos - 1) + 1;
    let lineEnd = this.rawMarkdown.indexOf('\n', this.cursorPos);
    if (lineEnd === -1) lineEnd = this.rawMarkdown.length;
    const currentLine = this.rawMarkdown.substring(lineStart, lineEnd);
    const cleanLine = currentLine.replace(/^#{1,6}\s*/, '');
    const prefix = '#'.repeat(level) + ' ';
    const newLine = prefix + cleanLine;
    this.rawMarkdown = this.rawMarkdown.substring(0, lineStart) + newLine + this.rawMarkdown.substring(lineEnd);
    this.cursorPos = lineStart + newLine.length;
    this.selectionStart = this.cursorPos;
    this.selectionEnd = this.cursorPos;
    this.render();
    this.scheduleAutoSave();
  }

  scheduleAutoSave() {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      const content = this.rawMarkdown;
      if (content !== this.lastSavedContent && this.autoSaveCallback) {
        this.autoSaveCallback(content);
        this.lastSavedContent = content;
      }
    }, this.autoSaveDelay);
  }
}
window.MarkdownEditor = MarkdownEditor;
