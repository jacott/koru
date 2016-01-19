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
      elm.addEventListener('mouseup', redraw, true);
      elm.addEventListener('keyup', redraw, true);

      ctx.onDestroy(function () {
        elm.removeEventListener('mouseup', redraw, true);
        elm.removeEventListener('keyup', redraw, true);
      });

      function redraw() {
        toolbarCtx.updateAllTags();
      }
      return elm;
    },
  });

  Tpl.$helpers({
    state: function () {
      Dom.setClass('on', document.queryCommandState($.element.getAttribute('name')));
    },

    link: function () {
      Dom.setClass('on', getTag('A'));
    },

    title: function (title) {
      if ($.element.getAttribute('title')) return;

      var action = $.element.getAttribute('name');

      $.element.setAttribute('title', RichTextEditor.title(title, action));
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

        RichTextEditor.actions[button.getAttribute('name')](event);
      });
    },
  });

  return Tpl;
});
