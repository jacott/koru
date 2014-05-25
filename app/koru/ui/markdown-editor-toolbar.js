var $ = Koru.current;
var MarkdownEditor = Koru.MarkdownEditor;
var Tpl = MarkdownEditor.Toolbar;
var Link = Tpl.Link;

var setRange = MarkdownEditor.setRange;
var getRange = MarkdownEditor.getRange;
var getTag = MarkdownEditor.getTag;
var getCaretRect = MarkdownEditor.getCaretRect;

Tpl.$helpers({
  state: function () {
    Koru.setClass('on', this.active && document.queryCommandState($.element.getAttribute('name')));
  },

  link: function () {
    Koru.setClass('on', this.active && getTag('A'));
  },
});

Tpl.$events({
  'mousedown button': function (event) {Koru.stopEvent()},
  'click button': function (event) {Koru.stopEvent()},

  'mouseup button': function (event) {
    Koru.stopEvent();
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
      abb = Koru.clonePosition(abb, data.link, op, data.inputElm.childNodes.length ? 'Bl' : 'tl');
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
    Koru.stopEvent();
    var value = this.getElementsByTagName('input')[0].value;

    var data = $.ctx.data;
    data.inputElm.focus();
    setRange(data.range);
    document.execCommand(value ? 'createLink' : 'unlink', false, value);
    Koru.getCtx(data.toolbar).updateAllTags();
    Koru.remove(event.currentTarget);
  },

  'mousedown': function (event) {
    $.ctx.mousedown = true;
  },

  'mouseup': function (event) {
    $.ctx.mousedown = false;
  },

  'focusout': function (event) {
    if ($.ctx.mousedown || Koru.parentOf(this, event.relatedTarget)) return;
    Koru.remove(this);
  },

  'keyup': function (event) {
    if (event.which === 27) {
      Koru.stopEvent();
      Link.cancel(this);
    }
  },

  'click [name=cancel]': function (event) {
    Koru.stopEvent();
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
    Koru.remove(elm);
  },

  $destroyed: function (ctx) {
    var tbctx = Koru.getCtx(ctx.data.toolbar);
    if (tbctx)
      tbctx.data.link = null;
  },
});
