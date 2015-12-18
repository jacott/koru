define(function(require, exports, module) {
  var util = require('koru/util');
  var Dom = require('koru/dom');
  var RichText = require('./rich-text');

  var Tpl = Dom.newTemplate(module, require('koru/html!./rich-text-editor'));
  var $ = Dom.current;

  var TEXT_NODE = document.TEXT_NODE;

  var BR = document.createElement('br');

  var INLINE_TAGS = RichText.INLINE_TAGS;

  Tpl.$extend({
    $created: function (ctx, elm) {
      var html = RichText.toHtml(ctx.data.content);

      elm.insertBefore(html, elm.lastChild);
      Dom.nextFrame(function () {
        elm.focus();
      });
    },

    insert: insert,
    select: select,
    breakLine: breakLine,
    findContainingBlock: findContainingBlock,
    firstInnerMostNode: firstInnerMostNode,
    lastInnerMostNode: lastInnerMostNode,
    deleteSelected: function (editor) {
      var range = Dom.getRange();
      range = deleteContents(editor, range);
      Dom.setRange(range);
      return range;
    },
    deleteContents: deleteContents,
  });

  Tpl.$events({
    'paste': function (event) {
      if ('clipboardData' in event) {
        var types = event.clipboardData.types;
        if (types) for(var i = 0; i < types.length; ++i) {
          var type = types[i];
          _koru_.debug('type', type);
          Dom.stopEvent();
          return;
        }
      }
    },

    'cut': function (event) {
      Dom.stopEvent();
      _koru_.debug('cut');

    },

    'keydown': function (event) {
      _koru_.debug('kd');

      switch(event.which) {
      case 37:
        var amount = -1;
      case 39:
        amount = amount || 1;
        Dom.stopEvent();
        range = select(this, 'char', amount);
        if (range) {
          range.collapse(amount < 0);
          Dom.setRange(range);
        }
        return;

      case 46:
        var amount = 1;
      case 8:
        amount = amount || -1;
        Dom.stopEvent();
        var range = Dom.getRange();
        if (range && range.collapsed)
          range = select(this, 'char', amount);
        if (range) {
          range = deleteContents(this, range);
          Dom.setRange(range);
        }
        return;
      }

    },

    'keypress': function (event) {
      if (event.charCode) {
        var code = event.which;
        Dom.stopEvent();
        var range = Dom.getRange();
        switch(code) {
        case 13: case 10:
          breakLine(this);
          return;
        }
        insert(this, String.fromCharCode(code));
      }
    },

    'input': function (event) {
      var node = this;
      Dom.stopEvent();
      _koru_.debug('X');
    },
  });

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
    _koru_.debug('node', node, offset);
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

  function deleteContents(editor, range) {
    if (range.collapsed) return range;
    normRange(editor, range);
    var node = range.startContainer;
    var startOffset = range.startOffset;
    var endNode = range.endContainer;
    var endOffset = range.endOffset;

    if (node === endNode) {
      node.textContent = node.textContent.slice(0, startOffset) + node.textContent.slice(range.endOffset);
      // } else {
      //   endNode = node.childNodes[range.endOffset];
      //   var curr = node.childNodes[range.startOffset];
      //   while(curr && curr !== endNode) {
      //     curr = curr.nextSibling;
      //     node.removeChild(curr.previousSibling);
      //   }
      //   curr = node.childNodes[range.startOffset];
      //   node = firstInnerMostNode(curr);
      //   startOffset = 0;
      // }
    } else {
      var startList = traceContainingBlock(editor, node);
      var endList = traceContainingBlock(editor, endNode, startList);
      var startIdx = startList.length - 1;
      var endIdx = endList.length - 1;
      for(var i = 0; i < startIdx ; ++i) {
        var curr = startList[i];
        var parent = curr.parentNode;
        while (curr.nextSibling) parent.removeChild(curr.nextSibling);
      }
      for(var i = 0; i < endIdx ; ++i) {
        var curr = endList[i];
        var parent = curr.parentNode;
        while (curr.previousSibling) parent.removeChild(curr.previousSibling);
      }
      var curr = startList[startIdx];
      var parent = curr.parentNode;
      var currEnd = endList[endIdx];
      while (curr.nextSibling !== currEnd)
        parent.removeChild(curr.nextSibling);

      if (node.nodeType === TEXT_NODE) {
        node.textContent = node.textContent.slice(0, startOffset) + (endNode.nodeType === TEXT_NODE ? endNode.textContent.slice(range.endOffset) : '');
      } else if (endNode.nodeType === TEXT_NODE) {
        var curr = document.createTextNode(endNode.textContent.slice(range.endOffset));
        node.parentNode.insertBefore(curr, node);
        node.parentNode.removeChild(node);
        node = curr;
      }
      var parent = endNode.parentNode;
      parent.removeChild(endNode);
      while (parent !== editor && ! parent.firstChild) {
        curr = parent;
        parent = parent.parentNode;
        parent.removeChild(curr);
      }
    }
    range.setStart(node, startOffset);
    range.collapse(true);
    deleteEmpty(range);
    return range;
  }

  function breakLine(editor) {
    var range = Dom.getRange();
    if (! range) return;
    range = deleteContents(editor, range);

    var node = range.startContainer;

    var block = findContainingBlock(editor, node);
    if (block === node) {
      if (block === editor) {
        var copy = document.createElement('div');
        copy.appendChild(BR.cloneNode());
        editor.insertBefore(copy, editor.childNodes[range.startOffset]);
      } else {
        var copy = block.cloneNode();
        block.parentNode.insertBefore(copy, block.nextSibling);
        var endNode = BR.cloneNode();
        copy.appendChild(endNode);
      }
      range.setEnd(copy, 0);
      range.collapse();
      Dom.setRange(range);
    } else if (node.nodeType === TEXT_NODE) {
      var remainder = node.textContent.slice(range.startOffset);
      node.textContent = node.textContent.slice(0, range.startOffset);
      var endNode = remainder ? document.createTextNode(remainder) : BR.cloneNode();
      copy = endNode;

      while (node !== block) {
        var curr, nextSib = node.nextSibling;
        node = node.parentNode;
        curr = copy;
        copy = node.cloneNode();
        copy.appendChild(curr);

        while(curr = nextSib) {
          nextSib = curr.nextSibling;
          copy.appendChild(curr);
        }
      }
      block.parentNode.insertBefore(copy, block.nextSibling);
      if (block.childNodes.length === 0) {
        block.appendChild(BR.cloneNode());
      }
      range.setEnd(endNode, 0);
      node = range.startContainer;
      if (node.textContent.length === 0) {
        if (node.parentNode.childNodes.length === 1)
          node.parentNode.appendChild(BR.cloneNode());
        node.parentNode.removeChild(node);
      }
      range.collapse();

      Dom.setRange(range);
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

  function insert(editor, data) {
    if (data.nodeType === TEXT_NODE)
      data = data.textContent;

    var range = Dom.getRange();
    if (! range) return;
    range = deleteContents(editor, range);
    var node = range.startContainer;
    if (! Dom.contains(editor, node)) return;
    var text = node.textContent;
    var offset = range.startOffset;

    if (typeof data === 'string') {
    }

    var newRange = document.createRange();
    if (node.nodeType === TEXT_NODE) {
      if (typeof data === 'string') {
        var newOffset= offset + data.length;
        data = text.slice(0, offset) + data + text.slice(offset);
        node.textContent = fixSpaces(data);
        newRange.setStart(node, newOffset);
      } else if (data.nodeType === document.DOCUMENT_FRAGMENT_NODE) {
        var firstChild = data.firstChild;
        if (firstChild.nodeType === TEXT_NODE) {
          data.removeChild(firstChild);
          text += firstChild.textContent;
        }
        node.textContent = text;
        node.parentNode.insertBefore(data, node.nextSibling);
        newRange.setStart(node, offset + data.length);
      } else {
        node.textContent = text.slice(0, offset);
        var before = node.nextSibling;
        var endText = document.createTextNode(text.slice(offset));
        node.parentNode.insertBefore(data, before);
        node.parentNode.insertBefore(endText, before);

        newRange.setStart(endText, 0);
      }
    } else {
      var before = node.childNodes[offset];
      var sc, so;
      if (typeof data === 'string') {
        data = document.createTextNode(fixSpaces(data));
        sc = data; so = data.length;
      } else if (data.nodeType === document.DOCUMENT_FRAGMENT_NODE) {
        if (data.lastChild.nodeType === TEXT_NODE) {
          sc = data.lastChild; so = data.lastChild.textContent.length;
        } else {
          sc = node; so = offset + data.childNodes.length;
        }
      } else {
        sc = node; so = offset + 1;
      }

      node.insertBefore(data, before);
      if (before && before.tagName === 'BR')
        node.removeChild(before);
      newRange.setStart(sc, so);
    }
    newRange.collapse(true);
    deleteEmpty(newRange);
    Dom.setRange(newRange);
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

  return Tpl;
});
