define(function(require, exports, module) {
  var Dom   = require('../dom');
  var koru   = require('../main');
  var util = require('../util');
  var Markdown = require('./markdown');
  var EditorCommon = require('./editor-common');
  var getRange = EditorCommon.getRange;
  var setRange = EditorCommon.setRange;

  var Tpl = Dom.newTemplate(require('../html!./markdown-editor'));
  var $ = Dom.current;
  var Input = Tpl.Input;

  Tpl.$extend({
    execCommand: execCommand,

    insert: EditorCommon.insert,

    moveLeft: function (select) {
      var range = getRange();
      var node = range.startContainer;
      if (node.nodeType === document.TEXT_NODE && range.startOffset !== 0) {
        range.setStart(node, range.startOffset - 1);
      } else {
        var node = range.startContainer.childNodes[range.startOffset - 1];
        if (node.nodeType !== document.TEXT_NODE) return; // we don't handle nested elms
        range.setStart(node, node.textContent.length -1);
      }
      select || range.collapse(true);

      setRange(range);
    },

    clear: function (elm) {
      if (! Dom.hasClass(elm, 'mdEditor'))
        elm = elm.parentNode;
      var input = Dom.getCtx(elm).data.inputElm;
      input.setAttribute('contenteditable', 'false');
      input.textContent = '';
      input.setAttribute('contenteditable', 'true');
      Dom.remove(Dom.getCtx(input).selectItem);
    },

    $created: function (ctx, elm) {
      var data = ctx.data;
      var options = data.options;

      var className = options['class'] || '';
      elm.className = className + " mdEditor";

      EditorCommon.addAttributes(elm, options);
      var tbElm = Tpl.Toolbar.$autoRender(data);
      elm.appendChild(tbElm);
      data.toolbar = Dom.getCtx(tbElm);

      var inElm = Input.$autoRender(data);
      data.inputElm = inElm;
      elm.appendChild(inElm);

      Object.defineProperty(elm, 'value', {get: function () {
        var value = Markdown.fromHtml(data.inputElm);
        if (! value) return value;

        value = value.replace(/(^|\s)(https?:\/\/\S+)/g, '$1[$2]($2)');
        if (value[value.length -1] === "\n")
          return value.slice(0, -1);
        return value;
      }});
    },

    getRange: getRange,
    setRange: setRange,
    getTag: getTag,
    selectElm: selectElm,
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
        elm.appendChild(Markdown.toHtml(content, null, 'editable'));
    },

    $destroyed: function (ctx) {
      Dom.remove(ctx.selectItem);
    },
  });

  var COMMANDS = {
    66: 'bold',
    73: 'italic',
    85: 'noop',
  };

  Input.$events({
    'click button': function (event) {
      Dom.stopEvent();
    },
    keydown: function (event) {
      var mdEditor = this.parentNode;

      switch(event.which) {
      case 229: case 16:
        return;

      default:
        if (event.ctrlKey) {
          var command = COMMANDS[event.which];
          if (command) {
            Dom.stopEvent();
            execCommand(command);
            return;
          }
        }
        break;
      }

      if ($.ctx.mentionState != null && $.ctx.mentionState < 3 &&
          ++$.ctx.mentionState > 2) {
        // we had a non printable key pressed; abort mention
        Tpl.List.revertMention(this);
      }
    },

    input: function (event) {
      var lec = this.lastElementChild;
      if (! lec) return;
      var lt = lec && lec.nextSibling;

      if (! (lt && lt.nodeType === document.TEXT_NODE && lt.textContent)) {
        var sp = document.createTextNode('\xa0');
        this.insertBefore(sp, lt);
      }
    },

    keypress: function (event) {
      var ctx = $.ctx;

      if (ctx.mentionState != null && ctx.mentionState < 3) {
        Dom.stopEvent();
        var ch = String.fromCharCode(event.which);
        var range = getRange();
        var span = Dom.html({tag: 'span', "class": 'ln', text: ch});
        range.insertNode(span);
        ctx.mentionState = 3;
        ctx.selectItem = Tpl.List.selectItem({inputCtx: ctx, inputElm: this, span: span});
        return;
      }
      switch(event.which) {
      case 64:
        if (event.shiftKey) {
          var range = getRange();
          if (range.startOffset !== 0) {
            if (range.startContainer.nodeType === document.TEXT_NODE) {
              var text = range.startContainer.textContent;
              text = text[range.startOffset - 1];
            } else {
              var text = range.startContainer.childNodes[range.startOffset - 1].textContent;
            }
            if (text.match(/\S/)) return;
          }
          ctx.mentionState = 1;
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
      var etb = this.querySelectorAll('[data-a]:not([contenteditable])');
      for(var i = 0; i < etb.length; ++i) {
        etb[i].setAttribute('contenteditable', 'false');
      }
      updateToolbar(ctx.data);
    },

    mouseup: function () {
      updateToolbar($.ctx.data);
    },

    'paste': function (event) {
      if ('clipboardData' in event) {
        var types = event.clipboardData.types;
        if (types) for(var i = 0; i < types.length; ++i) {
          var type = types[i];
          if (/html/.test(type)) {
            var md = Markdown.fromHtml(Dom.html('<div>'+event.clipboardData.getData(type)+'</div>'));
            if (Tpl.insert(Markdown.toHtml(md)) || Tpl.insert(md))
              Dom.stopEvent();
            return;
          }
        }
      }
    },
  });

  function updateToolbar(data) {
    data.active = true;
    data.toolbar.updateAllTags();
  }

  function getTag(tag) {
    var range = getRange();
    if (range === null) return null;
    var start = getRange().startContainer;
    return Dom.searchUpFor(start, function (elm) {
      return elm.tagName === tag;
    }, 'mdEditor');
  }

  function selectElm(elm) {
    if (elm) {
      var range = document.createRange();
      range.selectNode(elm);
      setRange(range);
      return range;
    }
  }

  function execCommand (cmd, value) {
    return document.execCommand(cmd, false, value);
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
