define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const Modal           = require('koru/ui/modal');
  const util            = require('koru/util');

  const Tpl = Dom.newTemplate(module, require('koru/html!./rich-text-mention'));
  const $ = Dom.current;

  const {setRange, getRange} = Dom;

  let execCommand, RichTextEditor;

  const acceptItem = (event, item)=>{
    Dom.stopEvent();

    const {data} = $.ctx;

    const link = data.mentions[data.type].html(item, $.ctx);
    if (! link)
      return;

    const frag = document.createDocumentFragment();
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
  };

  const cancelList = (elm, collapseStart)=>{
    Dom.stopEvent();
    if (collapseStart !== undefined) {
      revertMention($.data(elm).inputElm, null, collapseStart);
    }
    Dom.remove(elm);
  };

  const revertMention = (editorELm, frag, collapseStart)=>{
    if (! editorELm) return;

    const ln = editorELm.getElementsByClassName('ln')[0];
    if (ln) {
      const dest = ln.previousSibling;
      ln.remove();
      if (dest) {
        const destOffset = dest.length;

        editorELm.focus();
        const range = document.createRange();
        range.setStart(dest, destOffset);
        range.collapse(collapseStart);
        setRange(range);
        if (! frag) {
          ln.textContent && RichTextEditor.insert(ln.textContent);
          const range = getRange();
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

    const rtCtx = Dom.ctx(editorELm);
    if (rtCtx) {
      rtCtx.selectItem = null;
      rtCtx.mentionState = null;
    }
  };

  const collapseRange = (start)=>{
    const range = Dom.getRange();
    range.collapse(start);
    Dom.setRange(range);
  };

  const selectItem = (data)=>{
    data.value = data.span.textContent;
    const al = Tpl.$autoRender(data);

    Modal.append('on', {container: al, origin: data.span, handleTab: true});
    transformList(data, al);

    const input = al.firstChild.firstChild;
    input.value = data.value;
    data.span.style.opacity = "0";

    input.selectionStart = input.selectionEnd = 1;
    input.focus();
    return al;
  };

  const transformList = (data, al)=>{
    // noAppend needed to stop firefox loosing focus
    const rtMention = al.firstElementChild;
    Dom.reposition('on', {popup: rtMention, origin: data.span});
    const list = rtMention.lastElementChild;
    Dom.reposition('below', {popup: list, origin: rtMention.firstElementChild});
  };

  Tpl.$extend({
    $created(ctx, elm) {
      const {inputCtx} = ctx.data;
      inputCtx.openDialog = true;
      inputCtx.undo.pause();
    },

    $destroyed(ctx, elm) {
      const {data} = ctx;
      const {inputCtx} = data;
      inputCtx.openDialog = false;
      try {
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
      inputCtx.undo.unpause();
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
      const frag = document.createDocumentFragment();
      const parentNode = $.element.parentNode;
      const needMore = this.mentions[this.type].list(frag, this.value, $.ctx, parentNode);
      Dom.addClass(frag.firstChild, 'selected');

      Dom.setClass('needMore', needMore, parentNode);
      Dom.setClass('empty', ! frag.firstChild, parentNode);

      return frag;
    },
  });

  Tpl.$events({
    'pointerover .rtMention>div>:not(.disabled)'(event) {
      Dom.removeClass(event.currentTarget.getElementsByClassName('selected')[0], 'selected');
      Dom.addClass(this, 'selected');
    },

    'pointerdown .rtMention'(event) {
      Dom.stopEvent();
    },

    'pointerup .rtMention>div>:not(.disabled)'(event) {
      acceptItem(event, this);
    },

    'input .rtMention>input'(event) {
      const {data} = $.ctx;
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
        const item = event.currentTarget.getElementsByClassName('selected')[0];
        if (item)
          acceptItem(event, item);
        else
          cancelList(event.currentTarget);
        break;
      case 38: // up
      case 40: // down
        Dom.stopEvent();
        const elm = event.currentTarget.getElementsByClassName('selected')[0];
        if (elm == null) return;
        let nextElm = elm;
        do {
          nextElm = event.which === 38 ? nextElm.previousElementSibling : nextElm.nextElementSibling;
        } while(nextElm != null && nextElm.classList.contains('disabled'))
        if (nextElm != null) {
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

  return Tpl;
});
