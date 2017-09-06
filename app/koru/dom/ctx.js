define(function(require, exports, module) {
  const Dom  = require('koru/dom/base');
  const util = require('koru/util');

  const {private$, ctx$, endMarker$} = require('koru/symbols');

  const {DOCUMENT_NODE, ELEMENT_NODE, COMMENT_NODE,
         DOCUMENT_FRAGMENT_NODE, TEXT_NODE} = document;

  const {forEach} = util;

  let currentCtx = null, currentElement = null;

  let animationEndCount = 0;

  class Ctx {
    constructor(template, parentCtx, data) {
      this.template = template;
      this.parentCtx = parentCtx;
      this.data = data;
      this.evals = [];
      this.attrEvals = [];
    }

    onDestroy(obj) {
      if (obj == null) return;
      const list = this.__onDestroy;
      (list === undefined ? (this.__onDestroy = []) : list).push(obj);
      return this;
    }

    element() {
      return this.firstElement || findFirstElement(this);
    }

    updateAllTags(data) {
      const activeElement = document.activeElement;
      const prevCtx = currentCtx;
      const prevElm = currentElement;
      currentCtx = this;
      if (data === undefined)
        data = this.data;
      else
        this.data = data;
      try {
        const {evals, attrEvals} = this;
        for(let i = 0; i < attrEvals.length; ++i) {
          const node = attrEvals[i];
          currentElement = node[0];
          const value = (getValue(data, node[2], node[3])||'').toString();
          const name = node[1];
          if (name != null && currentElement.getAttribute(name) !== value) {
            if (name === 'xlink:href')
              currentElement.setAttributeNS('http://www.w3.org/1999/xlink', 'href', value);
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
      activeElement && document.activeElement !== activeElement &&
        activeElement.focus();
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
      if (! this.animationEnd) {
        if(++animationEndCount === 1)
          document.body.addEventListener('animationend', animationEnd, true);
        this.onDestroy(removeOnAnmiationEnd);
      } else {
        if (func !== 'cancel')
          var old = this.animationEnd;

        if (func == null || func === 'cancel') {
          removeOnAnmiationEnd.call(this);
          func = null;
        }
      }
      this.animationEnd = func;
      if (func != null && repeat === 'repeat')
        this.animationEndRepeat = true;
      old != null && old(this, this.element());
    }

    static get _currentCtx() {return currentCtx}
    static set _currentCtx(value) {currentCtx = value}

    static get _currentElement() {return currentElement}
  };

  function findFirstElement(ctx) {
    let evals = ctx.evals;
    evals = evals && ctx.evals[0];
    let elm = evals && evals[0];
    while(elm && elm.nodeType !== DOCUMENT_NODE && elm[ctx$] !== ctx)
      elm = elm.parentNode;

    return elm;
  }

  Ctx.current = {
    data(elm) {
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
    isElement() {
      return currentElement.nodeType === ELEMENT_NODE;
    },
  };

  module.exports = Ctx;

  function getValue(data, func, args) {
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

      var value = data && data[func];
      if (value === undefined) {
        value = currentCtx.template._helpers[func];
      }
      if (parts !== null) {
        for(let i = 2; value !== undefined && i < parts.length; ++i) {
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
  }

  function updateNode(node, data) {
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
  }

  function evalArgs(data, args) {
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
  }

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

  function animationEnd(event) {
    const target = event.target;
    const ctx = Dom.myCtx(target);
    const func = ctx && ctx.animationEnd;

    if (func == null) return;
    if (ctx.animationEndRepeat !== true)
      removeOnAnmiationEnd.call(ctx);

    func(ctx, target);
  }

  function removeOnAnmiationEnd() {
    if (this.animationEnd == null) return;
    this.animationEnd = null;
    if (--animationEndCount === 0)
      document.body.removeEventListener('animationend', animationEnd, true);
  }

  Ctx[private$] = {
    getValue: getValue,
    evalArgs: evalArgs,
    set currentElement(value) {
      return currentElement = value;
    }
  };
});
