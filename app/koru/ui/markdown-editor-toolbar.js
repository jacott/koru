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

        if (name === 'link') {
          if (data.link) {
            Link.cancel(data.link);
            return;
          }

          var a = getTag('A');
          if (a) {
            var range = document.createRange();
            range.selectNode(a);
            setRange(range);
          }

          var range = getRange();
          if (range === null) return;

          data.link = Link.$autoRender({
            toolbar: toolbar, range: range,
            elm: a, value: a ? a.getAttribute('href') : 'http://',
            inputElm: data.inputElm,
          });
          var parent = toolbar.parentNode;
          var op = parent.offsetParent;
          var abb = getCaretRect(range) || data.inputElm;
          abb = Dom.clonePosition(abb, data.link, op, data.inputElm.childNodes.length ? 'Bl' : 'tl');
          parent.appendChild(data.link);

          var ibb = parent.getBoundingClientRect();
          var lbb = data.link.getBoundingClientRect();

          if (lbb.right > ibb.right) {
            data.link.style.left = '';
            data.link.style.right = '0';
          }

          var lnp = data.link.getElementsByTagName('input')[0];

          lnp.focus();
          lnp.select();
        } else {
          execCommand(name);
        }
      });
    },
  });


  Link.$events({
    'submit': function (event) {
      Dom.stopEvent();
      var value = this.getElementsByTagName('input')[0].value;

      var data = $.ctx.data;
      data.inputElm.focus();
      setRange(data.range);
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
        tbctx.data.link = null;
    },
  });

  return Tpl;
});
