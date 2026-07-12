/**
 * Socra Markdown Editor - Obsidian-style live markdown editing.
 *
 * The rest of the app talks to this through setContent/getContent,
 * insertFormatting, insertHeading, and autosave callbacks.
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
    this._lineClasses = [];
    this._renderScheduled = false;
    this._scrollAfterRender = false;
    this._pendingQuestionClick = null;

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
      autoCloseBrackets: true,
      extraKeys: {
        'Ctrl-B': () => this._wrapSelection('**', '**'),
        'Cmd-B': () => this._wrapSelection('**', '**'),
        'Ctrl-I': () => this._wrapSelection('*', '*'),
        'Cmd-I': () => this._wrapSelection('*', '*'),
        'Ctrl-`': () => this._wrapSelection('`', '`'),
        'Cmd-`': () => this._wrapSelection('`', '`'),
        'Enter': 'newlineAndIndentContinueMarkdownList',
      },
    });

    this.cm.on('change', () => {
      this.rawMarkdown = this.cm.getValue();
      this._scheduleAutoSave();

      const c = this.cm.getCursor();
      const coords = this.cm.charCoords({ line: c.line, ch: 0 }, 'local');
      const scroller = this.cm.getScrollerElement();
      const visibleBottom = scroller.scrollTop + scroller.clientHeight;
      this._scheduleRender(coords.bottom > visibleBottom - 10);
    });

    this.cm.on('cursorActivity', () => this._scheduleRender(false));

    this.cm.getWrapperElement().addEventListener('mousedown', (e) => {
      const coords = this.cm.coordsChar({ left: e.clientX, top: e.clientY });
      if (!coords) return;
      const line = this.cm.getLine(coords.line);
      const question = this._findQuestion(line, coords.ch);
      if (question && !this._isLineActive(coords.line)) {
        this._pendingQuestionClick = line.substring(question.start + 1, question.end - 1).trim();
        e.preventDefault();
        return;
      }

      const info = this.cm.lineInfo(coords.line);
      if (info?.textClass?.includes('cm-code-line') && !this._isLineActive(coords.line)) {
        this.cm.setCursor({ line: coords.line, ch: Math.min(coords.ch, this.cm.getLine(coords.line).length) });
        this._scheduleRender(false);
      }
    });

    this.cm.getWrapperElement().addEventListener('click', (e) => {
      if (this._pendingQuestionClick) {
        const question = this._pendingQuestionClick;
        this._pendingQuestionClick = null;
        if (window.sendMessage) window.sendMessage(question);
        return;
      }

      const coords = this.cm.coordsChar({ left: e.clientX, top: e.clientY });
      if (!coords) return;
      const line = this.cm.getLine(coords.line);
      const match = this._findQuestion(line, coords.ch);
      if (!match || this._isLineActive(coords.line)) return;

      const content = line.substring(match.start + 1, match.end - 1).trim();
      if (content && window.sendMessage) window.sendMessage(content);
    });
  }

  _scheduleRender(scrollAfter = false) {
    if (this._renderScheduled) {
      this._scrollAfterRender = this._scrollAfterRender || scrollAfter;
      return;
    }

    this._renderScheduled = true;
    this._scrollAfterRender = scrollAfter;
    requestAnimationFrame(() => {
      this._renderScheduled = false;
      this._renderDecorations();
      if (!this._scrollAfterRender || !this.cm) return;
      requestAnimationFrame(() => {
        if (!this.cm) return;
        const c = this.cm.getCursor();
        const coords = this.cm.charCoords({ line: c.line, ch: 0 }, 'local');
        const scroller = this.cm.getScrollerElement();
        if (coords.bottom > scroller.scrollTop + scroller.clientHeight) {
          this.cm.scrollIntoView({ line: c.line, ch: c.ch }, 10);
        }
      });
    });
  }

  _renderDecorations() {
    if (!this.cm) return;

    this._marks.forEach(mark => mark?.clear?.());
    this._marks = [];
    this._lineClasses.forEach(item => this.cm.removeLineClass(item.line, item.where, item.className));
    this._lineClasses = [];

    const lineCount = this.cm.lineCount();
    let inCodeBlock = false;
    let codeBlockStart = -1;
    let codeBlockLang = '';
    let inDisplayMath = false;
    let displayMathStart = -1;
    let displayMathLines = [];

    for (let lineNum = 0; lineNum < lineCount; lineNum++) {
      const line = this.cm.getLine(lineNum);
      const active = this._isLineActive(lineNum);

      if (line.trim() === '$$') {
        if (!inDisplayMath) {
          inDisplayMath = true;
          displayMathStart = lineNum;
          displayMathLines = [];
          continue;
        }

        const blockActive = this._rangeIsActive(displayMathStart, lineNum);
        if (!blockActive) this._renderDisplayMath(displayMathStart, lineNum, displayMathLines.join('\n'));
        inDisplayMath = false;
        displayMathStart = -1;
        displayMathLines = [];
        continue;
      }

      if (inDisplayMath) {
        displayMathLines.push(line);
        continue;
      }

      const fenceOpen = line.match(/^(`{3,}|~{3,})\s*([\w-]*)\s*$/);
      if (fenceOpen && !inCodeBlock) {
        inCodeBlock = true;
        codeBlockStart = lineNum;
        codeBlockLang = fenceOpen[2] || '';
        this._addLineClass(lineNum, 'text', 'cm-code-line');
        this._addLineClass(lineNum, 'text', 'cm-code-fence');
        if (!active) {
          this._hideLine(lineNum);
          if (codeBlockLang) this._addCodeLanguageBadge(lineNum, codeBlockLang);
        }
        continue;
      }

      if (inCodeBlock) {
        const fenceClose = line.match(/^(`{3,}|~{3,})\s*$/);
        const blockActive = this._rangeIsActive(codeBlockStart, lineNum);
        this._addLineClass(lineNum, 'text', 'cm-code-line');

        if (fenceClose) {
          if (!blockActive) this._hideLine(lineNum);
          inCodeBlock = false;
          codeBlockStart = -1;
          codeBlockLang = '';
          continue;
        }

        if (!blockActive) this._highlightCodeLine(lineNum, line, codeBlockLang);
        continue;
      }

      this._decorateLine(lineNum, line, active);
    }
  }

  _decorateLine(lineNum, line, active) {
    const cursorCh = this.cm.getCursor().line === lineNum ? this.cm.getCursor().ch : -1;

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const prefixLen = heading[1].length + 1;
      if (!active) this._hide(lineNum, 0, prefixLen);
      this._mark(lineNum, active ? 0 : prefixLen, line.length, { className: `cm-header cm-header-${heading[1].length}` });
      this._decorateInline(lineNum, line, active, cursorCh);
      return;
    }

    const quote = line.match(/^>\s+(.*)$/);
    if (quote) {
      if (!active) this._hide(lineNum, 0, 2);
      this._mark(lineNum, active ? 0 : 2, line.length, { className: 'cm-quote' });
      this._decorateInline(lineNum, line, active, cursorCh);
      return;
    }

    const list = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (list) {
      const prefixLen = list[1].length + list[2].length + 1;
      this._addLineClass(lineNum, 'text', list[2].endsWith('.') ? 'cm-ordered-list-line' : 'cm-bullet-list-line');
      if (!active) this._hide(lineNum, 0, prefixLen);
      this._decorateInline(lineNum, line, active, cursorCh);
      return;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      if (!active) {
        this._hideLine(lineNum);
        const hr = document.createElement('hr');
        hr.className = 'md-hr-widget';
        this._marks.push(this.cm.setBookmark({ line: lineNum, ch: 0 }, { widget: hr }));
      }
      return;
    }

    this._decorateInline(lineNum, line, active, cursorCh);
  }

  _decorateInline(lineNum, line, active, cursorCh) {
    let i = 0;
    while (i < line.length) {
      let match;

      if ((match = line.substring(i).match(/^\*\*\*(.+?)\*\*\*/))) {
        this._decorateDelimited(lineNum, i, i + match[0].length, 3, 'cm-strong cm-em', active, cursorCh);
        i += match[0].length;
        continue;
      }

      if ((match = line.substring(i).match(/^\*\*(.+?)\*\*/))) {
        this._decorateDelimited(lineNum, i, i + match[0].length, 2, 'cm-strong', active, cursorCh);
        i += match[0].length;
        continue;
      }

      if ((match = line.substring(i).match(/^(\*|_)([^\s].*?[^\s])\1/))) {
        this._decorateDelimited(lineNum, i, i + match[0].length, 1, 'cm-em', active, cursorCh);
        i += match[0].length;
        continue;
      }

      if ((match = line.substring(i).match(/^`([^`]+)`/))) {
        this._decorateDelimited(lineNum, i, i + match[0].length, 1, 'cm-mono', active, cursorCh);
        i += match[0].length;
        continue;
      }

      if ((match = line.substring(i).match(/^\$\$([^$]+)\$\$/))) {
        const start = i;
        const end = i + match[0].length;
        if (!this._cursorInRange(active, cursorCh, start, end)) this._replaceWithKatex(lineNum, start, end, match[1], true);
        i = end;
        continue;
      }

      if ((match = line.substring(i).match(/^\$([^$\n]+)\$/))) {
        const start = i;
        const end = i + match[0].length;
        if (!this._cursorInRange(active, cursorCh, start, end)) this._replaceWithKatex(lineNum, start, end, match[1], false);
        i = end;
        continue;
      }

      if ((match = line.substring(i).match(/^\?([^?\n]+)\?/))) {
        const start = i;
        const end = i + match[0].length;
        if (!this._cursorInRange(active, cursorCh, start, end)) {
          this._addLineClass(lineNum, 'text', 'cm-question-line');
          this._hide(lineNum, start, start + 1);
          this._hide(lineNum, end - 1, end);
          this._mark(lineNum, start + 1, end - 1, { className: 'cm-question-content' });
          this._addQuestionBadge(lineNum, start);
        }
        i = end;
        continue;
      }

      if ((match = line.substring(i).match(/^\[([^\]]+)\]\(([^)]+)\)/))) {
        const start = i;
        const end = i + match[0].length;
        if (!this._cursorInRange(active, cursorCh, start, end)) {
          this._hide(lineNum, start, start + 1);
          this._hide(lineNum, start + 1 + match[1].length, end);
          this._mark(lineNum, start + 1, start + 1 + match[1].length, { className: 'cm-link' });
        }
        i = end;
        continue;
      }

      if ((match = line.substring(i).match(/^~~(.+?)~~/))) {
        this._decorateDelimited(lineNum, i, i + match[0].length, 2, 'cm-strikethrough', active, cursorCh);
        i += match[0].length;
        continue;
      }

      i++;
    }
  }

  _decorateDelimited(lineNum, start, end, delimiterLength, className, active, cursorCh) {
    const cursorInside = this._cursorInRange(active, cursorCh, start, end);
    if (!cursorInside) {
      this._hide(lineNum, start, start + delimiterLength);
      this._hide(lineNum, end - delimiterLength, end);
    }
    this._mark(lineNum, cursorInside ? start : start + delimiterLength, cursorInside ? end : end - delimiterLength, { className });
  }

  _renderDisplayMath(startLine, endLine, tex) {
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) this._hideLine(lineNum);
    const span = document.createElement('span');
    span.className = 'md-katex-display';
    try {
      span.innerHTML = katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
    } catch (e) {
      span.textContent = tex;
    }
    this._marks.push(this.cm.setBookmark({ line: startLine, ch: 0 }, { widget: span }));
  }

  _replaceWithKatex(lineNum, start, end, tex, displayMode) {
    this._mark(lineNum, start, end, { className: 'cm-hidden' });
    const span = document.createElement('span');
    span.className = displayMode ? 'md-katex-display' : 'md-katex-inline';
    try {
      span.innerHTML = katex.renderToString(tex.trim(), { displayMode, throwOnError: false });
    } catch (e) {
      span.textContent = tex;
    }
    this._marks.push(this.cm.setBookmark({ line: lineNum, ch: start }, { widget: span }));
  }

  _highlightCodeLine(lineNum, line, language) {
    if (!window.hljs || !language || !hljs.getLanguage(language) || line.length === 0) return;
    try {
      const result = hljs.highlight(line, { language, ignoreIllegals: true });
      const codeEl = document.createElement('span');
      codeEl.className = 'cm-code-rendered';
      codeEl.innerHTML = result.value;
      this._mark(lineNum, 0, line.length, { replacedWith: codeEl });
    } catch (e) {
      // Leave CodeMirror's own markdown styling in place.
    }
  }

  _addCodeLanguageBadge(lineNum, language) {
    const label = document.createElement('span');
    label.className = 'cm-code-lang-badge';
    label.textContent = language;
    this._marks.push(this.cm.setBookmark({ line: lineNum, ch: 0 }, { widget: label }));
  }

  _addQuestionBadge(lineNum, ch) {
    const badge = document.createElement('span');
    badge.className = 'cm-question-badge';
    badge.textContent = '?';
    this._marks.push(this.cm.setBookmark({ line: lineNum, ch }, { widget: badge }));
  }

  _findQuestion(line, ch) {
    const re = /\?([^?\n]+)\?/g;
    let match;
    while ((match = re.exec(line))) {
      const start = match.index;
      const end = start + match[0].length;
      if (ch >= start && ch <= end) return { start, end };
    }
    return null;
  }

  _cursorInRange(active, cursorCh, start, end) {
    return active && cursorCh >= start && cursorCh <= end;
  }

  _mark(line, from, to, opts) {
    if (to <= from) return;
    this._marks.push(this.cm.markText({ line, ch: from }, { line, ch: to }, opts));
  }

  _addLineClass(line, where, className) {
    this.cm.addLineClass(line, where, className);
    this._lineClasses.push({ line, where, className });
  }

  _hide(line, from, to) {
    this._mark(line, from, to, { className: 'cm-hidden' });
  }

  _hideLine(lineNum) {
    this._hide(lineNum, 0, (this.cm.getLine(lineNum) || '').length);
  }

  _isLineActive(lineNum) {
    if (!this.cm) return false;
    if (this.cm.getCursor().line === lineNum) return true;
    return this._lineHasSelection(lineNum);
  }

  _lineHasSelection(lineNum) {
    if (!this.cm || !this.cm.somethingSelected()) return false;
    return this.cm.listSelections().some(sel => {
      const from = sel.from();
      const to = sel.to();
      if (from.line === to.line && from.ch === to.ch) return false;
      return lineNum >= from.line && lineNum <= to.line;
    });
  }

  _rangeIsActive(fromLine, toLine) {
    if (!this.cm) return false;
    const cursorLine = this.cm.getCursor().line;
    if (cursorLine >= fromLine && cursorLine <= toLine) return true;
    if (!this.cm.somethingSelected()) return false;
    return this.cm.listSelections().some(sel => sel.from().line <= toLine && sel.to().line >= fromLine);
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

  _wrapBlock(open, close) {
    if (!this.cm) return;
    const sel = this.cm.getSelection();
    if (sel) {
      this.cm.replaceSelection(open + '\n' + sel + '\n' + close);
    } else {
      const cursor = this.cm.getCursor();
      this.cm.replaceSelection(open + '\n\n' + close);
      this.cm.setCursor({ line: cursor.line + 1, ch: 0 });
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
      case 'code-block': this._wrapBlock('```javascript', '```'); break;
      case 'latex-inline': this._wrapSelection('$', '$'); break;
      case 'latex-display': this._wrapBlock('$$', '$$'); break;
      case 'question': this._wrapSelection('?', '?'); break;
      case 'bullet-list': this._insertLinePrefix('- '); break;
      case 'numbered-list': this._insertLinePrefix('1. '); break;
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

  _insertLinePrefix(prefix) {
    const cursor = this.cm.getCursor();
    const line = this.cm.getLine(cursor.line);
    this.cm.replaceRange(prefix + line.replace(/^(\s*)([-*+]|\d+\.)\s+/, '$1'), { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
    this.cm.setCursor({ line: cursor.line, ch: prefix.length + line.length });
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
