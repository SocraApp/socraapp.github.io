/**
 * Socra Markdown Editor - CodeMirror 6 live markdown editor.
 *
 * Loaded from CDN at runtime so the site remains vanilla HTML/CSS/JS.
 */
(function () {
  'use strict';

  const CM6_CDN = 'https://esm.sh';
  let cm6ModulesPromise = null;

  function loadCodeMirror6() {
    if (!cm6ModulesPromise) {
      cm6ModulesPromise = Promise.all([
        import(`${CM6_CDN}/@codemirror/state@6.5.2`),
        import(`${CM6_CDN}/@codemirror/view@6.38.1`),
        import(`${CM6_CDN}/@codemirror/commands@6.8.1`),
        import(`${CM6_CDN}/@codemirror/lang-markdown@6.3.4`),
        import(`${CM6_CDN}/@codemirror/language-data@6.5.1`),
        import(`${CM6_CDN}/@codemirror/language@6.11.3`),
      ]).then(([state, view, commands, markdown, languageData, language]) => ({
        ...state,
        ...view,
        ...commands,
        ...markdown,
        ...languageData,
        ...language,
      }));
    }
    return cm6ModulesPromise;
  }

  class MarkdownEditor {
    constructor(textarea, previewEl, options = {}) {
      this.rawMarkdown = '';
      this.autoSaveCallback = options.autoSave || null;
      this.autoSaveDelay = options.autoSaveDelay || 1500;
      this.autoSaveTimer = null;
      this.lastSavedContent = '';
      this.view = null;
      this.cm = null;
      this.pendingContent = '';
      this.ready = this._init();
    }

    async _init() {
      const editorSplit = document.querySelector('.editor-split');
      if (!editorSplit) return;
      editorSplit.innerHTML = '';

      const wrapper = document.createElement('div');
      wrapper.className = 'live-editor-wrapper cm6-live-editor-wrapper';
      editorSplit.appendChild(wrapper);

      const editorEl = document.createElement('div');
      editorEl.className = 'live-editor cm6-live-editor';
      wrapper.appendChild(editorEl);

      try {
        const cm = await loadCodeMirror6();
        this._cm = cm;
        this._createEditor(editorEl, cm);
      } catch (error) {
        console.error('CodeMirror 6 failed to load', error);
        editorEl.innerHTML = '<div class="editor-load-error">Unable to load the editor. Check your connection and refresh.</div>';
      }
    }

    _createEditor(parent, cm) {
      const editor = this;
      const livePreviewTheme = cm.EditorView.theme({
        '&': {
          height: '100%',
          color: 'var(--ink)',
          backgroundColor: 'var(--canvas)',
          fontFamily: 'var(--font)',
          fontSize: '16px',
        },
        '.cm-scroller': {
          fontFamily: 'var(--font)',
          lineHeight: '1.6',
          overflow: 'auto',
        },
        '.cm-content': {
          minHeight: '100%',
          padding: '24px 32px',
          caretColor: 'var(--primary)',
        },
        '.cm-focused': { outline: 'none' },
        '.cm-selectionBackground': { backgroundColor: 'var(--primary-10) !important' },
        '.cm-cursor': { borderLeftColor: 'var(--primary)', borderLeftWidth: '2px' },
      });

      const updateListener = cm.EditorView.updateListener.of(update => {
        if (!update.docChanged) return;
        this.rawMarkdown = update.state.doc.toString();
        this._scheduleAutoSave();
      });

      const questionClick = cm.EditorView.domEventHandlers({
        mousedown(event, view) {
          const target = event.target.closest?.('.cm6-question-line, .cm6-question-badge, .cm6-question-content');
          if (!target) return false;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos == null) return false;
          const line = view.state.doc.lineAt(pos);
          if (editor._lineIsActive(view.state, line)) return false;
          const question = editor._questionForLine(line.text);
          if (!question) return false;
          event.preventDefault();
          if (window.sendMessage) window.sendMessage(question);
          return true;
        },
      });

      const state = cm.EditorState.create({
        doc: this.pendingContent || this.rawMarkdown || '',
        extensions: [
          cm.highlightSpecialChars(),
          cm.history(),
          cm.drawSelection(),
          cm.dropCursor(),
          cm.indentOnInput(),
          cm.bracketMatching(),
          cm.markdown({ codeLanguages: cm.languages }),
          cm.syntaxHighlighting(cm.defaultHighlightStyle, { fallback: true }),
          cm.EditorView.lineWrapping,
          livePreviewTheme,
          this._livePreviewExtension(cm),
          updateListener,
          questionClick,
          cm.Prec.high(cm.keymap.of([
            { key: 'Mod-b', run: () => this._wrapSelection('**', '**') },
            { key: 'Mod-i', run: () => this._wrapSelection('*', '*') },
            { key: 'Mod-`', run: () => this._wrapSelection('`', '`') },
            { key: 'Enter', run: view => this._handleEnter(view) },
            ...cm.defaultKeymap,
            ...cm.historyKeymap,
          ])),
        ],
      });

      this.view = new cm.EditorView({ state, parent });
      this.cm = this._compatFacade();
      this.rawMarkdown = this.view.state.doc.toString();
      this.lastSavedContent = this.rawMarkdown;
    }

    _livePreviewExtension(cm) {
      const editor = this;
      const InlineLatex = class extends cm.WidgetType {
        constructor(tex, displayMode) {
          super();
          this.tex = tex;
          this.displayMode = displayMode;
        }
        eq(other) {
          return other.tex === this.tex && other.displayMode === this.displayMode;
        }
        toDOM() {
          const span = document.createElement('span');
          span.className = this.displayMode ? 'md-katex-display' : 'md-katex-inline';
          if (window.katex) {
            try {
              span.innerHTML = katex.renderToString(this.tex.trim(), { displayMode: this.displayMode, throwOnError: false });
            } catch (error) {
              span.textContent = this.tex;
            }
          } else {
            span.textContent = this.tex;
          }
          return span;
        }
      };
      const QuestionBadge = class extends cm.WidgetType {
        toDOM() {
          const span = document.createElement('span');
          span.className = 'cm6-question-badge';
          span.textContent = '?';
          return span;
        }
      };
      const ListMarker = class extends cm.WidgetType {
        constructor(text, ordered) {
          super();
          this.text = text;
          this.ordered = ordered;
        }
        eq(other) {
          return other.text === this.text && other.ordered === this.ordered;
        }
        toDOM() {
          const span = document.createElement('span');
          span.className = this.ordered ? 'cm6-list-marker cm6-ordered-marker' : 'cm6-list-marker cm6-bullet-marker';
          span.textContent = this.ordered ? this.text.replace(/\.$/, '.') : '\u2022';
          return span;
        }
      };

      return cm.ViewPlugin.fromClass(class {
        constructor(view) {
          this.decorations = this.build(view);
        }
        update(update) {
          if (update.docChanged || update.viewportChanged || update.selectionSet) {
            this.decorations = this.build(update.view);
          }
        }
        build(view) {
          const builder = new cm.RangeSetBuilder();
          const doc = view.state.doc;
          const codeBlocks = editor._findCodeBlocks(doc);

          for (const { from, to } of view.visibleRanges) {
            let pos = from;
            while (pos <= to) {
              const line = doc.lineAt(pos);
              const text = line.text;
              const active = editor._lineIsActive(view.state, line);
              const codeBlock = codeBlocks.find(block => line.number >= block.fromLine && line.number <= block.toLine);

              if (codeBlock) {
                builder.add(line.from, line.from, cm.Decoration.line({ class: 'cm6-code-line' }));
                const isFence = line.number === codeBlock.fromLine || line.number === codeBlock.toLine;
                if (isFence && !active) {
                  builder.add(line.from, line.to, cm.Decoration.mark({ class: 'cm6-hidden-syntax' }));
                  if (line.number === codeBlock.fromLine && codeBlock.lang) {
                    builder.add(line.from, line.from, cm.Decoration.widget({
                      widget: new class extends cm.WidgetType {
                        toDOM() {
                          const label = document.createElement('span');
                          label.className = 'cm6-code-lang-badge';
                          label.textContent = codeBlock.lang;
                          return label;
                        }
                      }(),
                      side: 1,
                    }));
                  }
                }
                pos = line.to + 1;
                continue;
              }

              editor._decorateLine(cm, builder, view.state, line, text, active, QuestionBadge, ListMarker, InlineLatex);
              pos = line.to + 1;
            }
          }

          return builder.finish();
        }
      }, {
        decorations: plugin => plugin.decorations,
      });
    }

    _decorateLine(cm, builder, state, line, text, active, QuestionBadge, ListMarker, InlineLatex) {
      const heading = text.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        const prefixLength = heading[1].length + 1;
        if (!active) builder.add(line.from, line.from + prefixLength, cm.Decoration.mark({ class: 'cm6-hidden-syntax' }));
        builder.add(line.from + (active ? 0 : prefixLength), line.to, cm.Decoration.mark({ class: `cm-header cm-header-${heading[1].length}` }));
        this._decorateInline(cm, builder, state, line, text, active, InlineLatex);
        return;
      }

      const list = text.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
      if (list) {
        const prefixLength = list[1].length + list[2].length + 1;
        const ordered = /\d+\./.test(list[2]);
        if (!active) {
          builder.add(line.from, line.from + prefixLength, cm.Decoration.mark({ class: 'cm6-hidden-syntax' }));
          builder.add(line.from + list[1].length, line.from + list[1].length, cm.Decoration.widget({
            widget: new ListMarker(list[2], ordered),
            side: 1,
          }));
        }
        this._decorateInline(cm, builder, state, line, text, active, InlineLatex);
        return;
      }

      const quote = text.match(/^>\s+(.*)$/);
      if (quote) {
        if (!active) builder.add(line.from, line.from + 2, cm.Decoration.mark({ class: 'cm6-hidden-syntax' }));
        builder.add(line.from + (active ? 0 : 2), line.to, cm.Decoration.mark({ class: 'cm-quote' }));
        this._decorateInline(cm, builder, state, line, text, active, InlineLatex);
        return;
      }

      const displayLatex = text.match(/^\$\$([^$]+)\$\$$/);
      if (displayLatex && !active) {
        builder.add(line.from, line.to, cm.Decoration.mark({ class: 'cm6-hidden-syntax' }));
        builder.add(line.from, line.from, cm.Decoration.widget({ widget: new InlineLatex(displayLatex[1], true), side: 1 }));
        return;
      }

      const question = text.match(/^\?([^?\n]+)\?$/);
      if (question && !active) {
        builder.add(line.from, line.from, cm.Decoration.line({ class: 'cm6-question-line' }));
        builder.add(line.from, line.from + 1, cm.Decoration.mark({ class: 'cm6-hidden-syntax' }));
        builder.add(line.to - 1, line.to, cm.Decoration.mark({ class: 'cm6-hidden-syntax' }));
        builder.add(line.from, line.from, cm.Decoration.widget({ widget: new QuestionBadge(), side: 1 }));
        builder.add(line.from + 1, line.to - 1, cm.Decoration.mark({ class: 'cm-question-content cm6-question-content' }));
        return;
      }

      this._decorateInline(cm, builder, state, line, text, active, InlineLatex);
    }

    _decorateInline(cm, builder, state, line, text, lineActive, InlineLatex) {
      const token = /(\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|`[^`\n]+`|\$[^$\n]+\$|(^|[^\w])(\*|_)([^\s*_][^*_]*?[^\s*_])\3)/g;
      let match;
      while ((match = token.exec(text))) {
        let startOffset = match.index;
        let raw = match[0];
        let open = 1;
        let close = 1;
        let className = 'cm-em';
        let latex = false;

        if (raw.startsWith('***')) {
          open = 3;
          close = 3;
          className = 'cm-strong cm-em';
        } else if (raw.startsWith('**')) {
          open = 2;
          close = 2;
          className = 'cm-strong';
        } else if (raw.startsWith('`')) {
          className = 'cm-mono';
        } else if (raw.startsWith('$')) {
          className = 'cm6-latex-inline';
          latex = true;
        } else if (match[2]) {
          startOffset += match[2].length;
          raw = raw.slice(match[2].length);
        }

        const start = line.from + startOffset;
        const end = start + raw.length;
        const contentStart = start + open;
        const contentEnd = end - close;
        const active = lineActive && this._rangeIsActive(state, start, end);
        if (latex && !active) {
          builder.add(start, end, cm.Decoration.mark({ class: 'cm6-hidden-syntax' }));
          builder.add(start, start, cm.Decoration.widget({
            widget: new InlineLatex(raw.slice(open, raw.length - close), false),
            side: 1,
          }));
          continue;
        }
        if (!active) {
          builder.add(start, contentStart, cm.Decoration.mark({ class: 'cm6-hidden-syntax' }));
          builder.add(contentEnd, end, cm.Decoration.mark({ class: 'cm6-hidden-syntax' }));
        }
        builder.add(active ? start : contentStart, active ? end : contentEnd, cm.Decoration.mark({ class: className }));
      }
    }

    _findCodeBlocks(doc) {
      const blocks = [];
      let current = null;
      for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const line = doc.line(lineNo);
        const fence = line.text.match(/^(`{3,}|~{3,})\s*([\w-]*)\s*$/);
        if (!fence) continue;
        if (!current) {
          current = { fromLine: lineNo, toLine: lineNo, marker: fence[1][0], lang: fence[2] || '' };
        } else if (fence[1][0] === current.marker) {
          current.toLine = lineNo;
          blocks.push(current);
          current = null;
        }
      }
      return blocks;
    }

    _lineIsActive(state, line) {
      return state.selection.ranges.some(range => range.from <= line.to && range.to >= line.from);
    }

    _rangeIsActive(state, from, to) {
      return state.selection.ranges.some(range => range.from <= to && range.to >= from);
    }

    _questionForLine(text) {
      const match = text.match(/^\?([^?\n]+)\?$/);
      return match ? match[1].trim() : '';
    }

    _handleEnter(view) {
      const state = view.state;
      const selection = state.selection.main;
      if (!selection.empty) return false;

      const line = state.doc.lineAt(selection.head);
      const before = line.text.slice(0, selection.head - line.from);
      const after = line.text.slice(selection.head - line.from);
      const list = line.text.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
      if (!list) return false;

      const indent = list[1];
      const marker = list[2];
      const content = list[3];
      if (!content.trim() && !after.trim()) {
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: '' },
          selection: { anchor: line.from },
        });
        return true;
      }

      const nextMarker = /\d+\./.test(marker) ? `${parseInt(marker, 10) + 1}.` : marker;
      const insert = `\n${indent}${nextMarker} `;
      view.dispatch({
        changes: { from: selection.head, insert },
        selection: { anchor: selection.head + insert.length },
      });
      return true;
    }

    _compatFacade() {
      return {
        getValue: () => this.getContent(),
        setValue: value => this.setContent(value),
        focus: () => this.view?.focus(),
      };
    }

    _dispatchChange(from, to, insert, anchor) {
      if (!this.view) return false;
      this.view.dispatch({
        changes: { from, to, insert },
        selection: { anchor },
        scrollIntoView: true,
      });
      this.view.focus();
      return true;
    }

    _wrapSelection(open, close) {
      if (!this.view) return true;
      const state = this.view.state;
      const ranges = state.selection.ranges;
      const changes = ranges.map(range => ({
        from: range.from,
        to: range.to,
        insert: open + state.doc.sliceString(range.from, range.to) + close,
      }));
      const first = ranges[0];
      const empty = first.empty;
      this.view.dispatch({
        changes,
        selection: empty
          ? { anchor: first.from + open.length }
          : { anchor: first.from + open.length, head: first.to + open.length },
        scrollIntoView: true,
      });
      this.view.focus();
      return true;
    }

    _wrapBlock(open, close) {
      if (!this.view) return;
      const state = this.view.state;
      const selection = state.selection.main;
      const selected = state.doc.sliceString(selection.from, selection.to);
      const insert = selected ? `${open}\n${selected}\n${close}` : `${open}\n\n${close}`;
      const anchor = selected ? selection.from + insert.length : selection.from + open.length + 1;
      this._dispatchChange(selection.from, selection.to, insert, anchor);
    }

    _insertLinePrefix(prefix) {
      if (!this.view) return;
      const state = this.view.state;
      const line = state.doc.lineAt(state.selection.main.head);
      const stripped = line.text.replace(/^(\s*)([-*+]|\d+\.)\s+/, '$1');
      this._dispatchChange(line.from, line.to, prefix + stripped.trimStart(), line.from + prefix.length + stripped.trimStart().length);
    }

    setContent(content) {
      this.rawMarkdown = content || '';
      this.pendingContent = this.rawMarkdown;
      if (this.view) {
        this.view.dispatch({
          changes: { from: 0, to: this.view.state.doc.length, insert: this.rawMarkdown },
        });
      }
      this.lastSavedContent = this.rawMarkdown;
    }

    getContent() {
      return this.view ? this.view.state.doc.toString() : this.rawMarkdown;
    }

    insertFormatting(format) {
      if (!this.view) {
        this.ready.then(() => this.insertFormatting(format));
        return;
      }
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
      if (!this.view) {
        this.ready.then(() => this.insertHeading(level));
        return;
      }
      const state = this.view.state;
      const line = state.doc.lineAt(state.selection.main.head);
      const stripped = line.text.replace(/^#{1,6}\s+/, '');
      const prefix = '#'.repeat(level) + ' ';
      this._dispatchChange(line.from, line.to, prefix + stripped, line.from + prefix.length + stripped.length);
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
