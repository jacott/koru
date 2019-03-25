define((require)=>{
  'use strict';
  const Dom             = require('koru/dom');
  const Observable      = require('koru/observable');
  const util            = require('koru/util');

  const {test$} = require('koru/symbols');

  const {hasOwn} = util;

  const mo$ = Symbol(), paused$ = Symbol(), onchange$ = Symbol(),
        redos$ = Symbol(), undos$ = Symbol(), pendingTail$ = Symbol(),
        pending$ = Symbol(), range$ = Symbol(), target$ = Symbol();

  const OB_ALL = {
    subtree: true, childList: true,
    attributes: true, attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true,
  };

  const setAttr = ({attributeNamespace, attributeName, oldValue}, value)=>{
    const ans = attributeNamespace  || '';
    const attrs = value[ans] || (value[ans] = {});
    attrs[attributeName] = oldValue;
    return value;
  };

  const notify = (undo)=>{undo[onchange$].notify(undo)};

  // // test helpers
  // let gid = 0;

  // const db = (node)=>{
  //   if (node == null) return node;
  //   if (node[test$]) return node[test$];
  //   return node[test$] = `${++gid}:${node.tagName || node.nodeValue}`;
  // };

  const SUM_ACTIONS = {
    characterData: (list, mut)=>{
      const {target} = mut;
      const action = list.getAction(target);
      if (action === undefined) {
        list.addAction(target, {node: target, text: mut.oldValue});
      } else if (action.text === undefined)
        action.text = mut.oldValue;
    },

    childList: (list, mut)=>{
      const {addedNodes, removedNodes, target} = mut;
      for (const node of addedNodes) {
        const action = list.getAction(node);
        if (node.parentNode !== null)
          ++list.cc;
        else
          list.limbo.add(node);
        list.pending.push({node, remove: true});
      }
      for (const node of removedNodes) {
        if (node.parentNode === null) {
          if (list.limbo.has(node))
            list.limbo.delete(node);
          else
            ++list.cc;
        }
        const action = list.getAction(node);
        list.pending.push({node, parent: target, before: mut.nextSibling});
      }
    },

    attributes: (list, mut)=>{
      const {target} = mut;
      const action = list.getAction(target);
      if (action === undefined) {
        list.addAction(target, {node: target, attrs: setAttr(mut, {})});
      } else if (action.attrs === undefined)
        action.attrs = setAttr(mut, {});
      else
        setAttr(mut, action.attrs);
    },
  };

  const applyAttrs = (node, attrs) =>{
    for (const ns in attrs) {
      const nsmap = attrs[ns];
      for (const name in nsmap) {
        const v = nsmap[name];
        if (v == null)
          node.removeAttributeNS(ns, name);
        else
          node.setAttributeNS(ns, name, v);
      }
    }
  };

  const debugMut = (m)=> util.inspect(
    m.type === 'childList'
      ? {target: m.target, addedNodes: Array.from(m.addedNodes),
         removedNodes: Array.from(m.removedNodes)}
    : {target: m.target, oldValue: m.oldValue}
  );


  const summarise = (undo, list, muts)=>{
    if (muts.length == 0 && muts[pending$] === undefined)
      return;

    const range = undo[range$];
    saveCaret(undo);
    const ans = list.record(muts);
    if (ans === undefined) return false;
    if (range !== undefined && ans[range$] === undefined)
      ans[range$] = range;
    return true;
  };

  const applyActions = (undo, undos, redos)=>{
    undo.recordNow();
    const actions = undos.pop();
    if (actions === undefined) return false;

    for(let i = actions.length-1; i >= 0; --i) {
      const action = actions[i];
      const {node, text, attrs, remove} = action;
      if (text !== undefined) {
        node.textContent = text;
      }
      if (attrs !== undefined) {
        applyAttrs(node, attrs);
      }
      if (remove) {
        node.remove();
      } else {
        const {parent} = action;
        if (parent !== undefined) {
          parent.insertBefore(node, action.before);
        }
      }
    }

    const sel = actions[range$];
    if (sel !== undefined) {
      const range = document.createRange();
      range.setStart(sel[0], sel[1]);
      sel.length == 4 && range.setEnd(sel[2], sel[3]);
      Dom.setRange(range);
    }

    summarise(undo, redos, undo[mo$].takeRecords());
    notify(undo);
    return true;
  };

  const saveCaret = (undo, range=Dom.getRange())=>{
    if (range !== null && undo[target$].contains(range.startContainer)) {

      const sel = [range.startContainer, range.startOffset];
      range.collapsed || sel.push(range.endContainer, range.endOffset);
      undo[range$] = sel;
    }
  };

  const newPending = ()=>{
    const ans = [];
    ans[target$] = new Map();
    return ans;
  };

  const copyActionFields = (to, from)=>{
    if (from.text !== undefined) to.text = from.text;
    if (from.attrs !== undefined) to.attrs = from.attrs;
  };


  class UndoList {
    constructor(isUndo) {
      this.cast = new Map();
      this.isUndo = isUndo;
      this.actions = [];
      this.pending = newPending();
      this.cc = 0;
      this.limbo = new Set();
    }

    clear() {
      this.cast.clear();
      this.actions.length = 0;
    }

    pop() {
      const action = this.actions.pop();
      return action;
    }

    getAction(node, slot=this.pending) {return slot[target$].get(node)}

    addAction(node, action, slot=this.pending) {
      if (node.parentNode !== null) ++this.cc;
      const {parent} = action;
      slot[target$].set(node, action);
      slot.push(action);
    }

    get last() {
      const {actions} = this;
      return actions.length == 0 ? null : actions[actions.length-1];
    }

    record(muts) {
      for (;muts !== undefined; muts = muts[pending$]) {
        for (const mut of muts) {
          SUM_ACTIONS[mut.type](this, mut);
        }
      }
      const {pending} = this;
      if (pending.length == 0) return;
      this.pending = newPending();
      const {cc} = this;
      this.limbo.clear();
      this.cc = 0;

      if (cc === 0) {
        const {last} = this;
        last === null || util.append(last, pending);
        return;
      }

      if (this.isUndo && pending.length == 1) {
        const curr = pending[0];
        if (curr.remove === undefined && curr.parent === undefined && curr.attrs === undefined) {
          const {last} = this;
          if (last !== null && last.length == 1) {
            const prev = last[0];
            if (prev.text !== undefined && util.diffStringLength(prev.text, curr.text) < 10) {
              return;
            }
          }
        }
      }

      this.actions.push(pending);
      return pending;
    }
  }

  class DomUndo {
    constructor(target) {
      this[target$] = target;
      this[undos$] = new UndoList(true);
      this[redos$] = new UndoList(false);
      this[range$] = this[pending$] = this[pendingTail$] = undefined;
      this[mo$] = new window.MutationObserver(muts => this.recordNow(muts));
      const ctx = Dom.ctx(target);
      ctx === null || ctx.onDestroy(()=>{this.disconnect()});
      this.reconnect();
      this[onchange$] = new Observable();
      this[paused$] = false;
    }

    onChange(subject) {return this[onchange$].onChange(subject)}

    recordNow(muts=this[mo$].takeRecords()) {
      if (this[paused$] || this[pending$] !== undefined) {
        if (muts.length != 0) {
          if (this[pending$] === undefined)
            this[pending$] = this[pendingTail$] = muts;
          else
            this[pendingTail$] = this[pendingTail$][pending$] = muts;
        }
        if (this[paused$]) return;
        muts = this[pending$];
        this[pending$] = this[pendingTail$] = undefined;
      }
      if (muts.length != 0) {
        this[redos$].clear();
        if (summarise(this, this[undos$], muts)) {
          notify(this);
          return true;
        }
      }
    }

    disconnect() {
      this[mo$].disconnect();
      this[undos$].clear(); this[redos$].clear();
    }

    reconnect() {
      this[mo$].observe(this[target$], OB_ALL);
      this.saveCaret();
    }

    undo() {return applyActions(this, this[undos$], this[redos$])}
    redo() {return applyActions(this, this[redos$], this[undos$])}

    get undos() {return this[undos$].actions}
    get redos() {return this[redos$].actions}

    get paused() {return this[paused$]}

    pause() {
      this[paused$] = true;
    }

    unpause() {
      this[paused$] = false;
      this.recordNow();
    }

    saveCaret(range=Dom.getRange()) {
      if (this[pending$] !== undefined)
        return;

      const muts =this[mo$].takeRecords();
      if (muts.length != 0) {
        this[pending$] = this[pendingTail$] = muts;
        return;
      }

      saveCaret(this, range);
    }

    reset() {
      this.disconnect();
      this.reconnect();
    }
  }

  DomUndo[test$] = {
    range$
  };

  return DomUndo;
});
