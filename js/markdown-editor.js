/**
 * Socra Markdown Editor — CodeMirror 5 with Live Preview (v2)
 *
 * Key design decisions for v2:
 * 1. LaTeX/question rendering happens even on the ACTIVE line, as long as
 *    the cursor is not INSIDE the specific element. This means closing the
 *    $ delimiters renders the math immediately, even if the cursor is
 *    still on that line (just outside the $...$ range).
 * 2. CodeMirror's native scrollIntoView is used for auto-scroll (reliable).
 * 3. No cursor height override — CodeMirror handles it natively.
 * 4. Inline code backticks are hidden when not active.
 * 5. Clicking rendered LaTeX moves cursor into the raw source.
 * 6. Clicking question blocks sends to AI.
 * 7. Code blocks get a background style via line classes.
 */
class MarkdownEditor {
  constructor(textarea, previewEl, options = {}) {
    this.rawMarkdown = '';
    this.autoSaveCallback = options.autoSave || null;
    this.autoSaveDelay = options.autoSaveDelay || 1500;
    this.autoSaveTimer = null;
    this.lastSavedContent = '';
    this.cm = null;
    this._marks = [];
    this._lineClasses = []; // Track line class marks
    this._renderScheduled = false;

    this._init();
  }

  _init() {
    const editorSplit = document.querySelector('.editor-split');
    if (!editorSplit) return;
    editorSplit.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'live-editor-wrapper';
    editorSplit.appendChild(wrapper);

    const editorEl = document.createElement('div');
    editorEl.className = 'live-editor';
    wrapper.appendChild(editorEl);

    if (typeof CodeMirror === 'undefined') {
      console.error('CodeMirror not loaded');
      return;
    }

    this.cm = CodeMirror(editorEl, {
      value: this.rawMarkdown,
      mode: 'markdown',
      lineWrapping: true,
      lineNumbers: false,
      autofocus: false,
      indentUnit: 2,
      tabSize: 2,
      extraKeys: {
        'Ctrl-B': () => this._wrapSelection('**', '**'),
        'Cmd-B': () => this._wrapSelection('**', '**'),
        'Ctrl-I': () => this._wrapSelection('*', '*'),
        'Cmd-I': () => this._wrapSelection('*', '*'),
        'Enter': 'newlineAndIndentContinueMarkdownList',
      },
    });

    this.cm.on('change', () => {
      this.rawMarkdown = this.cm.getValue();
      this._scheduleAutoSave();
      this._scheduleRender();
    });

    this.cm.on('cursorActivity', () => {
      this._scheduleRender();
      // Use CodeMirror's built-in scrollIntoView with a margin
      this.cm.scrollIntoView(null, 80);
    });

    // Click handler: question blocks → send, LaTeX → edit
    this.cm.getWrapperElement().addEventListener('click', (e) => {
      const coords = this.cm.coordsChar({ left: e.clientX, top: e.clientY });
      if (!coords) return;
      const line = this.cm.getLine(coords.line);
      const ch = coords.ch;

      // Check for question block: find enclosing ?...?
      const qbMatch = this._findEnclosing(line, ch, '?', '?');
      if (qbMatch) {
        const content = line.substring(qbMatch.start + 1, qbMatch.end).trim();
        if (content && window.sendMessage) {
          window.sendMessage(content);
          return;
        }
      }

      // Check for LaTeX: find enclosing $...$ or $$...$$
      const latexMatch = this._findEnclosing(line, ch, '$', '$');
      if (latexMatch) {
        // Place cursor inside the LaTeX source so it un-renders
        this.cm.setCursor({ line: coords.line, ch: latexMatch.start + 1 });
        this.cm.focus();
        return;
      }

      // Check for display LaTeX $$...$$
      const dlatexMatch = this._findEnclosing(line, ch, '$$', '$$');
      if (dlatexMatch) {
        this.cm.setCursor({ line: coords.line, ch: dlatexMatch.start + 2 });
        this.cm.focus();
        return;
      }
    });
  }

  /**
   * Find if position `ch` is inside a delimited construct like ?...? or $...$
   * Returns {start, end} of the full match (including delimiters) or null.
   */
  _findEnclosing(line, ch, open, close) {
    const openLen = open.length;
    const closeLen = close.length;
    // Search backwards for the opening delimiter
    for (let i = ch - 1; i >= 0; i--) {
      if (line.substring(i, i + openLen) === open) {
        // Search forwards for the closing delimiter
        for (let j = ch; j <= line.length - closeLen; j++) {
          if (line.substring(j, j + closeLen) === close && j > i + openLen) {
            // Check ch is between i+openLen and j
            if (ch > i && ch <= j + closeLen) {
              return { start: i, end: j + closeLen };
            }
          }
        }
      }
    }
    return null;
  }

  _scheduleRender() {
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    requestAnimationFrame(() => {
      this._renderScheduled = false;
      this._renderDecorations();
    });
  }

  _renderDecorations() {
    if (!this.cm) return;

    // Clear old marks
    this._marks.forEach(m => { if (m.clear) m.clear(); });
    this._marks = [];
    this._lineClasses.forEach(lh => { if (lh.clear) lh.clear(); });
    this._lineClasses = [];

    const cursor = this.cm.getCursor();
    const cursorLine = cursor.line;
    const cursorCh = cursor.ch;
    const lineCount = this.cm.lineCount();

    // Track if we're inside a fenced code block
    let inCodeBlock = false;
    let codeBlockLang = '';

    for (let i = 0; i < lineCount; i++) {
      const line = this.cm.getLine(i);
      const isActive = (i === cursorLine);

      // ── Fenced code block tracking ──
      const fenceOpen = line.match(/^(`{3,})(\s*\w*)?/);
      if (fenceOpen && !inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = (fenceOpen[2] || '').trim();
        if (!isActive) {
          // Hide the backticks
          this._mark(i, 0, fenceOpen[1].length, { css: 'display: none' });
          // Show language label as widget
          if (codeBlockLang) {
            const label = document.createElement('span');
            label.textContent = codeBlockLang;
            label.style.cssText = 'font-family: var(--font-mono); font-size: 0.85em; color: var(--ink-muted); margin-left: 4px;';
            this._marks.push(this.cm.setBookmark({ line: i, ch: fenceOpen[1].length }, { widget: label }));
          }
        }
        // Style the fence line
        this._lineClasses.push(this.cm.addLineClass(i, 'wrapper', 'cm-code-fence-line'));
        continue;
      }

      if (inCodeBlock) {
        const fenceClose = line.match(/^`{3,}\s*$/);
        if (fenceClose) {
          inCodeBlock = false;
          if (!isActive) {
            this._mark(i, 0, line.length, { css: 'display: none' });
          }
          this._lineClasses.push(this.cm.addLineClass(i, 'wrapper', 'cm-code-fence-line'));
          continue;
        }
        // Code content line — add background styling
        this._lineClasses.push(this.cm.addLineClass(i, 'wrapper', 'cm-code-content-line'));
        continue;
      }

      this._decorateLine(i, line, isActive, cursorLine, cursorCh);
    }
  }

  _mark(line, from, to, opts) {
    this._marks.push(this.cm.markText({ line, ch: from }, { line, ch: to }, opts));
  }

  _decorateLine(lineNum, line, isActive, cursorLine, cursorCh) {
    // ── Heading ──
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const prefixLen = headingMatch[1].length + 1;
      if (!isActive) {
        this._mark(lineNum, 0, prefixLen, { css: 'display: none' });
      }
      this._mark(lineNum, isActive ? 0 : prefixLen, line.length, { className: 'cm-header cm-header-' + level });
      return;
    }

    // ── Blockquote ──
    const quoteMatch = line.match(/^>\s+(.*)$/);
    if (quoteMatch) {
      const prefixLen = 2;
      if (!isActive) {
        this._mark(lineNum, 0, prefixLen, { css: 'display: none' });
      }
      this._mark(lineNum, isActive ? 0 : prefixLen, line.length, { className: 'cm-quote' });
      return;
    }

    // ── List items ──
    const listMatch = line.match(/^([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const prefixLen = listMatch[1].length + 1;
      if (!isActive) {
        this._mark(lineNum, 0, prefixLen, { css: 'display: none' });
      }
      return;
    }

    // ── Horizontal rule ──
    if (line.match(/^(-{3,}|\*{3,}|_{3,})\s*$/)) {
      if (!isActive) {
        this._mark(lineNum, 0, line.length, { css: 'display: none' });
        const hr = document.createElement('hr');
        hr.style.cssText = 'border: none; border-top: 1px solid var(--border); margin: 8px 0;';
        this._marks.push(this.cm.setBookmark({ line: lineNum, ch: 0 }, { widget: hr }));
      }
      return;
    }

    // ── Inline decorations ──
    this._decorateInline(lineNum, line, isActive, cursorLine, cursorCh);
  }

  _decorateInline(lineNum, line, isActive, cursorLine, cursorCh) {
    let i = 0;
    while (i < line.length) {
      let match;

      // Bold+Italic: ***text***
      if ((match = line.substring(i).match(/^\*\*\*(.+?)\*\*\*/))) {
        const elStart = i, elEnd = i + match[0].length;
        const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
        if (!cursorInEl) {
          this._mark(lineNum, elStart, elStart + 3, { css: 'display: none' });
          this._mark(lineNum, elEnd - 3, elEnd, { css: 'display: none' });
        }
        this._mark(lineNum, cursorInEl ? elStart : elStart + 3, cursorInEl ? elEnd : elEnd - 3, { className: 'cm-strong cm-em' });
        i = elEnd;
        continue;
      }

      // Bold: **text**
      if ((match = line.substring(i).match(/^\*\*(.+?)\*\*/))) {
        const elStart = i, elEnd = i + match[0].length;
        const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
        if (!cursorInEl) {
          this._mark(lineNum, elStart, elStart + 2, { css: 'display: none' });
          this._mark(lineNum, elEnd - 2, elEnd, { css: 'display: none' });
        }
        this._mark(lineNum, cursorInEl ? elStart : elStart + 2, cursorInEl ? elEnd : elEnd - 2, { className: 'cm-strong' });
        i = elEnd;
        continue;
      }

      // Italic: *text* or _text_
      if ((match = line.substring(i).match(/^\*(.+?)\*/)) || (match = line.substring(i).match(/^_(.+?)_/))) {
        const elStart = i, elEnd = i + match[0].length;
        const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
        if (!cursorInEl) {
          this._mark(lineNum, elStart, elStart + 1, { css: 'display: none' });
          this._mark(lineNum, elEnd - 1, elEnd, { css: 'display: none' });
        }
        this._mark(lineNum, cursorInEl ? elStart : elStart + 1, cursorInEl ? elEnd : elEnd - 1, { className: 'cm-em' });
        i = elEnd;
        continue;
      }

      // Inline code: `text`
      if ((match = line.substring(i).match(/^`([^`]+)`/))) {
        const elStart = i, elEnd = i + match[0].length;
        const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
        if (!cursorInEl) {
          this._mark(lineNum, elStart, elStart + 1, { css: 'display: none' });
          this._mark(lineNum, elEnd - 1, elEnd, { css: 'display: none' });
        }
        this._mark(lineNum, cursorInEl ? elStart : elStart + 1, cursorInEl ? elEnd : elEnd - 1, { className: 'cm-comment cm-mono' });
        i = elEnd;
        continue;
      }

      // Display LaTeX: $$...$$
      if ((match = line.substring(i).match(/^\$\$([^$]+)\$\$/))) {
        const elStart = i, elEnd = i + match[0].length;
        const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
        if (!cursorInEl) {
          // Hide everything and show rendered KaTeX
          this._mark(lineNum, elStart, elEnd, { css: 'display: none' });
          try {
            const rendered = katex.renderToString(match[1], { displayMode: true, throwOnError: false });
            const span = document.createElement('span');
            span.className = 'md-katex-display';
            span.innerHTML = rendered;
            span.style.cssText = 'display: block; margin: 12px 0; text-align: center; overflow: visible;';
            this._marks.push(this.cm.setBookmark({ line: lineNum, ch: elStart }, { widget: span }));
          } catch (e) {}
        }
        i = elEnd;
        continue;
      }

      // Inline LaTeX: $...$
      if ((match = line.substring(i).match(/^\$([^$\n]+)\$/))) {
        const elStart = i, elEnd = i + match[0].length;
        const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
        if (!cursorInEl) {
          // Hide everything and show rendered KaTeX
          this._mark(lineNum, elStart, elEnd, { css: 'display: none' });
          try {
            const rendered = katex.renderToString(match[1], { displayMode: false, throwOnError: false });
            const span = document.createElement('span');
            span.className = 'md-katex-inline';
            span.innerHTML = rendered;
            span.style.cssText = 'display: inline;';
            this._marks.push(this.cm.setBookmark({ line: lineNum, ch: elStart }, { widget: span }));
          } catch (e) {}
        }
        i = elEnd;
        continue;
      }

      // Question block: ?text?
      if ((match = line.substring(i).match(/^\?([^?\n]+)\?/))) {
        const elStart = i, elEnd = i + match[0].length;
        const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
        if (!cursorInEl) {
          // Hide the ? delimiters
          this._mark(lineNum, elStart, elStart + 1, { css: 'display: none' });
          this._mark(lineNum, elEnd - 1, elEnd, { css: 'display: none' });
          // Style the content
          this._mark(lineNum, elStart + 1, elEnd - 1, { className: 'cm-question-content' });
          // Insert ? badge widget
          const badge = document.createElement('span');
          badge.textContent = '?';
          badge.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: var(--primary); color: #FFFFFF; border-radius: 50%; font-size: 12px; font-weight: 700; margin-right: 6px; vertical-align: middle; cursor: pointer;';
          this._marks.push(this.cm.setBookmark({ line: lineNum, ch: elStart }, { widget: badge }));
        }
        i = elEnd;
        continue;
      }

      // Link: [text](url)
      if ((match = line.substring(i).match(/^\[([^\]]+)\]\(([^)]+)\)/))) {
        const elStart = i, elEnd = i + match[0].length;
        const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
        if (!cursorInEl) {
          this._mark(lineNum, elStart, elStart + 1, { css: 'display: none' });
          this._mark(lineNum, elStart + 1 + match[1].length, elEnd, { css: 'display: none' });
          this._mark(lineNum, elStart + 1, elStart + 1 + match[1].length, { className: 'cm-link' });
        }
        i = elEnd;
        continue;
      }

      // Strikethrough: ~~text~~
      if ((match = line.substring(i).match(/^~~(.+?)~~/))) {
        const elStart = i, elEnd = i + match[0].length;
        const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
        if (!cursorInEl) {
          this._mark(lineNum, elStart, elStart + 2, { css: 'display: none' });
          this._mark(lineNum, elEnd - 2, elEnd, { css: 'display: none' });
        }
        this._mark(lineNum, cursorInEl ? elStart : elStart + 2, cursorInEl ? elEnd : elEnd - 2, { className: 'cm-strikethrough' });
        i = elEnd;
        continue;
      }

      i++;
    }
  }

  _wrapSelection(open, close) {
    if (!this.cm) return;
    const sel = this.cm.getSelection();
    if (sel) {
      this.cm.replaceSelection(open + sel + close);
      const from = this.cm.getCursor('from');
      this.cm.setSelection(
        { line: from.line, ch: from.ch - close.length - sel.length },
        { line: from.line, ch: from.ch - close.length }
      );
    } else {
      this.cm.replaceSelection(open + close);
      const pos = this.cm.getCursor();
      this.cm.setCursor({ line: pos.line, ch: pos.ch - close.length });
    }
    this.cm.focus();
  }

  setContent(content) {
    this.rawMarkdown = content || '';
    if (this.cm) {
      this.cm.setValue(this.rawMarkdown);
      this._renderDecorations();
    }
    this.lastSavedContent = this.rawMarkdown;
  }

  getContent() {
    return this.cm ? this.cm.getValue() : this.rawMarkdown;
  }

  insertFormatting(format) {
    if (!this.cm) return;
    switch (format) {
      case 'bold': this._wrapSelection('**', '**'); break;
      case 'italic': this._wrapSelection('*', '*'); break;
      case 'code-inline': this._wrapSelection('`', '`'); break;
      case 'code-block': this._wrapSelection('```\n', '\n```'); break;
      case 'latex-inline': this._wrapSelection('$', '$'); break;
      case 'latex-display': this._wrapSelection('$$\n', '\n$$'); break;
      case 'question': this._wrapSelection('?', '?'); break;
      default: break;
    }
  }

  insertHeading(level) {
    if (!this.cm) return;
    const cursor = this.cm.getCursor();
    const line = this.cm.getLine(cursor.line);
    const stripped = line.replace(/^#{1,6}\s+/, '');
    const prefix = '#'.repeat(level) + ' ';
    this.cm.replaceRange(prefix + stripped, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
    this.cm.setCursor({ line: cursor.line, ch: prefix.length + stripped.length });
    this.cm.focus();
  }

  _scheduleAutoSave() {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      if (this.autoSaveCallback && this.rawMarkdown !== this.lastSavedContent) {
        this.lastSavedContent = this.rawMarkdown;
        this.autoSaveCallback(this.rawMarkdown);
      }
    }, this.autoSaveDelay);
  }
}
window.MarkdownEditor = MarkdownEditor;
