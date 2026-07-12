/**
 * Socra Markdown Editor - Milkdown Crepe live markdown editor.
 *
 * Crepe owns the rich/live markdown editing model. Socra keeps a tiny wrapper
 * for autosave, toolbar insertion, document loading, and ?question? blocks.
 */
(function () {
  'use strict';

  const MILKDOWN_VERSION = '7.21.2';
  const MILKDOWN_CDN = `https://esm.sh/@milkdown/crepe@${MILKDOWN_VERSION}?bundle`;
  let milkdownPromise = null;

  function loadMilkdown() {
    if (!milkdownPromise) milkdownPromise = import(MILKDOWN_CDN);
    return milkdownPromise;
  }

  class MarkdownEditor {
    constructor(textarea, previewEl, options = {}) {
      this.rawMarkdown = '';
      this.autoSaveCallback = options.autoSave || null;
      this.autoSaveDelay = options.autoSaveDelay || 1500;
      this.autoSaveTimer = null;
      this.lastSavedContent = '';
      this.crepe = null;
      this.root = null;
      this.editorHost = null;
      this.ready = this._init();
      this._questionRenderQueued = false;
      this._suppressAutosave = false;
    }

    async _init() {
      const editorSplit = document.querySelector('.editor-split');
      if (!editorSplit) return;
      editorSplit.innerHTML = '';

      this.root = document.createElement('div');
      this.root.className = 'live-editor-wrapper milkdown-live-editor-wrapper';
      editorSplit.appendChild(this.root);

      this.editorHost = document.createElement('div');
      this.editorHost.className = 'live-editor milkdown-live-editor';
      this.root.appendChild(this.editorHost);

      await this._mount(this.rawMarkdown);
    }

    async _mount(markdown) {
      const { Crepe } = await loadMilkdown();
      if (this.crepe) {
        try {
          await this.crepe.destroy();
        } catch (error) {
          console.warn('Milkdown cleanup failed while remounting the editor.', error);
        }
        this.crepe = null;
      }
      this.editorHost.innerHTML = '';

      const crepe = new Crepe({
        root: this.editorHost,
        defaultValue: markdown || '',
        features: {
          [Crepe.Feature.CodeMirror]: false,
          [Crepe.Feature.Toolbar]: false,
          [Crepe.Feature.BlockEdit]: false,
          [Crepe.Feature.LinkTooltip]: false,
          [Crepe.Feature.TopBar]: false,
          [Crepe.Feature.AI]: false,
        },
      });

      crepe.on(listener => {
        listener.markdownUpdated((ctx, nextMarkdown) => {
          if (this._suppressAutosave) return;
          this.rawMarkdown = nextMarkdown;
          this._scheduleQuestionRender();
          this._scheduleAutoSave();
        });
        listener.selectionUpdated(() => this._scheduleQuestionRender());
        listener.focus(() => this._scheduleQuestionRender());
        listener.blur(() => this._scheduleQuestionRender());
      });

      this.crepe = crepe;
      await crepe.create();
      this.rawMarkdown = crepe.getMarkdown();
      this.lastSavedContent = this.rawMarkdown;
      this._wireQuestionClicks();
      this._scheduleQuestionRender();
    }

    _wireQuestionClicks() {
      if (this._questionClickWired) return;
      this._questionClickWired = true;
      this.root.addEventListener('mousedown', event => {
        const block = event.target.closest?.('.socra-question-block');
        if (!block || block.classList.contains('socra-question-active')) return;
        const question = block.dataset.question || '';
        if (!question) return;
        event.preventDefault();
        if (window.sendMessage) window.sendMessage(question);
      });
      document.addEventListener('selectionchange', () => this._scheduleQuestionRender());
    }

    _scheduleQuestionRender() {
      if (this._questionRenderQueued) return;
      this._questionRenderQueued = true;
      requestAnimationFrame(() => {
        this._questionRenderQueued = false;
        this._renderQuestionBlocks();
      });
    }

    _renderQuestionBlocks() {
      if (!this.root) return;
      const selection = document.getSelection();
      const paragraphs = this.root.querySelectorAll('.ProseMirror p');
      paragraphs.forEach(paragraph => {
        const text = paragraph.textContent || '';
        const match = text.match(/^\?([^?\n]+)\?$/);
        const active = selection && selection.rangeCount > 0 && paragraph.contains(selection.anchorNode);
        paragraph.classList.toggle('socra-question-block', !!match && !active);
        paragraph.classList.toggle('socra-question-active', !!match && active);
        if (match && !active) paragraph.dataset.question = match[1].trim();
        else paragraph.removeAttribute('data-question');
      });
    }

    _focusEditor() {
      const editable = this.root?.querySelector('.ProseMirror');
      if (editable) editable.focus();
      return editable;
    }

    _insertText(text) {
      const editable = this._focusEditor();
      if (!editable) return;
      document.execCommand('insertText', false, text);
      this._scheduleQuestionRender();
    }

    _wrapSelection(open, close) {
      const editable = this._focusEditor();
      if (!editable) return;
      const selection = document.getSelection();
      const selected = selection && selection.rangeCount ? selection.toString() : '';
      document.execCommand('insertText', false, open + selected + close);
      this._scheduleQuestionRender();
    }

    _wrapBlock(open, close) {
      const selection = document.getSelection();
      const selected = selection && selection.rangeCount ? selection.toString() : '';
      this._insertText(selected ? `${open}\n${selected}\n${close}` : `${open}\n\n${close}`);
    }

    _insertLinePrefix(prefix) {
      this._insertText(prefix);
    }

    async setContent(content) {
      this.rawMarkdown = content || '';
      this._suppressAutosave = true;
      await this.ready;
      await this._mount(this.rawMarkdown);
      this._suppressAutosave = false;
      this.lastSavedContent = this.rawMarkdown;
    }

    getContent() {
      if (this.crepe) {
        try {
          return this.crepe.getMarkdown();
        } catch (error) {
          return this.rawMarkdown;
        }
      }
      return this.rawMarkdown;
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
