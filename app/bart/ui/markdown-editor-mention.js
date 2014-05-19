var $ = Bart.current;
var MarkdownEditor = Bart.MarkdownEditor;
var List = MarkdownEditor.List;

var setRange = MarkdownEditor.setRange;
var getRange = MarkdownEditor.getRange;

List.$extend({
  $destroyed: function (ctx, elm) {
    revertMention(ctx.data.inputElm);
  },

  selectItem: selectItem,

  revertMention: revertMention,
});

List.$helpers({
  content: function () {
    return this.span.textContent;
  },

  list: function () {
    var frag = document.createDocumentFragment();
    this.inputCtx.data.options.atList(frag, this.span.textContent);
    Bart.addClass(frag.firstChild, 'selected');

    Bart.setClass('empty', ! frag.firstChild, $.element.parentNode);

    return frag;
  },
});

List.$events({
  'mouseover .mdList>div>*': function (event) {
    Bart.removeClass(event.currentTarget.getElementsByClassName('selected')[0], 'selected');
    Bart.addClass(this, 'selected');
  },

  'mousedown .mdList>div>*': function (event) {
    Bart.stopEvent();
    $.ctx.mousedown = true;
  },

  'focusout': function (event) {
    if ($.ctx.mousedown)
      $.ctx.mousedown = null;
    else
      Bart.remove(this);
  },

  'mouseup .mdList>div>*': function (event) {
    $.ctx.mousedown = false;
    acceptItem(event, this);
  },

  'input .mdList>input': function (event) {
    var data = $.ctx.data;

    data.span.textContent = this.value.replace(/ /g, ' ');
    transformList(data, event.currentTarget);
    $.ctx.updateAllTags();
  },

  'keydown .mdList>input': function (event) {
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
      Bart.stopEvent();
      var elm = event.currentTarget.getElementsByClassName('selected')[0];
      if (!elm) return;
      var nextElm = event.which === 38 ? elm.previousElementSibling : elm.nextElementSibling;
      if (nextElm) {
        Bart.removeClass(elm, 'selected');
        Bart.addClass(nextElm, 'selected');
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
        document.execCommand('delete', null, '');
      }
      break;
    }
  },

  'keyup .mdList>input': function (event) {
    switch(event.which) {
    case 27: // escape
      // this is a keyup event so that it stops propagating the event
      cancelList(event.currentTarget);
      break;
    };
  },
});

function acceptItem(event, item) {
  Bart.stopEvent();
  var data = $.ctx.data;

  var id = item.getAttribute('data-id');
  var nameELm = item.getElementsByClassName('name')[0];

  revertMention(data.inputElm,
                '<span class="ln">'+
                Bart.escapeHTML((nameELm || item).textContent)+
                '</span>&nbsp;');

  var button = data.inputElm.getElementsByClassName('ln')[0];

  if (button) {
    button.setAttribute('contenteditable', 'false');
    button.className = '';
    button.setAttribute('data-a', id);
  }
  collapseRange();

  Bart.remove(event.currentTarget);
}

function cancelList(elm) {
  Bart.stopEvent();
  Bart.remove(elm);
}

function revertMention(editorELm, button) {
  var lm = editorELm.getElementsByClassName('lm')[0];
  if (lm == null) return;

  var anchor = lm.firstChild.textContent;
  var text = button || lm.textContent;

  var dest = lm.previousSibling;
  if (dest) {
    var destOffset = dest.length;
    dest.textContent += ' '+anchor+lm.nextSibling.textContent;

    var parent = lm.parentNode;
    parent.removeChild(lm.nextSibling);
    parent.removeChild(lm);

    var range = document.createRange();
    range.setStart(dest, destOffset);
    range.setEnd(dest, destOffset + 2);
    setRange(range);
    document.execCommand(button ? 'insertHTML' : 'insertText', false, text);
    if (! button) {
      range = getRange();
      range.setStart(dest, destOffset);
      setRange(range);
    }
  }

  var mdCtx = Bart.getCtx(editorELm);
  if (mdCtx) {
    mdCtx.selectItem = null;
    mdCtx.mentionState = null;
  }
}

function collapseRange(start) {
  var sel = getSelection();
  var range = sel.getRangeAt(0);
  range.collapse(start);
  sel.removeAllRanges();
  sel.addRange(range);
}

function selectItem(data) {
  var al = List.$autoRender(data);

  transformList(data, al);

  var input = al.firstChild;
  input.value = data.span.textContent;
  data.span.style.opacity = "0";

  data.inputElm.parentNode.appendChild(al);
  input.selectionStart = input.selectionEnd = 1;
  input.focus();
  return al;
}

function transformList(data, al) {
  var op = data.inputElm.parentNode.offsetParent;

  var spbb = Bart.clonePosition(data.span, al, op);
  var input = al.firstChild;
  var st = input.style;
  st.width = (spbb.width+2)+'px';
  st.height = spbb.height+'px';

  return op;
}
