define(function(require, exports, module) {
  var util = require('koru/util');
  var Dom = require('koru/dom');
  var RichTextEditor = require('./rich-text-editor');
  var Modal = require('./modal');
  var koru = require('koru');
  var RichTextMention = require('./rich-text-mention');

  var Tpl = Dom.newTemplate(module, require('koru/html!./rich-text-editor-toolbar'));
  var $ = Dom.current;

  var Link = Tpl.Link;

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

    mentions: function () {
      if ($.element._koruEnd) return;
      var mentions = $.ctx.parentCtx.data.options;
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

        var tbCtx = $.ctx;

        var data = tbCtx.data;
        var name = button.getAttribute('name');

        var formFunc = actionForms[name];

        if (formFunc) {
          if (data.form) {
            Link.cancel(data.form);
            return;
          }

          data.form = formFunc(data, function () {
            tbCtx.updateAllTags();
            data.form = null;
          }, button, event);

          if (! data.form) return;

          var parent = toolbar.parentNode;
          var op = parent.offsetParent;
          var abb = Modal.append('below', {container: data.form, popup: data.form, origin: button});
          var lnp = data.form.getElementsByTagName('input')[0];

          lnp.focus();
          lnp.select();
        } else {
          execCommand(name);
        }
      });
    },
  });

  var actionForms = {
    mention: function (data, close, button) {
      var range = Dom.getRange();

      return range && RichTextMention.$autoRender({
        type: button.getAttribute('data-type'),
        mentions: $.ctx.parentCtx.data.options.mentions,
        inputCtx: $.ctx.parentCtx,
        close: close, range: range,
        value: range.toString(),
        inputElm: data,
      });
    },

    link: function (data, close) {
      var a = getTag('A');
      var range = selectElm(a) || Dom.getRange();

      return range && Link.$autoRender({
        close: close, range: range,
        elm: a, value: a ? a.getAttribute('href') : 'http://',
        inputElm: data,
      });
    },
  };

  Link.$extend({
    cancel: function (elm) {
      var data = $.data(elm);
      if (data) {
        Dom.setRange(data.range);
        data.inputElm.focus();
      }
      Dom.remove(elm);
    },

    $destroyed: function (ctx) {
      ctx.data.close && ctx.data.close();
    },
  });

  Link.$events({
    'submit': function (event) {
      Dom.stopEvent();
      var value = this.getElementsByTagName('input')[0].value;

      var data = $.ctx.data;
      Dom.setRange(data.range);
      data.inputElm.focus();
      execCommand(value ? 'createLink' : 'unlink', value);
      data.close && data.close();
      Dom.remove(event.currentTarget);
    },

    'mousedown': function (event) {
      $.ctx.mousedown = true;
    },

    'mouseup': function (event) {
      $.ctx.mousedown = false;
    },

    'focusout': function (event) {
      var ctx = $.ctx;
      var elm = this;
      koru.afTimeout(function () {
        if (ctx.mousedown || Dom.contains(elm, document.activeElement)) return;
        Dom.remove(elm);
      });
    },

    'keyup': function (event) {
      if (event.which === 27) {
        Dom.stopEvent();
        Link.cancel(this);
      }
    },

    'click [name=cancel]': function (event) {
      Dom.stopEvent();
      Link.cancel(event.currentTarget);
    },
  });

  return Tpl;
});
