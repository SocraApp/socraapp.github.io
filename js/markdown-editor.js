/**
 * Socra Markdown Editor — CodeMirror 5 Edition
 *
 * Replaces the custom contentEditable editor with CodeMirror 5, which handles
 * cursor positioning, undo/redo, scrolling, and syntax highlighting natively.
 *
 * Features:
 * - Native undo/redo (Ctrl+Z / Ctrl+Y)
 * - Native cursor positioning (click anywhere, arrow keys work everywhere)
 * - Auto-scroll to keep cursor visible
 * - Markdown syntax highlighting
 * - Custom Socra theme (light + dark)
 * - Ctrl+B / Ctrl+I shortcuts
 * - Same API as the old editor (setContent, insertFormatting, etc.)
 * - Question block (?text?) is just inline markdown — clickable to send
 */
class MarkdownEditor {
  constructor(textarea, previewEl, options = {}) {
    this.rawMarkdown = '';
    this.autoSaveCallback = options.autoSave || null;
    this.autoSaveDelay = options.autoSaveDelay || 1500;
    this.autoSaveTimer = null;
    this.lastSavedContent = '';
    this.cm = null;
    this._clickHandlerBound = null;

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

    // Create CodeMirror instance
    this.cm = CodeMirror(editorEl, {
      value: this.rawMarkdown,
      mode: 'markdown',
      lineWrapping: true,
      lineNumbers: false,
      autofocus: false,
      indentUnit: 2,
      tabSize: 2,
      extraKeys: {
        'Ctrl-B': (cm) => this._wrapSelection('**', '**'),
        'Cmd-B': (cm) => this._wrapSelection('**', '**'),
        'Ctrl-I': (cm) => this._wrapSelection('*', '*'),
        'Cmd-I': (cm) => this._wrapSelection('*', '*'),
        'Enter': 'newlineAndIndentContinueMarkdownList',
      },
    });

    // Auto-save on change
    this.cm.on('change', () => {
      this.rawMarkdown = this.cm.getValue();
      this._scheduleAutoSave();
    });

    // Click handler for question blocks (?text? -> send to chat)
    this._clickHandlerBound = (e) => {
      const text = this.cm.getSelection();
      // Check if clicking on a question block — CodeMirror doesn't render
      // custom decorations, so we check the token at the click position
      const coords = this.cm.coordsChar({ left: e.clientX, top: e.clientY });
      if (coords) {
        const token = this.cm.getTokenAt(coords);
        if (token && token.string && token.string.startsWith('?') && token.string.endsWith('?')) {
          const content = token.string.slice(1, -1).trim();
          if (content && window.sendMessage) window.sendMessage(content);
        }
      }
    };
    this.cm.getWrapperElement().addEventListener('click', this._clickHandlerBound);

    // Apply theme
    this._applyTheme();
  }

  _applyTheme() {
    if (!this.cm) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    // We use a custom CSS theme instead of CodeMirror's built-in themes
    this.cm.setOption('theme', isDark ? 'socra-dark' : 'socra-light');
  }

  _wrapSelection(open, close) {
    if (!this.cm) return;
    const sel = this.cm.getSelection();
    if (sel) {
      this.cm.replaceSelection(open + sel + close);
      // Select the original text (between open and close)
      const from = this.cm.getCursor('from');
      const to = this.cm.getCursor('to');
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
