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
    $created(ctx, elm) {
      ctx.data.inputCtx.openDialog = true;
    },

    $destroyed(ctx, elm) {
      try {
        var data = ctx.data;
        data.inputCtx.openDialog = false;
        if (data.span) {
          revertMention(data.inputElm);
        } else if (data.inputElm) {
          data.range.collapse();
          setRange(data.range);
          data.inputElm.focus();
        }
      } catch(ex) {
        koru.unhandledException(ex);
      }
    },

    selectItem: selectItem,

    revertMention: revertMention,

    init(rte) {
      RichTextEditor = rte;
      execCommand = rte.execCommand;
    }
  });

  Tpl.$helpers({
    inlineClass() {
      Dom.setClass('inline', this.span);
    },
    content() {
      return this.value;
    },

    list() {
      var frag = document.createDocumentFragment();
      var parentNode = $.element.parentNode;
      var needMore = this.mentions[this.type].list(frag, this.value, $.ctx, parentNode);
      Dom.addClass(frag.firstChild, 'selected');

      Dom.setClass('needMore', needMore, parentNode);
      Dom.setClass('empty', ! frag.firstChild, parentNode);

      return frag;
    },
  });

  Tpl.$events({
    'pointerover .rtMention>div>*'(event) {
      Dom.removeClass(event.currentTarget.getElementsByClassName('selected')[0], 'selected');
      Dom.addClass(this, 'selected');
    },

    'pointerdown .rtMention'(event) {
      Dom.stopEvent();
    },

    'pointerup .rtMention>div>*'(event) {
      var ctx = $.ctx;
      acceptItem(event, this);
    },

    'input .rtMention>input'(event) {
      var data = $.ctx.data;
      data.value = this.value;

      $.ctx.updateAllTags();

      if (data.value !== this.value)
        this.value = data.value;
      if (data.span) {
        data.span.textContent = data.value.replace(/ /g, '\xa0');
        transformList(data, event.currentTarget);
      }
    },

    'keydown .rtMention>input'(event) {
      switch(event.which) {
      case 9: // tab
        if (event.shiftKey) {
          cancelList(event.currentTarget, true);
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
          cancelList(event.currentTarget, true);
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
  });

  function acceptItem(event, item) {
    Dom.stopEvent();

    var data = $.ctx.data;

    var link = data.mentions[data.type].html(item, $.ctx);
    if (! link)
      return;

    var frag = document.createDocumentFragment();
    frag.appendChild(link);
    frag.appendChild(document.createTextNode('\xa0'));

    if (data.span) {
      revertMention(data.inputElm, frag);
    } else {
      setRange(data.range);
      data.range = null;
      data.inputElm.focus();
      RichTextEditor.insert(frag);
    }

    collapseRange(false);
    data.inputElm = null;
    Dom.remove(event.currentTarget);
  }

  function cancelList(elm, collapseStart) {
    Dom.stopEvent();
    if (collapseStart !== undefined) {
      revertMention($.data(elm).inputElm, null, collapseStart);
    }
    Dom.remove(elm);
  }

  function revertMention(editorELm, frag, collapseStart) {
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
        range.collapse(collapseStart);
        setRange(range);
        if (! frag) {
          ln.textContent && RichTextEditor.insert(ln.textContent);
          var range = getRange();
          if (range) { // maybe missing on destroy
            range.setStart(dest, destOffset);
            range.collapse(collapseStart);
            setRange(range);
          }
        } else {
          RichTextEditor.moveLeft(editorELm, 'select');
          RichTextEditor.insert(frag);
        }
      }
    } else {
      editorELm.focus();
    }

    var rtCtx = Dom.ctx(editorELm);
    if (rtCtx) {
      rtCtx.selectItem = null;
      rtCtx.mentionState = null;
    }
  }

  function collapseRange(start) {
    var range = Dom.getRange();
    range.collapse(start);
    Dom.setRange(range);
  }

  function selectItem(data) {
    data.value = data.span.textContent;
    var al = Tpl.$autoRender(data);

    Modal.append('on', {container: al, origin: data.span, handleTab: true});
    transformList(data, al);

    var input = al.firstChild.firstChild;
    input.value = data.value;
    data.span.style.opacity = "0";

    input.selectionStart = input.selectionEnd = 1;
    input.focus();
    return al;
  }

  function transformList(data, al) {
    // noAppend needed to stop firefox loosing focus
    var rtMention = al.firstElementChild;
    Modal.reposition('on', {popup: rtMention, origin: data.span});
    var list = rtMention.lastElementChild;
    Modal.reposition('below', {popup: list, origin: rtMention.firstElementChild});
  }

  return Tpl;
});
