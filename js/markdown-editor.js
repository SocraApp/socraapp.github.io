/**
 * Socra Markdown Editor — CodeMirror 5 (Simple Edition)
 *
 * Uses CodeMirror 5's built-in markdown mode for syntax highlighting.
 * No custom decoration passes — no markText, no collapsed marks, no
 * hidden syntax. The editor shows raw markdown with syntax coloring
 * (headings are bold, links are colored, etc.) but the syntax markers
 * (#, **, *, >) are always visible.
 *
 * This eliminates ALL cursor, selection, and scrolling issues that
 * were caused by the markText decoration system.
 *
 * Features:
 * - Native undo/redo (Ctrl+Z / Ctrl+Y)
 * - Native cursor positioning (click anywhere, arrow keys work)
 * - Native selection (Ctrl+A, multi-line select — all works perfectly)
 * - Native auto-scroll
 * - Markdown syntax highlighting via CM5 markdown mode
 * - Ctrl+B / Ctrl+I shortcuts
 * - Same API as before (setContent, insertFormatting, etc.)
 * - Question block (?text?) click-to-send via token detection
 */
class MarkdownEditor {
  constructor(textarea, previewEl, options = {}) {
    this.rawMarkdown = '';
    this.autoSaveCallback = options.autoSave || null;
    this.autoSaveDelay = options.autoSaveDelay || 1500;
    this.autoSaveTimer = null;
    this.lastSavedContent = '';
    this.cm = null;

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
    });

    // Click handler for question blocks
    this.cm.getWrapperElement().addEventListener('click', (e) => {
      const coords = this.cm.coordsChar({ left: e.clientX, top: e.clientY });
      if (!coords) return;
      const line = this.cm.getLine(coords.line);
      const ch = coords.ch;

      // Check for question block: find enclosing ?...?
      const qbMatch = this._findEnclosing(line, ch, '?', '?');
      if (qbMatch) {
        const content = line.substring(qbMatch.start + 1, qbMatch.end - 1).trim();
        if (content && window.sendMessage) {
          window.sendMessage(content);
        }
      }
    });
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
