/**
 * Socra Markdown Editor — CodeMirror 5 with Live Preview (v3)
 *
 * v3 fixes:
 * - Code block styling via CSS text classes (not wrapper) to avoid cursor offset
 * - Scroll padding moved to .CodeMirror-content to fix scroll offset
 * - Cursor height scales with heading font-size via line-height on cm-header-N
 * - Decoration pass deferred slightly to let CodeMirror update its own DOM first
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
    this._lineHandles = [];
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
      this._scheduleRender(true); // true = scroll after render
    });

    this.cm.on('cursorActivity', () => {
      this._scheduleRender(false); // false = no scroll on cursor-only moves
    });

    // Click handler
    this.cm.getWrapperElement().addEventListener('click', (e) => {
      const coords = this.cm.coordsChar({ left: e.clientX, top: e.clientY });
      if (!coords) return;
      const line = this.cm.getLine(coords.line);
      const ch = coords.ch;

      // Question block → send to AI
      const qbMatch = this._findEnclosing(line, ch, '?', '?');
      if (qbMatch) {
        const content = line.substring(qbMatch.start + 1, qbMatch.end - 1).trim();
        if (content && window.sendMessage) {
          window.sendMessage(content);
          return;
        }
      }

      // LaTeX $...$ → edit
      const latexMatch = this._findEnclosing(line, ch, '$', '$');
      if (latexMatch) {
        this.cm.setCursor({ line: coords.line, ch: latexMatch.start + 1 });
        this.cm.focus();
        return;
      }

      // LaTeX $$...$$ → edit
      const dlatexMatch = this._findEnclosing(line, ch, '$$', '$$');
      if (dlatexMatch) {
        this.cm.setCursor({ line: coords.line, ch: dlatexMatch.start + 2 });
        this.cm.focus();
        return;
      }

      // Code block content line — if the line has a replacedWith mark
      // (syntax highlighting widget), clicking won't map correctly via
      // coordsChar because the text is replaced. Set cursor to the
      // clicked line and let the re-render remove the widget.
      const lineEl = this.cm.lineInfo(coords.line);
      if (lineEl && lineEl.textClass && lineEl.textClass.includes('cm-code-line')) {
        // Calculate character position from click X
        const lineCoords = this.cm.charCoords({ line: coords.line, ch: 0 }, 'page');
        const charWidth = this._estimateCharWidth(coords.line);
        const clickX = e.clientX - lineCoords.left;
        const targetCh = Math.max(0, Math.min(Math.round(clickX / charWidth), line.length));
        this.cm.setCursor({ line: coords.line, ch: targetCh });
        this.cm.focus();
        return;
      }
    });
  }

  /**
   * Estimate the character width for a code line (monospace font).
   * Measures the actual rendered width of the first character.
   */
  _estimateCharWidth(lineNum) {
    // Try to measure from the actual DOM
    const lineEl = this.cm.getLineHandle(lineNum);
    if (lineEl && lineEl.textClass && lineEl.textClass.includes('cm-code-line')) {
      // For monospace font, all characters are the same width
      // Measure by getting the width of a 10-character string
      const measure = this.cm.charCoords({ line: lineNum, ch: 0 }, 'page');
      const measure10 = this.cm.charCoords({ line: lineNum, ch: 10 }, 'page');
      if (measure10.left > measure.left) {
        return (measure10.left - measure.left) / 10;
      }
    }
    // Fallback: estimate based on font size (monospace ~0.6em)
    return 16 * 0.9 * 0.6; // 16px base * 0.9em code size * 0.6 char ratio
  }

  _findEnclosing(line, ch, open, close) {
    const openLen = open.length;
    const closeLen = close.length;
    for (let i = ch - 1; i >= 0; i--) {
      if (line.substring(i, i + openLen) === open) {
        for (let j = ch; j <= line.length - closeLen; j++) {
          if (line.substring(j, j + closeLen) === close && j > i + openLen - 1) {
            if (ch > i && ch <= j + closeLen) {
              return { start: i, end: j + closeLen };
            }
          }
        }
      }
    }
    return null;
  }

  _scheduleRender(scrollAfter = false) {
    if (this._renderScheduled) {
      if (scrollAfter) this._scrollAfterRender = true;
      return;
    }
    this._renderScheduled = true;
    this._scrollAfterRender = scrollAfter;
    requestAnimationFrame(() => {
      this._renderScheduled = false;
      this._renderDecorations();
      if (this._scrollAfterRender && this.cm) {
        // Use a second rAF to ensure the browser has painted the
        // decoration changes before we scroll. This prevents the
        // scroll from targeting stale layout.
        requestAnimationFrame(() => {
          if (!this.cm) return;
          const c = this.cm.getCursor();
          // Use charCoords with 'local' to get position relative to the editor content
          const coordsTop = this.cm.charCoords({ line: c.line, ch: 0 }, 'local');
          const coordsBottom = this.cm.charCoords({ line: c.line, ch: c.ch || 0 }, 'local');
          const scroller = this.cm.getScrollerElement();
          const scrollerHeight = scroller.clientHeight;
          const scrollTop = scroller.scrollTop;
          const visibleBottom = scrollTop + scrollerHeight;
          const lineTop = coordsTop.top;
          const lineBottom = coordsBottom.bottom;
          const lineHeight = lineBottom - lineTop;

          // If any part of the cursor line is below the visible area,
          // scroll so the full line is visible with one line of padding
          if (lineBottom > visibleBottom - 5) {
            // Scroll so the bottom of the line is one line-height above the viewport bottom
            scroller.scrollTop = lineBottom - scrollerHeight + lineHeight + 10;
          }
        });
      }
    });
  }

  _renderDecorations() {
    if (!this.cm) return;

    // Clear old marks
    this._marks.forEach(m => { if (m.clear) m.clear(); });
    this._marks = [];
    this._lineHandles.forEach(lh => { if (lh.clear) lh.clear(); });
    this._lineHandles = [];

    const cursor = this.cm.getCursor();
    const cursorLine = cursor.line;
    const cursorCh = cursor.ch;
    const lineCount = this.cm.lineCount();

    let inCodeBlock = false;
    let codeBlockLang = '';

    for (let i = 0; i < lineCount; i++) {
      const line = this.cm.getLine(i);
      const isActive = (i === cursorLine);

      // Fenced code block tracking
      const fenceOpen = line.match(/^(`{3,})(\s*(\w*))?/);
      if (fenceOpen && !inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = (fenceOpen[3] || '').trim();
        if (!isActive) {
          // Hide the entire fence-open line (backticks + lang text)
          this._mark(i, 0, line.length, { css: 'display: none' });
          // Show language label as a widget positioned to the right
          if (codeBlockLang) {
            const label = document.createElement('span');
            label.textContent = codeBlockLang;
            label.style.cssText = 'font-family: var(--font-mono); font-size: 0.85em; color: var(--ink-muted); position: absolute; right: 16px; opacity: 0.6;';
            this._marks.push(this.cm.setBookmark({ line: i, ch: 0 }, { widget: label }));
          }
        }
        this._lineHandles.push(this.cm.addLineClass(i, 'text', 'cm-code-line'));
        continue;
      }

      if (inCodeBlock) {
        const fenceClose = line.match(/^`{3,}\s*$/);
        if (fenceClose) {
          inCodeBlock = false;
          if (!isActive) {
            this._mark(i, 0, line.length, { css: 'display: none' });
          }
          this._lineHandles.push(this.cm.addLineClass(i, 'text', 'cm-code-line'));
          continue;
        }
        // Code content line — add background + syntax highlighting
        this._lineHandles.push(this.cm.addLineClass(i, 'text', 'cm-code-line'));
        if (!isActive && window.hljs && codeBlockLang) {
          try {
            if (hljs.getLanguage(codeBlockLang)) {
              const result = hljs.highlight(line, { language: codeBlockLang, ignoreIllegals: true });
              const codeEl = document.createElement('span');
              codeEl.innerHTML = result.value;
              codeEl.style.cssText = 'display: inline;';
              this._mark(i, 0, line.length, { replacedWith: codeEl });
            }
          } catch (e) {}
        }
        continue;
      }

      this._decorateLine(i, line, isActive, cursorCh);
    }
  }

  _mark(line, from, to, opts) {
    this._marks.push(this.cm.markText({ line, ch: from }, { line, ch: to }, opts));
  }

  _decorateLine(lineNum, line, isActive, cursorCh) {
    // Heading
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

    // Blockquote
    const quoteMatch = line.match(/^>\s+(.*)$/);
    if (quoteMatch) {
      const prefixLen = 2;
      if (!isActive) {
        this._mark(lineNum, 0, prefixLen, { css: 'display: none' });
      }
      this._mark(lineNum, isActive ? 0 : prefixLen, line.length, { className: 'cm-quote' });
      return;
    }

    // List items
    const listMatch = line.match(/^([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const prefixLen = listMatch[1].length + 1;
      if (!isActive) {
        this._mark(lineNum, 0, prefixLen, { css: 'display: none' });
      }
      return;
    }

    // Horizontal rule
    if (line.match(/^(-{3,}|\*{3,}|_{3,})\s*$/)) {
      if (!isActive) {
        this._mark(lineNum, 0, line.length, { css: 'display: none' });
        const hr = document.createElement('hr');
        hr.style.cssText = 'border: none; border-top: 1px solid var(--border); margin: 8px 0;';
        this._marks.push(this.cm.setBookmark({ line: lineNum, ch: 0 }, { widget: hr }));
      }
      return;
    }

    // Inline decorations
    this._decorateInline(lineNum, line, isActive, cursorCh);
  }

  _decorateInline(lineNum, line, isActive, cursorCh) {
    let i = 0;
    while (i < line.length) {
      let match;

      // Bold+Italic
      if ((match = line.substring(i).match(/^\*\*\*(.+?)\*\*\*/))) {
        this._decorateSpan(lineNum, i, i + match[0].length, 3, 'cm-strong cm-em', isActive, cursorCh);
        i += match[0].length; continue;
      }
      // Bold
      if ((match = line.substring(i).match(/^\*\*(.+?)\*\*/))) {
        this._decorateSpan(lineNum, i, i + match[0].length, 2, 'cm-strong', isActive, cursorCh);
        i += match[0].length; continue;
      }
      // Italic * or _
      if ((match = line.substring(i).match(/^\*(.+?)\*/)) || (match = line.substring(i).match(/^_(.+?)_/))) {
        this._decorateSpan(lineNum, i, i + match[0].length, 1, 'cm-em', isActive, cursorCh);
        i += match[0].length; continue;
      }
      // Inline code
      if ((match = line.substring(i).match(/^`([^`]+)`/))) {
        this._decorateSpan(lineNum, i, i + match[0].length, 1, 'cm-comment cm-mono', isActive, cursorCh);
        i += match[0].length; continue;
      }
      // Display LaTeX $$...$$
      if ((match = line.substring(i).match(/^\$\$([^$]+)\$\$/))) {
        const elStart = i, elEnd = i + match[0].length;
        const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
        if (!cursorInEl) {
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
        i = elEnd; continue;
      }
      // Inline LaTeX $...$
      if ((match = line.substring(i).match(/^\$([^$\n]+)\$/))) {
        const elStart = i, elEnd = i + match[0].length;
        const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
        if (!cursorInEl) {
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
        i = elEnd; continue;
      }
      // Question block ?text?
      if ((match = line.substring(i).match(/^\?([^?\n]+)\?/))) {
        const elStart = i, elEnd = i + match[0].length;
        const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
        if (!cursorInEl) {
          this._mark(lineNum, elStart, elStart + 1, { css: 'display: none' });
          this._mark(lineNum, elEnd - 1, elEnd, { css: 'display: none' });
          this._mark(lineNum, elStart + 1, elEnd - 1, { className: 'cm-question-content' });
          const badge = document.createElement('span');
          badge.textContent = '?';
          badge.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: var(--primary); color: #FFFFFF; border-radius: 50%; font-size: 12px; font-weight: 700; margin-right: 6px; vertical-align: middle; cursor: pointer;';
          this._marks.push(this.cm.setBookmark({ line: lineNum, ch: elStart }, { widget: badge }));
        }
        i = elEnd; continue;
      }
      // Link [text](url)
      if ((match = line.substring(i).match(/^\[([^\]]+)\]\(([^)]+)\)/))) {
        const elStart = i, elEnd = i + match[0].length;
        const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
        if (!cursorInEl) {
          this._mark(lineNum, elStart, elStart + 1, { css: 'display: none' });
          this._mark(lineNum, elStart + 1 + match[1].length, elEnd, { css: 'display: none' });
          this._mark(lineNum, elStart + 1, elStart + 1 + match[1].length, { className: 'cm-link' });
        }
        i = elEnd; continue;
      }
      // Strikethrough ~~text~~
      if ((match = line.substring(i).match(/^~~(.+?)~~/))) {
        this._decorateSpan(lineNum, i, i + match[0].length, 2, 'cm-strikethrough', isActive, cursorCh);
        i += match[0].length; continue;
      }

      i++;
    }
  }

  /**
   * Helper: decorate a simple inline span with open/close delimiters.
   * Hides delimiters when cursor is not inside, applies className to content.
   */
  _decorateSpan(lineNum, elStart, elEnd, delimLen, className, isActive, cursorCh) {
    const cursorInEl = isActive && cursorCh > elStart && cursorCh <= elEnd;
    if (!cursorInEl) {
      this._mark(lineNum, elStart, elStart + delimLen, { css: 'display: none' });
      this._mark(lineNum, elEnd - delimLen, elEnd, { css: 'display: none' });
    }
    this._mark(lineNum, cursorInEl ? elStart : elStart + delimLen, cursorInEl ? elEnd : elEnd - delimLen, { className });
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
