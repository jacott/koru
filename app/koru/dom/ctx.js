define((require)=>{
  'use strict';
  const Dom             = require('koru/dom/base');
  const util            = require('koru/util');

  const {private$, ctx$, endMarker$} = require('koru/symbols');
  const {onDestroy$} = Symbol(), autoUpdate$ = Symbol(), data$ = Symbol();

  const {DOCUMENT_NODE, ELEMENT_NODE, COMMENT_NODE,
         DOCUMENT_FRAGMENT_NODE, TEXT_NODE} = document;

  const {forEach} = util;

  let currentCtx = null, currentElement = null;

  let animationEndCount = 0;

  const getValue = (data, func, args)=>{
    if (args == null) return;
    if (args.dotted != null) {
      let value = getValue(data, func, []);
      if (value == null) return value;
      const {dotted} = args;
      const last = dotted.length -1;
      for(let i = 0; i <= last ; ++i) {
        const row = dotted[i];
        const lv = value;
        value = lv[dotted[i]];
        if (value == null) {
          return value;
        }
        if (typeof value === 'function') {
          value = i === last ?
            value.apply(lv, evalArgs(data, args)) :
            value.call(lv);
        }
      }
      return value;
    }

    let parts = null;
    switch(typeof func) {
    case 'function':
      return func.apply(data, evalArgs(data, args));
    case 'string': {
      switch(func[0]) {
      case '"': return func.slice(1);
      case '.':
        parts = func.split('.');
        func = parts[1];
      }

      if (func === 'this') return data;

      let value;
      if (data != null) {
        const {_helpers} = currentCtx.template;
        if (func in _helpers) {
          value = _helpers[func];
        } else {
          value = data[func];
          if (value === undefined) value = null;
        }
      }
      if (parts !== null) {
        for(let i = 2; value != null && i < parts.length; ++i) {
          data = value;
          value = value[parts[i]];
        }
      }
      if (value !== undefined) {
        if (typeof value === 'function')
          return value.apply(data, evalArgs(data, args));
        return value;
      }
      return;
    }
    case 'number':
      return func;
    case 'object':
      if ('$autoRender' in func) {
        return evalPartial.call(data, func, args);
      }
    default:
      throw new Error('Unexpected type: '+ (typeof func));
    }
  };

  const updateNode = (node, data)=>{
    currentElement = node[0];

    let value = getValue(data, node[1], node[2]);

    if (value === undefined || value === currentElement)
      return;

    if (value === null)  {
      if (currentElement.nodeType === COMMENT_NODE)
        value = currentElement;
      else
        value = document.createComment('empty');

    } else if (typeof value === 'object' && value.nodeType === DOCUMENT_FRAGMENT_NODE) {
      if (currentElement[endMarker$] !== undefined) {
        Dom.removeInserts(currentElement);
      } else {
        if (currentElement.nodeType !== COMMENT_NODE) {
          const start = document.createComment('start');
          Dom.replaceElement(start, currentElement);
          currentElement = start;
        } else
          currentElement.textContent = 'start';
        currentElement[endMarker$] = document.createComment('end');
        currentElement.parentNode.insertBefore(
          currentElement[endMarker$], currentElement.nextSibling);
      }

      currentElement.parentNode.insertBefore(value, currentElement[endMarker$]);
      value = currentElement;

    } else if (typeof value !== 'object' || ! ('nodeType' in value)) {

      // ***  Text output ***
      if (currentElement.nodeType === TEXT_NODE) {
        currentElement.textContent = value.toString();
        value = currentElement;
      } else {
        value = document.createTextNode(value.toString());
      }
    } // else *** User created node

    if (currentElement !== value) {
      Dom.replaceElement(value, currentElement);
    }
    node[0] = value;
  };

  const evalArgs = (data, args)=>{
    const len = args.length;
    if (len === 0) return args;

    let output = [];
    let hash = undefined;

    for(let i = 0; i < len; ++i) {
      const arg = args[i];
      if (arg != null && typeof arg === 'object' && arg[0] === '=') {
        if (hash === undefined) hash = {};
        hash[arg[1]] = getValue(data, arg[2], []);
      } else {
        output.push(getValue(data, arg, []));
      }
    }
    if (hash !== undefined) for(const key in hash) {
      output.push(hash);
      break;
    }
    return output;
  };

  const animationEnd = event =>{
    const target = event.target;
    const ctx = Dom.myCtx(target);
    const func = ctx && ctx.animationEnd;

    if (func == null) return;
    if (ctx.animationEndRepeat !== true)
      removeOnAnmiationEnd.call(ctx);

    func(ctx, target);
  };

  function evalPartial(func, args) {
    if (args.length === 0) {
      args = this;
    } else {
      args = evalArgs(this, args);
      if (args.length === 1) args = args[0];
    }

    if (currentElement[ctx$] != null) {
      return currentElement[ctx$].updateAllTags(args);
    }

    if (func.$autoRender !== undefined)
      return func.$autoRender(args);
    else
      return func.call(this, args);
  }

  function removeOnAnmiationEnd() {
    if (this.animationEnd == null) return;
    this.animationEnd = null;
    if (--animationEndCount === 0)
      document.body.removeEventListener('animationend', animationEnd, true);
  }

  const autoUpdateChange = (ctx)=>{
    const {data} = ctx;
    stopAutoUpdate(ctx);
    ctx.autoUpdate();
  };

  const stopAutoUpdate = (ctx)=>{
    ctx[autoUpdate$].stop();
    ctx[autoUpdate$] = undefined;
  };

  const nullDataAutoHandle = {stop: ()=>{}};

  class Ctx {
    constructor(template, parentCtx, data) {
      this.template = template;
      this.parentCtx = parentCtx;
      this[data$] = data;
      this.evals = [];
      this.attrEvals = [];
    }

    get data() {return this[data$]}
    set data(value) {
      if (this[data$] !== value) {
        this[data$] = value;
        this[autoUpdate$] === undefined || autoUpdateChange(this);
      }
    }

    _destroyData(elm) {
      if (this[autoUpdate$] !== undefined) stopAutoUpdate(this);

      if (this[onDestroy$] !== undefined) {
        const list = this[onDestroy$];
        this[onDestroy$] = undefined;
        for(let i = list.length - 1; i >=0; --i) {
          const row = list[i];
          if (typeof row === 'function')
            row.call(this, this, elm);
          else
            row.stop(this, elm);
        }
      }
      this.destroyed !== undefined && this.destroyed(this, elm);
      const tpl = this.template;
      tpl != null && tpl.$destroyed !== undefined && tpl.$destroyed.call(tpl, this, elm);
    }

    onDestroy(obj) {
      if (obj == null) return;
      const list = this[onDestroy$];
      (list === undefined ? (this[onDestroy$] = []) : list).push(obj);
      return this;
    }

    element() {return this.firstElement}

    updateAllTags(data) {
      if (data === undefined)
        data = this[data$];
      else if (data !== this[data$]) {
        this[data$] = data;
        if (this[autoUpdate$] !== undefined) {
          autoUpdateChange(this);
        }
      }
      const {activeElement} = document;
      const prevCtx = currentCtx;
      const prevElm = currentElement;
      currentCtx = this;
      try {
        const {evals, attrEvals} = this;
        for(let i = 0; i < attrEvals.length; ++i) {
          const node = attrEvals[i];
          currentElement = node[0];
          const raw = getValue(data, node[2], node[3]);
          const value = (raw === 0 ? '0' : raw ||'').toString();
          const name = node[1];
          if (name != null && currentElement.getAttribute(name) !== value) {
            if (name === 'xlink:href')
              currentElement.setAttributeNS(Dom.XLINKNS, 'href', value);
            else
              currentElement.setAttribute(name, value);
          }
        }

        for(let i = 0; i < evals.length; ++i) {
          updateNode(evals[i], data);
        }
      } finally {
        currentElement = prevElm;
        currentCtx = prevCtx;
      }
      const nae = document.activeElement;
      if (nae !== activeElement && (nae === null || nae === document.body) && activeElement !== null) {
        activeElement.focus();
      }
    }

    updateElement(elm) {
      const prevCtx = currentCtx;
      const prevElm = currentElement;
      currentCtx = this;
      try {
        const {evals} = this;
        const len = evals.length;
        for(let i = 0; i < len; ++i) {
          const ev = evals[i];
          if (Dom.contains(elm, ev[0])) {
            updateNode(ev, currentCtx.data);
          }
        }
      } finally {
        currentElement = prevElm;
        currentCtx = prevCtx;
      }
    }

    onAnimationEnd(func, repeat) {
      let old = null;
      if (this.animationEnd == null) {
        if(++animationEndCount === 1)
          document.body.addEventListener('animationend', animationEnd, true);
        this.onDestroy(removeOnAnmiationEnd);
      } else {
        if (func !== 'cancel')
          old = this.animationEnd;

        if (func == null || func === 'cancel') {
          removeOnAnmiationEnd.call(this);
          func = null;
        }
      }
      this.animationEnd = func;
      if (func != null && repeat === 'repeat')
        this.animationEndRepeat = true;
      old !== null && old(this, this.element());
    }

    autoUpdate({subject=this.data, removed}={}) {
      if (this[autoUpdate$])
        stopAutoUpdate(this);
      if (subject == null) {
        if (subject === this.data) {
          this[autoUpdate$] = nullDataAutoHandle;
        }
        return;
      }
      const model = subject.constructor;
      const handle = model.observeId ? model.observeId(subject._id, ({doc, isDelete})=>{
        if (isDelete) {
          handle.stop();
          removed !== undefined && removed(doc);
        } else {
          if (subject !== doc) this[data$] = subject = doc;
          this.updateAllTags();
        }
      }) : model.onChange(({doc, isDelete})=>{
        if (isDelete) {
          if (doc === subject) {
            handle.stop();
            removed !== undefined && removed(doc);
          }
        } else if (doc === subject) {
          this.updateAllTags();
        }
      });

      if (subject === this.data)
        return this[autoUpdate$] = handle;
      else {
        this.onDestroy(handle.stop);
        return handle;
      }
    }

    static get _currentCtx() {return currentCtx}
    static set _currentCtx(value) {currentCtx = value}

    static get _currentElement() {return currentElement}
  };

  Ctx[private$] = {onDestroy$};

  Ctx.current = {
    data: elm =>{
      if (elm != null) {
        const ctx = Dom.ctx(elm);
        return ctx && ctx.data;
      }

      return currentCtx == null ? null : currentCtx.data;
    },

    get template() {return currentCtx.template},
    get ctx() {return currentCtx},
    set _ctx(value) {currentCtx = value},
    get element() {return currentElement},
    isElement: ()=> currentElement.nodeType === ELEMENT_NODE,
    getValue: (name, ...args)=> getValue(currentCtx.data, name, args),
  };

  Ctx[private$] = {
    getValue: getValue,
    evalArgs: evalArgs,
    set currentElement(value) {currentElement = value}
  };

  return Ctx;
});
