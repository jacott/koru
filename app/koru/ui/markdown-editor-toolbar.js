define(function(require, exports, module) {
  var Dom   = require('../dom');
  var koru   = require('../main');
  var util = require('../util');
  var MarkdownEditor = require('./markdown-editor-common');
  var Markdown = require('./markdown');

  var Tpl = Dom.newTemplate(require('../html!./markdown-editor-toolbar'));
  var $ = Dom.current;

  var Link = Tpl.Link;

  var setRange = MarkdownEditor.setRange;
  var getRange = MarkdownEditor.getRange;
  var getTag = MarkdownEditor.getTag;
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
        if (! Dom.parentOf(event.target, button)) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        if (! $.ctx.data.active) {
          return;
        }

        var data = $.ctx.data;
        var name = button.getAttribute('name');

        var formFunc = actionForms[name];

        if (formFunc) {
          if (data.form) {
            Link.cancel(data.form);
            return;
          }

          data.form = formFunc(data, toolbar, button, event);
          if (! data.form) return;

          var parent = toolbar.parentNode;
          var op = parent.offsetParent;
          var abb = Dom.clonePosition(button, data.form, op, 'Bl');
          parent.appendChild(data.form);

          var ibb = parent.getBoundingClientRect();
          var lbb = data.form.getBoundingClientRect();

          if (lbb.right > ibb.right) {
            data.form.style.left = '';
            data.form.style.right = '0';
          }

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
    link: function (data, toolbar) {
      var a = getTag('A');
      if (a) {
        var range = document.createRange();
        range.selectNode(a);
        setRange(range);
      }

      var range = getRange();

      return range && Link.$autoRender({
        toolbar: toolbar, range: range,
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
      Dom.getCtx(data.toolbar).updateAllTags();
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
        if (ctx.mousedown || Dom.parentOf(elm, document.activeElement)) return;
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
      var tbctx = Dom.getCtx(ctx.data.toolbar);
      if (tbctx)
        tbctx.data.form = null;
    },
  });

  return Tpl;
});
