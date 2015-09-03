define(function(require, exports, module) {
  var Dom   = require('../dom');
  var koru   = require('../main');
  var util = require('../util');
  var MarkdownEditor = require('./markdown-editor-common');
  var Markdown = require('./markdown');
  var Modal = require('./modal');

  var Tpl = Dom.newTemplate(require('../html!./markdown-editor-toolbar'));
  var $ = Dom.current;

  var Link = Tpl.Link;

  var setRange = MarkdownEditor.setRange;
  var getRange = MarkdownEditor.getRange;
  var getTag = MarkdownEditor.getTag;
  var selectElm = MarkdownEditor.selectElm;
  var getCaretRect = MarkdownEditor.getCaretRect;

  var execCommand = MarkdownEditor.execCommand;

  Tpl.$helpers({
    state: function () {
      Dom.setClass('on', this.active && document.queryCommandState($.element.getAttribute('name')));
    },

    link: function () {
      Dom.setClass('on', this.active && getTag('A'));
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

        if (! tbCtx.data.active) return;

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
    mention: function (data, close) {
      var range = getRange();

      return range && MarkdownEditor.List.$autoRender({
        inputCtx: $.ctx,
        close: close, range: range,
        value: range.toString(),
        inputElm: data.inputElm
      });
    },

    link: function (data, close) {
      var a = getTag('A');
      var range = selectElm(a) || getRange();

      return range && Link.$autoRender({
        close: close, range: range,
        elm: a, value: a ? a.getAttribute('href') : 'http://',
        inputElm: data.inputElm,
      });
    },
  };


  Link.$events({
    'submit': function (event) {
      Dom.stopEvent();
      var value = this.getElementsByTagName('input')[0].value;

      var data = $.ctx.data;
      setRange(data.range);
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

  Link.$extend({
    cancel: function (elm) {
      var data = $.data(elm);
      if (data) {
        setRange(data.range);
        data.inputElm.focus();
      }
      Dom.remove(elm);
    },

    $destroyed: function (ctx) {
      ctx.data.close && ctx.data.close();
    },
  });

  return Tpl;
});
