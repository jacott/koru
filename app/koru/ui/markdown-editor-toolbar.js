define(function(require, exports, module) {
  var Dom   = require('../dom');
  var env   = require('../env');
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

  Tpl.$helpers({
    state: function () {
      Dom.setClass('on', this.active && document.queryCommandState($.element.getAttribute('name')));
    },

    link: function () {
      Dom.setClass('on', this.active && getTag('A'));
    },
  });

  Tpl.$events({
    'mousedown button': function (event) {Dom.stopEvent()},
    'click button': function (event) {Dom.stopEvent()},

    'mouseup button': function (event) {
      Dom.stopEvent();
      if (! $.ctx.data.active) {
        return;
      }

      var data = $.ctx.data;
      var name = this.getAttribute('name');

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
          toolbar: event.currentTarget, range: range,
          elm: a, value: a ? a.getAttribute('href') : 'http://',
          inputElm: data.inputElm,
        });
        var parent = event.currentTarget.parentNode;
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
        document.execCommand(name, false);
      }
    },
  });


  Link.$events({
    'submit': function (event) {
      Dom.stopEvent();
      var value = this.getElementsByTagName('input')[0].value;

      var data = $.ctx.data;
      data.inputElm.focus();
      setRange(data.range);
      document.execCommand(value ? 'createLink' : 'unlink', false, value);
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
      if ($.ctx.mousedown || Dom.parentOf(this, event.relatedTarget)) return;
      Dom.remove(this);
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
