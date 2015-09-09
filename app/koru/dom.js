define(function(require, exports, module) {
  var util = require('./util');
  var koru = require('./main');
  var Dom = require('./ui/util');

  var extend = util.extend;

  var COMMENT_NODE = document.COMMENT_NODE;
  var TEXT_NODE = document.TEXT_NODE;
  var DOCUMENT_FRAGMENT_NODE = document.DOCUMENT_FRAGMENT_NODE;
  var DOCUMENT_NODE = document.DOCUMENT_NODE;
  var _disable_focusout = false;

  var koruEvent = null;

  var currentCtx, currentElement, currentEvent;

  util.extend(Dom, {
    set _disable_focusout(value) {return _disable_focusout = value},
    get _disable_focusout() {return _disable_focusout},
    Ctx: DomCtx,
    current: {
      data: function (elm) {
        if (elm) {
          var ctx = Dom.getCtx(elm);
          return ctx && ctx.data;
        }

        return currentCtx.data;
      },

      get event() {return currentEvent},
      get template() {return currentCtx.template},
      get ctx() {return currentCtx},
      get element() {return currentElement},
      isElement: function () {
        return currentElement.nodeType === 1;
      },
    },

    get element() {return currentElement},

    _helpers: {
      inputValue: function (value) {
        Dom.updateInput(Dom.current.element, value == null ? '' : ''+value);
      },
    },

    updateInput: function (input, value) {
      if (value !== input.value) {
        input.value = value;
      }
      return value;
    },

    registerHelpers: function (helpers) {
      extend(this._helpers, helpers);
      return this;
    },

    newTemplate: function (module, options) {
      if (arguments.length === 1)
        return addTemplates(Dom, module);


      var tpl = addTemplates(Dom, options);
      koru.onunload(module, function () {
        delete (tpl.parent || Dom)[tpl.name];
      });
      return tpl;
    },

    lookupTemplate: function (name) {
      var m = /^((?:\.\.\/)*[^\.]+)\.(.*)$/.exec(name);

      if (m)
        return fetchTemplate(this, m[1], m[2].split("."));

      return fetchTemplate(this, name);
    },

    modifierKey: function (event) {
      return event.ctrlKey || event.shiftKey || event.metaKey || event.altKey;
    },

    stopEvent: function () {
      currentEvent = null;
    },

    stopPropigation: function () {
      currentEvent = 'propigation';
    },

    destroyData: function (elm) {
      var ctx = elm && elm._koru;
      if (ctx) {
        if (ctx.__onDestroy) {
          var list = ctx.__onDestroy;
          ctx.__onDestroy = null;
          for(var i = 0; i < list.length; ++i) {
            var row = list[i];
            if (typeof row === 'function')
              row.call(ctx);
            else
              row.stop();
          }
        }
        ctx.destroyed && ctx.destroyed(ctx, elm);
        var tpl = ctx.template;
        tpl && tpl.$destroyed && tpl.$destroyed.call(tpl, ctx, elm);
        elm._koru = null;
      }
      Dom.destroyChildren(elm);
    },

    removeId: function (id) {
      return this.remove(document.getElementById(id));
    },

    removeAll: function (elms) {
      for(var i = 0; i < elms.length; ++i) {
        this.remove(elms[i]);
      }
    },

    remove: function (elm) {
      if (elm) {
        Dom.destroyData(elm);
        elm.parentNode && elm.parentNode.removeChild(elm);
        return true;
      }
    },

    removeInserts: function (start) {
      var parent = start.parentNode;
      if (! parent) return;
      var end = start._koruEnd;
      for(var elm = start.nextSibling; elm && elm !== end; elm = start.nextSibling) {
        parent.removeChild(elm);
        Dom.destroyData(elm);
      }
    },

    removeChildren: function (elm) {
      if (! elm) return;

      var row;
      while(row = elm.firstChild) {
        Dom.destroyData(row);
        elm.removeChild(row);
      }
    },

    destroyChildren: function (elm) {
      if (! elm) return;

      var iter = elm.firstChild;
      while (iter) {
        var row = iter;
        iter = iter.nextSibling; // incase side affect
        Dom.destroyData(row);
      }
    },

    getMyCtx: function (elm) {
      return elm && elm._koru;
    },

    getCtx: function (elm) {
      if (! elm) return;
      if (typeof elm === 'string')
        elm = document.querySelector(elm);
      var ctx = elm._koru;
      while(! ctx && elm.parentNode)
        ctx = (elm = elm.parentNode)._koru;
      return ctx;
    },

    getCtxById: function (id) {
      var elm = document.getElementById(id);
      return elm && elm._koru;
    },

    updateElement: function (elm) {
      var ctx = Dom.getCtx(elm);
      ctx && ctx.updateElement(elm);
    },

    replaceElement: function (newElm, oldElm, noRemove) {
      var ast = oldElm._koruEnd;
      if (ast) {
        Dom.removeInserts(oldElm);
        Dom.remove(ast);
      }

      var parentCtx = (oldElm._koru && oldElm._koru.parentCtx) || Dom.getCtx(oldElm.parentNode);
      if (parentCtx) {
        var ctx = newElm._koru;
        if (ctx) ctx.parentCtx = parentCtx;
      }

      noRemove === 'noRemove' || Dom.destroyData(oldElm);

      oldElm.parentNode && oldElm.parentNode.replaceChild(newElm, oldElm);
      return this;
    },

    fragEnd: function (fragStart) {
      return fragStart._koruEnd;
    },

    /**
     * Remove an element and provide a function that inserts it into its original position
     * @param element {Element} The element to be temporarily removed
     * @return {Function} A function that inserts the element into its original position
     **/
    removeToInsertLater: function(element) {
      var parentNode = element.parentNode;
      var nextSibling = element.nextSibling;
      parentNode.removeChild(element);
      if (nextSibling) {
        return function() {parentNode.insertBefore(element, nextSibling)};
      } else {
        return function() {parentNode.appendChild(element)};
      };
    },

    contains: document.body.contains && Dom.vendorPrefix !== 'ms' ? function (parent, elm) {
      return parent && parent.contains(elm) ? parent : null;
    } : function (parent, elm) {
      while(elm && elm.nodeType !== DOCUMENT_NODE) {
        if (parent === elm) return parent;
        elm = elm.parentNode;
      }
      return null;
    },

    setCtx: function (elm, ctx) {
      if (! ctx) {
        ctx = new DomCtx(null, Dom.getCtx(elm));
      }
      elm._koru = ctx;
      return ctx;
    },

    // TODO import by performing a binary search. Also allow passing a
    // hint of the best place to start searching. It might be the upper
    // or lower bound or the point of insertion or not even in the list
    findFirstByCtxData: function (parent, finder) {
      var iter = parent && parent.firstChild;
      while(iter) {
        var row = iter;
        iter = iter.nextSibling; // incase side affect
        var b = row._koru;
        if (b && finder(b.data)) return row;
      }
      return null; // need null for IE
    },

    onMouseUp: onMouseUp,
  });

  require('./ui/next-frame')(Dom);

  var matches = Dom._matchesFunc;

  Dom.WIDGET_SELECTOR = Dom.INPUT_SELECTOR+',button,a';
  Dom.FOCUS_SELECTOR = '[tabindex="0"],'+Dom.INPUT_SELECTOR;

  if (! document.head.classList) {
    Dom.hasClass = function (elm, name) {
      return elm && new RegExp("\\b" + name + "\\b").test(elm.className);
    };
    Dom.addClass = function (elm, name) {
      if (! elm || elm.nodeType !== 1) return;
      var className = " " + elm.className + " ";
      elm.className = (className.replace(" " + name + " ", " ") + name).trim();
    };
    Dom.removeClass = function (elm, name) {
      if (! elm || elm.nodeType !== 1) return;
      var className = " " + elm.className + " ";
      elm.className = (className.replace(" " + name + " ", " ")).trim();
    };
  }

  Dom._private = {
    DomTemplate: DomTemplate,
    getValue: getValue,
    evalArgs: evalArgs,
    set currentElement(value) {
      return currentElement = value;
    }
  };

  function addTemplates(parent, options) {
    var name = options.name;
    if (name.match(/\./)) {
      var names = name.split('.');
      name = names.pop();
      util.forEach(names, function (nm) {
        parent = parent[nm] || (parent[nm] =  new DomTemplate(nm, parent));
      });
    }
    parent[name] = parent = (parent[name] || new DomTemplate(name, parent)).$initOptions(options);
    var nested = options.nested;

    if (options.nested) for(var i=0; i < nested.length; ++i) {
      addTemplates(parent, nested[i]);
    }

    return parent;
  }

  function DomCtx(template, parentCtx, data) {
    this.template = template;
    this.parentCtx = parentCtx;
    this.data = data;
    this.evals = [];
    this.attrEvals = [];
  }

  DomCtx.prototype = {
    constructor: DomCtx,

    onDestroy: function (obj) {
      if (! obj) return;
      var list = this.__onDestroy || (this.__onDestroy = []);
      list.push(obj);
      return this;
    },

    element: function () {
      var evals = this.evals;
      evals = evals && this.evals[0];
      var elm = evals && evals[0];
      while(elm && elm.nodeType !== DOCUMENT_NODE && elm._koru !== this)
        elm = elm.parentNode;

      return elm;
    },

    updateAllTags: function (data) {
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
    },

    updateElement: function (elm) {
      var prevCtx = currentCtx;
      var prevElm = currentElement;
      currentCtx = this;
      try {
        util.forEach(this.evals, function (eval) {
          if (Dom.contains(elm, eval[0])) {
            updateNode(eval, currentCtx.data);
          }
        });
      } finally {
        currentElement = prevElm;
        currentCtx = prevCtx;
      }
    },

    onAnimationEnd: function (func, repeat) {
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
    },
  };

  var animationEndCount = 0;
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

  function updateNode (node, data) {
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
        value = currentCtx.template._helpers[func] || Dom._helpers[func];
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

  function DomTemplate(name, parent) {
    this.name = name;
    if (parent !== Dom)
      this.parent = parent;
  }

  DomTemplate.prototype = {
    constructor: DomTemplate,

    $ctx: function (origin) {
      if (typeof origin === 'string') origin = document.getElementById(origin);
      if (! origin)
        origin = currentCtx;
      else if ('nodeType' in origin)
        origin = Dom.getCtx(origin);

      for(; origin; origin = origin.parentCtx) {
        if (origin.template === this) return origin;
      }
    },

    $data: function (origin) {
      var ctx = this.$ctx(origin);
      return ctx && ctx.data;
    },

    $initOptions: function (options) {
      this.nodes = options.nodes;
      this._helpers = {};
      this._events = [];
      return this;
    },

    $autoRender: function (data, parentCtx) {
      var tpl = this;
      var elm = tpl.$render(data, parentCtx);

      if (tpl._events.length > 0) {
        if (elm.nodeType === document.DOCUMENT_FRAGMENT_NODE) throw new Error("attempt to attach events to document fragment: " + tpl.$fullname);
        tpl.$attachEvents(elm);
        Dom.getCtx(elm).onDestroy(function () {
          tpl.$detachEvents(elm);
        });
      }
      return elm;
    },

    $render: function (data, parentCtx) {
      var prevCtx = currentCtx;
      currentCtx = new DomCtx(this, parentCtx || currentCtx, data);
      try {
        var frag = document.createDocumentFragment();
        this.nodes && addNodes.call(this, frag, this.nodes);
        if (frag.firstChild) {
          if (frag.lastChild === frag.firstChild)
            frag = frag.firstChild;

          frag._koru = currentCtx;
        }
        this.$created && this.$created(currentCtx, frag);
        currentCtx.data === undefined || currentCtx.updateAllTags(currentCtx.data);
        return frag;
      } catch(ex) {
        ex.message = 'while rendering: '+this.$fullname+'\n' + ex.message;
        // clean up what we can
        try {
          Dom.destroyData(frag);
        } catch(ex2) {}
        throw ex;
      } finally {
        currentCtx = prevCtx;
      }
    },

    get $fullname() {
      return (this.parent ? this.parent.$fullname + "." : "") + this.name;
    },

    $helpers: function (properties) {
      extend(this._helpers, properties);
      return this;
    },

    $events: function (events) {
      for(var key in events)
        this.$event(key, events[key]);
      return this;
    },

    $event: function (key, func) {
      var m = /^(\S+)(.*)/.exec(key);
      if (! m) throw new Error("invalid event spec: " + key);
      this._events.push([m[1], m[2].trim(), func]);
      return this;
    },

    $findEvent: function (type, css) {
      var events = this._events;
      for(var i = 0; i < events.length; ++i) {
        var row = events[i];
        if (row[0] === type && row[1] === css)
          return row;
      }
    },

    $actions: function (actions) {
      var events = {};
      for(var key in actions) {
        events['click [name='+key+']'] = actions[key];
      }
      return this.$events(events);
    },

    $extend: function (properties) {
      return extend(this, properties);
    },

    $attachEvents: function (parent, selector) {
      nativeOnOff(parent, nativeOn, selector, this._events);
      return this;
    },

    $detachEvents: function (parent, selector) {
      nativeOnOff(parent, nativeOff, selector, this._events);
      return this;
    },

    $inspect: function () {
      return "DomTemplate:" + this.$fullname;
    },
  };

  function nativeOn(parent, eventType, selector, func) {
    var events = parent._koru.__events;

    if (! events) {
      events = parent._koru.__events = {};
    }

    var eventTypes = events[eventType];

    if (! eventTypes) {
      eventTypes = events[eventType] = {};
      if (eventType === 'focus' || eventType === 'blur')
        parent.addEventListener(eventType, onEvent, true);
      else
        parent.addEventListener(eventType, onEvent);
    }

    eventTypes[selector||':TOP'] = func;
  }

  function onMouseUp(func, elm) {
    document.addEventListener('mouseup', omu, true);

    var ctx = currentCtx;

    function omu(event) {
      document.removeEventListener('mouseup', omu, true);

      var orig = currentCtx;
      currentCtx = ctx;
      try {
        func(event);
      } catch(ex) {
        handleException(ex);
      } finally {
        currentCtx = orig;
      }
    }
  }

  function onEvent(event) {
    if (_disable_focusout && event.type == 'focusout') return;
    currentEvent = event;
    currentCtx = event.currentTarget._koru;
    var eventTypes = currentCtx.__events[event.type];

    var later = {};
    var elm = event.target;

    try {
      for(var key in eventTypes) {
        if (key === ':TOP') {
          if (elm === event.currentTarget) {
            if (fire(event, elm, eventTypes[key])) return;
          } else
            later[key] = true;
        }
        else if (elm && elm.nodeType !== TEXT_NODE) {
          if (matches.call(elm, key)) {
            if (fire(event, elm, eventTypes[key])) return;
          } else if (matches.call(elm, key.replace(/,/g, ' *,')+' *')) {
            later[key] = true;
          }
        }
      }

      for(var key in later) {
        for (elm = elm && elm.parentNode;elm && elm !== event.currentTarget; elm = elm.parentNode) {
          for(var key in later) {
            if (key !== ':TOP' && matches.call(elm, key)) {
              if (fire(event, elm, eventTypes[key])) return;
              delete later[key];
            }
          }
        }
        break;
      }

      for(var key in later) {
        if (fire(event, elm, eventTypes[key])) return;
      }
    } catch(ex) {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleException(ex);
    } finally {
      currentEvent = null;
      currentCtx = null;
    }
  }

  function handleException(ex) {
    if (! (koru.globalErrorCatch && koru.globalErrorCatch(ex))) {
      koru.unhandledException(ex);

      throw ex;
    }
  }

  function fire(event, elm, func) {
    if (func.call(elm, event) === false || currentEvent !== event) {
      currentEvent === 'propigation' || event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
  }

  function nativeOff(parent, eventType, selector, func) {
    var events = parent._koru.__events;

    if (events) {
      var eventTypes = events[eventType];
      events[eventType] = null;
      if (eventType === 'focus' || eventType === 'blur')
        parent.removeEventListener(eventType, onEvent, true);
      else
        parent.removeEventListener(eventType, onEvent);
    }
  }

  function nativeOnOff(parent, func, selector, events) {
    parent = parent.nodeType ? parent : parent[0];

    if (selector) {
      selector = selector+' ';
      for(var i = 0; i < events.length; ++i) {
        var row = events[i];
        func(parent, row[0],  selector+row[1], row[row.length -1]);
      }
    } else for(var i = 0; i < events.length; ++i) {
      var row = events[i];
      func(parent, row[0], row[1], row[row.length -1]);
    }
  }

  function addNodes(parent, nodes) {
    for ( var i = 0; i < nodes.length; ++i ) {
      var node = nodes[i];

      if (typeof node === 'string') {
        var elm = document.createTextNode(node);

      } else if (Array.isArray(node)) {
        var elm = addNodeEval(this, node, parent);
      } else {
        var elm = document.createElement(node.name);
        setAttrs.call(this, elm, node.attrs);
        node.children && addNodes.call(this, elm, node.children);
      }
      elm && parent.appendChild(elm);
    }
  }

  function parseNode(template, node, result) {
    var origName = node[1];
    var m = /^((?:\.\.\/)*[^\.]+)\.(.*)$/.exec(origName);
    var partial = node[0] === '>';

    if (m) {
      var name = m[1];
      node = {dotted: m[2].split('.'), opts: node.slice(m ? 2 : 1)};
    } else {
      var name = origName;
      node = node.slice(2);
    }

    if (partial) {
      var pt = fetchTemplate(template, name, m && node.dotted);
      if (! pt) throw new Error("Invalid partial '"  + origName + "' in Template: " + template.name);

      result.push(pt);
      result.push(m ? node.opts : node);
    } else {
      result.push(template._helpers[name] || name);
      result.push(node);
    }

    return result;
  }

  function fetchTemplate(template, name, rest) {
    if (name[0] === '/') {
      var result = Dom[name.slice(1)];
    } else {
      var result = template[name];
      while (! result && name.slice(0,3) === '../' && template.parent) {
        name = name.slice(3);
        template = template.parent;
        result = template[name];
      }
    }
    if (rest) for(var i = 0; i < rest.length; ++i) {
      result = result && result[rest[i]];
    }

    return result;
  }

  function addNodeEval(template, node, parent) {
    switch(node[0]) {
    case '-':
      var elm = null; break;
    case '':
      var elm = document.createTextNode(''); break;
    default:
      var elm = document.createComment('empty');
    }

    currentCtx.evals.push(parseNode(template, node, [elm]));
    return elm;
  }

  function addAttrEval(template, id, node, elm) {
    currentCtx.attrEvals.push(parseNode(template, node, [elm, id]));
  }

  function setAttrs(elm, attrs) {
    if (attrs) for(var j=0; j < attrs.length; ++j) {
      var attr = attrs[j];

      if (typeof attr === 'string') {
        elm.setAttribute(attr, '');

      } else if (attr[0] === '=') {

        if (typeof attr[2] === 'string') {

          elm.setAttribute(attr[1], attr[2]);

        } else {
          addAttrEval(this, attr[1], attr[2], elm);
        }
      } else { // custom element mutator
        addAttrEval(this, null, attr, elm);
      }
    }
  }

  return Dom;
});
