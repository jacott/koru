define((require, exports, module)=>{
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const DomNav          = require('koru/ui/dom-nav');
  const util            = require('koru/util');
  const Modal           = require('./modal');
  const RichText        = require('./rich-text');
  const RichTextEditor  = require('./rich-text-editor');
  const RichTextMention = require('./rich-text-mention');
  const SelectMenu      = require('./select-menu');

  const Tpl = Dom.newTemplate(module, require(
    'koru/html!./rich-text-editor-toolbar'));
  const $ = Dom.current;

  const {ELEMENT_NODE} = document;

  const {getTag} = DomNav;
  const {execCommand, chooseFromMenu} = RichTextEditor;

  Tpl.$extend({
    $autoRender(data, parentCtx) {
      const elm = RichTextEditor.$autoRender(data, parentCtx);
      const ctx = Dom.myCtx(elm);
      const toolbar = Tpl.constructor.prototype.$autoRender.call(Tpl, ctx.inputElm, ctx);
      const toolbarCtx = Dom.myCtx(toolbar);
      elm.insertBefore(toolbar, elm.firstChild);
      const undoElm = toolbar.querySelector('[name=undo]');
      const redoElm = toolbar.querySelector('[name=redo]');
      const setUndoButtons = (undo)=>{
        Dom.setBoolean('disabled', undo.undos.length == 0, undoElm);
        Dom.setBoolean('disabled', undo.redos.length == 0, redoElm);
      };

      setUndoButtons(ctx.undo);
      ctx.onDestroy(ctx.undo.onChange(setUndoButtons));
      ctx.onDestroy(ctx.caretMoved.onChange((override)=>{
        toolbarCtx.override = override;
        toolbarCtx.updateAllTags();
      }));

      return elm;
    },
  });

  const getFont = (inputElm)=>{
    const {override} = $.ctx;
    if (override && override.font !== undefined)
      return RichText.fontType(override.font);

    const code = getTag('SPAN', inputElm);
    return RichText.fontType(code !== null && code.style.fontFamily);
  };

  const matchHeader = elm=>{
    const {tagName} = elm;
    return tagName !== undefined && tagName.length === 2 && /^H\d$/.test(tagName);
  };

  const HEADER_NAME = {};
  for(let i = 1; i < 7; ++i) {
    HEADER_NAME['H'+i] = 'Heading '+i;
  }

  Tpl.$helpers({
    mode: ()=> $.ctx.parentCtx.mode.type,

    state: ()=>{
      Dom.setClass('on', document.queryCommandState($.element.getAttribute('name')));
    },

    undoState: ()=>{Dom.setBoolean('disabled', $.ctx.parentCtx.undo.undos.length == 0)},
    redoState: ()=>{Dom.setBoolean('disabled', $.ctx.parentCtx.undo.redos.length == 0)},

    link() {Dom.setClass('on', getTag('A', this))},

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

    title: title =>{
      const elm = $.element;
      if (elm.getAttribute('title')) return;

      const action = elm.getAttribute('name');

      elm.setAttribute('title', RichTextEditor.title(
        title, action, elm.parentNode.className||'standard'));
    },

    mentions: ()=>{
      if ($.element.nodeType === document.COMMENT_NODE) return;
      let mentions = $.ctx.parentCtx.data.extend;
      mentions = mentions && mentions.mentions;
      if (! mentions) return;
      const frag = document.createDocumentFragment();
      Object.keys(mentions).sort().forEach(id =>{
        frag.appendChild(Dom.h({
          button: [id], class: mentions[id].buttonClass, $name: 'mention',
          tabindex: -1,
          'data-type': id, title: mentions[id].title}));
      });
      return frag;
    },

    language() {
      const {mode} = $.ctx.parentCtx;
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

  const FORMAT_TEXT_LIST = [
    ['heading0', 'Normal'],
  ];

  {
    for(let i = 1; i < 7; ++i) {
      FORMAT_TEXT_LIST.push(['heading'+i, 'Heading '+i]);
    }

    TEXT_ALIGN_LIST.forEach(row =>{
      row[1] = Dom.h({button: [], $name: row[0],
                      title: RichTextEditor.title(row[1], row[0], 'standard')});
    });

    FORMAT_TEXT_LIST.forEach(row =>{
      row[1] = Dom.h({button: [row[1]],
                      title: RichTextEditor.title(row[1], row[0], 'standard')});
    });
  }

  Tpl.$events({
    'pointerdown'() {Dom.stopEvent()},
    'click button'(event) {Dom.stopEvent()},
    'pointerdown button'(mde) {
      Dom.stopEvent();

      const toolbar = mde.currentTarget;

      const button = this;

      const pCtx = $.ctx.parentCtx;
      const {actions} = pCtx.mode;

      if (document.activeElement !== $.ctx.parentCtx.inputElm)
        pCtx.inputElm.focus();
      Dom.onPointerUp(event =>{
        if (! Dom.contains(button, event.target)) return;


        Dom.stopEvent(event);

        const name = button.getAttribute('name');
        switch(name) {
        case 'more':
          Dom.toggleClass(toolbar, 'more');
          return;
        case 'textAlign':
          chooseFromMenu(event, {
            classes: 'rtTextAlign',
            list: TEXT_ALIGN_LIST,
          }, (ctx, id)=>{actions[id](event)});
          return;
        case 'formatText':
          chooseFromMenu(event, {
            classes: 'rtFormatText',
            list: FORMAT_TEXT_LIST,
          }, (ctx, id)=>{actions[id](event)});
          return;
        default:
          actions[name](event);
        }

      });
    },
  });

  module.onUnload(()=>{koru.unload(koru.absId(require, './rich-text'))});

  return Tpl;
});
