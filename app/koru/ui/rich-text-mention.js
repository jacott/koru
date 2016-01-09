define(function(require, exports, module) {
  var util = require('koru/util');
  var Dom = require('koru/dom');
  var koru = require('koru');
  var Modal = require('./modal');

  var Tpl = Dom.newTemplate(module, require('koru/html!./rich-text-mention'));
  var $ = Dom.current;

  var setRange = Dom.setRange;
  var getRange = Dom.getRange;

  var execCommand, RichTextEditor;

  Tpl.$extend({
    $destroyed: function (ctx, elm) {
      try {
        revertMention(ctx.data.inputElm);
      } catch(ex) {
        koru.unhandledException(ex);
      }
      ctx.data.close && ctx.data.close();
    },

    selectItem: selectItem,

    revertMention: revertMention,

    init: function (rte) {
      RichTextEditor = rte;
      execCommand = rte.execCommand;
    }
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
      this.inputCtx.data.options[this.type].list(frag, this.value);
      Dom.addClass(frag.firstChild, 'selected');

      Dom.setClass('empty', ! frag.firstChild, $.element.parentNode);

      return frag;
    },
  });

  Tpl.$events({
    'mouseover .rtMention>div>*': function (event) {
      Dom.removeClass(event.currentTarget.getElementsByClassName('selected')[0], 'selected');
      Dom.addClass(this, 'selected');
    },

    'mousedown .rtMention>div>*': function (event) {
      Dom.stopEvent();
      $.ctx.mousedown = true;
    },

    'focusout': function (event) {
      if ($.ctx.mousedown)
        $.ctx.mousedown = null;
      else
        Dom.remove(this);
    },

    'mouseup .rtMention>div>*': function (event) {
      var ctx = $.ctx;
      acceptItem(event, this);
      ctx.mousedown = false;
    },

    'input .rtMention>input': function (event) {
      var data = $.ctx.data;
      data.value = this.value;

      $.ctx.updateAllTags();
      if (data.span) {
        data.span.textContent = data.value.replace(/ /g, '\xa0');
        transformList(data, event.currentTarget, true);
      }
    },

    'keydown .rtMention>input': function (event) {
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
          collapseRange(false);
        }
        break;
      case 37: // left
        if (this.selectionStart === 0) {
          cancelList(event.currentTarget);
          RichTextEditor.moveLeft($.ctx.data.inputElm);
        }
        break;
      case 8: // Backspace
        if (! this.value) {
          cancelList(event.currentTarget);
          execCommand('delete');
          Dom.stopEvent();
        }
        break;
      }
    },

    'keyup .rtMention>input': function (event) {
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
      RichTextEditor.insert(frag);
    }

    var button = data.inputElm.getElementsByClassName('ln')[0];

    if (button) {
      button.setAttribute('contenteditable', 'true');
      button.className = 'link user';
      button.setAttribute('data-a', id);
    }
    collapseRange(false);
    data.inputElm = null;
    Dom.remove(event.currentTarget);
  }

  function cancelList(elm) {
    Dom.stopEvent();
    Dom.remove(elm);
  }

  function revertMention(editorELm, button) {
    if (! editorELm) return;

    var ln = editorELm.getElementsByClassName('ln')[0];
    if (ln) {
      var dest = ln.previousSibling;
      var parent = ln.parentNode;
      parent && parent.removeChild(ln);
      if (dest) {
        var destOffset = dest.length;

        editorELm.focus();
        var range = document.createRange();
        range.setStart(dest, destOffset);
        range.collapse(true);
        Dom.setRange(range);
        if (! button) {
          ln.textContent && RichTextEditor.insert(ln.textContent);
          var range = getRange();
          if (range) { // maybe missing on destroy
            range.setStart(dest, destOffset);
            setRange(range);
          }
        } else {
          RichTextEditor.moveLeft(editorELm, 'select');
          RichTextEditor.insert(button);
        }
      }
    } else {
      editorELm.focus();
    }

    var rtCtx = Dom.getCtx(editorELm);
    if (rtCtx) {
      rtCtx.selectItem = null;
      rtCtx.mentionState = null;
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

    input.selectionStart = input.selectionEnd = 1;
    input.focus();
    return al;
  }

  function transformList(data, al, noAppend) {
    // noAppend needed to stop firefox loosing focus
    Modal.append('on', {container: al, popup: al, noAppend: noAppend, origin: data.span});
    Modal.append('below', {container: al.lastElementChild, popup: al.lastElementChild, noAppend: true, origin: al.firstElementChild});
  }

  return Tpl;
});