define(['bart/util'], function(util) {
  var extend = util.extend;

  var vendorStylePrefix = (function () {
    var style = document.documentElement.style;
    var styles = ['webkit', 'Moz',  'ms', 'o', ''];
    for(var i = 0; i < styles.length; ++i) {
      if (styles[i]+'Transform' in style) break;
    }
    return styles[i];
  })();

  var vendorFuncPrefix = vendorStylePrefix.toLowerCase();
  var vendorTransform = vendorStylePrefix ? vendorStylePrefix + 'Transform' : 'transform';

  var matches = document.documentElement[vendorFuncPrefix+'MatchesSelector'] || document.documentElement.matchesSelector;

  var COMMENT_NODE = document.COMMENT_NODE;
  var TEXT_NODE = document.TEXT_NODE;
  var DOCUMENT_FRAGMENT_NODE = document.DOCUMENT_FRAGMENT_NODE;
  var DOCUMENT_NODE = document.DOCUMENT_NODE;
  var _disable_focusout = false;

  var bartEvent = null;

  var currentCtx, currentElement, currentEvent;

  var Dom = {
    set _disable_focusout(value) {return _disable_focusout = value},
    get _disable_focusout() {return _disable_focusout},
    Ctx: DomCtx,
    current: {
      data: function (elm) {
        if (elm)
          return Dom.getCtx(elm).data;

        return currentCtx.data;
      },

      get template() {return currentCtx.template},
      get ctx() {return currentCtx},
      get element() {return currentElement},
    },

    MOUSEWHEEL_EVENT: vendorFuncPrefix === 'moz' ? 'wheel' : 'mousewheel',

    _helpers: {},

    clonePosition: function (from, to, offsetParent, where) {
      where = where || 'tl';

      var bbox = this.offsetPosition(from, offsetParent || to.offsetParent);

      var style = to.style;

      if (where[0] === 't')
        style.top  = bbox.top+'px';
      else
        style.top  = bbox.bottom+'px';

      if (where[1] === 'l')
        style.left = bbox.left+'px';
      else
        style.right = bbox.right+'px';

      return bbox;
    },

    offsetPosition: function (from, offsetParent) {
      if ('nodeType' in from) {
        offsetParent = offsetParent || from.offsetParent;
        var bbox = from.getBoundingClientRect();
      } else {
        var bbox = from;
      }

      var offset = offsetParent.getBoundingClientRect();

      return {
        top: bbox.top - offset.top - offsetParent.scrollTop,
        bottom: bbox.bottom - offset.top - offsetParent.scrollTop,
        left: bbox.left - offset.left - offsetParent.scrollLeft,
        right: bbox.right - offset.left - offsetParent.scrollLeft,
        width: bbox.width,
        height: bbox.height,
      };
    },

    html: function (html, tagName) {
      tagName = tagName || 'div';
      if (typeof html === 'string') {
        var elm = document.createElement(tagName);
        elm.innerHTML = html;
        return elm.firstChild;
      }

      var id, className, content, attrs = {};

      for(var key in html) {
        var value = html[key];
        switch(key) {
        case "id": id = value; break;

        case "class": case "className": className = value; break;
        case "content": case "html": content = Dom.html(value); break;
        case "textContent": case "text": content = value.toString(); break;

        case "tag": case "tagName": tagName = value; break;
        default:
          if (typeof value === 'object') {
            content = Dom.html(value, key);
          } else {
            attrs[key] = value;
          }
          break;
        }
      }

      var elm = document.createElement(tagName);
      className && (elm.className = className);
      id && (elm.id = id);
      for(var key in attrs) {
        elm.setAttribute(key, attrs[key]);
      }

      if (typeof content === "string")
        elm.textContent = content;
      else
        content && elm.appendChild(content);

      return elm;
    },

    escapeHTML: function(text) {
      var pre = document.createElement('pre');
      pre.appendChild(document.createTextNode(text));
      return pre.innerHTML;
    },

    hasClass: function (elm, name) {
      var classList = elm && elm.classList;
      return classList && classList.contains(name);
    },

    addClass: function (elm, name) {
      var classList = elm && elm.classList;
      classList && classList.add(name);
    },

    removeClass: function (elm, name) {
      var classList = elm && elm.classList;
      classList && classList.remove(name);
    },

    toggleClass: function (elm, name) {
      if (! elm) return;
      if (Dom.hasClass(elm, name)) {
        Dom.removeClass(elm, name);
        return false;
      }

      Dom.addClass(elm, name);
      return true;
    },

    setClassBySuffix: function (name, suffix, elm) {
      elm = elm || currentElement;
      if (!elm) return;
      var classes = elm.className.replace(new RegExp('\\s*\\S*'+suffix+'\\b', 'g'), '').replace(/(^ | $)/g,'');

      if (name)
        elm.className = (classes.length ? classes + ' ' : '') + name + suffix;
      else
        elm.className = classes;
    },

    setClassByPrefix: function (name, suffix, elm) {
      elm = elm || currentElement;
      if (!elm) return;

      var classes = elm.className.replace(new RegExp('\\s*'+suffix+'\\S*', 'g'), '').replace(/(^ | $)/g,'');

      if (name)
        elm.className = (classes.length ? classes + ' ' : '') + suffix + name;
      else
        elm.className = classes;
    },

    setClass: function (name, isAdd, elm) {
      (isAdd ? Dom.addClass : Dom.removeClass)(elm || currentElement, name);
    },

    setBoolean: function (name, isAdd, elm) {
      elm = elm || currentElement;
      if (isAdd)
        elm.setAttribute(name, name);
      else
        elm.removeAttribute(name);
    },

    focus: function (elm, selector) {
      if (!elm) return;
      if (typeof selector !== 'string') selector = "input,textarea";
      var focus = elm.querySelector(selector);
      focus && focus.focus();
    },

    parentOf: function (parent, elm) {
      while(elm && elm.nodeType !== DOCUMENT_NODE) {
        if (parent === elm) return parent;
        elm = elm.parentNode;
      }
      return null;
    },

    registerHelpers: function (helpers) {
      extend(this._helpers, helpers);
      return this;
    },

    newTemplate: function (options) {
      addTemplates(Dom, options);
      return this;
    },

    lookupTemplate: function (name) {
      var names = name.split('.');
      var node = this;
      for(var i = 0; node && i < names.length; ++i) {
        node = node[names[i]];
      }

      return node;
    },

    stopEvent: function () {
      currentEvent = null;
    },

    stopPropigation: function () {
      currentEvent = 'propigation';
    },

    destroyData: function (elm) {
      var ctx = elm && elm._bart;
      if (ctx) {
        if (ctx._onDestroy) {
          var list = ctx._onDestroy;
          ctx._onDestroy = null;
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
        elm._bart = null;
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

    forEach: function (elm, querySelector, func) {
      if (! elm) return;
      var elms = elm.querySelectorAll(querySelector);
      for(var i = 0; i < elms.length; ++i) {
        func(elms[i]);
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
      var end = start._bartEnd;
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
      return elm && elm._bart;
    },

    getCtx: function (elm) {
      if (! elm) return;
      if (typeof elm === 'string')
        elm = document.querySelector(elm);
      var ctx = elm._bart;
      while(! ctx && elm.parentNode)
        ctx = (elm = elm.parentNode)._bart;
      return ctx;
    },

    getCtxById: function (id) {
      var elm = document.getElementById(id);
      return elm && elm._bart;
    },

    replaceElement: function (newElm, oldElm, noRemove) {
      var ast = oldElm._bartEnd;
      if (ast) {
        Dom.removeInserts(oldElm);
        Dom.remove(ast);
      }

      var parentCtx = (oldElm._bart && oldElm._bart.parentCtx) || Dom.getCtx(oldElm.parentNode);
      if (parentCtx) {
        var ctx = newElm._bart;
        if (ctx) ctx.parentCtx = parentCtx;
      }

      noRemove === 'noRemove' || Dom.destroyData(oldElm);

      oldElm.parentNode && oldElm.parentNode.replaceChild(newElm, oldElm);
      return this;
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

    getClosest: function (elm, selector) {
      while(elm && elm.nodeType !== DOCUMENT_NODE) {
        if (matches.call(elm, selector)) return elm;
        elm = elm.parentNode;
      }
    },

    searchUpFor: function (elm, func, stopClass) {
      if (! elm) return null;
      while(elm && elm.nodeType !== DOCUMENT_NODE) {
        if (func(elm)) return elm;
        if (Dom.hasClass(elm, stopClass)) return null;
        elm = elm.parentNode;
      }
      return null;
    },

    getClosestClass: function (elm, className) {
      while(elm && elm.nodeType !== DOCUMENT_NODE) {
        if (Dom.hasClass(elm, className)) return elm;
        elm = elm.parentNode;
      }
    },

    matches: function (elm, selector) {
      return matches.call(elm, selector);
    },

    nextSibling: function (elm, selector) {
      if (elm) for(var next = elm.nextElementSibling; next; next = next.nextElementSibling) {
        if (matches.call(next, selector)) return next;
      }
      return null;
    },

    getClosestCtx: function (elm, selector) {
      return this.getCtx(this.getClosest(elm, selector));
    },

    setCtx: function (elm, ctx) {
      elm._bart = ctx;
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
        var b = row._bart;
        if (b && finder(b.data)) return row;
      }
      return null; // need null for IE
    },

    transformTranslate: function (elm , x, y) {
      elm.style[vendorTransform] = elm.style[vendorTransform].replace(/\btranslate\([^)]*\)\s*/, '')+'translate('+x+','+y+')';
    },

    vendorTransform: vendorTransform,
    vendorTransformOrigin: vendorTransform+'Origin',

    vendorPrefix: vendorFuncPrefix,

    hasPointerEvents: true,

    INPUT_SELECTOR: 'input,textarea,select,select>option,[contenteditable="true"]',
  };

  Dom.WIDGET_SELECTOR = Dom.INPUT_SELECTOR+',button,a';

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


  if (vendorStylePrefix === 'ms') {
    (function () {
      var m = /\bMSIE (\d+)/.exec(navigator.userAgent);
      if (m) {
        if (+m[1] < 11) {
          Dom.hasPointerEvents = false;
        }
      }
    })();
  }


  _private = {
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
      names.forEach(function (nm) {
        parent = parent[nm] || (parent[nm] =  new DomTemplate(nm, parent));
      });
    }
    parent[name] = parent = (parent[name] || new DomTemplate(name, parent)).$initOptions(options);
    var nested = options.nested;

    if (! options.nested) return;
    for(var i=0; i < nested.length; ++i) {
      addTemplates(parent, nested[i]);
    }
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
      var list = this._onDestroy || (this._onDestroy = []);
      list.push(obj);
      return this;
    },

    element: function () {
      var evals = this.evals;
      evals = evals && this.evals[0];
      var elm = evals && evals[0];
      while(elm && elm.nodeType !== DOCUMENT_NODE && elm._bart !== this)
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
      if (document.activeElement !== activeElement) {
        activeElement.focus();
      }
    },
  };

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
      if ('_bartEnd' in currentElement) {
        Dom.removeInserts(currentElement);
      } else {
        if (currentElement.nodeType !== COMMENT_NODE) {
          var start = document.createComment('start');
          Dom.replaceElement(start, currentElement);
          currentElement = start;
        }
        currentElement.textContent = 'start';
        currentElement._bartEnd = document.createComment('end');
        currentElement.parentNode.insertBefore(currentElement._bartEnd, currentElement.nextSibling);
      }
      currentElement.parentNode.insertBefore(value, currentElement._bartEnd);
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
      if (func[0] === '"')
        return func.slice(1);
      if (func === 'this') return data;
      var value = data && data[func];
      if (value === undefined) {
        value = currentCtx.template._helpers[func] || Dom._helpers[func];
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

    if (currentElement._bart) {
      return currentElement._bart.updateAllTags(args);
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

    $ctx: function (ctx) {
      if (typeof ctx === 'string') ctx = document.getElementById(ctx);
      if (! ctx)
        ctx = currentCtx;
      else if ('_bart' in ctx)
        ctx = ctx._bart;

      for(; ctx; ctx = ctx.parentCtx) {
        if (ctx.template === this) return ctx;
      }
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

          frag._bart = currentCtx;
        }
        this.$created && this.$created(currentCtx, frag);
        currentCtx.data === undefined || currentCtx.updateAllTags(currentCtx.data);
        return frag;
      } finally {
        currentCtx = prevCtx;
      }
    },

    $helpers: function (properties) {
      extend(this._helpers, properties);
      return this;
    },

    $events: function (events) {
      for(var key in events) {
        var func = events[key];
        var m = /^(\S+)(.*)/.exec(key);
        if (! m) throw new Error("invalid event spec: " + key);
        this._events.push([m[1], m[2].trim(), events[key]]);
      }
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
        events['click [name='+key+']'] = actionFunc(actions[key]);
      }
      return this.$events(events);

      function actionFunc(func) {
        return func;
      }
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
  };

  function nativeOn(parent, eventType, selector, func) {
    var events = parent._bart._events;

    if (! events) {
      events = parent._bart._events = {};
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

  function onEvent(event) {
    if (_disable_focusout && event.type == 'focusout') return;
    currentEvent = event;
    currentCtx = event.currentTarget._bart;
    var eventTypes = currentCtx._events[event.type];

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
        else if (matches.call(elm, key)) {
          if (fire(event, elm, eventTypes[key])) return;
        } else if (matches.call(elm, key.replace(/,/g, ' *,')+' *'))
          later[key] = true;
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
      if (! (Dom.globalErrorCatch && Dom.globalErrorCatch(ex))) {
        if('stack' in ex)
          console.log(ex.stack);

        throw ex;
      }
    } finally {
      currentEvent = null;
      currentCtx = null;
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
    var events = parent._bart._events;

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

      } else if (node.shift) {
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
    var m = /^([^\.]+)\.(.*)$/.exec(node[1]);
    var partial = node[0] === '>';

    if (m) {
      var name = m[1];
      node = {dotted: m[2].split('.'), opts: node.slice(m ? 2 : 1)};
    } else {
      var name = node[1];
      node = node.slice(2);
    }

    if (partial) {
      result.push(fetchTemplate(template, name, m && node.dotted));
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
    }
    if (rest) for(var i = 0; i < rest.length; ++i) {
      result = result && result[rest[i]];
    }

    if (! result) throw new Error("Invalid partial '"  + name + (rest ? "."+rest.join(".") : '') + "' in Template: " + template.name);

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
