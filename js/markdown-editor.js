/**
 * Socra Markdown Editor - CodeMirror 6 live-preview markdown editor.
 *
 * This keeps markdown as the source of truth and uses decorations to hide or
 * replace syntax only outside the active line/block, matching Obsidian-style
 * Live Preview behavior.
 */
(function () {
  'use strict';

  const CM_VERSION = '6.7.1';
  const VIEW_VERSION = '6.36.8';
  const COMMANDS_VERSION = '6.8.1';
  const LANGUAGE_VERSION = '6.11.0';
  const MARKDOWN_VERSION = '6.3.3';
  const LANGUAGE_DATA_VERSION = '6.5.1';

  const moduleUrls = {
    state: `https://esm.sh/@codemirror/state@${CM_VERSION}`,
    view: `https://esm.sh/@codemirror/view@${VIEW_VERSION}`,
    commands: `https://esm.sh/@codemirror/commands@${COMMANDS_VERSION}`,
    language: `https://esm.sh/@codemirror/language@${LANGUAGE_VERSION}`,
    markdown: `https://esm.sh/@codemirror/lang-markdown@${MARKDOWN_VERSION}`,
    languageData: `https://esm.sh/@codemirror/language-data@${LANGUAGE_DATA_VERSION}`,
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

  function isRangeActive(state, from, to) {
    return state.selection.ranges.some(range => {
      if (range.empty) return range.from >= from && range.from <= to;
      return range.from <= to && range.to >= from;
    });
  }

  function renderKatex(tex, displayMode) {
    if (!window.katex) return escapeHtml(tex);
    try {
      return window.katex.renderToString(tex, { displayMode, throwOnError: false });
    } catch (error) {
      return escapeHtml(tex);
    }
  }

  class InlineWidgetBase {
    constructor(value) { this.value = value; }
    eq(other) { return other.value === this.value; }
    ignoreEvent() { return false; }
  }

  class BulletWidget extends InlineWidgetBase {
    toDOM() {
      const span = document.createElement('span');
      span.className = 'cm-live-list-marker';
      span.textContent = '\u2022 ';
      return span;
    }
  }

  class NumberWidget extends InlineWidgetBase {
    toDOM() {
      const span = document.createElement('span');
      span.className = 'cm-live-list-marker';
      span.textContent = `${this.value}. `;
      return span;
    }
  }

  class LatexInlineWidget extends InlineWidgetBase {
    toDOM() {
      const span = document.createElement('span');
      span.className = 'cm-live-latex-inline';
      span.innerHTML = renderKatex(this.value, false);
      return span;
    }
  }

  class LatexBlockWidget extends InlineWidgetBase {
    toDOM() {
      const div = document.createElement('div');
      div.className = 'cm-live-latex-block';
      div.innerHTML = renderKatex(this.value, true);
      return div;
    }
  }

  class QuestionWidget extends InlineWidgetBase {
    toDOM() {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cm-live-question-block';
      button.dataset.question = this.value;
      button.innerHTML = `<span class="cm-live-question-icon">?</span><span>${escapeHtml(this.value)}</span>`;
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => {
        if (window.sendMessage) window.sendMessage(this.value);
      });
      return button;
    }
  }

  class CodeBlockWidget extends InlineWidgetBase {
    constructor(language, code) {
      super(`${language}\n${code}`);
      this.language = language || '';
      this.code = code || '';
    }

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
        } catch (error) {
          codeEl.textContent = this.code;
        }
      }
      pre.appendChild(codeEl);
      wrap.appendChild(pre);
      return wrap;
    }
  }

  function addInlineFormatting(cm, add, line, text) {
    const lineStart = line.from;
    let match;

    const codeRe = /`([^`\n]+)`/g;
    while ((match = codeRe.exec(text))) {
      const from = lineStart + match.index;
      const contentFrom = from + 1;
      const contentTo = contentFrom + match[1].length;
      add(from, contentFrom, cm.Decoration.replace({ inclusive: false }));
      add(contentFrom, contentTo, cm.Decoration.mark({ class: 'cm-live-inline-code' }));
      add(contentTo, contentTo + 1, cm.Decoration.replace({ inclusive: false }));
    }

    const latexRe = /(^|[^\\$])\$([^$\n]+)\$/g;
    while ((match = latexRe.exec(text))) {
      const offset = match.index + match[1].length;
      const from = lineStart + offset;
      const to = from + match[2].length + 2;
      add(from, to, cm.Decoration.replace({ widget: new LatexInlineWidget(match[2]), inclusive: false }));
    }

    const strongRe = /\*\*([^*\n]+)\*\*/g;
    while ((match = strongRe.exec(text))) {
      const from = lineStart + match.index;
      const contentFrom = from + 2;
      const contentTo = contentFrom + match[1].length;
      add(from, contentFrom, cm.Decoration.replace({ inclusive: false }));
      add(contentFrom, contentTo, cm.Decoration.mark({ class: 'cm-live-bold' }));
      add(contentTo, contentTo + 2, cm.Decoration.replace({ inclusive: false }));
    }

    const italicRe = /(^|[^*])\*([^*\n]+)\*(?!\*)/g;
    while ((match = italicRe.exec(text))) {
      const offset = match.index + match[1].length;
      const from = lineStart + offset;
      const contentFrom = from + 1;
      const contentTo = contentFrom + match[2].length;
      add(from, contentFrom, cm.Decoration.replace({ inclusive: false }));
      add(contentFrom, contentTo, cm.Decoration.mark({ class: 'cm-live-italic' }));
      add(contentTo, contentTo + 1, cm.Decoration.replace({ inclusive: false }));
    }
  }

  function findFenceEnd(doc, startLine) {
    for (let n = startLine.number + 1; n <= doc.lines; n += 1) {
      const line = doc.line(n);
      if (/^\s*```\s*$/.test(line.text)) return line;
    }
    return null;
  }

  function findMathEnd(doc, startLine) {
    for (let n = startLine.number + 1; n <= doc.lines; n += 1) {
      const line = doc.line(n);
      if (/^\s*\$\$\s*$/.test(line.text)) return line;
    }
    return null;
  }

  function buildDecorations(cm, view) {
    const ranges = [];
    const add = (from, to, decoration) => ranges.push({ from, to, decoration });
    const { state } = view;
    const doc = state.doc;

    for (let lineNo = 1; lineNo <= doc.lines; lineNo += 1) {
      const line = doc.line(lineNo);
      const text = line.text;

      const fence = text.match(/^\s*```\s*([^`]*)\s*$/);
      if (fence) {
        const endLine = findFenceEnd(doc, line);
        if (endLine) {
          const active = isRangeActive(state, line.from, endLine.to);
          if (!active) {
            const codeFrom = line.to + 1;
            const codeTo = Math.max(codeFrom, endLine.from - 1);
            const code = doc.sliceString(codeFrom, codeTo);
            add(line.from, endLine.to, cm.Decoration.replace({
              widget: new CodeBlockWidget(fence[1].trim(), code),
              block: true,
            }));
          }
          lineNo = endLine.number;
          continue;
        }
      }

      if (/^\s*\$\$\s*$/.test(text)) {
        const endLine = findMathEnd(doc, line);
        if (endLine) {
          const active = isRangeActive(state, line.from, endLine.to);
          if (!active) {
            const texFrom = line.to + 1;
            const texTo = Math.max(texFrom, endLine.from - 1);
            add(line.from, endLine.to, cm.Decoration.replace({
              widget: new LatexBlockWidget(doc.sliceString(texFrom, texTo)),
              block: true,
            }));
          }
          lineNo = endLine.number;
          continue;
        }
      }

      const headingForLine = text.match(/^(#{1,6})\s+/);
      if (headingForLine) {
        add(line.from, line.from, cm.Decoration.line({ class: `cm-live-heading-line cm-live-h${headingForLine[1].length}` }));
      }

      const activeLine = isRangeActive(state, line.from, line.to);
      if (activeLine) continue;

      const question = text.match(/^\?([^?\n]+)\?$/);
      if (question) {
        add(line.from, line.to, cm.Decoration.replace({
          widget: new QuestionWidget(question[1].trim()),
          block: true,
        }));
        continue;
      }

      const heading = headingForLine;
      if (heading) {
        add(line.from, line.from + heading[0].length, cm.Decoration.replace({ inclusive: false }));
      }

      const bullet = text.match(/^(\s*)[-*+]\s+/);
      if (bullet) {
        const from = line.from + bullet[1].length;
        add(from, line.from + bullet[0].length, cm.Decoration.replace({ widget: new BulletWidget('bullet'), inclusive: false }));
      }

      const ordered = text.match(/^(\s*)(\d+)[.)]\s+/);
      if (ordered) {
        const from = line.from + ordered[1].length;
        add(from, line.from + ordered[0].length, cm.Decoration.replace({ widget: new NumberWidget(ordered[2]), inclusive: false }));
      }

      addInlineFormatting(cm, add, line, text);
    }

    const builder = new cm.RangeSetBuilder();
    ranges.sort((a, b) => a.from - b.from || a.to - b.to || (a.decoration.startSide || 0) - (b.decoration.startSide || 0));
    for (const range of ranges) builder.add(range.from, range.to, range.decoration);
    return builder.finish();
  }

  function livePreviewExtension(cm) {
    return cm.ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = buildDecorations(cm, view); }
      update(update) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(cm, update.view);
        }
      }
    }, {
      decorations: plugin => plugin.decorations,
    });
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
    constructor(textarea, previewEl, options = {}) {
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