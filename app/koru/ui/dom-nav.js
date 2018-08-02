define((require)=>{
  const Dom             = require('koru/dom');
  const util            = require('koru/util');

  const {TEXT_NODE} = document;

  const INLINE_TAGS = util.toMap('B U I S A SPAN CODE FONT EM STRONG KBD TT Q'.split(' '));

  const elmMatch = tag=> elm => elm.tagName === tag;
  const isInlineNode = item => item.nodeType === TEXT_NODE || INLINE_TAGS[item.tagName];

  const lastInnerMostNode = (node)=>{
    let other;
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
  };

  const firstInnerMostNode = (node)=>{
    let other;
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
  };

  const forwardOneChar = (editor, obj)=>{
    let other, {node, offset} = obj;

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
  };

  const backOneChar = (editor, obj)=>{
    let other, {node, offset} = obj;

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
  };

  const normPos = (editor, range, node, offset, setter)=>{
    if (node.nodeType !== TEXT_NODE) {
      if (node.tagName === 'BR') {
        if (offset !== 0) range[setter](node, 0);
        return;
      }
      const children = node.childNodes;
      if (! children.length) return;
      let curr = node.childNodes[offset];
      if (curr && curr.tagName === 'BR') {
        range[setter](curr, 0);
        return;
      }
      curr = (curr && firstInnerMostNode(curr)) || lastInnerMostNode(node.childNodes[offset - 1]);
      if (curr.nodeType !== TEXT_NODE && curr.tagName !== 'BR') {
        const obj = {node: node, offset: offset};
        forwardOneChar(editor, obj);
        range[setter](obj.node, obj.offset);
      } else if (curr !== node) {
        range[setter](curr, 0);
      }
    }
  };

  const isBlockNode = node => node.nodeType === 1 && ! INLINE_TAGS[node.tagName];

  const findBeforeBlock = (editor, node)=>{
    let last = node;
    node = node.parentNode;
    while (node && node !== editor && INLINE_TAGS[node.tagName]) {
      last = node;
      node = node.parentNode;
    }

    return last;
  };

  return {
    INLINE_TAGS,

    isInlineNode,
    elmMatch,

    backOneChar,
    forwardOneChar,
    firstInnerMostNode,
    lastInnerMostNode,

    getTag: tagOrFunc =>{
      const range = Dom.getRange();
      if (range === null) return null;
      const start = range.endContainer;
      return Dom.searchUpFor(
        start,
        typeof tagOrFunc === 'string'
          ? elmMatch(tagOrFunc) : tagOrFunc,
        'richTextEditor');
    },

    normPos,
    normRange: (editor, range)=>{
      normPos(editor, range, range.startContainer, range.startOffset, 'setStart');
      normPos(editor, range, range.endContainer, range.endOffset, 'setEnd');
      return range;
    },

    isBlockNode,

    findContainingBlock: (editor, node)=>{
      if (isBlockNode(node)) return node;
      node = findBeforeBlock(editor, node);
      if (node.nodeType === TEXT_NODE || INLINE_TAGS[node.tagName])
        return node.parentNode;

      return node;
    },

    findBeforeBlock,

    selectRange: (editor, type, amount)=>{
      const range = Dom.getRange();
      const obj = {node: range.startContainer, offset: range.startOffset};

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
    },
  };
});
