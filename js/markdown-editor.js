// Markdown Editor - Obsidian-like WYSIWYM experience
class MarkdownEditor {
  constructor(element, options = {}) {
    this.el = element;
    this.rawContent = '';
    this.autoSaveCallback = options.autoSave || null;
    this.autoSaveDelay = options.autoSaveDelay || 1500;
    this.autoSaveTimer = null;
    this.currentLine = null;

    this.init();
  }

  init() {
    // Listen for input events
    this.el.addEventListener('input', () => this.handleInput());
    this.el.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.el.addEventListener('click', () => this.updateCurrentLine());
    this.el.addEventListener('keyup', () => this.updateCurrentLine());
    this.el.addEventListener('paste', (e) => this.handlePaste(e));

    // Set initial content
    if (!this.el.innerHTML.trim()) {
      this.el.innerHTML = '';
    }
  }

  handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    this.scheduleAutoSave();
  }

  handleInput() {
    this.updateCurrentLine();
    this.scheduleAutoSave();
  }

  handleKeydown(e) {
    if (e.key === 'Enter') {
      // Let the browser handle Enter, but schedule re-render
      setTimeout(() => {
        this.updateCurrentLine();
        this.scheduleAutoSave();
      }, 0);
    }
  }

  updateCurrentLine() {
    // Find the line the cursor is on
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    let node = sel.anchorNode;
    // Walk up to find the line element
    while (node && node !== this.el && !node.classList?.contains('md-line')) {
      node = node.parentNode;
    }

    // Remove cursor-line from all lines
    this.el.querySelectorAll('.md-line.cursor-line').forEach(l => {
      l.classList.remove('cursor-line');
    });

    if (node && node.classList?.contains('md-line')) {
      node.classList.add('cursor-line');
      this.currentLine = node;
    }
  }

  setContent(rawMarkdown) {
    this.rawContent = rawMarkdown || '';
    this.renderAll();
  }

  getContent() {
    // Extract raw markdown from the editor
    return this.extractRawMarkdown();
  }

  extractRawMarkdown() {
    const lines = this.el.querySelectorAll('.md-line');
    if (lines.length === 0) {
      return this.el.innerText || '';
    }

    let result = [];
    lines.forEach(line => {
      result.push(this.extractLineRaw(line));
    });
    return result.join('\n');
  }

  extractLineRaw(lineEl) {
    // Get the raw text content, but we need to preserve markdown syntax
    // For headings, we store the level
    const level = this.getHeadingLevel(lineEl);
    let prefix = '';
    if (level > 0) prefix = '#'.repeat(level) + ' ';

    // Get text content (strips HTML tags)
    let text = lineEl.textContent || lineEl.innerText || '';

    // Check for question blocks
    if (lineEl.classList.contains('question-block')) {
      text = '?' + text + '?';
    }

    return prefix + text;
  }

  getHeadingLevel(lineEl) {
    for (let i = 1; i <= 6; i++) {
      if (lineEl.classList.contains('md-heading-' + i)) return i;
    }
    return 0;
  }

  renderAll() {
    const lines = this.rawContent.split('\n');
    let html = '';

    lines.forEach((line, idx) => {
      html += this.renderLine(line, idx);
    });

    this.el.innerHTML = html;
  }

  renderLine(line, idx) {
    const trimmed = line.trim();

    // Check for question blocks: ?content?
    const questionMatch = trimmed.match(/^\?(.+)\?$/);
    if (questionMatch) {
      const content = this.renderInline(questionMatch[1]);
      return `<div class="md-line question-block" data-line="${idx}">${content}</div>`;
    }

    // Check for headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = this.renderInline(headingMatch[2]);
      return `<div class="md-line md-heading-${level}" data-line="${idx}"><span class="md-syntax">${headingMatch[1]} </span>${text}</div>`;
    }

    // Check for code blocks (``` markers)
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      return `<div class="md-line md-code-block-marker" data-line="${idx}"><span class="md-syntax">\`\`\`${lang}</span></div>`;
    }

    // Empty line
    if (trimmed === '') {
      return `<div class="md-line" data-line="${idx}"><br></div>`;
    }

    // Regular paragraph
    const content = this.renderInline(trimmed);
    return `<div class="md-line" data-line="${idx}">${content}</div>`;
  }

  renderInline(text) {
    // Inline code: `code`
    text = text.replace(/`([^`]+)`/g, '<code class="md-code-inline">$1</code>');

    // Bold: **text** or __text__
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    text = text.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');

    // Display LaTeX: $$...$$
    text = text.replace(/\$\$([^$]+)\$\$/g, (match, formula) => {
      try {
        return katex.renderToString(formula, { displayMode: true, throwOnError: false });
      } catch (e) {
        return `<span class="md-code-inline">$$${formula}$$</span>`;
      }
    });

    // Inline LaTeX: $...$
    text = text.replace(/(?<!\$)\$(?!\$)([^$]+)(?<!\$)\$(?!\$)/g, (match, formula) => {
      try {
        return katex.renderToString(formula, { displayMode: false, throwOnError: false });
      } catch (e) {
        return `<span class="md-code-inline">$${formula}$</span>`;
      }
    });

    return text;
  }

  // Insert formatting at cursor position
  insertFormatting(type) {
    const sel = window.getSelection();
    if (!sel.rangeCount) {
      this.el.focus();
      return;
    }

    const range = sel.getRangeAt(0);
    const selectedText = sel.toString();

    switch (type) {
      case 'bold':
        this.insertAround('**', '**', selectedText || 'bold text');
        break;
      case 'italic':
        this.insertAround('_', '_', selectedText || 'italic text');
        break;
      case 'code-inline':
        this.insertAround('`', '`', selectedText || 'code');
        break;
      case 'code-block':
        this.insertText('\n```\ncode\n```\n');
        break;
      case 'latex-inline':
        this.insertAround('$', '$', selectedText || '\\sqrt{x}');
        break;
      case 'latex-display':
        this.insertText('\n$$\\frac{x}{y}$$\n');
        break;
      case 'question':
        this.insertAround('?', '?', selectedText || 'your question');
        break;
    }

    this.scheduleAutoSave();
  }

  insertHeading(level) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    // Get current line
    let node = sel.anchorNode;
    while (node && node !== this.el && node.nodeType !== Node.DOCUMENT_NODE) {
      if (node.classList && node.classList.contains('md-line')) break;
      node = node.parentNode;
    }

    if (node && node.classList && node.classList.contains('md-line')) {
      // Remove existing heading classes
      for (let i = 1; i <= 6; i++) {
        node.classList.remove('md-heading-' + i);
        const syntax = node.querySelector('.md-syntax');
        if (syntax) syntax.remove();
      }

      if (level > 0) {
        node.classList.add('md-heading-' + level);
        const prefix = document.createElement('span');
        prefix.className = 'md-syntax';
        prefix.textContent = '#'.repeat(level) + ' ';
        node.insertBefore(prefix, node.firstChild);
      }
    } else {
      // Insert new heading line
      const prefix = '#'.repeat(level) + ' ';
      document.execCommand('insertText', false, prefix);
    }

    this.scheduleAutoSave();
  }

  insertAround(before, after, defaultText) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const text = sel.toString() || defaultText;

    const span = document.createElement('span');
    span.textContent = before + text + after;

    range.deleteContents();
    range.insertNode(span);

    // Select the text between markers
    const textStart = range.startOffset + before.length;
    const textEnd = textStart + text.length;

    const newRange = document.createRange();
    newRange.setStart(span.firstChild, textStart);
    newRange.setEnd(span.firstChild, textEnd);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  insertText(text) {
    document.execCommand('insertText', false, text);
  }

  scheduleAutoSave() {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.rawContent = this.extractRawMarkdown();
      if (this.autoSaveCallback) {
        this.autoSaveCallback(this.rawContent);
      }
    }, this.autoSaveDelay);
  }

  // Find and return all question blocks
  getQuestionBlocks() {
    const blocks = this.el.querySelectorAll('.question-block');
    return Array.from(blocks).map(b => b.textContent.trim());
  }
}

// Make available globally
window.MarkdownEditor = MarkdownEditor;
