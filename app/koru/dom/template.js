define(function(require, exports, module) {
  const koru        = require('koru');
  const Ctx         = require('koru/dom/ctx');
  const makeSubject = require('koru/make-subject');
  const util        = require('koru/util');
  const Dom         = require('./base');

  const extend = util.extend;
  const DOCUMENT_NODE = document.DOCUMENT_NODE;
  const TEXT_NODE = document.TEXT_NODE;

  let currentEvent;

  class DomTemplate {
    constructor(name, parent, blueprint) {
      this.name = name;
      this.parent = parent !== Dom ? parent : null;
      this._events = [];
      this.nodes = undefined;
      this._helpers = undefined;
      blueprint && initBlueprint(this, blueprint);
    }

    static newTemplate(module, blueprint) {
      if (arguments.length === 1)
        return addTemplates(Dom, module);


      var tpl = addTemplates(Dom, blueprint);
      koru.onunload(module, function () {
        (tpl.parent || Dom)[tpl.name] = null;
      });
      return tpl;
    }

    static stopEvent(event) {
      if (event && event !== currentEvent) {
        event.stopImmediatePropagation();
        event.preventDefault();
      } else {
        currentEvent = null;
      }
    }

    static stopPropigation() {
      currentEvent = 'propigation';
    }

    $ctx(origin) {
      if (typeof origin === 'string') origin = document.getElementById(origin);
      if (! origin)
        origin = Ctx._currentCtx;
      else if ('nodeType' in origin)
        origin = Dom.getCtx(origin);

      for(; origin; origin = origin.parentCtx) {
        if (origin.template === this) return origin;
      }
    }

    $data(origin) {
      var ctx = this.$ctx(origin);
      return ctx && ctx.data;
    }

    $autoRender(data, parentCtx) {
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
    }

    $render(data, parentCtx) {
      ensureHelper(this);
      var prevCtx = Ctx._currentCtx;
      Ctx._currentCtx = new Ctx(this, parentCtx || Ctx._currentCtx, data);
      try {
        var frag = document.createDocumentFragment();
        this.nodes && addNodes.call(this, frag, this.nodes);
        if (frag.firstChild) {
          if (frag.lastChild === frag.firstChild)
            frag = frag.firstChild;

          frag._koru = Ctx._currentCtx;
        }
        this.$created && this.$created(Ctx._currentCtx, frag);
        Ctx._currentCtx.data === undefined || Ctx._currentCtx.updateAllTags(Ctx._currentCtx.data);
        return frag;
      } catch(ex) {
        ex.message = 'while rendering: '+this.$fullname+'\n' + ex.message;
        // clean up what we can
        try {
          Dom.destroyData(frag);
        } catch(ex2) {}
        throw ex;
      } finally {
        Ctx._currentCtx = prevCtx;
      }
    }

    get $fullname() {
      return (this.parent ? this.parent.$fullname + "." : "") + this.name;
    }

    $helpers(properties) {
      ensureHelper(this);
      extend(this._helpers, properties);
      return this;
    }

    $events(events) {
      for(var key in events)
        this.$event(key, events[key]);
      return this;
    }

    $event(key, func) {
      var m = /^(\S+)(.*)/.exec(key);
      if (! m) throw new Error("invalid event spec: " + key);
      this._events.push([m[1], m[2].trim(), func]);
      return this;
    }

    $findEvent(type, css) {
      var events = this._events;
      for(var i = 0; i < events.length; ++i) {
        var row = events[i];
        if (row[0] === type && row[1] === css)
          return row;
      }
    }

    $actions(actions) {
      var events = {};
      for(var key in actions) {
        events['click [name='+key+']'] = actions[key];
      }
      return this.$events(events);
    }

    $extend(properties) {
      return extend(this, properties);
    }

    $attachEvents(parent, selector) {
      nativeOnOff(parent, nativeOn, selector, this._events);
      return this;
    }

    $detachEvents(parent, selector) {
      nativeOnOff(parent, nativeOff, selector, this._events);
      return this;
    }

    $inspect() {
      return "DomTemplate:" + this.$fullname;
    }

    static get _currentEvent() {return currentEvent}
    static set _currentEvent(value) {currentEvent =  value}
  }; module.exports = DomTemplate;

  DomTemplate.lookupTemplate = lookupTemplate;

  function ensureHelper(tpl) {
    if (! tpl._helpers)
      tpl._helpers = Object.create(Dom._helpers);
  }

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

  function onEvent(event) {
    var prevEvent = currentEvent;
    var prevCtx = Ctx._currentCtx;
    currentEvent = event;
    Ctx._currentCtx = event.currentTarget._koru;
    var eventTypes = Ctx._currentCtx.__events[event.type];
    var matches = Dom._matchesFunc;

    var later = Object.create(null);
    later.x = true; delete later.x; // force dictionary
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
      Dom.stopEvent(event);
      Dom.handleException(ex);
    } finally {
      currentEvent = prevEvent;
      Ctx._currentCtx = prevCtx;
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
    var events = parent._koru && parent._koru.__events;

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
    const origName = node[1];
    const m = /^((?:\.\.\/)*[^\.]+)\.(.*)$/.exec(origName);
    const partial = node[0] === '>';

    if (m) {
      var name = m[1];
      node = {dotted: m[2].split('.'), opts: node.slice(m ? 2 : 1)};
    } else {
      var name = origName;
      node = node.slice(2);
    }

    if (partial) {
      const pt = fetchTemplate(template, name, m && node.dotted);
      if (! pt) throw new Error("Invalid partial '"  + origName + "' in Template: " + template.name);

      result.push(pt);
      result.push(m ? node.opts : node);
    } else {
      result.push(template._helpers[name] || name);
      result.push(node);
    }

    return result;
  }

  function lookupTemplate(tpl, name) {
      var m = /^((?:\.\.\/)*[^\.]+)\.(.*)$/.exec(name);

      if (m)
        return fetchTemplate(tpl, m[1], m[2].split("."));

      return fetchTemplate(tpl, name);
  }

  function fetchTemplate(template, name, rest) {
    if (name[0] === '/') {
      var result = Dom[name.slice(1)];
    } else {
      var result = template[name];
      while (! result && name.slice(0,3) === '../' && template) {
        name = name.slice(3);
        template = template.parent;
        result = (template || Dom)[name];
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

    Ctx._currentCtx.evals.push(parseNode(template, node, [elm]));
    return elm;
  }

  function addAttrEval(template, id, node, elm) {
    Ctx._currentCtx.attrEvals.push(parseNode(template, node, [elm, id]));
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

  function addTemplates(parent, blueprint) {
    let name = blueprint.name;
    if (name.match(/\./)) {
      const names = name.split('.');
      name = names.pop();
      util.forEach(names, function (nm) {
        parent = parent[nm] || (parent[nm] =  new DomTemplate(nm, parent));
      });
    }
    if (parent.hasOwnProperty(name) && parent[name]) {
      parent = parent[name];
      initBlueprint(parent, blueprint);
    } else {
      parent[name] = parent = new DomTemplate(name, parent, blueprint);
    }
    const nested = blueprint.nested;

    if (blueprint.nested) for(let i = 0; i < nested.length; ++i) {
      addTemplates(parent, nested[i]);
    }

    return parent;
  }

  function initBlueprint(tpl, blueprint) {
    let helpers;
    if (blueprint.extends) {
      const sup = lookupTemplate(tpl.parent, blueprint.extends);
      if (! sup)
        throw new Error(`Invalid extends '${blueprint.extends}' in Template ${tpl.name}`);
      helpers = sup._helpers && Object.create(sup._helpers);
      Object.setPrototypeOf(tpl, sup);
      tpl._helpers = helpers;
    }
    tpl.nodes = blueprint.nodes;
  }
});
