/**
 * Socra Markdown Editor - CodeMirror 6 Obsidian-style live preview.
 *
 * Feature list:
 * - Markdown source is the saved document.
 * - Active line/block shows markdown syntax for editing.
 * - Inactive lines hide markdown markers and render headings, lists, bold,
 *   italic, inline code, inline math, display math, code blocks, and Socra
 *   question blocks.
 * - `?question?` renders as a clickable block that sends the question to AI.
 */
(function () {
  'use strict';

  const versions = {
    state: '6.7.1',
    view: '6.36.8',
    commands: '6.8.1',
    language: '6.11.0',
    markdown: '6.3.3',
    languageData: '6.5.1',
  };

  const moduleUrls = {
    state: `https://esm.sh/@codemirror/state@${versions.state}`,
    view: `https://esm.sh/@codemirror/view@${versions.view}`,
    commands: `https://esm.sh/@codemirror/commands@${versions.commands}`,
    language: `https://esm.sh/@codemirror/language@${versions.language}`,
    markdown: `https://esm.sh/@codemirror/lang-markdown@${versions.markdown}`,
    languageData: `https://esm.sh/@codemirror/language-data@${versions.languageData}`,
  };

  let cmPromise = null;
  function loadCodeMirror() {
    if (!cmPromise) {
      cmPromise = Promise.all([
        import(moduleUrls.state),
        import(moduleUrls.view),
        import(moduleUrls.commands),
        import(moduleUrls.language),
        import(moduleUrls.markdown),
        import(moduleUrls.languageData),
      ]).then(([state, view, commands, language, markdown, languageData]) => ({
        ...state,
        ...view,
        ...commands,
        ...language,
        ...markdown,
        ...languageData,
      }));
    }
    return cmPromise;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function renderKatex(tex, displayMode) {
    if (!window.katex) return escapeHtml(tex);
    try {
      return window.katex.renderToString(tex, { displayMode, throwOnError: false });
    } catch (_error) {
      return escapeHtml(tex);
    }
  }

  function selectionTouches(state, from, to) {
    return state.selection.ranges.some(range => {
      if (range.empty) return range.from >= from && range.from <= to;
      return range.from <= to && range.to >= from;
    });
  }

  function wholeLineActive(state, line) {
    return selectionTouches(state, line.from, line.to);
  }

  function findClosingLine(doc, startLine, re) {
    for (let n = startLine.number + 1; n <= doc.lines; n += 1) {
      const line = doc.line(n);
      if (re.test(line.text)) return line;
    }
    return null;
  }

  function isEscaped(text, index) {
    let slashCount = 0;
    for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) slashCount += 1;
    return slashCount % 2 === 1;
  }

  function makeWidgets(cm) {
    class TextWidget extends cm.WidgetType {
      constructor(value, className) {
        super();
        this.value = value;
        this.className = className;
      }
      eq(other) { return other.value === this.value && other.className === this.className; }
      toDOM() {
        const span = document.createElement('span');
        span.className = this.className;
        span.textContent = this.value;
        return span;
      }
      ignoreEvent() { return false; }
    }

    class LatexInlineWidget extends cm.WidgetType {
      constructor(tex) { super(); this.tex = tex; }
      eq(other) { return other.tex === this.tex; }
      toDOM() {
        const span = document.createElement('span');
        span.className = 'cm-live-latex-inline';
        span.innerHTML = renderKatex(this.tex, false);
        return span;
      }
      ignoreEvent() { return false; }
    }

    class LatexBlockWidget extends cm.WidgetType {
      constructor(tex) { super(); this.tex = tex; }
      eq(other) { return other.tex === this.tex; }
      toDOM() {
        const div = document.createElement('div');
        div.className = 'cm-live-latex-block';
        div.innerHTML = renderKatex(this.tex, true);
        return div;
      }
      ignoreEvent() { return false; }
    }

    class QuestionWidget extends cm.WidgetType {
      constructor(question) { super(); this.question = question; }
      eq(other) { return other.question === this.question; }
      toDOM() {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cm-live-question-block';
        button.dataset.question = this.question;
        button.innerHTML = `<span class="cm-live-question-icon">?</span><span>${escapeHtml(this.question)}</span>`;
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', () => {
          if (window.sendMessage) window.sendMessage(this.question);
        });
        return button;
      }
      ignoreEvent() { return false; }
    }

    class CodeBlockWidget extends cm.WidgetType {
      constructor(language, code) {
        super();
        this.language = language || '';
        this.code = code || '';
      }
      eq(other) { return other.language === this.language && other.code === this.code; }
      toDOM() {
        const wrap = document.createElement('div');
        wrap.className = 'cm-live-code-block';
        if (this.language) {
          const label = document.createElement('div');
          label.className = 'cm-live-code-lang';
          label.textContent = this.language;
          wrap.appendChild(label);
        }
        const pre = document.createElement('pre');
        const codeEl = document.createElement('code');
        codeEl.textContent = this.code;
        if (this.language) codeEl.className = `language-${this.language}`;
        if (window.hljs) {
          try {
            if (this.language && window.hljs.getLanguage(this.language)) {
              codeEl.innerHTML = window.hljs.highlight(this.code, { language: this.language }).value;
            } else {
              codeEl.innerHTML = window.hljs.highlightAuto(this.code).value;
            }
            codeEl.classList.add('hljs');
          } catch (_error) {
            codeEl.textContent = this.code;
          }
        }
        pre.appendChild(codeEl);
        wrap.appendChild(pre);
        return wrap;
      }
      ignoreEvent() { return false; }
    }

    return { TextWidget, LatexInlineWidget, LatexBlockWidget, QuestionWidget, CodeBlockWidget };
  }

  function addRange(ranges, decoration, from, to = from) {
    if (from < 0 || to < from) return;
    ranges.push(decoration.range(from, to));
  }

  function addInlinePreview(cm, widgets, ranges, line, text) {
    const protectedRanges = [];
    const overlapsProtected = (from, to) => protectedRanges.some(range => from < range.to && to > range.from);
    const protect = (from, to) => protectedRanges.push({ from, to });

    const lineStart = line.from;
    let i = 0;
    while (i < text.length) {
      if (text[i] === '`' && !isEscaped(text, i)) {
        const end = text.indexOf('`', i + 1);
        if (end > i + 1) {
          const from = lineStart + i;
          const to = lineStart + end + 1;
          addRange(ranges, cm.Decoration.replace({ inclusive: false }), from, from + 1);
          addRange(ranges, cm.Decoration.mark({ class: 'cm-live-inline-code' }), from + 1, to - 1);
          addRange(ranges, cm.Decoration.replace({ inclusive: false }), to - 1, to);
          protect(from, to);
          i = end + 1;
          continue;
        }
      }
      if (text[i] === '$' && text[i + 1] !== '$' && !isEscaped(text, i)) {
        let end = i + 1;
        while (end < text.length) {
          if (text[end] === '$' && text[end + 1] !== '$' && !isEscaped(text, end)) break;
          end += 1;
        }
        if (end < text.length && end > i + 1) {
          const from = lineStart + i;
          const to = lineStart + end + 1;
          addRange(ranges, cm.Decoration.replace({ widget: new widgets.LatexInlineWidget(text.slice(i + 1, end)), inclusive: false }), from, to);
          protect(from, to);
          i = end + 1;
          continue;
        }
      }
      i += 1;
    }

    const strongRe = /\*\*([^*\n]+)\*\*/g;
    let match;
    while ((match = strongRe.exec(text))) {
      const from = lineStart + match.index;
      const to = from + match[0].length;
      if (overlapsProtected(from, to)) continue;
      addRange(ranges, cm.Decoration.replace({ inclusive: false }), from, from + 2);
      addRange(ranges, cm.Decoration.mark({ class: 'cm-live-bold' }), from + 2, to - 2);
      addRange(ranges, cm.Decoration.replace({ inclusive: false }), to - 2, to);
      protect(from, to);
    }

    const italicRe = /(^|[^*])\*([^*\n]+)\*(?!\*)/g;
    while ((match = italicRe.exec(text))) {
      const offset = match.index + match[1].length;
      const from = lineStart + offset;
      const to = from + match[2].length + 2;
      if (overlapsProtected(from, to)) continue;
      addRange(ranges, cm.Decoration.replace({ inclusive: false }), from, from + 1);
      addRange(ranges, cm.Decoration.mark({ class: 'cm-live-italic' }), from + 1, to - 1);
      addRange(ranges, cm.Decoration.replace({ inclusive: false }), to - 1, to);
      protect(from, to);
    }
  }

  function buildLivePreview(cm, widgets, state) {
    const ranges = [];
    const doc = state.doc;

    for (let lineNo = 1; lineNo <= doc.lines; lineNo += 1) {
      const line = doc.line(lineNo);
      const text = line.text;

      const codeFence = text.match(/^\s*```\s*([^`]*)\s*$/);
      if (codeFence) {
        const endLine = findClosingLine(doc, line, /^\s*```\s*$/);
        if (endLine) {
          const active = selectionTouches(state, line.from, endLine.to);
          if (!active) {
            const code = doc.sliceString(line.to + 1, Math.max(line.to + 1, endLine.from - 1));
            addRange(ranges, cm.Decoration.replace({
              widget: new widgets.CodeBlockWidget(codeFence[1].trim(), code),
              block: true,
            }), line.from, endLine.to);
          }
          lineNo = endLine.number;
          continue;
        }
      }

      if (/^\s*\$\$\s*$/.test(text)) {
        const endLine = findClosingLine(doc, line, /^\s*\$\$\s*$/);
        if (endLine) {
          const active = selectionTouches(state, line.from, endLine.to);
          if (!active) {
            const tex = doc.sliceString(line.to + 1, Math.max(line.to + 1, endLine.from - 1));
            addRange(ranges, cm.Decoration.replace({
              widget: new widgets.LatexBlockWidget(tex),
              block: true,
            }), line.from, endLine.to);
          }
          lineNo = endLine.number;
          continue;
        }
      }

      const heading = text.match(/^(#{1,6})\s+/);
      if (heading) {
        addRange(ranges, cm.Decoration.line({ class: `cm-live-heading-line cm-live-h${heading[1].length}` }), line.from);
      }

      if (wholeLineActive(state, line)) continue;

      const question = text.match(/^\s*\?([^?\n]+)\?\s*$/);
      if (question) {
        addRange(ranges, cm.Decoration.replace({
          widget: new widgets.QuestionWidget(question[1].trim()),
          block: true,
        }), line.from, line.to);
        continue;
      }

      if (heading) {
        addRange(ranges, cm.Decoration.replace({ inclusive: false }), line.from, line.from + heading[0].length);
      }

      const bullet = text.match(/^(\s*)[-*+]\s+/);
      if (bullet) {
        const from = line.from + bullet[1].length;
        addRange(ranges, cm.Decoration.replace({
          widget: new widgets.TextWidget('\u2022 ', 'cm-live-list-marker'),
          inclusive: false,
        }), from, line.from + bullet[0].length);
      }

      const ordered = text.match(/^(\s*)(\d+)[.)]\s+/);
      if (ordered) {
        const from = line.from + ordered[1].length;
        addRange(ranges, cm.Decoration.replace({
          widget: new widgets.TextWidget(`${ordered[2]}. `, 'cm-live-list-marker'),
          inclusive: false,
        }), from, line.from + ordered[0].length);
      }

      addInlinePreview(cm, widgets, ranges, line, text);
    }

    return cm.Decoration.set(ranges, true);
  }

  function livePreviewExtension(cm) {
    const widgets = makeWidgets(cm);
    const field = cm.StateField.define({
      create(state) {
        return buildLivePreview(cm, widgets, state);
      },
      update(_value, transaction) {
        return buildLivePreview(cm, widgets, transaction.state);
      },
      provide: f => cm.EditorView.decorations.from(f),
    });
    return field;
  }

  function listContinuation(cm) {
    return cm.keymap.of([{
      key: 'Enter',
      run(view) {
        const range = view.state.selection.main;
        if (!range.empty) return false;
        const line = view.state.doc.lineAt(range.from);
        const before = view.state.doc.sliceString(line.from, range.from);
        const bullet = before.match(/^(\s*)([-*+])\s+(.*)$/);
        if (bullet) {
          if (!bullet[3].trim()) {
            view.dispatch({
              changes: { from: line.from, to: range.from, insert: '' },
              selection: { anchor: line.from },
              scrollIntoView: true,
              userEvent: 'input',
            });
            return true;
          }
          const prefix = `${bullet[1]}${bullet[2]} `;
          view.dispatch({
            changes: { from: range.from, insert: `\n${prefix}` },
            selection: { anchor: range.from + prefix.length + 1 },
            scrollIntoView: true,
            userEvent: 'input',
          });
          return true;
        }

        const ordered = before.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
        if (ordered) {
          if (!ordered[4].trim()) {
            view.dispatch({
              changes: { from: line.from, to: range.from, insert: '' },
              selection: { anchor: line.from },
              scrollIntoView: true,
              userEvent: 'input',
            });
            return true;
          }
          const next = Number(ordered[2]) + 1;
          const prefix = `${ordered[1]}${next}${ordered[3]} `;
          view.dispatch({
            changes: { from: range.from, insert: `\n${prefix}` },
            selection: { anchor: range.from + prefix.length + 1 },
            scrollIntoView: true,
            userEvent: 'input',
          });
          return true;
        }
        return false;
      },
    }]);
  }

  function socraTheme(cm) {
    return cm.EditorView.theme({
      '&': { height: '100%', backgroundColor: 'var(--canvas)', color: 'var(--ink)' },
      '.cm-scroller': { fontFamily: 'var(--font)', lineHeight: '1.7', overflow: 'auto' },
      '.cm-content': { minHeight: '100%', padding: '24px 32px', caretColor: 'var(--primary)' },
      '.cm-focused': { outline: 'none' },
      '.cm-selectionBackground': { backgroundColor: 'var(--primary-10) !important' },
      '.cm-line': { padding: '0' },
    });
  }

  class MarkdownEditor {
    constructor(_textarea, _previewEl, options = {}) {
      this.rawMarkdown = '';
      this.autoSaveCallback = options.autoSave || null;
      this.autoSaveDelay = options.autoSaveDelay || 1500;
      this.autoSaveTimer = null;
      this.lastSavedContent = '';
      this.root = null;
      this.editorHost = null;
      this.view = null;
      this.cm = null;
      this._suppressAutosave = false;
      this.ready = this._init();
    }

    async _init() {
      const editorSplit = document.querySelector('.editor-split');
      if (!editorSplit) return;
      editorSplit.innerHTML = '';

      this.root = document.createElement('div');
      this.root.className = 'live-editor-wrapper cm-live-editor-wrapper';
      editorSplit.appendChild(this.root);

      this.editorHost = document.createElement('div');
      this.editorHost.className = 'live-editor cm-live-editor';
      this.root.appendChild(this.editorHost);

      this.cm = await loadCodeMirror();
      const cm = this.cm;
      this.view = new cm.EditorView({
        parent: this.editorHost,
        doc: this.rawMarkdown,
        extensions: [
          cm.highlightSpecialChars(),
          cm.history(),
          cm.drawSelection(),
          cm.dropCursor(),
          cm.indentOnInput(),
          cm.syntaxHighlighting(cm.defaultHighlightStyle, { fallback: true }),
          cm.markdown({ codeLanguages: cm.languages }),
          listContinuation(cm),
          cm.keymap.of([
            ...cm.defaultKeymap,
            ...cm.historyKeymap,
            cm.indentWithTab,
          ]),
          cm.EditorView.lineWrapping,
          socraTheme(cm),
          livePreviewExtension(cm),
          cm.EditorView.updateListener.of(update => {
            if (!update.docChanged || this._suppressAutosave) return;
            this.rawMarkdown = update.state.doc.toString();
            this._scheduleAutoSave();
          }),
        ],
      });
      this.lastSavedContent = this.rawMarkdown;
    }

    _focusEditor() {
      if (this.view) this.view.focus();
      return this.view;
    }

    _replaceSelection(text) {
      const view = this._focusEditor();
      if (!view) return;
      const changes = view.state.changeByRange(range => ({
        changes: { from: range.from, to: range.to, insert: text },
        range: this.cm.EditorSelection.cursor(range.from + text.length),
      }));
      view.dispatch(view.state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    }

    _wrapSelection(open, close) {
      const view = this._focusEditor();
      if (!view) return;
      const changes = view.state.changeByRange(range => {
        const selected = view.state.doc.sliceString(range.from, range.to);
        const insert = open + selected + close;
        return {
          changes: { from: range.from, to: range.to, insert },
          range: this.cm.EditorSelection.range(range.from + open.length, range.from + open.length + selected.length),
        };
      });
      view.dispatch(view.state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    }

    _wrapBlock(open, close) {
      const view = this._focusEditor();
      if (!view) return;
      const range = view.state.selection.main;
      const selected = view.state.doc.sliceString(range.from, range.to);
      const insert = selected ? `${open}\n${selected}\n${close}` : `${open}\n\n${close}`;
      const cursor = selected ? range.from + insert.length : range.from + open.length + 1;
      view.dispatch({
        changes: { from: range.from, to: range.to, insert },
        selection: { anchor: cursor },
        scrollIntoView: true,
        userEvent: 'input',
      });
    }

    _insertLinePrefix(prefix) {
      const view = this._focusEditor();
      if (!view) return;
      const range = view.state.selection.main;
      const line = view.state.doc.lineAt(range.from);
      view.dispatch({
        changes: { from: line.from, insert: prefix },
        selection: { anchor: range.from + prefix.length },
        scrollIntoView: true,
        userEvent: 'input',
      });
    }

    async setContent(content) {
      this.rawMarkdown = content || '';
      this._suppressAutosave = true;
      await this.ready;
      if (this.view) {
        this.view.dispatch({
          changes: { from: 0, to: this.view.state.doc.length, insert: this.rawMarkdown },
          selection: { anchor: 0 },
        });
      }
      this._suppressAutosave = false;
      this.lastSavedContent = this.rawMarkdown;
    }

    getContent() {
      return this.view ? this.view.state.doc.toString() : this.rawMarkdown;
    }

    insertFormatting(format) {
      this.ready.then(() => {
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
      });
    }

    insertHeading(level) {
      this.ready.then(() => this._insertLinePrefix('#'.repeat(level) + ' '));
    }

    _scheduleAutoSave() {
      if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = setTimeout(() => {
        const content = this.getContent();
        if (this.autoSaveCallback && content !== this.lastSavedContent) {
          this.lastSavedContent = content;
          this.autoSaveCallback(content);
        }
      }, this.autoSaveDelay);
    }
  }

  window.MarkdownEditor = MarkdownEditor;
})();