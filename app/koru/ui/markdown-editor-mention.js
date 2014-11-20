define(function(require, exports, module) {
  var Dom   = require('../dom');
  var koru   = require('../main');
  var util = require('../util');
  var MarkdownEditor = require('./markdown-editor-common');
  var Markdown = require('./markdown');

  var Tpl = Dom.newTemplate(require('../html!./markdown-editor-mention'));
  var $ = Dom.current;

  var setRange = MarkdownEditor.setRange;
  var getRange = MarkdownEditor.getRange;
  var execCommand = MarkdownEditor.execCommand;

  Tpl.$extend({
    $destroyed: function (ctx, elm) {
      revertMention(ctx.data.inputElm);
      ctx.data.close && ctx.data.close();
    },

    selectItem: selectItem,

    revertMention: revertMention,
  });

  Tpl.$helpers({
    inlineClass: function () {
      Dom.setClass('inline', this.span);
    },
    content: function () {
      return this.value;
    },

    list: function () {
      var frag = document.createDocumentFragment();
      this.inputCtx.data.options.atList(frag, this.value);
      Dom.addClass(frag.firstChild, 'selected');

      Dom.setClass('empty', ! frag.firstChild, $.element.parentNode);

      return frag;
    },
  });

  Tpl.$events({
    'mouseover .mdMention>div>*': function (event) {
      Dom.removeClass(event.currentTarget.getElementsByClassName('selected')[0], 'selected');
      Dom.addClass(this, 'selected');
    },

    'mousedown .mdMention>div>*': function (event) {
      Dom.stopEvent();
      $.ctx.mousedown = true;
    },

    'focusout': function (event) {
      if ($.ctx.mousedown)
        $.ctx.mousedown = null;
      else
        Dom.remove(this);
    },

    'mouseup .mdMention>div>*': function (event) {
      $.ctx.mousedown = false;
      acceptItem(event, this);
    },

    'input .mdMention>input': function (event) {
      var data = $.ctx.data;
      data.value = this.value;

      if (data.span) {
        data.span.textContent = data.value.replace(/ /g, '\xa0');
        transformList(data, event.currentTarget);
      }
      $.ctx.updateAllTags();
    },

    'keydown .mdMention>input': function (event) {
      switch(event.which) {
      case 9: // tab
        if (event.shiftKey) {
          cancelList(event.currentTarget);
          break;
        }
      case 13: // enter
        var item = event.currentTarget.getElementsByClassName('selected')[0];
        if (item)
          acceptItem(event, item);
        else
          cancelList(event.currentTarget);
        break;
      case 38: // up
      case 40: // down
        Dom.stopEvent();
        var elm = event.currentTarget.getElementsByClassName('selected')[0];
        if (!elm) return;
        var nextElm = event.which === 38 ? elm.previousElementSibling : elm.nextElementSibling;
        if (nextElm) {
          Dom.removeClass(elm, 'selected');
          Dom.addClass(nextElm, 'selected');
        }
        break;
      case 39: // right
        if (this.selectionStart === this.value.length) {
          cancelList(event.currentTarget);
          collapseRange();
        }
        break;
      case 37: // left
        if (this.selectionStart === 0) {
          cancelList(event.currentTarget);
          collapseRange(true);
        }
        break;
      case 8: // Backspace
        if (! this.value) {
          cancelList(event.currentTarget);
          execCommand('delete');
        }
        break;
      }
    },

    'keyup .mdMention>input': function (event) {
      switch(event.which) {
      case 27: // escape
        // this is a keyup event so that it stops propagating the event
        cancelList(event.currentTarget);
        break;
      };
    },
  });

  function acceptItem(event, item) {
    Dom.stopEvent();
    var data = $.ctx.data;

    var id = item.getAttribute('data-id');
    var nameELm = item.getElementsByClassName('name')[0];

    var frag = document.createDocumentFragment();
    frag.appendChild(Dom.html({tag: 'span', class: 'ln', text: (nameELm || item).textContent}));
    frag.appendChild(document.createTextNode('\xa0'));

    if (data.span) {
      revertMention(data.inputElm, frag);
    } else {
      setRange(data.range);
      data.inputElm.focus();
      MarkdownEditor.insert(frag);
    }

    var button = data.inputElm.getElementsByClassName('ln')[0];

    if (button) {
      button.setAttribute('contenteditable', 'false');
      button.className = '';
      button.setAttribute('data-a', id);
    }
    collapseRange();
    data.inputElm = null;
    Dom.remove(event.currentTarget);
  }

  function cancelList(elm) {
    Dom.stopEvent();
    Dom.remove(elm);
  }

  function revertMention(editorELm, button) {
    if (! editorELm) return;

    var lm = editorELm.getElementsByClassName('lm')[0];
    if (lm == null) return;

    var anchor = lm.firstChild.textContent;

    var dest = lm.previousSibling;
    if (dest) {
      var destOffset = dest.length;
      dest.textContent += '\xa0'+anchor+lm.nextSibling.textContent;

      var parent = lm.parentNode;
      parent.removeChild(lm.nextSibling);
      parent.removeChild(lm);

      var range = document.createRange();
      range.setStart(dest, destOffset);
      range.setEnd(dest, destOffset + 2);
      setRange(range);
      editorELm.focus(); // otherwise ?security violation? in Firefox

      MarkdownEditor.insert(button || lm.textContent);

      if (! button) {
        range = getRange();
        range.setStart(dest, destOffset);
        setRange(range);
      }
    }

    var mdCtx = Dom.getCtx(editorELm);
    if (mdCtx) {
      mdCtx.selectItem = null;
      mdCtx.mentionState = null;
    }
  }

  function collapseRange(start) {
    var sel = window.getSelection();
    var range = sel.getRangeAt(0);
    range.collapse(start);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function selectItem(data) {
    data.value = data.span.textContent;
    var al = Tpl.$autoRender(data);

    transformList(data, al);

    var input = al.firstChild;
    input.value = data.value;
    data.span.style.opacity = "0";

    data.inputElm.parentNode.appendChild(al);
    input.selectionStart = input.selectionEnd = 1;
    input.focus();
    return al;
  }

  function transformList(data, al) {
    var op = data.inputElm.parentNode.offsetParent;

    var spbb = Dom.clonePosition(data.span, al, op);
    var input = al.firstChild;
    var st = input.style;
    st.width = (spbb.width+2)+'px';
    st.height = spbb.height+'px';

    return op;
  }
  return Tpl;
});
