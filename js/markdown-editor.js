/**
 * Socra Markdown Editor — CodeMirror 5 with Live Preview
 *
 * Uses CodeMirror 5's markText API to create an Obsidian-style live preview:
 * - Syntax markers (**, *, ##, >, etc.) are hidden when the cursor is NOT on that line
 * - When the cursor enters a line, syntax markers become visible for editing
 * - Code blocks, LaTeX, question blocks, blockquotes are rendered with styling
 * - Ctrl+Z/Y, arrow keys, auto-scroll all work natively via CodeMirror
 * - Ctrl+B inserts **|**, Ctrl+I inserts *|*
 *
 * The rendering is done via a "decoration pass" that runs after each cursor
 * move or content change. It marks text ranges with CSS classes and hides
 * syntax markers using the 'display: none' style on marks.
 */
class MarkdownEditor {
  constructor(textarea, previewEl, options = {}) {
    this.rawMarkdown = '';
    this.autoSaveCallback = options.autoSave || null;
    this.autoSaveDelay = options.autoSaveDelay || 1500;
    this.autoSaveTimer = null;
    this.lastSavedContent = '';
    this.cm = null;
    this._marks = []; // Track active marks so we can clear them
    this._cursorLine = -1;
    this._renderScheduled = false;
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
      this._scheduleRender();
    });

    // Re-render decorations when cursor moves
    this.cm.on('cursorActivity', () => {
      this._scheduleRender();
    });

    // Auto-scroll: scroll cursor into view with extra padding
    this.cm.on('cursorActivity', () => {
      this._scrollCursorIntoView();
    });

    // Click handler for question blocks
    this._clickHandlerBound = (e) => {
      const coords = this.cm.coordsChar({ left: e.clientX, top: e.clientY });
      if (!coords) return;
      const line = this.cm.getLine(coords.line);
      // Check if the clicked position is inside a ?...? block
      const ch = coords.ch;
      let before = line.substring(0, ch);
      let after = line.substring(ch);
      const lastQ = before.lastIndexOf('?');
      const nextQ = after.indexOf('?');
      if (lastQ >= 0 && nextQ >= 0) {
        // Check that the ? before is an opening ? (odd count before it)
        const qCount = line.substring(0, lastQ).split('?').length - 1;
        if (qCount % 2 === 0) {
          const content = line.substring(lastQ + 1, ch + nextQ).trim();
          if (content && window.sendMessage) {
            window.sendMessage(content);
            return;
          }
        }
      }
    };
    this.cm.getWrapperElement().addEventListener('click', this._clickHandlerBound);
  }

  /**
   * Schedule a decoration render on the next animation frame to avoid
   * redundant re-renders on rapid cursor movements.
   */
  _scheduleRender() {
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    requestAnimationFrame(() => {
      this._renderScheduled = false;
      this._renderDecorations();
    });
  }

  /**
   * Main decoration pass. Clears old marks, then applies new ones based on
   * the current content and cursor position.
   *
   * For each line, if the cursor is NOT on that line, we hide syntax markers
   * and apply rendered styling. If the cursor IS on that line, we show all
   * syntax markers (raw mode) for editing.
   */
  _renderDecorations() {
    if (!this.cm) return;

    // Clear old marks
    this._marks.forEach(m => { if (m.clear) m.clear(); });
    this._marks = [];

    const cursor = this.cm.getCursor();
    const cursorLine = cursor.line;
    const lineCount = this.cm.lineCount();

    for (let i = 0; i < lineCount; i++) {
      const line = this.cm.getLine(i);
      const isActive = (i === cursorLine);

      this._decorateLine(i, line, isActive);
    }
  }

  _decorateLine(lineNum, line, isActive) {
    // ── Fenced code blocks: ``` ... ``` ──
    const fenceMatch = line.match(/^(`{3,})(.*)$/);
    if (fenceMatch) {
      if (!isActive) {
        // Hide the backticks, show the language as a label
        this._marks.push(this.cm.markText(
          { line: lineNum, ch: 0 },
          { line: lineNum, ch: fenceMatch[1].length },
          { css: 'display: none' }
        ));
      }
      return;
    }

    // ── Heading: # text ──
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const prefixLen = headingMatch[1].length + 1; // hashes + space
      if (!isActive) {
        // Hide the # markers
        this._marks.push(this.cm.markText(
          { line: lineNum, ch: 0 },
          { line: lineNum, ch: prefixLen },
          { css: 'display: none' }
        ));
      }
      // Apply heading styling to the content
      this._marks.push(this.cm.markText(
        { line: lineNum, ch: isActive ? 0 : prefixLen },
        { line: lineNum, ch: line.length },
        { className: 'cm-header cm-header-' + level }
      ));
      return;
    }

    // ── Blockquote: > text ──
    const quoteMatch = line.match(/^>\s+(.*)$/);
    if (quoteMatch) {
      const prefixLen = 2; // "> "
      if (!isActive) {
        this._marks.push(this.cm.markText(
          { line: lineNum, ch: 0 },
          { line: lineNum, ch: prefixLen },
          { css: 'display: none' }
        ));
      }
      this._marks.push(this.cm.markText(
        { line: lineNum, ch: isActive ? 0 : prefixLen },
        { line: lineNum, ch: line.length },
        { className: 'cm-quote' }
      ));
      return;
    }

    // ── List items: - text, * text, 1. text ──
    const listMatch = line.match(/^([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const prefixLen = listMatch[1].length + 1; // marker + space
      if (!isActive) {
        this._marks.push(this.cm.markText(
          { line: lineNum, ch: 0 },
          { line: lineNum, ch: prefixLen },
          { css: 'display: none' }
        ));
      }
      return;
    }

    // ── Horizontal rule: --- ──
    if (line.match(/^(-{3,}|\*{3,}|_{3,})\s*$/)) {
      if (!isActive) {
        this._marks.push(this.cm.markText(
          { line: lineNum, ch: 0 },
          { line: lineNum, ch: line.length },
          { css: 'display: none' }
        ));
        // Insert a widget showing an <hr>
        const hr = document.createElement('hr');
        hr.style.cssText = 'border: none; border-top: 1px solid var(--border); margin: 8px 0;';
        this._marks.push(this.cm.setBookmark({ line: lineNum, ch: 0 }, { widget: hr }));
      }
      return;
    }

    // ── Inline decorations for regular paragraphs ──
    this._decorateInline(lineNum, line, isActive);
  }

  _decorateInline(lineNum, line, isActive) {
    let i = 0;
    while (i < line.length) {
      let match;

      // Bold+Italic: ***text***
      if ((match = line.substring(i).match(/^\*\*\*(.+?)\*\*\*/))) {
        if (!isActive) {
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i },
            { line: lineNum, ch: i + 3 },
            { css: 'display: none' }
          ));
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i + match[0].length - 3 },
            { line: lineNum, ch: i + match[0].length },
            { css: 'display: none' }
          ));
        }
        this._marks.push(this.cm.markText(
          { line: lineNum, ch: i + (isActive ? 0 : 3) },
          { line: lineNum, ch: i + match[0].length - (isActive ? 0 : 3) },
          { className: 'cm-strong cm-em' }
        ));
        i += match[0].length;
        continue;
      }

      // Bold: **text**
      if ((match = line.substring(i).match(/^\*\*(.+?)\*\*/))) {
        if (!isActive) {
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i },
            { line: lineNum, ch: i + 2 },
            { css: 'display: none' }
          ));
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i + match[0].length - 2 },
            { line: lineNum, ch: i + match[0].length },
            { css: 'display: none' }
          ));
        }
        this._marks.push(this.cm.markText(
          { line: lineNum, ch: i + (isActive ? 0 : 2) },
          { line: lineNum, ch: i + match[0].length - (isActive ? 0 : 2) },
          { className: 'cm-strong' }
        ));
        i += match[0].length;
        continue;
      }

      // Italic: *text* or _text_
      if ((match = line.substring(i).match(/^\*(.+?)\*/)) || (match = line.substring(i).match(/^_(.+?)_/))) {
        if (!isActive) {
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i },
            { line: lineNum, ch: i + 1 },
            { css: 'display: none' }
          ));
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i + match[0].length - 1 },
            { line: lineNum, ch: i + match[0].length },
            { css: 'display: none' }
          ));
        }
        this._marks.push(this.cm.markText(
          { line: lineNum, ch: i + (isActive ? 0 : 1) },
          { line: lineNum, ch: i + match[0].length - (isActive ? 0 : 1) },
          { className: 'cm-em' }
        ));
        i += match[0].length;
        continue;
      }

      // Inline code: `text`
      if ((match = line.substring(i).match(/^`([^`]+)`/))) {
        if (!isActive) {
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i },
            { line: lineNum, ch: i + 1 },
            { css: 'display: none' }
          ));
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i + match[0].length - 1 },
            { line: lineNum, ch: i + match[0].length },
            { css: 'display: none' }
          ));
        }
        this._marks.push(this.cm.markText(
          { line: lineNum, ch: i + (isActive ? 0 : 1) },
          { line: lineNum, ch: i + match[0].length - (isActive ? 0 : 1) },
          { className: 'cm-comment' }
        ));
        i += match[0].length;
        continue;
      }

      // Display LaTeX: $$...$$
      if ((match = line.substring(i).match(/^\$\$([^$]+)\$\$/))) {
        if (!isActive) {
          // Hide the $$ delimiters
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i },
            { line: lineNum, ch: i + 2 },
            { css: 'display: none' }
          ));
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i + match[0].length - 2 },
            { line: lineNum, ch: i + match[0].length },
            { css: 'display: none' }
          ));
          // Try to render KaTeX
          try {
            const rendered = katex.renderToString(match[1], { displayMode: true, throwOnError: false });
            const span = document.createElement('span');
            span.className = 'md-katex-display';
            span.innerHTML = rendered;
            span.style.cssText = 'display: block; margin: 12px 0; text-align: center;';
            // Hide the raw LaTeX and show rendered
            this._marks.push(this.cm.markText(
              { line: lineNum, ch: i + 2 },
              { line: lineNum, ch: i + match[0].length - 2 },
              { css: 'display: none' }
            ));
            this._marks.push(this.cm.setBookmark({ line: lineNum, ch: i + 2 }, { widget: span }));
          } catch (e) {}
        }
        i += match[0].length;
        continue;
      }

      // Inline LaTeX: $...$
      if ((match = line.substring(i).match(/^\$([^$\n]+)\$/))) {
        if (!isActive) {
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i },
            { line: lineNum, ch: i + 1 },
            { css: 'display: none' }
          ));
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i + match[0].length - 1 },
            { line: lineNum, ch: i + match[0].length },
            { css: 'display: none' }
          ));
          // Try to render KaTeX
          try {
            const rendered = katex.renderToString(match[1], { displayMode: false, throwOnError: false });
            const span = document.createElement('span');
            span.className = 'md-katex-inline';
            span.innerHTML = rendered;
            span.style.cssText = 'display: inline;';
            this._marks.push(this.cm.markText(
              { line: lineNum, ch: i + 1 },
              { line: lineNum, ch: i + match[0].length - 1 },
              { css: 'display: none' }
            ));
            this._marks.push(this.cm.setBookmark({ line: lineNum, ch: i + 1 }, { widget: span }));
          } catch (e) {}
        }
        i += match[0].length;
        continue;
      }

      // Question block: ?text?
      if ((match = line.substring(i).match(/^\?([^?\n]+)\?/))) {
        if (!isActive) {
          // Hide the ? delimiters
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i },
            { line: lineNum, ch: i + 1 },
            { css: 'display: none' }
          ));
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i + match[0].length - 1 },
            { line: lineNum, ch: i + match[0].length },
            { css: 'display: none' }
          ));
          // Apply question block styling
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i },
            { line: lineNum, ch: i + match[0].length },
            { className: 'cm-question-block' }
          ));
          // Insert a ? badge widget before the text
          const badge = document.createElement('span');
          badge.textContent = '?';
          badge.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: var(--primary); color: #FFFFFF; border-radius: 50%; font-size: 12px; font-weight: 700; margin-right: 6px; vertical-align: middle;';
          this._marks.push(this.cm.setBookmark({ line: lineNum, ch: i + 1 }, { widget: badge }));
        }
        i += match[0].length;
        continue;
      }

      // Link: [text](url)
      if ((match = line.substring(i).match(/^\[([^\]]+)\]\(([^)]+)\)/))) {
        if (!isActive) {
          // Hide [ and ](url)
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i },
            { line: lineNum, ch: i + 1 },
            { css: 'display: none' }
          ));
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i + 1 + match[1].length },
            { line: lineNum, ch: i + match[0].length },
            { css: 'display: none' }
          ));
          // Style the link text
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i + 1 },
            { line: lineNum, ch: i + 1 + match[1].length },
            { className: 'cm-link' }
          ));
        }
        i += match[0].length;
        continue;
      }

      // Strikethrough: ~~text~~
      if ((match = line.substring(i).match(/^~~(.+?)~~/))) {
        if (!isActive) {
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i },
            { line: lineNum, ch: i + 2 },
            { css: 'display: none' }
          ));
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i + match[0].length - 2 },
            { line: lineNum, ch: i + match[0].length },
            { css: 'display: none' }
          ));
          this._marks.push(this.cm.markText(
            { line: lineNum, ch: i + 2 },
            { line: lineNum, ch: i + match[0].length - 2 },
            { className: 'cm-strikethrough' }
          ));
        }
        i += match[0].length;
        continue;
      }

      i++;
    }
  }

  /**
   * Scroll the cursor into view with extra padding so the line isn't clipped.
   */
  _scrollCursorIntoView() {
    if (!this.cm) return;
    const cursor = this.cm.getCursor();
    const coords = this.cm.charCoords({ line: cursor.line, ch: cursor.ch }, 'local');
    const wrapper = this.cm.getWrapperElement();
    const scroller = wrapper.querySelector('.CodeMirror-scroll');
    if (!scroller) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const cursorTop = coords.top;
    const cursorBottom = coords.bottom;
    const scrollTop = scroller.scrollTop;
    const visibleTop = scrollTop;
    const visibleBottom = scrollTop + scrollerRect.height;

    // Extra padding so the line isn't clipped (40px = roughly 2 lines)
    const padding = 60;

    if (cursorBottom + padding > visibleBottom) {
      // Cursor is below visible area — scroll down
      scroller.scrollTop = cursorBottom - scrollerRect.height + padding;
    } else if (cursorTop - padding < visibleTop) {
      // Cursor is above visible area — scroll up
      scroller.scrollTop = cursorTop - padding;
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
