define(function(require, exports, module) {
  var util = require('koru/util');
  var Dom = require('koru/dom');
  var RichText = require('./rich-text');
  var KeyMap = require('./key-map');
  var RichTextMention = require('./rich-text-mention');

  var Tpl = Dom.newTemplate(module, require('koru/html!./rich-text-editor'));
  var $ = Dom.current;

  var TEXT_NODE = document.TEXT_NODE;

  var BR = document.createElement('br');

  var INLINE_TAGS = RichText.INLINE_TAGS;

  var shift = KeyMap.shift, ctrl = KeyMap.ctrl;

  var actions = commandify({
    bold: true,
    italic: true,
    underline: true,
    insertOrderedList: true,
    insertUnorderedList: true,
    outdent: true,
    indent: true,
  });

  var keyMap = KeyMap(mapActions({
    bold: ctrl+'B',
    italic: ctrl+'I',
    underline: ctrl+'U',
    insertOrderedList: ctrl+shift+'7',
    insertUnorderedList: ctrl+shift+'8',
    outdent: ctrl+'Û', // '['
    indent: ctrl+'Ý', // ']'
  }));

  keyMap.addKeys(mapActions({
    outdent: ctrl+'[',
    indent: ctrl+']',
  }));

  function commandify(func, cmd) {
    switch(typeof func) {
    case 'function':
      return function (event) {
        return func.call(null, event, cmd);
      };
    case 'boolean':
      return function () {
        execCommand(cmd);
      };
    }
    for (cmd in func) {
      func[cmd] = commandify(func[cmd], cmd);
    }
    return func;
  }


  function mapActions(keys) {
    for (var name in keys) {
      keys[name] = [keys[name], actions[name]];
    }
    return keys;
  }

  function execFunc(command) {
    return function () {

    };
  }

  Tpl.$helpers({
    attrs: function () {
      var elm = $.element;
      var options = this.options;
      for (var id in options) {
        if (id === 'type' || id[0] === '$') continue;
        (id === 'placeholder' ?
         $.ctx.inputElm : elm)
          .setAttribute(id, options[id]);
      }
      Dom.addClass(elm, 'richTextEditor');
    },
  });

  function getHtml() {
    return Dom.getMyCtx(this).inputElm.cloneNode(true);
  }

  function setHtml(value) {
    var inputElm = Dom.getMyCtx(this).inputElm;
    Tpl.clear(inputElm);
    inputElm.appendChild(value);
  }

  Tpl.$extend({
    $created: function (ctx, elm) {
      Object.defineProperty(elm, 'value', {configurable: true, get: getHtml, set: setHtml});
      ctx.inputElm = elm.lastChild;
      ctx.data.content && ctx.inputElm.appendChild(ctx.data.content);
      Dom.nextFrame(function () {
        ctx.inputElm.focus();
      });
    },

    $destroyed: function (ctx) {
      Dom.remove(ctx.selectItem);
    },

    title: function (title, action) {
      return keyMap.getTitle(title, action);
    },

    clear: function (elm) {
      if (! Dom.hasClass(elm, 'richTextEditor'))
        elm = elm.parentNode;
      var ctx = Dom.getCtx(elm);
      var input = ctx.inputElm;
      input.setAttribute('contenteditable', 'false');
      input.textContent = '';
      input.setAttribute('contenteditable', 'true');
      Dom.remove(ctx.selectItem);
    },

    moveLeft: function (editor, mark) {
      var range = select(editor, 'char', -1);
      if (! range) return;
      if (! mark) {
        range.collapse(true);
      }
      Dom.setRange(range);
    },

    select: select,
    execCommand: execCommand,
    getTag: getTag,
    findContainingBlock: findContainingBlock,
    firstInnerMostNode: firstInnerMostNode,
    lastInnerMostNode: lastInnerMostNode,

    insert: function (arg, inner) {
      if (typeof arg === 'string')
        return execCommand('insertText', arg);

      if (arg.nodeType === document.DOCUMENT_FRAGMENT_NODE) {
        var t = document.createElement('div');
        t.appendChild(arg);
        t = t.innerHTML;
      } else if (inner) {
        var t = arg.innerHTML;
      } else {
        var t = arg.outerHTML;
      }
      return execCommand("insertHTML", t);
    },

    keyMap: keyMap,
  });

  Tpl.$events({
    'paste': function (event) {
      if ('clipboardData' in event) {
        var types = event.clipboardData.types;
        if (types) for(var i = 0; i < types.length; ++i) {
          var type = types[i];
          if (/html/.test(type)) {
            var md = RichText.fromHtml(Dom.html('<div>'+event.clipboardData.getData(type)+'</div>'));
            var text = md[0].join('\n');

            var div = document.createElement('div');
            if (Tpl.insert(RichText.toHtml(text, md[1], div).firstChild, 'inner') || Tpl.insert(text))
              Dom.stopEvent();
            return;
          }
        }
      }
    },

    'click a,button': function (event) {
      event.preventDefault();
    },

    keydown: function (event) {
      var mdEditor = this.parentNode;

      switch(event.which) {
      case 229: case 16:
        return;
      }

      if (event.ctrlKey) {
        keyMap.exec(event, 'ignoreFocus');
        return;
      }

      if ($.ctx.mentionState != null && $.ctx.mentionState < 3 &&
          ++$.ctx.mentionState > 2) {
        // we had a non printable key pressed; abort mention
        RichTextMention.revertMention(this);
      }
    },

    keypress: function (event) {
      var ctx = $.ctx;

      if (ctx.mentionState != null && ctx.mentionState < 3) {
        Dom.stopEvent();
        var ch = String.fromCharCode(event.which);
        var range = Dom.getRange();
        var span = Dom.html({tag: 'span', "class": 'ln', text: ch});
        range.insertNode(span);
        ctx.mentionState = 3;
        ctx.selectItem = RichTextMention.selectItem({
          type: ctx.mentionType,
          mentions: ctx.data.extend.mentions,
          inputCtx: ctx,
          inputElm: ctx.inputElm,
          span: span,
        });
        return;
      }
      var mentionType = mentionKey(ctx, event.which);
      if (mentionType && event.shiftKey) {
        ctx.mentionType = mentionType;
        var range = Dom.getRange();
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
    },

    keyup: function () {
      var ctx = $.ctx;
      if (ctx.selectItem && ! $.data(ctx.selectItem).span.parentNode) {
        Dom.remove(ctx.selectItem);
      }
    },
  });

  function mentionKey(ctx, code) {
    var mentions = ctx.data.extend;
    mentions = mentions && mentions.mentions;
    if (! mentions) return;
    var id = String.fromCharCode(code);
    if (mentions[id])
      return id;
  }

  function getTag(tag) {
    var range = Dom.getRange();
    if (range === null) return null;
    var start = range.startContainer;
    return Dom.searchUpFor(start, function (elm) {
      return elm.tagName === tag;
    }, 'richTextEditor');
  }

  function execCommand (cmd, value) {
    return document.execCommand(cmd, false, value);
  }

  function select(editor, type, amount) {
    var range = Dom.getRange();
    var obj = {node: range.startContainer, offset: range.startOffset};

    if (! Dom.contains(editor, obj.node)) return;

    if (amount >= 0) {
      while (amount-- && forwardOneChar(editor, obj))
        ;
      range.setEnd(obj.node, obj.offset);
    } else {
      while (amount++ && backOneChar(editor, obj))
        ;
      range.setStart(obj.node, obj.offset);
    }

    return range;
  }

  function backOneChar(editor, obj) {
    var other;
    var node = obj.node;
    var offset = obj.offset;

    if (node.nodeType === TEXT_NODE) {
      --offset;
      if (offset >= 0) {
        obj.offset = offset;
        return true;
      }
    } else {
      node = node.childNodes[offset];
    }
    if (! node)
      return;

    offset = -1;

    while ( node !== editor) {
      other = node.previousSibling;
      if (other) {
        node = lastInnerMostNode(other);
        obj.node = node;
        if (node.nodeType === TEXT_NODE) {
          offset = offset + node.textContent.length;
        } else {
          offset = 0;
        }
        obj.offset = offset;
        return true;
      } else {
        node = node.parentNode;
        if (! INLINE_TAGS[node.tagName])
          offset = 0;
      }
    }

    return;
  }

  function lastInnerMostNode(node) {
    var other;
    if (node.nodeType === TEXT_NODE) {
      if (node.textContent.length) {
        return node;
      }
      other = node.previousSibling;
      return other && lastInnerMostNode(other);
    }
    if (other = node.lastChild) {
      return lastInnerMostNode(other) || other;
    }
  }

  function firstInnerMostNode(node) {
    var other;
    if (node.nodeType === TEXT_NODE) {
      if (node.textContent.length) {
        return node;
      }
      other = node.nextSibling;
      return other && firstInnerMostNode(other);
    }
    if (other = node.firstChild) {
      return firstInnerMostNode(other) || other;
    }
  }

  function forwardOneChar(editor, obj) {
    var other;
    var node = obj.node;
    var offset = obj.offset;

    if (node.nodeType === TEXT_NODE) {
      ++offset;
      if (offset <= node.textContent.length) {
        obj.offset = offset;
        return true;
      }
    } else {
      node = node.childNodes[offset];
    }
    if (! node)
      return;

    offset = 1;

    while ( node !== editor) {
      other = node.nextSibling;
      if (other) {
        node = firstInnerMostNode(other);
        obj.node = node;
        obj.offset = offset;
        return true;
      } else {
        node = node.parentNode;
        if (! INLINE_TAGS[node.tagName])
          offset = 0;
      }
    }

    return;
  }

  function isPrevChar(char) {
    var range = Dom.getRange();
    if (range.startContainer.nodeType !== TEXT_NODE)
      return;
    var offset = range.startOffset;
    if (offset && range.startContainer.textContent[offset - 1] === char)
      return range;
  }

  function normRange(editor, range) {
    normPos(editor, range, range.startContainer, range.startOffset, 'setStart');
    normPos(editor, range, range.endContainer, range.endOffset, 'setEnd');
  }

  function normPos(editor, range, node, offset, setter) {
    if (node.nodeType !== TEXT_NODE) {
      if (node.tagName === 'BR') {
        if (offset !== 0) range[setter](node, 0);
        return;
      }
      var curr = node.childNodes[offset];
      if (curr.tagName === 'BR') {
        range[setter](curr, 0);
        return;
      }
      curr = (curr && firstInnerMostNode(curr)) || lastInnerMostNode(node.childNodes[offset - 1]);
      if (curr.nodeType !== TEXT_NODE && curr.tagName !== 'BR') {
        var obj = {node: node, offset: offset};
        forwardOneChar(editor, obj);
        range[setter](obj.node, obj.offset);
      } else if (curr !== node) {
        range[setter](curr, 0);
      }
    }
  }

  function isBlockNode(node) {
    return node.nodeType === 1 && ! INLINE_TAGS[node.tagName];
  }

  function traceContainingBlock(editor, node, wrt) {
    var trace = [];
    while (node !== editor) {
      trace.push(node);
      node = node.parentNode;
    }
    if (! wrt) return trace;
    var wrtIdx = wrt.length - 1;
    var traceIdx = trace.length - 1;
    while(wrt[wrtIdx] === trace[traceIdx]) {
      --wrtIdx; -- traceIdx;
    }
    wrt.length = wrtIdx + 1;
    trace.length = traceIdx + 1;
    return trace;
  }

  function findContainingBlock(editor, node) {
    if (isBlockNode(node)) return node;
    node = findBeforeBlock(editor, node);
    if (node.nodeType === TEXT_NODE || INLINE_TAGS[node.tagName])
      return node.parentNode;

    return node;
  }

  function findBeforeBlock(editor, node) {
    var last = node;
    node = node.parentNode;
    while (node && node !== editor && INLINE_TAGS[node.tagName]) {
      last = node;
      node = node.parentNode;
    }

    return last;
  }

  function fixSpaces(data) {
    data = data.replace(/[ \u00a0]{2}/g, ' \u00a0');
    if (data.slice(-1) === ' ') data = data.slice(0, -1) + '\xa0';
    return data;
  }

  function deleteEmpty(range) {
    var node = range.startContainer;
    if (node.nodeType !== TEXT_NODE) return;
    var offset = range.startOffset;
    var other, parent = node.parentNode;
    while ((other = node.previousSibling) && other.nodeType === TEXT_NODE) {
      node.textContent = other.textContent + node.textContent;
      offset += other.textContent.length;
      parent.removeChild(other);
    }
    while ((other = node.nextSibling) && other.nodeType === TEXT_NODE) {
      node.textContent = node.textContent + other.textContent;
      parent.removeChild(other);
    }
    node.textContent = fixSpaces(node.textContent);
    node.textContent.length || killNode();
    range.setStart(node, offset);
    range.collapse(true);

    function killNode() {
      var other = node.nextSibling;
      offset = 0;
      if (! other) {
        other = node.previousSibling;
        other = other && lastInnerMostNode(other);
        if (other && other.nodeType === TEXT_NODE)
          offset =  other.textContent.length;
      }
      parent.removeChild(node);
      if (! other) {
        if (isBlockNode(parent))
          parent.appendChild(node = BR.cloneNode());
        else {
          node = parent;
          parent = node.parentNode;
          killNode();
        }
      }
    }
  }

  Dom.registerHelpers({
    richTextEditor: function (content, options) {
      return Tpl.$autoRender({content: content, options: options});
    }
  });

  RichTextMention.init(Tpl);

  return Tpl;
});
