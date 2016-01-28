define(function(require, exports, module) {
  var util = require('koru/util');
  var Dom = require('koru/dom');
  var RichTextEditor = require('./rich-text-editor');
  var Modal = require('./modal');
  var koru = require('koru');
  var RichTextMention = require('./rich-text-mention');

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

      function redraw() {
        toolbarCtx.updateAllTags();
      }
      return elm;
    },
  });

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

  Tpl.$events({
    'click button': function (event) {Dom.stopEvent()},
    'mousedown button': function (mde) {
      Dom.stopEvent();

      var toolbar = mde.currentTarget;

      var button = this;
      Dom.onMouseUp(function (event) {
        if (! Dom.contains(event.target, button)) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        $.ctx.parentCtx.mode.actions[button.getAttribute('name')](event);
      });
    },
  });

  return Tpl;
});
