define((require)=>{
  const Dom             = require('koru/dom');
  const util            = require('koru/util');

  const {ELEMENT_NODE, TEXT_NODE} = document;

  const INLINE_TAGS = util.toMap(
    'A ABBR AUDIO B BDI BDO BUTTON CANVAS CITE CODE DATA DATALIST DEL DFN EM EMBED FONT I IFRAME IMG INPUT INS KBD LABEL MAP MARK MATHML MATH METER NOSCRIPT OBJECT OUTPUT PICTURE PROGRESS Q RUBY RT RP S SAMP SELECT SLOT SMALL SPAN STRONG SUB SUP SVG TEMPLATE TEXTAREA TIME TT U VAR VIDEO WBR'
      .split(' '));

  const lastInnerMostNode = (node)=>{
    if (node.nodeType === TEXT_NODE)
      return node;

    let nn = node.lastChild;
    while (nn !== null) {
      node = nn;
      nn = nn.lastChild;
    }
    return node;
  };

  const firstInnerMostNode = (node)=>{
    if (node.nodeType === TEXT_NODE)
      return node;

    let nn = node.firstChild;
    while (nn !== null) {
      node = nn;
      nn = nn.firstChild;
    }
    return node;
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
      if (node.tagName === 'BR') {
        return [node.parentNode, Dom.nodeIndex(node)];
      }
      const {childNodes} = node;
      if (offset != childNodes.length) {
        const curr = childNodes[offset];
        if (curr.nodeType === TEXT_NODE) {
          return [curr, 0];
        }
        return normPos(curr, 0);
      }
    } else if (offset == node.nodeValue.length) {
      const curr = node.nextSibling;
      if (curr === null || curr.nodeType !== TEXT_NODE) return [node, offset];
      return [curr, 0];
    }
    return [node, offset];
  };

  const normRange = (range)=>{
    const collapsed = range.collapsed;
    const s = normPos(range.startContainer, range.startOffset);
    s[0] === range.startContainer || range.setStart(s[0], s[1]);

    if (! collapsed) {
      const e = normPos(range.endContainer, range.endOffset);
      e[0] === range.endContainer || range.setStart(e[0], e[1]);
    } else if (! range.collapsed) {
      range.collapse(true);
    }
    return range;
  };

  const restrictRange = (range, within)=>{
    const ca = range.commonAncestorContainer;
    if (within !== ca && within.contains(ca)) return range;
    const withinLen = within.childNodes.length;
    const sc = range.startContainer;
    if ((within === sc && range.startOffset == withinLen) ||
        (within !== sc && ! within.contains(sc))) {
      range.setStart(firstInnerMostNode(within), 0);
    }
    const ec = range.endContainer;
    if ((within === ec && range.endOffset == withinLen) ||
        (within !== ec && ! within.contains(ec))) {
      const node = lastInnerMostNode(within);
      range.setEnd(node, nodeEndOffset(node));
    }
    return range;
  };


  const isInlineNode = item => item.nodeType === TEXT_NODE || !! INLINE_TAGS[item.tagName];

  const isBlockNode = node => node.nodeType === ELEMENT_NODE && ! INLINE_TAGS[node.tagName];

  const previousNode = (node, top)=>{
    let nn = node.previousSibling;
    if (nn !== null) return lastInnerMostNode(nn);
    node = node.parentNode;
    if (node === top) return null;
    while (node !== null) {
      nn = node.previousSibling;
      if (nn === null) {
        if (node === top) return null;
        node = node.parentNode;
      } else {
        return lastInnerMostNode(nn);
      }
    }
    return null;
  };

  const nextNode = (node, top)=>{
    let nn = node.nextSibling;
    if (nn !== null) return firstInnerMostNode(nn);
    node = node.parentNode;
    if (node === top) return null;
    while (node !== null) {
      nn = node.nextSibling;
      if (nn === null) {
        if (node === top) return null;
        node = node.parentNode;
      } else {
        return firstInnerMostNode(nn);
      }
    }
    return null;
  };


  const rangeStartNode = (range, top)=>{
    const {startContainer: node, startOffset} = range;
    if (node === null || node.nodeType !== ELEMENT_NODE)
      return node;

    const {childNodes} = node;
    if (startOffset == childNodes.length) {
      return node === top
        ? null
        : startOffset == 0 ? node : nextNode(node);
    } else
      return childNodes[startOffset];
  };


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
    if (! range.collapsed) {
      const node = range.commonAncestorContainer;
      return node.nodeType === TEXT_NODE ? node.parentNode : node;
    }
    const [start, offset] = normPos(range.startContainer, range.startOffset);
    if (start.nodeType === TEXT_NODE)
      return start.parentNode;
    else {
      const {childNodes} = start;
      return offset < childNodes.length
        ? childNodes[offset] : start;
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

  const clearEmptyInlineForward = (node)=>{
    while (node !== null) {
      if (node.nodeType === TEXT_NODE) {
        if (node.nodeValue !== '') break;
      } else {
        if (! isInlineNode(node)) break;
        clearEmptyInline(node);
        if (node.firstChild !== null)
          break;
      }
      const nn = node.nextSibling;
      node.remove();
      node = nn;
    }
  };
  const clearEmptyInlineReverse = (node)=>{
    while (node !== null) {
      if (node.nodeType === TEXT_NODE) {
        if (node.nodeValue !== '') break;
      } else {
        if (! isInlineNode(node)) break;
        clearEmptyInline(node);
        if (node.firstChild !== null)
          break;
      }
      const nn = node.previousSibling;
      node.remove();
      node = nn;
    }
  };

  const clearEmptyInline = (node=null)=>{
    if (node === null) return;
    clearEmptyInlineForward(node.firstChild);
    clearEmptyInlineReverse(node.lastChild);
  };

  const nodeEndOffset = node => node.nodeType === TEXT_NODE
        ? node.nodeValue.length : node.childNodes.length;

  const setEndOfNode = (range, node)=>{
    range.setStart(node, nodeEndOffset(node));
    normRange(range);
    return range;
  };

  const previousInline = node => {
    let prev = node.previousSibling;
    if (prev === null) {
      prev = node.parentNode;
      return prev === null || ! isInlineNode(prev)
        ? node : prev;
    } else return isInlineNode(prev)
      ? lastInnerMostNode(prev) : node;
  };

  const nextInline = node => {
    if (node.tagName === 'BR') return node;
    let nn = node.nextSibling;
    if (nn === null) {
      nn = node.parentNode;
      return nn === null || ! isInlineNode(nn)
        ? node : nn;
    } else return isInlineNode(nn)
      ? firstInnerMostNode(nn) : node;
  };

  const startOfLine = (range=Dom.getRange())=>{
    let node = rangeStartNode(range);
    if (node === null) return null;

    let prev = previousInline(node);

    while(prev !== null && prev !== node && isInlineNode(prev)) {
      prev = previousInline(node = prev);
    }

    const ans = document.createRange();
    ans.setStart(node, 0);
    normRange(ans);
    return ans;
  };

  const endOfLineNode = (node)=>{
    if (node === null) return null;

    let nn = nextInline(node);

    while (nn !== null && nn !== node) {
      if (! isInlineNode(nn)) {
        if (nn.tagName === 'BR') node = nn;
        break;
      }
      nn = nextInline(node = nn);
    }

    return node;
  };

  const endOfLine = (range=Dom.getRange())=>{
    const node = endOfLineNode(rangeStartNode(range));
    if (node === null) return null;

    const ans = document.createRange();
    setEndOfNode(ans, node);
    return ans;
  };

  const commonAncestor = (startNode, endNode)=>{
    const range = document.createRange();
    range.setStart(startNode, 0);
    range.setEnd(endNode, 0);
    return range.commonAncestorContainer;
  };

  const childOfBlock = (node, top)=>{
    while (node !== null && node !== top) {
      if (isBlockNode(node)) return true;
      node = node.parentNode;
    }
    return false;
  };

  const startOfNextLine = (range=Dom.getRange())=>{
    let node = endOfLineNode(rangeStartNode(range));
    if (node === null) return null;

    let nn = nextNode(node);
    if (nn !== null) {
      if (! childOfBlock(node, commonAncestor(node, nn))) {
        node = nn;
        if (node.tagName === 'BR') {
          nn = nextNode(node);
        }
      }
    }

    const ans = document.createRange();
    if (nn === null)
      ans.setStart(node.parentNode, Dom.nodeIndex(node)+1);
    else
      ans.setStart(nn, 0);
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

    restrictRange,
    normRange,
    previousNode,
    nextNode,
    rangeStartNode,

    isBlockNode,

    startOfLine,
    startOfNextLine,

    endOfLine,

    setEndOfNode,

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

    newline: ()=>{
      const br = document.createElement('BR');
      insertNode(br);
      clearEmptyText(br.nextSibling);
      if (br.nextSibling == null)
        br.parentNode.appendChild(document.createElement('BR'));
    },

    clearEmptyText,
    clearEmptyInline,
    insertNode,

    selectNode: node =>{
      if (node != null) {
        const range = document.createRange();
        range.selectNode(node);
        Dom.setRange(range);
        return range;
      }
    },

    rangeIsInline: range =>{
      let n = range.commonAncestorContainer;
      if (isInlineNode(n)) return true;

      let c = range.startContainer;
      let son = range.startOffset == 0;
      while(c !== n) {
        if (! isInlineNode(c)) return false;
        const p = c.parentNode;
        if (son && c.previousSibling !== null &&
            (p !== n || c.previousSibling.tagName !== 'BR')) {
          son = false;
        }
        c = p;
      }
      c = range.endContainer;
      let eon = c.nodeType === TEXT_NODE
          ? range.endOffset == c.nodeValue.length : c.nextSibling === null;

      while(c !== n) {
        if (! isInlineNode(c)) return false;
        const p = c.parentNode;
        if (p === n) {
          return ! (son && eon);
        }
        if (eon && c.previousSibling !== null)
          eon = false;
        c = p;
      }

      return false;
    },
  };
});
