define((require)=>{
  'use strict';
  const BTree = require('koru/btree');
  const Dom   = require('koru/dom');

  const $ = Dom.current;
  const {myCtx} = Dom;

  const {deepCopy} = require('koru/util');

  const copyKeys = (obj, keys)=>{
    const ans = {};
    const len = keys.length;
    for(let i = 0; i < len; ++i) {
      const key = keys[i];
      if (key in obj) {
        const v = obj[key];
        ans[key] = typeof v === 'object' && v !== null
          ? deepCopy(v) : v;
      }
    }
    return ans;
  };

  const {private$, endMarker$} = require('koru/symbols');
  const elm$ = Symbol(), addOrder$ = Symbol(), doc$ = Symbol();
  const {COMMENT_NODE} = document;

  const addOrder = (pv, obj)=>obj[addOrder$] || (obj[addOrder$] = ++pv.globalAddOrder);
  const compareAddOrder = (a,b)=>a-b;
  const addOrderKeys = compareAddOrder.compareKeys = [addOrder$];

  class AutoList {
    constructor({
      template, container,
      query,
      limit=Infinity,
      compare=query ? query.compare : compareAddOrder,
      compareKeys=compare.compareKeys || (query && query.compareKeys),
      observeUpdates,
      overLimit,
      removeElement=Dom.remove,
      parentCtx=$.ctx,
    })  {
      let endMarker = null;
      if (container.nodeType === COMMENT_NODE) {
        endMarker = container[endMarker$];
        container = container.parentNode;
      }
      const onChange = makeOnChange(this);
      const pv = this[private$] = {
        template, container,
        query,
        limit,
        compare,
        compareKeys,
        observeUpdates,
        removeElement,
        parentCtx,

        overLimit,
        endMarker,
        onChange,
        entries: new BTree(compare),
        sym$: Symbol(),
        observer: query && (query.onChange == null ? null : query.onChange(onChange)),
        lastVis: null,
        globalAddOrder: 0,
      };

      const ctx = Dom.ctx(pv.container);
      if (ctx != null) ctx.onDestroy(this);

      query === undefined || query.forEach(doc => {addRow(pv, doc)});
    }

    thisNode(doc) {return doc[this[private$].sym$]}

    thisElm(doc) {
      const node = doc[this[private$].sym$];
      return node == null ? null : node[elm$];
    }

    elm(doc, force) {
      if (doc == null) return null;
      const pv = this[private$];
      const {entries, sym$} = pv;
      const node = doc[sym$] || entries.findNode(doc);
      if (node == null) return null;

      const elm = node[elm$];

      if (elm !== null || force !== 'render') return elm;

      return this.nodeElm(node, force);
    }

    nodeElm(node, force) {
      if (node == null) return null;
      const elm = node[elm$];

      if (elm !== null || force !== 'render') return elm;

      const pv = this[private$];
      const {entries} = pv;

      for(let count = -1, curr = node; curr !== null; curr = entries.previousNode(curr)) {
        ++count;
        if (curr[elm$] !== null) {
          setLimit(pv, pv.limit + count);
          return node[elm$];
        }
      }

      return null;
    }

    get query() {return this[private$].query}
    changeOptions({
      query, compare, compareKeys,
      limit,
      updateAllTags=false,
    }={}) {
      const pv = this[private$];
      const {sym$} = pv;

      if (query !== undefined) {
        stopObserver(pv);
        pv.query = query;
      }

      if (compare === undefined) compare = pv.query.compare || pv.compare;
      if (compareKeys === undefined)
        compareKeys = pv.query.compareKeys || compare.compareKeys || pv.compareKeys;

      if (pv.compare !== undefined) pv.compare = compare;
      if (pv.compareKeys !== undefined) pv.compareKeys = compareKeys;
      if (limit !== undefined) pv.limit = limit;

      pv.lastVis = null;
      const oldTree = pv.entries;
      // tag docs with elms

      const newTree = pv.entries = new BTree(pv.compare);

      if (query !== undefined) {
        pv.observer = pv.query.onChange == null ? null : pv.query.onChange(pv.onChange);
      }

      pv.query && pv.query.forEach(doc => {
        const node = doc[sym$];

        if (node == null)
          addRow(pv, doc);
        else {
          doc[doc$] = undefined;
          oldTree.deleteNode(node);
          node.value = pv.compareKeys === addOrderKeys ?
            addOrder(pv, doc) : copyKeys(doc, pv.compareKeys);
          newTree.addNode(node);
          updateAllTags && myCtx(node[elm$]).updateAllTags();
          insertElm(pv, node);
        }
      });

      for (const node of oldTree.nodes()) {
        if (node[elm$] == null) break;
        delete node[doc$][sym$];
        removeElm(pv, node, true);
      }
    }

    get entries() {return this[private$].entries}

    updateEntry(doc, action) {
      const pv = this[private$];
      const {sym$} = pv;
      if (action === 'remove') {
        action = 'removed';
        removeRow(pv, doc);
      } else {
        const node = doc[sym$] || pv.entries.findNode(doc);
        if (node == null) {
          action = 'added';
          addRow(pv, doc);
        } else {
          action = 'changed';
          const isAddOrder = pv.compareKeys === addOrderKeys;
          if (pv.compare(isAddOrder ? doc[addOrder$] : doc, node.value) != 0) {
            node.value = isAddOrder ?
              addOrder(pv, doc) : copyKeys(doc, pv.compareKeys);
            moveNode(pv, node);
          }
          node[elm$] == null || myCtx(node[elm$]).updateAllTags(doc);
        }
      };
      pv.observeUpdates === undefined || pv.observeUpdates(this, doc, action);
    }

    get limit() {return this[private$].limit}
    set limit(value) {
      setLimit(this[private$], value);
    }

    stop() {
      stop(this[private$]);
    }
  }


  const makeOnChange = list => ({doc, isDelete}) =>{
    list.updateEntry(doc, isDelete ? 'remove' : undefined);
  };

  const setLimit = (pv, value)=>{
    const old = pv.limit;
    const {entries} = pv;
    pv.limit = value;

    let lastVis = pv.lastVis;

    for(let diff = value-old;lastVis !== null && diff > 0; --diff) {
      lastVis = entries.nextNode(lastVis);
      lastVis === null || (renderNode(pv, lastVis), insertElm(pv, lastVis));
    }
    if (value < old) {
      let node = entries.firstNode;
      for(let count = value; node !== null && count > 1; --count)
        node = entries.nextNode(node);

      lastVis = node;
      while(node = entries.nextNode(node)) {
        removeElm(pv, node);
      }
    }
    pv.lastVis === lastVis || (pv.lastVis = lastVis);
  };

  const stopObserver = pv=>{
    if (pv.observer != null) {
      pv.observer.stop();
      pv.observer = null;
    }
  };

  const cleanupDoc = (pv, doc)=>{
    delete doc[pv.sym$];
    if (pv.compareKeys === addOrderKeys)
      delete doc[addOrder$];
  };

  const stop = pv=>{
    stopObserver(pv);
    const {endMarker, entries} = pv;
    if (entries == null) return;
    for (const node of entries.nodes()) {
      if (node[elm$] == null) break;
      cleanupDoc(pv, node[doc$]);
    }
    let n = endMarker == null ? pv.container.lastChild : endMarker.previousSibling;
    while (n != null && n.nodeType !== COMMENT_NODE &&
           (endMarker == null || n[endMarker$] != endMarker)) {
      const p = n.previousSibling;
      pv.removeElement(n, true);
      n = p;
    }
  };

  const addRow = (pv, doc)=>{
    const node = pv.entries.add(pv.compareKeys === addOrderKeys ?
                                addOrder(pv, doc) : copyKeys(doc, pv.compareKeys));
    node[doc$] = doc;
    doc[pv.sym$] = node;
    const elm = checkToRender(pv, node);
    elm === null || insertElm(pv, node);
  };

  const checkToRender = (pv, node)=>{
    const {entries} = pv;
    const overLimit = entries.size - pv.limit;

    const nn = entries.nextNode(node);

    if (overLimit > 0) {
      pv.overLimit === undefined || pv.overLimit();
      if (nn === null || nn[elm$] === null)
        return node[elm$] = null;
      const {lastVis} = pv;
      removeElm(pv, lastVis);
      pv.lastVis = entries.previousNode(lastVis);

    } else if (overLimit == 0) {
      pv.lastVis = entries.lastNode;
    }
    const elm = node[elm$];
    return elm == null ? renderNode(pv, node) : elm;
  };

  const renderNode = (pv, node)=>{node[elm$] = pv.template.$autoRender(node[doc$], pv.parentCtx)};

  const removeElm = (pv, node, isNodeRemove=false)=>{
    const elm = node[elm$];
    if (elm !== null) {
      node[elm$] = null;
      pv.removeElement(elm, isNodeRemove);
    }
  };

  const removeRow = (pv, doc)=>{
    const {sym$} = pv;
    const node = doc[sym$] || pv.entries.findNode(doc);
    if (node !== null) {
      cleanupDoc(pv, node[doc$]);
      checkLimitBeforeRemove(pv, node);
      pv.entries.deleteNode(node);
      removeElm(pv, node, true);
    }
  };

  const checkLimitBeforeRemove = (pv, node) => {
    if (node[elm$] === null) return;

    const overLimit = pv.entries.size-1 - pv.limit;

    if (overLimit >= 0) {
      const lastVis = pv.entries.nextNode(pv.lastVis);
      pv.lastVis = lastVis;
      renderNode(pv, lastVis);
      insertElm(pv, lastVis);
      return;
    }
    pv.lastVis === null || (pv.lastVis = null);
  };

  const insertElm = (pv, node)=>{
    const nn = pv.entries.nextNode(node);
    pv.container.insertBefore(node[elm$], nn === null ? pv.endMarker : nn[elm$]);
  };

  const moveNode = (pv, node)=>{
    /** move up/down **/

    const lastFromVis = pv.lastVis;
    const {entries} = pv;

    if (lastFromVis === null) {
      /** fully visible list **/
      entries.deleteNode(node);
      entries.addNode(node);

    } else {
      let lastVis = lastFromVis;
      const fromNode = entries.nextNode(node);
      entries.deleteNode(node);
      entries.addNode(node);
      const nn = entries.nextNode(node);
      if (nn === fromNode) return; // position not changed
      if (node[elm$] === null) {
        /** hidden from **/
        if (nn !== null && nn[elm$] !== null) {
          /** to visible **/
          renderNode(pv, node);
          removeElm(pv, lastVis);
          pv.lastVis = entries.previousNode(lastVis);
        } /** else to hidden requires nothing **/
      } else {
        /** visible from **/
        if (nn === null || nn[elm$] === null) {
          /** to not visible (unless === lastFromVis) **/
          lastVis = pv.lastVis = node === lastFromVis ? fromNode : entries.nextNode(lastVis);
          if (node !== lastVis) {
            removeElm(pv, node);

            lastVis === null || renderNode(pv, node = lastVis);
          }
        } else if (node === lastVis) {
          /** to visible **/
          lastVis = pv.lastVis = fromNode === null ? entries.lastNode
            : entries.previousNode(fromNode);
        }
      }
    }
    node[elm$] === null || insertElm(pv, node);
  };

  AutoList.elm$ = elm$;

  /*
  **  const assertPv = pv=>{
  **    const {limit, entries: {size}, lastVis} = pv;
  **
  **    const overLimit = size - limit;
  **
  **    try {
  **      if (overLimit > 0) {
  **        if (lastVis == null)
  **          throw new Error("lastVis is null");
  **        else {
  **          let node = pv.entries.lastNode;
  **          for (let i = size; i > limit; --i)
  **            node = pv.entries.previousNode(node);
  **          if (lastVis !== node)
  **            throw new Error("lastVis in wrong place");
  **        }
  **      } else if (overLimit == 0) {
  **        if (lastVis !== pv.entries.lastNode)
  **          throw new Error("lastVis not lastNode");
  **      } else if (lastVis != null) {
  **        throw new Error("lastVis not null");
  **      }
  **    } catch(ex) {
  **      throw ex;
  **    }
  **  };
  **
  */

  return AutoList;
});
