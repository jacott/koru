define(function(require, exports, module) {
  const Dom  = require('koru/dom/base');
  const util = require('koru/util');

  const DOCUMENT_NODE = document.DOCUMENT_NODE;
  const COMMENT_NODE = document.COMMENT_NODE;
  const DOCUMENT_FRAGMENT_NODE = document.DOCUMENT_FRAGMENT_NODE;
  const TEXT_NODE = document.TEXT_NODE;

  let currentCtx, currentElement;

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
      if (! obj) return;
      var list = this.__onDestroy || (this.__onDestroy = []);
      list.push(obj);
      return this;
    }

    element() {
      var evals = this.evals;
      evals = evals && this.evals[0];
      var elm = evals && evals[0];
      while(elm && elm.nodeType !== DOCUMENT_NODE && elm._koru !== this)
        elm = elm.parentNode;

      return elm;
    }

    updateAllTags(data) {
      var activeElement = document.activeElement;
      var prevCtx = currentCtx;
      var prevElm = currentElement;
      currentCtx = this;
      if (data === undefined)
        data = this.data;
      else
        this.data = data;
      try {
        var evals = this.attrEvals;
        for(var i=0; i < evals.length; ++i) {
          var node = evals[i];
          currentElement = node[0];
          var value = (getValue(data, node[2], node[3])||'').toString();
          if (node[1] && node[0].getAttribute(node[1]) !== value)
            node[0].setAttribute(node[1], value);
        }
        evals = this.evals;

        for(var i=0; i < evals.length; ++i) {
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
      var prevCtx = currentCtx;
      var prevElm = currentElement;
      currentCtx = this;
      try {
        util.forEach(this.evals, function (ev) {
          if (Dom.contains(elm, ev[0])) {
            updateNode(ev, currentCtx.data);
          }
        });
      } finally {
        currentElement = prevElm;
        currentCtx = prevCtx;
      }
    }

    onAnimationEnd(func, repeat) {
      if (! this.animationEnd) {
        if(++animationEndCount === 1)
          document.body.addEventListener(Dom.animationEndEventName, animationEnd, true);
        this.onDestroy(removeOnAnmiationEnd);
      } else {
        if (func !== 'cancel')
          var old = this.animationEnd;

        if (! func || func === 'cancel') {
          removeOnAnmiationEnd.call(this);
          func = null;
        }
      }
      this.animationEnd = func;
      this.animationEndRepeat = func && repeat === 'repeat';
      old && old(this, this.element());
    }

    static get _currentCtx() {return currentCtx}
    static set _currentCtx(value) {currentCtx = value}

    static get _currentElement() {return currentElement}
  };

  Ctx.current = {
    data(elm) {
      if (elm) {
        var ctx = Dom.getCtx(elm);
        return ctx && ctx.data;
      }

      return currentCtx && currentCtx.data;
    },

    get template() {return currentCtx.template},
    get ctx() {return currentCtx},
    set _ctx(value) {currentCtx = value},
    get element() {return currentElement},
    isElement() {
      return currentElement.nodeType === 1;
    },
  };

  module.exports = Ctx;

  function getValue(data, func, args) {
    if (! args) {
      return;
    }
    if (args.dotted) {
      var value = getValue(data, func, []);
      if (value == null) return value;
      var dotted = args.dotted;
      var last = dotted.length -1;
      for(var i = 0; i <= last ; ++i) {
        var row = dotted[i];
        var lv = value;
        var value = lv[dotted[i]];
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

    switch(typeof func) {
    case 'function':
      return func.apply(data, evalArgs(data, args));
    case 'string':
      switch(func[0]) {
      case '"': return func.slice(1);
      case '.':
        var parts = func.split('.');
        func = parts[1];
      }

      if (func === 'this') return data;

      var value = data && data[func];
      if (value === undefined) {
        value = currentCtx.template._helpers[func];
      }
      if (parts) {
        for(var i = 2; value !== undefined && i < parts.length; ++i) {
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

    var value = getValue(data, node[1], node[2]);

    if (value === undefined || value === currentElement)
      return;

    if (value === null)  {
      if (currentElement.nodeType === COMMENT_NODE)
        value = currentElement;
      else
        value = document.createComment('empty');

    } else if (typeof value === 'object' && value.nodeType === DOCUMENT_FRAGMENT_NODE) {
      if ('_koruEnd' in currentElement) {
        Dom.removeInserts(currentElement);
      } else {
        if (currentElement.nodeType !== COMMENT_NODE) {
          var start = document.createComment('start');
          Dom.replaceElement(start, currentElement);
          currentElement = start;
        } else
          currentElement.textContent = 'start';
        currentElement._koruEnd = document.createComment('end');
        currentElement.parentNode.insertBefore(currentElement._koruEnd, currentElement.nextSibling);
      }

      currentElement.parentNode.insertBefore(value, currentElement._koruEnd);
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
    if (args.length === 0) return args;

    var output = [];
    var hash;

    for(var i = 0; i < args.length; ++i) {
      var arg = args[i];
      if (arg != null && typeof arg === 'object' && arg[0] === '=') {
        hash = hash || {};
        hash[arg[1]] = getValue(data, arg[2], []);
      } else {
        output.push(getValue(data, arg, []));
      }
    }
    if (hash) for(var key in hash) {
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

    if (currentElement._koru) {
      return currentElement._koru.updateAllTags(args);
    }



    if ('$autoRender' in func)
      return func.$autoRender(args);
    else
      return func.call(this, args);
  }

  function animationEnd(event) {
    var target = event.target;
    var ctx = target._koru;
    var func = ctx && ctx.animationEnd;

    if (! func) return;
    if (! ctx.animationEndRepeat)
      removeOnAnmiationEnd.call(ctx);

    func(ctx, target);
  }

  function removeOnAnmiationEnd() {
    if (! this.animationEnd) return;
    this.animationEnd = null;
    if (--animationEndCount === 0)
      document.body.removeEventListener(Dom.animationEndEventName, animationEnd, true);
  }

  Ctx._private = {
    getValue: getValue,
    evalArgs: evalArgs,
    set currentElement(value) {
      return currentElement = value;
    }
  };
});
