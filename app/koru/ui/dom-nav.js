define((require)=>{
  const Dom             = require('koru/dom');
  const util            = require('koru/util');

  const {ELEMENT_NODE, TEXT_NODE} = document;

  const INLINE_TAGS = util.toMap('B U I S A SPAN CODE FONT EM STRONG KBD TT Q'.split(' '));

  const lastInnerMostNode = (node)=>{
    let other;
    if (node.nodeType === TEXT_NODE) {
      return node;

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
      return node;

      other = node.nextSibling;
      return other && firstInnerMostNode(other);
    }
    if (other = node.firstChild) {
      return firstInnerMostNode(other) || other;
    }
  };

  const forwardOneChar = (top, obj)=>{
    let other, {node, offset} = obj;

    if (node.nodeType === TEXT_NODE) {
      ++offset;
      if (offset <= node.nodeValue.length) {
        obj.offset = offset;
        return true;
      }
    } else {
      node = node.childNodes[offset];
    }
    if (node == null)
      return;

    offset = 1;

    while (node !== top) {
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

  const backOneChar = (top, obj)=>{
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

    while ( node !== top) {
      other = node.previousSibling;
      if (other) {
        node = lastInnerMostNode(other);
        obj.node = node;
        if (node.nodeType === TEXT_NODE) {
          offset = offset + node.nodeValue.length;
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

  const normPos = (node, offset)=>{
    if (node.nodeType !== TEXT_NODE) {
      const {childNodes} = node;
      if (childNodes.length == 0) {
        return [node.parentNode, Dom.nodeIndex(node)];
      }
      if (offset != childNodes.length) {
        const curr = childNodes[offset];
        if (curr.nodeType === TEXT_NODE) {
          return [curr, 0];
        }
        return normPos(curr, 0) || [curr, 0];
      }
    } else if (offset == node.nodeValue.length) {
      const curr = node.nextSibling;
      if (curr === null || curr.nodeType !== TEXT_NODE) return;
      return [curr, 0];
    }
  };

  const normRange = (range)=>{
    const s = normPos(range.startContainer, range.startOffset);
    s === undefined || range.setStart(s[0], s[1]);

    if (! range.collapsed) {
      const e = normPos(range.endContainer, range.endOffset);
      e === undefined || range.setStart(e[0], e[1]);
    }
    return range;
  };

  const isInlineNode = item => item.nodeType === TEXT_NODE || INLINE_TAGS[item.tagName];

  const isBlockNode = node => node.nodeType === ELEMENT_NODE && ! INLINE_TAGS[node.tagName];

  const findBeforeBlock = (top, node)=>{
    let last = node;
    node = node.parentNode;
    while (node && node !== top && INLINE_TAGS[node.tagName]) {
      last = node;
      node = node.parentNode;
    }

    return last;
  };

  const containingNode = range =>{
    const offset = range.endOffset, start = range.endContainer;
    if (start.nodeType === TEXT_NODE)
      return start.parentNode;
    else {
      const {childNodes} = start;
      return offset < childNodes.length
        ? childNodes[offset] :  start;
    }
  };

  const insertNode = (node, pos, offset=0)=>{
    const range = Dom.getRange();
    range.deleteContents();
    range.insertNode(node);
    if (pos === undefined)
      range.setEndAfter(node);
    else
      range.setEnd(pos, offset);
    range.collapse();

    normRange(range);
    range.collapse();
    Dom.setRange(range);
  };

  const clearEmptyText = (node=null)=>{
    while (node !== null && node.nodeType === TEXT_NODE && node.nodeValue === '') {
      const nn = node.nextSibling;
      node.remove();
      node = nn;
    }
  };

  const setEndOfElm = (range, elm)=>{
    range.setStart(elm, elm.nodeType === TEXT_NODE ? elm.nodeValue.length : elm.childNodes.length);
    normRange(range);
    return range;
  };

  const startOfLine = (range=Dom.getRange())=>{
    let elm = range.startContainer;
    while(elm != null && isInlineNode(elm)) {
      elm = elm.previousSibling || elm.parentNode;
    }
    if (elm == null) return null;
    const ans = document.createRange();
    if (elm.firstChild == null) {
      if (elm.nextSibling == null) {
        elm = elm.parentNode;
        ans.setStart(elm, elm.childNodes.length);
      } else {
        ans.setStart(elm.nextSibling, 0);
      }
    } else {
      ans.setStart(elm.firstChild, 0);
    }
    normRange(ans);
    return ans;
  };

  const startOfNextLine = (range=Dom.getRange())=>{
    let elm = range.startContainer;
    while(elm != null && isInlineNode(elm)) {
      elm = elm.nextSibling || elm.parentNode;
    }
    if (elm == null) return null;
    const ns = elm.nextSibling;
    if (ns !== null && ns.tagName === 'BR') elm = ns;
    const ans = document.createRange();
    ans.setStart(elm.parentNode, Dom.nodeIndex(elm)+1);
    normRange(ans);
    return ans;
  };

  const endOfLine = (range=Dom.getRange())=>{
    let elm = range.startContainer;
    while(elm != null && isInlineNode(elm)) {
      elm = elm.nextSibling || elm.parentNode;
    }
    if (elm == null) return null;
    const ans = document.createRange();
    if (elm.lastChild != null) {
      elm = elm.lastChild;
    }
    setEndOfElm(ans, elm);
    return ans;
  };

  return {
    INLINE_TAGS,

    isInlineNode,

    backOneChar,
    forwardOneChar,
    firstInnerMostNode,
    lastInnerMostNode,

    containingNode,

    getTag: (tagOrFunc, top=document.body) =>{
      const range = Dom.getRange();
      if (range === null) return null;
      let start = containingNode(range);
      const foundFunc = typeof tagOrFunc === 'function' ? tagOrFunc : null,
            tag = foundFunc === null ? tagOrFunc.toUpperCase() : '';

      if (! top.contains(start)) return null;

      for (
        ;
        start != null && start !== top;
        start = start.parentNode) {

        if (foundFunc === null ? start.tagName === tag : foundFunc(start))
          return start;
      }
      return null;
    },

    normRange,

    isBlockNode,

    findContainingBlock: (top, node)=>{
      if (isBlockNode(node)) return node;
      node = findBeforeBlock(top, node);
      if (node.nodeType === TEXT_NODE || INLINE_TAGS[node.tagName])
        return node.parentNode;

      return node;
    },

    findBeforeBlock,

    startOfLine,
    startOfNextLine,

    endOfLine,

    setEndOfElm,

    clearTrailingBR(frag) {
      let last = frag.lastChild;
      while (last !== null && last.nodeType === TEXT_NODE && last.nodeValue === '') {
        const t = last;
        last = last.previousSibling;
        t.remove();
      }
      if (last !== null && last.tagName === 'BR')
        last.remove();

      return frag;
    },

    selectLine: (range=Dom.getRange())=>{
      const sr = startOfLine(range), er = startOfNextLine(range);
      sr.setEnd(er.startContainer, er.startOffset);
      return sr;
    },

    selectRange: (top, type, amount)=>{
      const range = Dom.getRange();
      const obj = {node: range.startContainer, offset: range.startOffset};

      if (! Dom.contains(top, obj.node)) return;

      if (amount >= 0) {
        while (amount-- && forwardOneChar(top, obj))
          ;
        range.setEnd(obj.node, obj.offset);
      } else {
        while (amount++ && backOneChar(top, obj))
          ;
        range.setStart(obj.node, obj.offset);
      }

      return range;
    },

    newLine: ()=>{
      const br = document.createElement('BR');
      insertNode(br);
      clearEmptyText(br.nextSibling);
      if (br.nextSibling == null)
        br.parentNode.appendChild(document.createElement('BR'));
    },

    clearEmptyText,
    insertNode,

    selectNode: node =>{
      if (node != null) {
        const range = document.createRange();
        range.selectNode(node);
        Dom.setRange(range);
        return range;
      }
    },
  };
});
