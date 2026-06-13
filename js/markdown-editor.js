/**
 * Socra Live Markdown Editor — WYSIWYM (What You See Is What You Mean)
 *
 * Single-pane editor that renders markdown inline as you type.
 * Approach: Store raw markdown internally. On each input, re-render the
 * entire document into the contenteditable div. Cursor position is
 * preserved by tracking offset relative to the raw text.
 */
class MarkdownEditor {
  constructor(textarea, previewEl, options = {}) {
    // We reuse the textarea param name but actually replace the split-pane
    // with a single contenteditable div
    this.rawMarkdown = '';
    this.editorEl = null; // The contenteditable div
    this.autoSaveCallback = options.autoSave || null;
    this.autoSaveDelay = options.autoSaveDelay || 1500;
    this.autoSaveTimer = null;
    this.isComposing = false; // IME composition flag
    this.lastSavedContent = '';

    this.init();
  }

  init() {
    // Replace the split editor-source + editor-preview with a single pane
    const editorSplit = document.querySelector('.editor-split');
    if (!editorSplit) return;

    // Create the single live editor
    editorSplit.innerHTML = '';

    const editorWrapper = document.createElement('div');
    editorWrapper.className = 'live-editor-wrapper';

    this.editorEl = document.createElement('div');
    this.editorEl.className = 'live-editor';
    this.editorEl.contentEditable = 'true';
    this.editorEl.spellcheck = true;
    this.editorEl.setAttribute('data-placeholder', 'Start typing... Use Markdown syntax:\n# Heading\n**bold** _italic_\n?question? sends to AI');
    this.editorEl.setAttribute('role', 'textbox');
    this.editorEl.setAttribute('aria-multiline', 'true');

    editorWrapper.appendChild(this.editorEl);
    editorSplit.appendChild(editorWrapper);

    // Event listeners
    this.editorEl.addEventListener('input', () => {
      if (this.isComposing) return;
      this.onInput();
    });

    // Handle IME composition (for CJK input)
    this.editorEl.addEventListener('compositionstart', () => { this.isComposing = true; });
    this.editorEl.addEventListener('compositionend', () => {
      this.isComposing = false;
      this.onInput();
    });

    this.editorEl.addEventListener('keydown', (e) => this.onKeyDown(e));

    // Paste as plain text
    this.editorEl.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  }

  onInput() {
    // Get raw text from contenteditable
    const raw = this.getEditorText();
    this.rawMarkdown = raw;
    this.scheduleAutoSave();
  }

  onKeyDown(e) {
    // Tab inserts 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
      return;
    }

    // Enter: let default behavior, then we handle it
    if (e.key === 'Enter' && !e.shiftKey) {
      // Let the browser handle the newline
      // After the newline is inserted, the input event will fire
    }
  }

  /**
   * Get the plain text content of the contenteditable div
   */
  getEditorText() {
    if (!this.editorEl) return '';
    // Get text content, preserving newlines from divs/br
    let text = '';
    const walker = document.createTreeWalker(this.editorEl, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node;
    let lastWasBlock = false;
    while (node = walker.nextNode()) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'BR' || node.tagName === 'DIV') {
          text += '\n';
          lastWasBlock = true;
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
        lastWasBlock = false;
      }
    }
    // Also handle direct innerHTML extraction as fallback
    return text || this.editorEl.innerText || '';
  }

  /**
   * Set content and render it
   */
  setContent(rawMarkdown) {
    this.rawMarkdown = rawMarkdown || '';
    this.lastSavedContent = this.rawMarkdown;
    if (this.editorEl) {
      // Render the markdown as HTML
      const html = this.renderMarkdown(this.rawMarkdown);
      this.editorEl.innerHTML = html;
      // If empty, make sure placeholder shows
      if (!this.rawMarkdown) {
        this.editorEl.innerHTML = '<p><br></p>';
      }
    }
  }

  /**
   * Get current raw markdown content
   */
  getContent() {
    return this.rawMarkdown;
  }

  /**
   * Insert text at cursor position
   */
  insertAtCursor(text) {
    this.editorEl.focus();
    document.execCommand('insertText', false, text);
    this.rawMarkdown = this.getEditorText();
    this.scheduleAutoSave();
  }

  /**
   * Insert formatting around selection
   */
  insertAround(before, after, defaultText) {
    const sel = window.getSelection();
    const selectedText = sel.toString() || defaultText;

    // Delete selection if any
    if (sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      // Insert before + text + after
      const beforeNode = document.createTextNode(before + selectedText + after);
      range.insertNode(beforeNode);
      // Select just the text between before/after
      const newRange = document.createRange();
      newRange.setStart(beforeNode, before.length);
      newRange.setEnd(beforeNode, before.length + selectedText.length);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } else {
      document.execCommand('insertText', false, before + selectedText + after);
    }

    this.rawMarkdown = this.getEditorText();
    this.scheduleAutoSave();
  }

  /**
   * Insert formatting by type
   */
  insertFormatting(type) {
    switch (type) {
      case 'bold': this.insertAround('**', '**', 'bold text'); break;
      case 'italic': this.insertAround('_', '_', 'italic text'); break;
      case 'code-inline': this.insertAround('`', '`', 'code'); break;
      case 'code-block': this.insertAtCursor('\n```\ncode\n```\n'); break;
      case 'latex-inline': this.insertAround('$', '$', '\\sqrt{x}'); break;
      case 'latex-display': this.insertAtCursor('\n$$\\frac{x}{y}$$\n'); break;
      case 'question': this.insertAround('?', '?', 'your question'); break;
    }
  }

  /**
   * Insert heading at current line
   */
  insertHeading(level) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    // Get current line text
    const range = sel.getRangeAt(0);
    const node = range.startContainer;

    // Find the start of the current line
    let textBefore = '';
    if (node.nodeType === Node.TEXT_NODE) {
      textBefore = node.textContent.substring(0, range.startOffset);
    }

    // Simple approach: just insert heading prefix at start of line
    const prefix = '#'.repeat(level) + ' ';
    this.insertAtLineStart(prefix);
  }

  insertAtLineStart(prefix) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);

    // Move to start of current line
    // Create a range from the start of the editor to the cursor
    const preRange = document.createRange();
    preRange.selectNodeContents(this.editorEl);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBeforeCursor = preRange.toString();

    // Find the last newline
    const lastNewline = textBeforeCursor.lastIndexOf('\n');
    const lineStart = lastNewline + 1;

    // Remove any existing heading prefix on this line
    const currentLineText = textBeforeCursor.substring(lineStart);
    const cleanedLine = currentLineText.replace(/^#{1,6}\s*/, '');

    // We need to replace from lineStart to current cursor position on that line
    // Simple approach: select from line start to cursor, delete, reinsert
    // This is complex with contenteditable, so use a simpler method:
    // Just type the prefix at cursor position and let user adjust

    // Move cursor to start of line
    const lineStartNode = this.findNodeAtOffset(lineStart);
    if (lineStartNode) {
      const newRange = document.createRange();
      newRange.setStart(lineStartNode.node, lineStartNode.offset);
      newRange.setEnd(lineStartNode.node, lineStartNode.offset);

      // Extend to select existing heading prefix
      const lineEndOffset = lineStart + currentLineText.length;
      const lineEndNode = this.findNodeAtOffset(lineEndOffset);
      if (lineEndNode && cleanedLine !== currentLineText) {
        newRange.setEnd(lineEndNode.node, lineEndNode.offset);
      } else {
        newRange.setEnd(range.startContainer, range.startOffset);
      }

      sel.removeAllRanges();
      sel.addRange(newRange);
      document.execCommand('insertText', false, prefix + cleanedLine);
    } else {
      // Fallback: just insert at cursor
      document.execCommand('insertText', false, prefix);
    }

    this.rawMarkdown = this.getEditorText();
    this.scheduleAutoSave();
  }

  findNodeAtOffset(offset) {
    const walker = document.createTreeWalker(this.editorEl, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let node;
    while (node = walker.nextNode()) {
      const len = node.textContent.length;
      if (currentOffset + len >= offset) {
        return { node, offset: offset - currentOffset };
      }
      currentOffset += len;
    }
    return null;
  }

  /**
   * Render markdown to HTML
   */
  renderMarkdown(raw) {
    if (!raw || !raw.trim()) return '<p><br></p>';

    let processed = raw;

    // Question blocks
    processed = processed.replace(/\?([^?\n]+)\?/g, '<div class="question-block">$1</div>');

    // Display math LaTeX
    processed = processed.replace(/\$\$([^$]+)\$\$/g, (m, f) => {
      try {
        return '<div class="katex-display">' + katex.renderToString(f, { displayMode: true, throwOnError: false }) + '</div>';
      } catch (e) { return '<code>' + m + '</code>'; }
    });

    // Inline math LaTeX
    processed = processed.replace(/(?<!\$)\$(?!\$)([^$\n]+)(?<!\$)\$(?!\$)/g, (m, f) => {
      try {
        return katex.renderToString(f, { displayMode: false, throwOnError: false });
      } catch (e) { return '<code>' + m + '</code>'; }
    });

    let html;
    try {
      html = marked.parse(processed);
    } catch (e) {
      html = '<p>' + raw.replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</p>';
    }

    return html;
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
