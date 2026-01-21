define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const Ctx             = require('koru/dom/ctx');
  const RichText        = require('koru/dom/rich-text');
  const CharacterCounter = require('koru/ui/character-counter');
  const DomNav          = require('koru/ui/dom-nav');
  const util            = require('koru/util');
  const Modal           = require('./modal');
  const RichTextEditor  = require('./rich-text-editor');
  const RichTextMention = require('./rich-text-mention');
  const SelectMenu      = require('./select-menu');

  const Tpl = Dom.newTemplate(module, require('koru/html!./rich-text-editor-toolbar'));
  const $ = Dom.current;

  const {ELEMENT_NODE} = document;

  const {getTag} = DomNav;
  const {execCommand, chooseFromMenu, runAction} = RichTextEditor;

  const addCharcterCounter = (ctx, elm) => {
    const {extend} = ctx.data;
    if (extend === undefined || extend.maxlength === undefined) return;
    const cc = ctx.characterCounter = new CharacterCounter(extend);
    cc.attach(elm.children[1]);
    elm.insertBefore(cc.element, cc.editor.nextSibling);
    ctx.onDestroy(() => {
      cc.attach();
    });
  };

  Tpl.$extend({
    $autoRender(data, parentCtx) {
      const elm = RichTextEditor.$autoRender(data, parentCtx);
      const ctx = Dom.myCtx(elm);
      const toolbar = Tpl.constructor.prototype.$autoRender.call(Tpl, ctx.inputElm, ctx);
      const toolbarCtx = Dom.myCtx(toolbar);
      elm.insertBefore(toolbar, elm.firstChild);
      const undoElm = toolbar.querySelector('[name=undo]');
      const redoElm = toolbar.querySelector('[name=redo]');
      const setUndoButtons = (undo) => {
        Dom.setBoolean('disabled', undo.undos.length == 0, undoElm);
        Dom.setBoolean('disabled', undo.redos.length == 0, redoElm);
      };

      setUndoButtons(ctx.undo);
      addCharcterCounter(ctx, elm);
      const maxlength = ctx.onDestroy(ctx.undo.onChange(setUndoButtons));
      ctx.onDestroy(ctx.caretMoved.onChange((override) => {
        toolbarCtx.override = override;
        toolbarCtx.updateAllTags();
      }));

      return elm;
    },
  });

  const getFont = (inputElm) => {
    const {override} = $.ctx;
    if (override && override.font !== undefined) {
      return RichText.fontType(override.font);
    }

    const code = getTag('SPAN', inputElm);
    return RichText.fontType(code !== null && code.style.fontFamily);
  };

  const matchHeader = (elm) => {
    const {tagName} = elm;
    return tagName !== undefined && tagName.length === 2 && /^H\d$/.test(tagName);
  };

  const HEADER_NAME = {};
  for (let i = 1; i < 7; ++i) {
    HEADER_NAME['H' + i] = 'Heading ' + i;
  }

  Tpl.$helpers({
    mode: () => $.ctx.parentCtx.mode.type,

    state: () => {
      Dom.setClass('on', document.queryCommandState($.element.getAttribute('name')));
    },

    undoState: () => {
      Dom.setBoolean('disabled', $.ctx.parentCtx.undo.undos.length == 0);
    },
    redoState: () => {
      Dom.setBoolean('disabled', $.ctx.parentCtx.undo.redos.length == 0);
    },

    link() {
      Dom.setClass('on', getTag('A', this));
    },

    code() {
      const mode = $.ctx.parentCtx.mode;
      Dom.setClass('on', mode.type === 'code' || getFont(this) === 'monospace');
    },

    font() {
      let code = getFont(this);
      if (code === 'initial') code = 'sans-serif';
      $.element.setAttribute('face', code);
      $.element.textContent = util.capitalize(util.humanize(code));
    },

    format() {
      const elm = getTag(matchHeader, this);
      return elm === null ? 'Normal text' : HEADER_NAME[elm.tagName];
    },

    title: (title) => {
      const elm = $.element;
      if (elm.getAttribute('title') !== null) return;

      elm.setAttribute(
        'title',
        RichTextEditor.title(
          title,
          elm.getAttribute('name'),
          elm.parentNode.classList.contains('code') ? 'code' : 'standard',
        ),
      );
    },

    mentions: () => {
      if ($.element.nodeType === document.COMMENT_NODE) return;
      const {extend} = $.ctx.parentCtx.data;
      const mentions = extend && extend.mentions;
      if (mentions == null) return;
      const frag = document.createDocumentFragment();
      Object.keys(mentions).sort().forEach((id) => {
        frag.appendChild(
          Dom.h({
            button: [],
            class: mentions[id].buttonClass,
            $name: 'mention',
            tabindex: -1,
            'data-type': id,
            title: mentions[id].title,
          }),
        );
      });
      return frag;
    },

    language() {
      const {mode} = $.ctx.parentCtx;
      if (mode.type !== 'code') return;
      const language = mode.language || 'text';

      return ((RichTextEditor.languageMap && RichTextEditor.languageMap[language]) ||
        util.capitalize(language)).replace(/,.*$/, '');
    },
  });

  const TEXT_ALIGN_LIST = [['justifyLeft', 'Left align'], ['justifyCenter', 'Center'], [
    'justifyRight',
    'Right align',
  ], ['justifyFull', 'Justify']];

  for (const row of TEXT_ALIGN_LIST) {
    row[1] = Dom.h({
      span: [],
      name: row[0],
      title: RichTextEditor.title(row[1], row[0], 'standard'),
    });
  }

  const FORMAT_TEXT_LIST = [['heading0', 'Normal']];

  for (let i = 1; i < 7; ++i) FORMAT_TEXT_LIST.push(['heading' + i, 'Heading ' + i]);

  for (const row of FORMAT_TEXT_LIST) {
    row[1] = Dom.h({span: [row[1]], title: RichTextEditor.title(row[1], row[0], 'standard')});
  }

  let allowUp = false;

  Tpl.$events({
    'pointerdown'() {
      allowUp = true;
      Dom.stopEvent();
    },
    'click button'(event) {
      Dom.stopEvent();
    },
    'pointerup button'(mde) {
      Dom.stopEvent();

      if (!allowUp) {
        return;
      }

      allowUp = false;

      const toolbar = mde.currentTarget;

      const button = this;

      const {ctx} = $;

      const pCtx = ctx.parentCtx;

      if (document.activeElement !== $.ctx.parentCtx.inputElm) {
        pCtx.inputElm.focus();
      }

      window.requestAnimationFrame(() => {
        if (ctx.inputElm === null) {
          return;
        }

        const prevCtx = Ctx._currentCtx;
        Ctx._currentCtx = ctx;
        try {
          const name = button.getAttribute('name');
          switch (name) {
            case 'more':
              Dom.toggleClass(toolbar, 'more');
              return;
            case 'textAlign':
              chooseFromMenu(mde, {classes: 'rtTextAlign', list: TEXT_ALIGN_LIST}, (ctx, id) => {
                runAction(pCtx, id, mde);
              });
              return;
            case 'formatText':
              chooseFromMenu(mde, {classes: 'rtFormatText', list: FORMAT_TEXT_LIST}, (ctx, id) => {
                runAction(pCtx, id, mde);
              });
              return;
            default:
              runAction(pCtx, name, mde);
          }
        } finally {
          Ctx._currentCtx = prevCtx;
        }
      });
    },
  });

  return Tpl;
});
