define((require) => {
  'use strict';
  const Dom             = require('koru/dom/base');
  const util            = require('koru/util');

  const {private$, ctx$, endMarker$} = require('koru/symbols');
  const {onDestroy$} = Symbol(), autoUpdate$ = Symbol(), data$ = Symbol();

  const {ELEMENT_NODE, COMMENT_NODE,
         DOCUMENT_FRAGMENT_NODE, TEXT_NODE} = document;

  const {forEach} = util;

  let currentCtx = null, currentElement = null;

  let animationEndCount = 0;

  const Specials = {
    this: true,
    true: true,
    false: false,
    null: null,
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    '-': '-',
  };

  const getValue = (data, func, args) => {
    if (args == null) return;
    if (args.dotted != null) {
      let value = getValue(data, func, []);
      if (value == null) return value;
      const {dotted} = args;
      const last = dotted.length - 1;
      for (let i = 0; i <= last; ++i) {
        const row = dotted[i];
        const lv = value;
        value = lv[dotted[i]];
        if (value == null) {
          return value;
        }
        if (typeof value === 'function') {
          value = i === last
            ? value.apply(lv, evalArgs(data, args))
            : value.call(lv);
        }
      }
      return value;
    }

    let parts = null;
    switch (typeof func) {
    case 'function':
      return func.apply(data, evalArgs(data, args));
    case 'string': {
      const sp = Specials[func];
      if (sp !== void 0) {
        if (func === 'this') return data;
        return sp;
      }

      switch (func[0]) {
      case '"': return func.slice(1);
      case '.':
        parts = func.split('.');
        func = parts[1];
      default:
        if (Specials[func[0]] !== void 0) {
          const n = Number.parseFloat(func);
          if (! isNaN(n)) {
            return n;
          }
        }
      }

      let value;
      if (data != null) {
        const {_helpers} = currentCtx.template;
        if (func in _helpers) {
          value = _helpers[func];
        } else {
          value = data[func];
          if (value === void 0) value = null;
        }
      }
      if (parts !== null) {
        for (let i = 2; value != null && i < parts.length; ++i) {
          data = value;
          value = value[parts[i]];
        }
      }
      if (value !== void 0) {
        if (typeof value === 'function') {
          return value.apply(data, evalArgs(data, args));
        }
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
      throw new Error('Unexpected type: ' + (typeof func));
    }
  };

  const updateNode = (node, data) => {
    currentElement = node[0];

    let value = getValue(data, node[1], node[2]);

    if (value === void 0 || value === currentElement) {
      return;
    }

    if (value === null) {
      if (currentElement.nodeType === COMMENT_NODE) {
        value = currentElement;
      } else {
        value = document.createComment('empty');
      }
    } else if (typeof value === 'object' && value.nodeType === DOCUMENT_FRAGMENT_NODE) {
      if (currentElement[endMarker$] !== void 0) {
        Dom.removeInserts(currentElement);
      } else {
        if (currentElement.nodeType !== COMMENT_NODE) {
          const start = document.createComment('start');
          Dom.replaceElement(start, currentElement);
          currentElement = start;
        } else {
          currentElement.textContent = 'start';
        }
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
    }// else *** User created node

    if (currentElement !== value) {
      Dom.replaceElement(value, currentElement);
    }
    node[0] = value;
  };

  const evalArgs = (data, args) => {
    const len = args.length;
    if (len === 0) return args;

    let output = [];
    let hash = void 0;

    for (let i = 0; i<len; ++i) {
      const arg = args[i];
      if (arg != null && typeof arg === 'object' && arg[0] === '=') {
        if (hash === void 0) hash = {};
        hash[arg[1]] = getValue(data, arg[2], []);
      } else {
        output.push(getValue(data, arg, []));
      }
    }
    if (hash !== void 0) for (const key in hash) {
      output.push(hash);
      break;
    }
    return output;
  };

  const animationEnd = (event) => {
    const target = event.target;
    const ctx = Dom.myCtx(target);
    const func = ctx && ctx.animationEnd;

    if (func == null) return;
    if (ctx.animationEndRepeat !== true) {
      removeOnAnmiationEnd.call(ctx);
    }

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

    if (func.$autoRender !== void 0) {
      return func.$autoRender(args);
    } else {
      return func.call(this, args);
    }
  }

  function removeOnAnmiationEnd() {
    if (this.animationEnd == null) return;
    this.animationEnd = null;
    if (--animationEndCount === 0) {
      document.body.removeEventListener('animationend', animationEnd, true);
    }
  }

  const nullStop = () => {};

  const autoUpdateChange = (ctx) => {
    const handle = ctx[autoUpdate$];
    handle.stop();
    handle.subject = ctx.data;
    const model = ctx.data?.constructor;
    handle.stop = model == null
      ? nullStop
      : (model.observeId?.(ctx.data._id, handle.oc) ?? model.onChange?.(handle.oc))?.stop ?? nullStop;
  };

  const stopAutoUpdate = (ctx) => {
    ctx[autoUpdate$].stop();
    ctx[autoUpdate$] = void 0;
  };

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
        this[autoUpdate$] === void 0 || autoUpdateChange(this);
      }
    }

    _destroyData(elm) {
      if (this[autoUpdate$] !== void 0) stopAutoUpdate(this);

      if (this[onDestroy$] !== void 0) {
        const list = this[onDestroy$];
        this[onDestroy$] = void 0;
        for (let i = list.length - 1; i >= 0; --i) {
          const row = list[i];
          if (typeof row === 'function') {
            row.call(this, this, elm);
          } else {
            row.stop();
          }
        }
      }
      this.destroyed !== void 0 && this.destroyed(this, elm);
      const tpl = this.template;
      tpl != null && tpl.$destroyed !== void 0 && tpl.$destroyed.call(tpl, this, elm);
    }

    onDestroy(obj) {
      if (obj == null) return;
      const list = this[onDestroy$];
      (list === void 0 ? (this[onDestroy$] = []) : list).push(obj);
      return this;
    }

    element() {return this.firstElement}

    updateAllTags(data) {
      if (data === void 0) {
        data = this[data$];
      } else if (data !== this[data$]) {
        this[data$] = data;
        this[autoUpdate$] === void 0 || autoUpdateChange(this);
      }
      const {activeElement} = document;
      const prevCtx = currentCtx;
      const prevElm = currentElement;
      currentCtx = this;
      try {
        const {evals, attrEvals} = this;
        for (let i = 0; i < attrEvals.length; ++i) {
          const node = attrEvals[i];
          currentElement = node[0];
          const raw = getValue(data, node[2], node[3]);
          const value = (raw === 0 ? '0' : raw || '').toString();
          const name = node[1];
          if (name != null && currentElement.getAttribute(name) !== value) {
            if (name === 'xlink:href') {
              currentElement.setAttributeNS(Dom.XLINKNS, 'href', value);
            } else {
              currentElement.setAttribute(name, value);
            }
          }
        }

        for (let i = 0; i < evals.length; ++i) {
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
        for (let i = 0; i<len; ++i) {
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
        if (++animationEndCount === 1) {
          document.body.addEventListener('animationend', animationEnd, true);
        }
        this.onDestroy(removeOnAnmiationEnd);
      } else {
        if (func !== 'cancel') {
          old = this.animationEnd;
        }

        if (func == null || func === 'cancel') {
          removeOnAnmiationEnd.call(this);
          func = null;
        }
      }
      this.animationEnd = func;
      if (func != null && repeat === 'repeat') {
        this.animationEndRepeat = true;
      }
      old !== null && old(this, this.element());
    }

    autoUpdate(observe) {
      if (this[autoUpdate$] !== void 0) stopAutoUpdate(this);
      this[autoUpdate$] = {subject: void 0, stop: nullStop, observe, oc: (dc) => {
        const handle = this[autoUpdate$];
        if (dc.isDelete) {
          handle.stop();
        } else {
          if (handle.subject !== dc.doc) this[data$] = handle.subject = dc.doc;
          this.updateAllTags();
        }
        handle.observe?.call(this, dc);
      }};
      autoUpdateChange(this);
    }

    stopAutoUpdate() {
      stopAutoUpdate(this);
    }

    addEventListener(elm, type, callback, opts) {
      if (type === 'menustart') {
        const wrapper = Dom.makeMenustartCallback(callback);
        elm.addEventListener('pointerdown', wrapper, opts);
        elm.addEventListener('click', wrapper, opts);
        this.onDestroy(() => {
          elm.removeEventListener('pointerdown', wrapper, opts);
          elm.removeEventListener('click', wrapper, opts);
        });
      } else {
        elm.addEventListener(type, callback, opts);
        this.onDestroy(() => {elm.removeEventListener(type, callback, opts)});
      }
    }

    static get _currentCtx() {return currentCtx}
    static set _currentCtx(value) {currentCtx = value}

    static get _currentElement() {return currentElement}
  }

  Ctx[private$] = {onDestroy$};

  Ctx.current = {
    data: (elm) => {
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
    isElement: () => currentElement.nodeType === ELEMENT_NODE,
    getValue: (name, ...args) => getValue(currentCtx.data, name, args),
  };

  Ctx[private$] = {
    getValue,
    evalArgs,
    set currentElement(value) {currentElement = value},
  };

  return Ctx;
});
