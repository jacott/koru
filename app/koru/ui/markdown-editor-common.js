define(function(require, exports, module) {
  var Dom   = require('../dom');
  var koru   = require('../main');
  var util = require('../util');
  var Markdown = require('./markdown');
  var Tpl = Dom.newTemplate(require('../html!./markdown-editor'));

  var $ = Dom.current;

  var Input = Tpl.Input;


  var IGNORE_OPTIONS = {"class": true, type: true, atList: true};

  Tpl.$extend({
    execCommand: execCommand,

    clear: function (elm) {
      if (! Dom.hasClass(elm, 'mdEditor'))
        elm = elm.parentNode;
      var input = Dom.getCtx(elm).data.inputElm;
      input.setAttribute('contenteditable', 'false');
      input.textContent = '';
      input.setAttribute('contenteditable', 'true');
      Dom.remove(Dom.getCtx(input).selectItem);
      Dom.addClass(elm, 'empty');
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
      data.toolbar = Dom.getCtx(tbElm);

      var inElm = Input.$autoRender(data);
      data.inputElm = inElm;
      elm.appendChild(inElm);

      Object.defineProperty(elm, 'value', {get: function () {
        var value = Markdown.fromHtml(data.inputElm);
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
      Dom.addClass(this, 'focus');
      updateToolbar($.ctx.data);
    },

    'focusout': function (event) {
      Dom.removeClass(this, 'focus');
    },
  });

  Input.$extend({
    $created: function (ctx, elm) {
      var content = ctx.data.content;

      if (content)
        elm.appendChild(Markdown.toHtml(content));

      ctx.br = document.createElement('br');
    },

    $destroyed: function (ctx) {
      Dom.remove(ctx.selectItem);
    },
  });

  Input.$events({
    'click button': function (event) {
      Dom.stopEvent();
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
        Dom.stopEvent();
        var ch = String.fromCharCode(event.which);
        execCommand('insertText', ch);
        var range = getRange();
        var tnode = range.startContainer;
        tnode.textContent = '@';
        var span = Dom.html({tag: 'span', "class": 'ln', text: ch});
        tnode.parentNode.appendChild(span);
        range.selectNode(span.firstChild, ch.length);
        range.selectNode(span.firstChild, ch.length);
        setRange(range);
        ctx.mentionState = 3;
        ctx.selectItem = Tpl.List.selectItem({inputCtx: ctx, inputElm: this, span: span});
        return;
      }
      switch(event.which) {
      case 64:
        if (event.shiftKey) {
          var range = getRange();
          if (range.startContainer.nodeType === document.TEXT_NODE) {
            var text = range.startContainer.textContent;
            if (range.startOffset !== 0 && text[range.startOffset - 1].match(/\S/)) return;
          }
          Dom.stopEvent();
          ctx.mentionState = 1;

          execCommand('insertText', ' @ ');
          var range = getRange();
          range.setStart(range.startContainer, range.startOffset - 2);
          range.deleteContents();
          var span = Dom.html({tag: 'span', "class": 'lm', text: '@'});
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
        Dom.remove(ctx.selectItem);
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
      if (! Dom.hasClass(mdEditor, 'empty') === isEmpty)
        Dom.setClass('empty', isEmpty, mdEditor);
    },

    'paste': function (event) {
      if ('clipboardData' in event) {
        var items = event.clipboardData.items;
        var index = util.indexOfRegex(items, /html/, 'type');
        if (index !== -1) {
          var md = Markdown.fromHtml(Dom.html('<div>'+event.clipboardData.getData(items[index].type)+'</div>'));
          if (execCommand('insertHTML', Markdown.toHtml(md, 'div').innerHTML) || execCommand('insertText', md))
            Dom.stopEvent();
        }
      }
    },
  });

  function updateToolbar(data) {
    data.active = true;
    data.toolbar.updateAllTags();
  }

  function getRange() {
    var sel = window.getSelection();
    if (sel.rangeCount === 0) return null;
    return sel.getRangeAt(0);
  }

  function getTag(tag) {
    var range = getRange();
    if (range === null) return null;
    var start = getRange().startContainer;
    return Dom.searchUpFor(start, function (elm) {
      return elm.tagName === tag;
    }, 'mdEditor');
  }

  function execCommand (cmd, value) {
    return document.execCommand(cmd, false, value);
  }

  function setRange(range) {
    var sel = window.getSelection();
		try {
			sel.removeAllRanges();
		} catch (ex) {
			document.body.createTextRange().select();
			document.selection.empty();
		}
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


  Dom.registerHelpers({
    markdownEditor: function (content, options) {
      return Tpl.$autoRender({content: content, options: options});
    }
  });

  return Tpl;
});
