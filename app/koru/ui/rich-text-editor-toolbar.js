define(function(require, exports, module) {
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const util            = require('koru/util');
  const Modal           = require('./modal');
  const RichText        = require('./rich-text');
  const RichTextEditor  = require('./rich-text-editor');
  const RichTextMention = require('./rich-text-mention');
  const SelectMenu      = require('./select-menu');

  const Tpl = module.exports = Dom.newTemplate(module, require(
    'koru/html!./rich-text-editor-toolbar'));
  const $ = Dom.current;

  const {execCommand, getTag} = RichTextEditor;
  const {selectElm} = Dom;

  Tpl.$extend({
    $autoRender(data, parentCtx) {
      const elm = RichTextEditor.$autoRender(data, parentCtx);
      const ctx = Dom.myCtx(elm);
      const toolbar = Tpl.constructor.prototype.$autoRender.call(Tpl, ctx.inputElm, ctx);
      const toolbarCtx = Dom.myCtx(toolbar);
      elm.insertBefore(toolbar, elm.firstChild);
      ctx.onDestroy(ctx.caretMoved.onChange(redraw));

      function redraw(override) {
        toolbarCtx.override = override;
        toolbarCtx.updateAllTags();
      }
      return elm;
    },
  });

  function getFont() {
    const {override} = $.ctx;
    if (override && override.font !== undefined)
      return RichText.fontType(override.font);

    const code = getTag('SPAN');
    return RichText.fontType(code && code.style.fontFamily);
  }

  Tpl.$helpers({
    mode() {
      return $.ctx.parentCtx.mode.type;
    },

    state() {
      Dom.setClass('on', document.queryCommandState($.element.getAttribute('name')));
    },

    link() {
      Dom.setClass('on', getTag('A'));
    },

    code() {
      Dom.setClass('on', getFont() === 'monospace');
    },

    font() {
      let code = getFont();
      if (code === 'initial') code = 'sans-serif';
      $.element.setAttribute('face', code);
      $.element.textContent = util.capitalize(util.humanize(code));
    },

    title(title) {
      const elm = $.element;
      if (elm.getAttribute('title')) return;

      const action = elm.getAttribute('name');

      elm.setAttribute('title', RichTextEditor.title(title, action, elm.parentNode.className));
    },

    mentions() {
      if ($.element.nodeType === document.COMMENT_NODE) return;
      let mentions = $.ctx.parentCtx.data.extend;
      mentions = mentions && mentions.mentions;
      if (! mentions) return;
      const frag = document.createDocumentFragment();
      Object.keys(mentions).sort().forEach(function (id) {
        frag.appendChild(Dom.h({
          button: id, class: mentions[id].buttonClass, $name: 'mention',
          '$data-type': id, $title: mentions[id].title}));
      });
      return frag;
    },

    language() {
      const mode = $.ctx.parentCtx.mode;
      if (mode.type !== 'code') return;
      const language = mode.language || 'text';

      return ((RichTextEditor.languageMap && RichTextEditor.languageMap[language]) ||
              util.capitalize(language))
        .replace(/,.*$/, '');
    },
  });

  const TEXT_ALIGN_LIST = [
    ['justifyLeft', 'Left align'],
    ['justifyCenter', 'Center'],
    ['justifyRight', 'Right align'],
    ['justifyFull', 'Justify'],
  ];

  TEXT_ALIGN_LIST.forEach(function (row) {
    row[1] = Dom.h({button: '', $name: row[0],
                    $title: RichTextEditor.title(row[1], row[0], 'standard')});
  });

  Tpl.$events({
    'click button'(event) {Dom.stopEvent()},
    'pointerdown button'(mde) {
      Dom.stopEvent();

      const toolbar = mde.currentTarget;

      const button = this;

      const pCtx = $.ctx.parentCtx;
      const {actions} = pCtx.mode;

      if (document.activeElement !== $.ctx.parentCtx.inputElm)
        pCtx.inputElm.focus();
      Dom.onPointerUp(function (event) {
        if (! Dom.contains(button, event.target)) return;


        Dom.stopEvent(event);

        const name = button.getAttribute('name');
        switch(name) {
        case 'more':
          Dom.toggleClass(toolbar, 'more');
          return;
        case 'textAlign':
          SelectMenu.popup(event.target, {
            classes: 'rtTextAlign',
            list: TEXT_ALIGN_LIST,
            onSelect(elm) {
              actions[$.data(elm).id](event);
              return true;
            },
          });
          return;
        default:
          actions[name](event);
        }

      });
    },
  });
});
