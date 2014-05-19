var $ = Bart.current;
var Tpl = Bart.MarkdownEditor;
var List = Tpl.List;
var Input = Tpl.Input;


var IGNORE_OPTIONS = {"class": true, type: true, atList: true};

Tpl.$extend({
  clear: function (elm) {
    if (! Bart.hasClass(elm, 'mdEditor'))
      elm = elm.parentNode;
    var input = Bart.getCtx(elm).data.inputElm;
    input.setAttribute('contenteditable', 'false');
    input.textContent = '';
    input.setAttribute('contenteditable', 'true');
    Bart.remove(Bart.getCtx(input).selectItem);
    Bart.addClass(elm, 'empty');
  },

  $created: function (ctx, elm) {
    var data = ctx.data;
    var options = data.options;

    var className = options['class'] || '';
    if (! data.content) className += ' empty';
    elm.className = className + " mdEditor";

    for(var key in options) {
      if (key in IGNORE_OPTIONS) continue;
      elm.setAttribute(key, options[key]);
    }

    var tbElm = Tpl.Toolbar.$autoRender(data);
    elm.appendChild(tbElm);
    data.toolbar = Bart.getCtx(tbElm);

    var inElm = Input.$autoRender(data);
    data.inputElm = inElm;
    elm.appendChild(inElm);

    Object.defineProperty(elm, 'value', {get: function () {
      var value = App.Markdown.fromHtml(data.inputElm);
      if (! value) return value;
      if (value[value.length -1] === "\n")
        return value.slice(0, -1);
      return value;
    }});
  },

  getRange: getRange,
  setRange: setRange,
  getTag: getTag,
  getCaretRect: getCaretRect,
});

Tpl.$events({
  'focusin': function (event) {
    Bart.addClass(this, 'focus');
    updateToolbar($.ctx.data);
  },

  'focusout': function (event) {
    Bart.removeClass(this, 'focus');
  },
});

Input.$extend({
  $created: function (ctx, elm) {
    var content = ctx.data.content;

    if (content)
      elm.appendChild(App.Markdown.toHtml(content));

    ctx.br = document.createElement('br');
  },

  $destroyed: function (ctx) {
    Bart.remove(ctx.selectItem);
  },
});

Input.$events({
  'click button': function (event) {
    Bart.stopEvent();
  },
  keydown: function (event) {
    if (event.which === 229) return;

    if (event.which !== 16 && $.ctx.mentionState != null && $.ctx.mentionState < 3 &&
        ++$.ctx.mentionState > 2) {
      // we had a non printable key pressed; abort mention
      Tpl.List.revertMention(this);
    }
  },

  keypress: function (event) {
    var ctx = $.ctx;
    if (ctx.mentionState != null && ctx.mentionState < 3) {
      Bart.stopEvent();
      var ch = String.fromCharCode(event.which);
      document.execCommand('insertText', null, ch);
      var range = getRange();
      var tnode = range.startContainer;
      tnode.textContent = '@';
      var span = Bart.html({tag: 'span', "class": 'ln', text: ch});
      tnode.parentNode.appendChild(span);
      range.selectNode(span.firstChild, ch.length);
      range.selectNode(span.firstChild, ch.length);
      setRange(range);
      ctx.mentionState = 3;
      ctx.selectItem = List.selectItem({inputCtx: ctx, inputElm: this, span: span});
      return;
    }
    switch(event.which) {
    case 64:
      if (event.shiftKey) {
        var range = getRange();
        var text = range.startContainer.textContent;
        if (range.startOffset !== 0 && text[range.startOffset - 1].match(/\S/)) return;
        Bart.stopEvent();
        ctx.mentionState = 1;

        document.execCommand('insertText', null, ' @ ');
        var range = getRange();
        range.setStart(range.startContainer, range.startOffset - 2);
        range.deleteContents();
        var span = Bart.html({tag: 'span', "class": 'lm', text: '@'});
        range.insertNode(span);
        range.setStart(span.firstChild, 1);
        range.setEnd(span.firstChild, 1);
        span.previousSibling.textContent = span.previousSibling.textContent.slice(0, -1);
        setRange(range);
        return;
      }
      break;
    }
  },
  keyup: function () {
    var ctx = $.ctx;
    if (ctx.selectItem && ! $.data(ctx.selectItem).span.parentNode) {
      Bart.remove(ctx.selectItem);
    }
    if (this.lastChild && ctx.br !== this.lastChild) {
      this.appendChild(ctx.br);
    }
    var etb = this.querySelectorAll('[data-a]:not([contenteditable])');
    for(var i = 0; i < etb.length; ++i) {
      etb[i].setAttribute('contenteditable', 'false');
    }
    updateToolbar(ctx.data);
  },

  mouseup: function () {
    updateToolbar($.ctx.data);
  },

  'input': function (event) {
    var ctx = $.ctx;
    var input = this;
    var mdEditor = input.parentNode;
    if (ctx.br === input.firstChild) {
      input.removeChild(ctx.br);
    }
    var isEmpty = ! input.firstChild;
    if (! Bart.hasClass(mdEditor, 'empty') === isEmpty)
      Bart.setClass('empty', isEmpty, mdEditor);
  },

  'paste': function (event) {
    if ('clipboardData' in event) {
      var items = event.clipboardData.items;
      var index = Apputil.indexOfRegex(items, /html/, 'type');
      if (index !== -1) {
        var md = App.Markdown.fromHtml(Bart.html('<div>'+event.clipboardData.getData(items[index].type)+'</div>'));
        if (document.execCommand('insertHTML', null, App.Markdown.toHtml(md, 'div').innerHTML) || document.execCommand('insertText', null, md))
          Bart.stopEvent();
      }
    }
  },
});

function updateToolbar(data) {
  data.active = true;
  data.toolbar.updateAllTags();
}

function getRange() {
  var sel = getSelection();
  if (sel.rangeCount === 0) return null;
  return sel.getRangeAt(0);
}

function getTag(tag) {
  var range = getRange();
  if (range === null) return null;
  var start = getRange().startContainer;
  return Bart.searchUpFor(start, function (elm) {
    return elm.tagName === tag;
  }, 'mdEditor');
}

function setRange(range) {
  var sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function getCaretRect(range) {
  var node = range.startContainer;
  if (! node) return null;

  var bb = range.getClientRects()[0];
  if (bb) return bb;

  if ('getBoundingClientRect' in node) {
    if (range.startOffset < node.childNodes.length) {
      node = node.childNodes[range.startOffset];
      if ('getBoundingClientRect' in node) {
        var bb = node.getBoundingClientRect();
        if (bb.top === 0 && bb.bottom === 0 && bb.left === 0 && bb.right === 0)
          return range.startContainer.getBoundingClientRect();
        return bb;
      } else {
        range = document.createRange();
        range.selectNodeContents(node);
        return range.getClientRects()[0];
      }
    } else {
      return node.getBoundingClientRect();
    }
  } else {
    return null;
  }
}


Bart.registerHelpers({
  markdownEditor: function (content, options) {
    return Tpl.$autoRender({content: content, options: options});
  }
});
