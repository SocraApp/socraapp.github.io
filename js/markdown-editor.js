/**
 * Socra Markdown Editor — Obsidian-style Live Preview
 *
 * Architecture:
 * - rawMarkdown is the source of truth (always)
 * - beforeinput is intercepted; all edits update rawMarkdown + cursorPos
 * - Custom renderer outputs HTML with syntax wrapped in <span class="md-syntax">
 * - Syntax spans are hidden by CSS (font-size:0) and shown when cursor is on that line/element
 * - Cursor is placed after render by walking the DOM to find the position matching cursorPos
 *
 * Behavior (mimics Obsidian Live Preview):
 * - Block syntax (# heading, > blockquote, - list): hidden when cursor is OFF that line
 * - Inline syntax (**bold**, *italic*, `code`, $math$): hidden when cursor is OUTSIDE that element
 * - Formatting (heading size, bold weight, italic style) is ALWAYS visible
 * - LaTeX renders when complete ($...$ closed), raw source shows when cursor enters
 * - Fenced code blocks (``` ... ```): rendered as code blocks, syntax hidden when cursor is outside
 *
 * Cursor placement strategy:
 * - After render, placeCursorFromModel() walks the DOM tree to find the exact
 *   character position matching cursorPos in rawMarkdown
 * - No cursor markers embedded in HTML — eliminates all duplicate-marker bugs
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

    this.editorEl.addEventListener('beforeinput', (e) => this.handleBeforeInput(e));

    this.editorEl.addEventListener('compositionstart', () => { this.isComposing = true; });
    this.editorEl.addEventListener('compositionend', () => {
      this.isComposing = false;
      this.reconcile();
    });

    this.editorEl.addEventListener('input', (e) => {
      if (this.isComposing) return;
    });

    this.editorEl.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      this.deleteSelection();
      this.rawInsertText(text);
      this.render();
      this.scheduleAutoSave();
    });

    this.editorEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.deleteSelection();
        this.rawInsertText('  ');
        this.render();
        this.scheduleAutoSave();
      }
    });

    document.addEventListener('selectionchange', () => {
      if (this.editorEl === document.activeElement || this.editorEl.contains(document.activeElement)) {
        requestAnimationFrame(() => this.onCursorChange());
      }
    });

    this.editorEl.addEventListener('focus', () => this.onCursorChange());
    this.editorEl.addEventListener('blur', () => this.hideAllSyntax());

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
        if (this.hasSelection()) { this.deleteSelection(); } else { this.rawDeleteBackward(); }
        break;
      case 'deleteContentForward':
        if (this.hasSelection()) { this.deleteSelection(); } else { this.rawDeleteForward(); }
        break;
      case 'insertParagraph':
      case 'insertLineBreak':
        this.deleteSelection();
        this.rawInsertText('\n');
        break;
      case 'deleteWordBackward':
        if (this.hasSelection()) { this.deleteSelection(); } else { this.rawDeleteWordBackward(); }
        break;
      case 'deleteWordForward':
        if (this.hasSelection()) { this.deleteSelection(); } else { this.rawDeleteWordForward(); }
        break;
      case 'deleteByCut':
      case 'deleteContent':
      case 'deleteHardLineBackward':
      case 'deleteHardLineForward':
      case 'deleteSoftLineBackward':
      case 'deleteSoftLineForward':
        if (this.hasSelection()) { this.deleteSelection(); } else { this.rawDeleteCurrentLine(); }
        break;
      case 'insertReplacementText':
        this.deleteSelection();
        this.rawInsertText(e.data || '');
        break;
    }

    this.render();
    this.scheduleAutoSave();
  }

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
    const html = this.renderDocument(this.rawMarkdown);
    this.editorEl.innerHTML = html;
    this.placeCursorFromModel();
    this.onCursorChange();
  }

  renderDocument(raw) {
    if (!raw) {
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

        while (j < lines.length) {
          const closeMatch = lines[j].match(new RegExp('^' + fenceChar + '{' + fenceLen + ',}\\s*$'));
          if (closeMatch) break;
          j++;
        }

        const hasClose = j < lines.length;

        // Opening fence line
        html += `<div class="md-line md-code-fence-line" data-line="${i}">`;
        html += `<span class="md-syntax md-block-syntax" data-line="${i}" data-type="code-fence-open">${this.esc(line)}</span>`;
        if (info) {
          html += `<span class="md-code-lang">${this.esc(info)}</span>`;
        }
        html += '</div>';

        // Code content lines
        let codeCharPos = lineStart + line.length + 1;
        for (let k = i + 1; k < j; k++) {
          html += `<div class="md-line md-code-line" data-line="${k}">`;
          html += `<code class="md-code-block-content">${this.esc(lines[k])}</code>`;
          if (!lines[k]) html += '<br>';
          html += '</div>';
          codeCharPos += lines[k].length + 1;
        }

        // Closing fence line
        if (hasClose) {
          html += `<div class="md-line md-code-fence-line" data-line="${j}">`;
          html += `<span class="md-syntax md-block-syntax" data-line="${j}" data-type="code-fence-close">${this.esc(lines[j])}</span>`;
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
      html += this.renderLine(line, i, lineStart);
      html += '</div>';

      charPos += line.length + 1;
      i++;
    }

    return html;
  }

  renderLine(line, lineIndex, lineStart) {
    // Heading: # text
    const headingMatch = line.match(/^(#{1,6})\s(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const prefixLen = headingMatch[1].length + 1;
      const content = headingMatch[2];
      let html = `<span class="md-syntax md-block-syntax" data-line="${lineIndex}" data-type="heading">`;
      html += this.esc(headingMatch[1] + ' ');
      html += '</span>';
      html += `<span class="md-h${level}">`;
      html += this.renderInline(content, lineIndex, lineStart + prefixLen);
      html += '</span>';
      return html;
    }

    // Horizontal rule: --- or *** or ___
    if (line.match(/^(-{3,}|\*{3,}|_{3,})\s*$/)) {
      let html = `<span class="md-syntax md-block-syntax" data-line="${lineIndex}" data-type="hr">`;
      html += this.esc(line);
      html += '</span><hr>';
      return html;
    }

    // Blockquote: > text
    if (line.match(/^>\s/)) {
      let html = `<span class="md-syntax md-block-syntax" data-line="${lineIndex}" data-type="blockquote">`;
      html += this.esc('> ');
      html += '</span>';
      html += '<blockquote class="md-blockquote">';
      html += this.renderInline(line.substring(2), lineIndex, lineStart + 2);
      html += '</blockquote>';
      return html;
    }

    // Unordered list: - item or * item or + item
    const ulMatch = line.match(/^([-*+])\s(.*)$/);
    if (ulMatch) {
      let html = `<span class="md-syntax md-block-syntax" data-line="${lineIndex}" data-type="list">`;
      html += this.esc(ulMatch[1] + ' ');
      html += '</span>';
      html += '<span class="md-list-item">';
      html += this.renderInline(ulMatch[2], lineIndex, lineStart + 2);
      html += '</span>';
      return html;
    }

    // Ordered list: 1. item
    const olMatch = line.match(/^(\d+\.)\s(.*)$/);
    if (olMatch) {
      const prefixLen = olMatch[1].length + 1;
      let html = `<span class="md-syntax md-block-syntax" data-line="${lineIndex}" data-type="olist">`;
      html += this.esc(olMatch[1] + ' ');
      html += '</span>';
      html += '<span class="md-list-item md-ol-item">';
      html += this.renderInline(olMatch[2], lineIndex, lineStart + prefixLen);
      html += '</span>';
      return html;
    }

    // Empty line
    if (!line) {
      return '<br>';
    }

    // Regular paragraph
    return this.renderInline(line, lineIndex, lineStart);
  }

  renderInline(text, lineIndex, basePos) {
    let html = '';
    let i = 0;
    let pos = basePos;

    while (i < text.length) {
      let match;

      // ── 3+ backticks: output literally, don't parse as inline code ──
      if ((match = text.substring(i).match(/^`{3,}/))) {
        html += this.esc(match[0]);
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Display LaTeX: $$...$$
      if ((match = text.substring(i).match(/^\$\$([^$]+)\$\$/))) {
        const elId = `${lineIndex}-${pos}`;
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="latex-display">${this.esc('$$')}</span>`;
        try {
          const rendered = katex.renderToString(match[1], { displayMode: true, throwOnError: false });
          html += `<span class="md-katex md-katex-display md-element" data-element="${elId}">${rendered}</span>`;
        } catch (e) {
          html += `<code class="md-element" data-element="${elId}">${this.esc(match[1])}</code>`;
        }
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="latex-display">${this.esc('$$')}</span>`;
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Inline LaTeX: $...$
      if ((match = text.substring(i).match(/^\$([^$\n]+)\$/))) {
        const elId = `${lineIndex}-${pos}`;
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="latex-inline">${this.esc('$')}</span>`;
        try {
          const rendered = katex.renderToString(match[1], { displayMode: false, throwOnError: false });
          html += `<span class="md-katex md-katex-inline md-element" data-element="${elId}">${rendered}</span>`;
        } catch (e) {
          html += `<code class="md-element" data-element="${elId}">${this.esc(match[1])}</code>`;
        }
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="latex-inline">${this.esc('$')}</span>`;
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Bold+Italic: ***text***
      if ((match = text.substring(i).match(/^\*\*\*(.+?)\*\*\*/))) {
        const elId = `${lineIndex}-${pos}`;
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="bolditalic">${this.esc('***')}</span>`;
        html += `<strong><em class="md-element" data-element="${elId}">`;
        html += this.esc(match[1]);
        html += '</em></strong>';
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="bolditalic">${this.esc('***')}</span>`;
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Bold: **text**
      if ((match = text.substring(i).match(/^\*\*(.+?)\*\*/))) {
        const elId = `${lineIndex}-${pos}`;
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="bold">${this.esc('**')}</span>`;
        html += `<strong class="md-element" data-element="${elId}">`;
        html += this.esc(match[1]);
        html += '</strong>';
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="bold">${this.esc('**')}</span>`;
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Italic: *text*
      if ((match = text.substring(i).match(/^\*(.+?)\*/))) {
        const elId = `${lineIndex}-${pos}`;
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="italic">${this.esc('*')}</span>`;
        html += `<em class="md-element" data-element="${elId}">`;
        html += this.esc(match[1]);
        html += '</em>';
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="italic">${this.esc('*')}</span>`;
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Italic: _text_
      if ((match = text.substring(i).match(/^_(.+?)_/))) {
        const elId = `${lineIndex}-${pos}`;
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="italic">${this.esc('_')}</span>`;
        html += `<em class="md-element" data-element="${elId}">`;
        html += this.esc(match[1]);
        html += '</em>';
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="italic">${this.esc('_')}</span>`;
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Strikethrough: ~~text~~
      if ((match = text.substring(i).match(/^~~(.+?)~~/))) {
        const elId = `${lineIndex}-${pos}`;
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="strike">${this.esc('~~')}</span>`;
        html += `<del class="md-element" data-element="${elId}">`;
        html += this.esc(match[1]);
        html += '</del>';
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="strike">${this.esc('~~')}</span>`;
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Inline code: `text` — content must not contain backticks
      if ((match = text.substring(i).match(/^`([^`]+)`/))) {
        const elId = `${lineIndex}-${pos}`;
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="code">${this.esc('`')}</span>`;
        html += `<code class="md-element" data-element="${elId}">`;
        html += this.esc(match[1]);
        html += '</code>';
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="code">${this.esc('`')}</span>`;
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Question block: ?text?
      if ((match = text.substring(i).match(/^\?([^?\n]+)\?/))) {
        const elId = `${lineIndex}-${pos}`;
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="question">${this.esc('?')}</span>`;
        html += `<span class="question-block md-element" data-element="${elId}">`;
        html += this.esc(match[1]);
        html += '</span>';
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="question">${this.esc('?')}</span>`;
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Link: [text](url)
      if ((match = text.substring(i).match(/^\[([^\]]+)\]\(([^)]+)\)/))) {
        const elId = `${lineIndex}-${pos}`;
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="link">${this.esc('[')}</span>`;
        html += `<a class="md-element md-link" data-element="${elId}" href="${this.esc(match[2])}">`;
        html += this.esc(match[1]);
        html += '</a>';
        html += `<span class="md-syntax md-inline-syntax" data-line="${lineIndex}" data-element="${elId}" data-type="link">${this.esc('](' + match[2] + ')')}</span>`;
        pos += match[0].length;
        i += match[0].length;
        continue;
      }

      // Regular character
      html += this.esc(text[i]);
      pos++;
      i++;
    }

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

  /**
   * Place cursor by walking the DOM tree to find the character offset
   * that corresponds to cursorPos in rawMarkdown.
   *
   * This is the ProseMirror-style approach: the model (rawMarkdown + cursorPos)
   * is the source of truth, and after rendering HTML we map the model position
   * back to a DOM position by counting text characters in the rendered tree.
   *
   * Key insight: the rendered HTML contains ALL the same characters as rawMarkdown
   * (syntax characters are just hidden via font-size:0 in CSS), so we can count
   * text characters in the DOM to find the right position.
   */
  placeCursorFromModel() {
    if (this.rawMarkdown.length === 0) {
      // Empty document — place cursor in the first line div
      const firstLine = this.editorEl.querySelector('.md-line');
      if (firstLine) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(firstLine, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      return;
    }

    // Find which line the cursor is on
    const lines = this.rawMarkdown.split('\n');
    let lineIndex = 0;
    let charPos = 0;

    for (let i = 0; i < lines.length; i++) {
      if (charPos + lines[i].length >= this.cursorPos) {
        lineIndex = i;
        break;
      }
      charPos += lines[i].length + 1;
      if (i === lines.length - 1) {
        lineIndex = i;
      }
    }

    const offsetInLine = this.cursorPos - charPos;

    // Find the md-line div for this line
    const lineEls = this.editorEl.querySelectorAll(':scope > .md-line');
    const lineEl = lineEls[lineIndex];

    if (!lineEl) {
      this.placeCursorAtEnd();
      return;
    }

    // Walk DOM tree within the line to find the exact position
    const result = this.findDOMPositionForOffset(lineEl, offsetInLine);

    if (result) {
      const range = document.createRange();
      const sel = window.getSelection();
      try {
        range.setStart(result.node, result.offset);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {
        this.placeCursorAtEnd();
      }
    } else {
      this.placeCursorAtEnd();
    }
  }

  /**
   * Walk the DOM tree within a container, counting text characters
   * until we reach the target offset. Returns {node, offset} for
   * the Range API.
   */
  findDOMPositionForOffset(container, targetOffset) {
    let currentOffset = 0;

    for (let ci = 0; ci < container.childNodes.length; ci++) {
      const child = container.childNodes[ci];

      if (child.nodeType === Node.TEXT_NODE) {
        const textLen = child.textContent.length;
        if (currentOffset + textLen >= targetOffset) {
          // Target is inside this text node
          return { node: child, offset: targetOffset - currentOffset };
        }
        currentOffset += textLen;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const textLen = child.textContent.length;

        if (textLen === 0) {
          // Empty element (e.g., <br>) — skip but consider cursor at start
          if (currentOffset === targetOffset) {
            // Place cursor inside this empty element or after it
            return { node: child, offset: 0 };
          }
          continue;
        }

        if (currentOffset + textLen > targetOffset) {
          // Target is inside this element — recurse
          const innerResult = this.findDOMPositionForOffset(child, targetOffset - currentOffset);
          if (innerResult) return innerResult;
          // Recursion failed (e.g., target was exactly at boundary) — place after this element
          currentOffset += textLen;
          continue;
        }

        if (currentOffset + textLen === targetOffset) {
          // Target is exactly at the end of this element.
          // We want to place cursor AFTER this element (at the start of the next sibling)
          // rather than inside it. This is crucial for syntax spans — if the cursor is at
          // the boundary between syntax and content, we want it in the content area.
          currentOffset += textLen;

          // If there's a next sibling, continue the loop and the cursor will end up
          // at the start of the next element's content.
          // If this is the last child, we'll fall through to the end-of-container case.
          continue;
        }

        currentOffset += textLen;
      }
    }

    // If we've processed all children and currentOffset === targetOffset,
    // the cursor should be at the end of the container.
    if (currentOffset === targetOffset) {
      // Place at end of last text node, or after last child element
      if (container.childNodes.length > 0) {
        const lastChild = container.lastChild;
        if (lastChild.nodeType === Node.TEXT_NODE) {
          return { node: lastChild, offset: lastChild.textContent.length };
        } else if (lastChild.nodeType === Node.ELEMENT_NODE) {
          // Try to place at end inside the last element
          const innerResult = this.findDOMPositionForOffset(lastChild, lastChild.textContent.length);
          if (innerResult) return innerResult;
          return { node: container, offset: container.childNodes.length };
        }
      }
      return { node: container, offset: 0 };
    }

    // Target is past the end — place at end
    return null;
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
   * Uses the same line-based strategy as placeCursorFromModel but in reverse.
   */
  calcPosFromDOMNode(targetNode, targetOffset) {
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

    // Calculate line start from line index
    const lineIndex = parseInt(lineEl.dataset.line);
    const lines = this.rawMarkdown.split('\n');
    let lineStart = 0;
    for (let i = 0; i < lineIndex && i < lines.length; i++) {
      lineStart += lines[i].length + 1;
    }

    // Count text characters within the line before the cursor
    let offsetInLine = 0;
    let found = false;

    // Special case: targetNode IS the line div itself
    if (targetNode === lineEl) {
      const children = lineEl.childNodes;
      for (let j = 0; j < targetOffset && j < children.length; j++) {
        offsetInLine += children[j].textContent.length;
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
            offsetInLine += child.childNodes[j].textContent.length;
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
