define(function(require, exports, module) {
  var util = require('koru/util');
  var Dom = require('koru/dom');
  var RichTextEditor = require('./rich-text-editor');
  var Modal = require('./modal');
  var koru = require('koru');
  var RichTextMention = require('./rich-text-mention');
  var SelectMenu = require('./select-menu');

  var Tpl = Dom.newTemplate(module, require('koru/html!./rich-text-editor-toolbar'));
  var $ = Dom.current;

  var execCommand = RichTextEditor.execCommand;
  var getTag = RichTextEditor.getTag;
  var selectElm = Dom.selectElm;

  Tpl.$extend({
    $autoRender: function (data, parentCtx) {
      var elm = RichTextEditor.$autoRender(data, parentCtx);
      var ctx = Dom.getMyCtx(elm);
      var toolbar = Tpl.constructor.prototype.$autoRender.call(Tpl, ctx.inputElm, ctx);
      var toolbarCtx = Dom.getMyCtx(toolbar);
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
    var override = $.ctx.override;
    if (override && override.font)
      return override.font;

    var code = getTag('FONT');
    return (code && code.getAttribute('face')) || 'sans-serif';
  }

  Tpl.$helpers({
    mode: function () {
      return $.ctx.parentCtx.mode.type;
    },

    state: function () {
      Dom.setClass('on', document.queryCommandState($.element.getAttribute('name')));
    },

    link: function () {
      Dom.setClass('on', getTag('A'));
    },

    code: function () {
      Dom.setClass('on', getFont() === 'monospace');
    },

    font: function () {
      var code = getFont();
      if (code === 'initial') code = 'sans-serif';
      $.element.setAttribute('face', code);
      $.element.textContent = util.capitalize(util.humanize(code));
    },

    title: function (title) {
      var elm = $.element;
      if (elm.getAttribute('title')) return;

      var action = elm.getAttribute('name');

      elm.setAttribute('title', RichTextEditor.title(title, action, elm.parentNode.className));
    },

    mentions: function () {
      if ($.element._koruEnd) return;
      var mentions = $.ctx.parentCtx.data.extend;
      mentions = mentions && mentions.mentions;
      if (! mentions) return;
      var frag = document.createDocumentFragment();
      Object.keys(mentions).sort().forEach(function (id) {
        frag.appendChild(Dom.h({button: id, class: mentions[id].buttonClass, $name: 'mention', '$data-type': id}));
      });
      return frag;
    },

    language: function () {
      var mode = $.ctx.parentCtx.mode;
      if (mode.type !== 'code') return;
      var language = mode.language || 'text';

      return ((RichTextEditor.languageMap && RichTextEditor.languageMap[language]) || util.capitalize(language))
        .replace(/,.*$/, '');
    },
  });

  var TEXT_ALIGN_LIST = [
    ['justifyLeft', 'Left align'],
    ['justifyCenter', 'Center'],
    ['justifyRight', 'Right align'],
    ['justifyFull', 'Justify'],
  ];

  TEXT_ALIGN_LIST.forEach(function (row) {
    row[1] = Dom.h({button: '', $name: row[0], $title: RichTextEditor.title(row[1], row[0], 'standard')});
  });

  Tpl.$events({
    'click button': function (event) {Dom.stopEvent()},
    'mousedown button': function (mde) {
      Dom.stopEvent();

      var toolbar = mde.currentTarget;

      var button = this;

      var pCtx = $.ctx.parentCtx;
      var actions = pCtx.mode.actions;

      if (document.activeElement !== $.ctx.parentCtx.inputElm)
        pCtx.inputElm.focus();
      Dom.onMouseUp(function (event) {
        if (! Dom.contains(button, event.target)) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        var name = button.getAttribute('name');
        switch(name) {
        case 'more':
          Dom.toggleClass(toolbar, 'more');
          return;
        case 'textAlign':
          SelectMenu.popup(event.target, {
            classes: 'rtTextAlign',
            list: TEXT_ALIGN_LIST,
            onSelect: function (elm) {
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

  return Tpl;
});
