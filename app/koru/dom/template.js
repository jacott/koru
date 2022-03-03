define((require) => {
  'use strict';
  const koru            = require('koru');
  const Ctx             = require('koru/dom/ctx');
  const util            = require('koru/util');
  const Dom             = require('./base');

  const root = Dom.tpl = {};

  const {hasOwn, mergeNoEnum, forEach, createDictionary} = util;
  const {SVGNS, XHTMLNS} = Dom;

  const {ctx$, inspect$} = require('koru/symbols');

  const {TEXT_NODE} = document;
  const dragTouchStart$ = Symbol(), template$ = Symbol(), parsed$ = Symbol();

  let currentEvent;

  const dragTouchStart = (event) => {
    let touch = event.touches[0];
    let v = event.currentTarget[dragTouchStart$];

    const te = (event) => {
      if (event.touches.length !== 0) return;
      if (v.dragging) {
        Dom.triggerEvent(event.target, 'pointerup', {
          clientX: touch.clientX, clientY: touch.clientY});
      }
      cancel();
    };

    const tm = (event) => {
      if (! v.dragging) {
        return cancel();
      }

      touch = event.touches[0];

      event.preventDefault();
      event.stopImmediatePropagation();

      Dom.triggerEvent(event.target, 'pointermove', {
        clientX: touch.clientX, clientY: touch.clientY});
    };

    const cancel = () => {
      if (v == null) return;
      document.removeEventListener('touchend', te, Dom.captureEventOption);
      document.removeEventListener('touchmove', tm, Dom.captureEventOption);
      koru.clearTimeout(v.timer);
      v.currentTarget[dragTouchStart$] = null;
      v = null;
    };

    v?.cancel?.();

    if (event.touches.length !== 1) {
      return;
    }

    document.addEventListener('touchend', te, Dom.captureEventOption);
    document.addEventListener('touchmove', tm, Dom.captureEventOption);

    v = event.currentTarget[dragTouchStart$] = {
      dragging: false,
      currentTarget: event.currentTarget,
      target: event.target,
      data: {clientX: touch.clientX, clientY: touch.clientY},
      timer: koru.setTimeout(() => {
        const {target, data} = v;
        v.dragging = true;
        Dom.triggerEvent(target, 'dragstart', data);
      }, 300),
      cancel,
    };
  };

  const onBlur = (event) => {if (document.activeElement !== event.target) onEvent(event)};

  const onEvent = (event, type=event.type) => {
    const prevEvent = currentEvent;
    const prevCtx = Ctx._currentCtx;
    currentEvent = event;

    Ctx._currentCtx = event.currentTarget[ctx$];
    const eventTypes = Ctx._currentCtx.__events[type];
    const matches = Dom._matchesFunc;

    const later = createDictionary();
    let elm = event.target;

    try {
      for (const key in eventTypes) {
        if (key === ':TOP') {
          if (elm === event.currentTarget) {
            if (fire(event, elm, eventTypes[key])) return;
          } else {
            later[key] = true;
          }
        } else if (elm != null && elm.nodeType !== TEXT_NODE) {
          if (matches.call(elm, key)) {
            if (fire(event, elm, eventTypes[key])) return;
          } else if (matches.call(elm, key.replace(/,/g, ' *,') + ' *')) {
            later[key] = true;
          }
        }
      }

      for (const key in later) {
        for (elm = elm?.parentNode; elm != null && elm !== event.currentTarget; elm = elm.parentNode) {
          for (const key in later) {
            if (key !== ':TOP' && matches.call(elm, key)) {
              if (fire(event, elm, eventTypes[key])) return;
              delete later[key];
            }
          }
        }
        break;
      }

      for (const key in later) {
        if (fire(event, elm, eventTypes[key])) return;
      }
    } catch (ex) {
      Dom.stopEvent(event);
      Dom.handleException(ex);
    } finally {
      currentEvent = prevEvent;
      Ctx._currentCtx = prevCtx;
    }
  };

  const fire = (event, elm, func) => {
    if (func.call(elm, event) === false || currentEvent !== event) {
      currentEvent === 'propigation' || event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
    return false;
  };

  const menustart = Dom.makeMenustartCallback(onEvent);

  const nativeOff = (parent, eventType, selector, func) => {
    const events = parent[ctx$]?.__events;

    if (events != null) {
      const eventTypes = events[eventType];
      events[eventType] = null;
      switch (eventType) {
      case 'focus':
        parent.removeEventListener(eventType, onEvent, true);
        break;
      case 'blur':
        parent.removeEventListener(eventType, onBlur, true);
        break;
      case 'focusout':
        parent.removeEventListener(eventType, onBlur);
        break;
      case 'dragstart':
        parent.removeEventListener(eventType, onEvent);
        parent.removeEventListener('touchstart', dragTouchStart);
        break;
      case 'menustart':
        parent.removeEventListener('pointerdown', menustart);
        parent.removeEventListener('click', menustart);
        break;
      default:
        parent.removeEventListener(eventType, onEvent);
      }
    }
  };

  const nativeOnOff = (parent, func, selector, events) => {
    parent = parent.nodeType ? parent : parent[0];

    if (selector) {
      selector += ' ';
      for (let i = 0; i < events.length; ++i) {
        const row = events[i];
        func(parent, row[0], selector + row[1], row[row.length - 1]);
      }
    } else {
      for (let i = 0; i < events.length; ++i) {
        const row = events[i];
        func(parent, row[0], row[1], row[row.length - 1]);
      }
    }
  };

  const fetchTemplate = (template, name, rest) => {
    let result;
    if (name[0] === '/') {
      result = root[name.slice(1)];
    } else {
      if (name === '.') return template;
      if (name === '..') return template.parent;
      result = template[name];
      while (result == null && name.startsWith('../') && template !== void 0) {
        name = name.slice(3);
        template = template.parent;
        if (name === '.') return template;
        if (name === '..') return template.parent;
        result = (template ?? root)[name];
      }
    }
    if (rest != null) for (let i = 0; result != null && i < rest.length; ++i) {
      result = result[rest[i]];
    }

    return result;
  };

  const addNodeEval = (template, node, parent) => {
    let elm;
    switch (node[0]) {
    case '-':
      elm = null; break;
    case '':
      elm = document.createTextNode(''); break;
    default:
      elm = document.createComment('empty');
    }

    Ctx._currentCtx.evals.push(parseNode(template, node, [elm]));
    return elm;
  };

  const addAttrEval = (template, id, node, elm) => {
    Ctx._currentCtx.attrEvals.push(parseNode(template, node, [elm, id]));
  };

  const setAttrs = (template, elm, attrs) => {
    for (let j = 0; j < attrs.length; ++j) {
      const attr = attrs[j];

      if (typeof attr === 'string') {
        elm.setAttribute(attr, '');
      } else if (attr[0] === '=') {
        const name = attr[1], value = attr[2];
        if (typeof value === 'string') {
          if (name === 'xlink:href') {
            elm.setAttributeNS(Dom.XLINKNS, 'href', value);
          } else {
            elm.setAttribute(name, value);
          }
        } else {
          addAttrEval(template, name, value, elm);
        }
      } else { // custom element mutator
        addAttrEval(template, null, attr, elm);
      }
    }
  };

  const initBlueprint = (tpl, blueprint) => {
    if (blueprint.extends != null) {
      const sup = lookupTemplate(tpl.parent, blueprint.extends);
      if (sup == null) {
        throw new Error(`Invalid extends '${blueprint.extends}' in Template ${tpl.name}`);
      }
      Object.setPrototypeOf(tpl, sup);
      tpl._helpers = sup._helpers != null && Object.create(sup._helpers);
    }
    tpl.ns = blueprint.ns;
    tpl.nodes = blueprint.nodes;
  };

  const addNodes = (template, parent, nodes, pns) => {
    const len = nodes.length;
    for (let i = 0; i < len; ++i) {
      const node = nodes[i];
      let ns = pns;

      if (typeof node === 'string') {
        parent.appendChild(document.createTextNode(node));
      } else if (Array.isArray(node)) {
        const elm = addNodeEval(template, node, parent);
        elm != null && parent.appendChild(elm);
      } else {
        const {name, attrs, children} = node;
        if (node.ns !== void 0) {
          ns = node.ns;
          if (ns === XHTMLNS) {
            ns = void 0;
          }
        }
        const elm = ns === void 0
              ? (
                name === 'svg'
                  ? document.createElementNS(ns = SVGNS, name)
                  : document.createElement(name))
              : document.createElementNS(ns, name);
        attrs !== void 0 && setAttrs(template, elm, attrs);
        children != null && addNodes(template, elm, children, ns);
        parent.appendChild(elm);
      }
    }
  };

  const tryFetchTemplate = (template, name, parts) => {
    const pt = fetchTemplate(template, name, parts);
    if (pt == null) throw new Error("Invalid partial '" + name + "' in Template: " + template.name);
    return pt;
  };

  const resolveHelper = (node, helpers) => {
    const name = node[1];
    if (typeof name === 'string' && (name in helpers)) {
      const func = helpers[name];
      if (typeof func === 'function') return func;
    }
    return name;
  };

  const parseNode = (template, node, result) => {
    let node1 = node[parsed$];
    if (node[template$] !== template) {
      node1 = node[1];
      if (node[0] === '>') {
        if (typeof node1 === 'string') {
          const m = /^((?:\.\.\/)*[^\.]+)\.(.*)$/.exec(node1);

          if (m !== null) {
            node1 = tryFetchTemplate(template, m[1], m[2].split('.'));
          } else {
            node1 = tryFetchTemplate(template, node1);
          }
        } else {
          node1 = tryFetchTemplate(template, node1[1], node1[2]);
        }
      } else if (typeof node1 === 'string') {
        node1 = resolveHelper(node, template._helpers);
      } else if (node1[0] === '.') {
        node1 = node1.slice();
        node1[1] = resolveHelper(node1, template._helpers);
      }
      node[template$] = template;
      node[parsed$] = node1;
    }

    result.push(node1, node[2]);
    return result;
  };

  class Template {
    constructor(name, parent, blueprint) {
      this.name = name;
      this.parent = parent !== root ? parent : null;
      this._events = [];
      this.nodes = void 0;
      blueprint != null && initBlueprint(this, blueprint);
      if (this._helpers === void 0) {
        this._helpers = Object.create(Dom._helpers);
      }
    }

    static get root() {return root}

    static newTemplate(module, blueprint, parent=this.root) {
      if (blueprint === void 0) {
        return this.addTemplates(parent, module);
      }

      const tpl = this.addTemplates(parent, blueprint);
      tpl.$module = module;
      koru.onunload(module, () => {
        (tpl.parent ?? parent)[tpl.name] = void 0;
        for (const name in tpl) {
          const sub = tpl[name];
          if (sub?.$module != null && sub instanceof Template) {
            koru.unload(sub.$module.id);
          }
        }
      });
      return tpl;
    }

    static addTemplates(parent, blueprint) {
      let {name} = blueprint;
      if (name.match(/\./)) {
        const names = name.split('.');
        name = names.pop();
        forEach(names, (nm) => {
          parent = parent[nm] ?? (parent[nm] = new this(nm, parent));
        });
      }
      if (hasOwn(parent, name) && parent[name] != null) {
        parent = parent[name];
        initBlueprint(parent, blueprint);
      } else {
        parent[name] = parent = new this(name, parent, blueprint);
      }
      const {nested} = blueprint;

      if (nested != null) for (let i = 0; i < nested.length; ++i) {
        this.addTemplates(parent, nested[i]);
      }

      return parent;
    }

    static stopEvent(event) {
      if (event != null && event !== currentEvent) {
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
      if (origin == null) {
        origin = Ctx._currentCtx;
      } else if (origin.parentNode !== void 0) {
        origin = Dom.ctx(origin);
      }

      for (;origin != null; origin = origin.parentCtx) {
        if (origin.template === this) return origin;
      }
    }

    $data(origin) {return this.$ctx(origin)?.data}

    $autoRender(data, parentCtx) {
      const elm = this.$render(data, parentCtx);

      if (this._events.length > 0) {
        if (elm.nodeType === document.DOCUMENT_FRAGMENT_NODE) {
          throw new Error('attempt to attach events to document fragment: ' + this.$fullname);
        }
        this.$attachEvents(elm);
        Dom.ctx(elm).onDestroy(() => this.$detachEvents(elm));
      }
      return elm;
    }

    $render(data, parentCtx) {
      const prevCtx = Ctx._currentCtx;
      const ctx = Ctx._currentCtx = new Ctx(this, parentCtx ?? Ctx._currentCtx, data);
      let frag = document.createDocumentFragment();
      this.nodes != null && addNodes(this, frag, this.nodes, this.ns);
      const {firstChild} = frag;
      if (firstChild !== null) {
        if (frag.lastChild === firstChild) frag = firstChild;
      }
      frag[ctx$] = ctx;
      ctx.firstElement = firstChild;
      try {
        this.$created?.(ctx, frag);
        ctx.data == null || ctx.updateAllTags(ctx.data);
        return frag;
      } catch (err) {
        try {
          err.toStringPrefix = `while rendering: ${this.$fullname}\n`;
          // clean up what we can
          Dom.destroyData(frag);
        } catch (ex2) {}
        throw err;
      } finally {
        Ctx._currentCtx = prevCtx;
      }
    }

    get $fullname() {
      return (this.parent === null ? '' : this.parent.$fullname + '.') + this.name;
    }

    $helpers(properties) {
      mergeNoEnum(this._helpers, properties);
      return this;
    }

    $events(events) {
      for (const key in events)
        this.$event(key, events[key]);
      return this;
    }

    $event(key, func) {
      const m = /^(\S+)(.*)/.exec(key);
      if (! m) throw new Error('invalid event spec: ' + key);
      this._events.push([m[1], m[2].trim(), func]);
      return this;
    }

    $findEvent(type, css) {
      const events = this._events;
      for (let i = 0; i < events.length; ++i) {
        const row = events[i];
        if (row[0] === type && row[1] === css) {
          return row;
        }
      }
    }

    $actions(actions) {
      const events = {};
      for (const key in actions) {
        events['click [name=' + key + ']'] = actions[key];
      }
      return this.$events(events);
    }

    $extend(properties) {
      return mergeNoEnum(this, properties);
    }

    $attachEvents(parent, selector) {
      nativeOnOff(parent, nativeOn, selector, this._events);
      return this;
    }

    $detachEvents(parent, selector) {
      nativeOnOff(parent, nativeOff, selector, this._events);
      return this;
    }

    [inspect$]() {
      return 'Template(' + this.$fullname + ')';
    }

    $contains(subTemplate=null) {
      while (subTemplate !== null) {
        if (this === subTemplate) {
          return true;
        }
        subTemplate = subTemplate.parent;
      }
      return false;
    }

    static get _currentEvent() {return currentEvent}
    static set _currentEvent(value) {currentEvent = value}
  }

  const nativeOn = (parent, eventType, selector, func) => {
    const events = parent[ctx$].__events ?? (parent[ctx$].__events = {});

    let eventTypes = events[eventType];
    if (eventTypes === void 0) {
      eventTypes = events[eventType] = {};
      switch (eventType) {
      case 'focus':
        parent.addEventListener(eventType, onEvent, true);
        break;
      case 'blur':
        parent.addEventListener(eventType, onBlur, true);
        break;
      case 'focusout':
        parent.addEventListener(eventType, onBlur);
        break;
      case 'dragstart':
        parent.addEventListener(eventType, onEvent);
        parent.addEventListener('touchstart', dragTouchStart);
        break;
      case 'menustart':
        parent.addEventListener('pointerdown', menustart);
        parent.addEventListener('click', menustart);
        break;
      default:
        parent.addEventListener(eventType, onEvent);
      }
    }

    eventTypes[selector || ':TOP'] = func;
  };

  const lookupTemplate = Template.lookupTemplate = (tpl, name) => {
    const m = /^((?:\.\.\/)*[^\.]+)\.(.*)$/.exec(name);

    return m == null
      ? fetchTemplate(tpl, name)
      : fetchTemplate(tpl, m[1], m[2].split('.'));
  };

  return Template;
});
