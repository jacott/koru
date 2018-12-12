define((require)=>{
  const koru            = require('koru');
  const Ctx             = require('koru/dom/ctx');
  const DomTemplate     = require('koru/dom/template');
  const util            = require('koru/util');
  const Dom             = require('./base');
  const DLinkedList     = require('koru/dlinked-list');

  const {hasOwn, isObjEmpty} = util;
  const {ctx$, endMarker$, private$, original$} = require('koru/symbols');
  const destoryObservers$ = Ctx[private$].destoryObservers$ = Symbol();
  const destoryWith$ = Symbol();
  const {onDestroy$} = Ctx[private$];

  const vendorStylePrefix = (() => {
    const style = document.documentElement.style;
    const styles = ['Moz', 'ms',  'webkit', 'o', ''];
    let i = 0;
    for(; i < styles.length; ++i) {
      if (styles[i]+'Transform' in style) break;
    }
    return styles[i];
  })();

  const vendorFuncPrefix = vendorStylePrefix.toLowerCase();

  const matches = document.documentElement[vendorFuncPrefix+'MatchesSelector'] ||
        document.documentElement.matchesSelector;

  const {DOCUMENT_NODE} = document;

  require('./next-frame')(Dom);

  Dom.INPUT_SELECTOR = 'input,textarea,select,select>option,[contenteditable="true"]';
  Dom.WIDGET_SELECTOR = Dom.INPUT_SELECTOR+',button,a';
  Dom.FOCUS_SELECTOR = '[tabindex="0"],'+Dom.INPUT_SELECTOR;

  let supportsPassiveEvents = false;
  window.addEventListener('test', null, Object.defineProperty({}, 'passive', {
    get() { supportsPassiveEvents = true; },
  }));

  const captureEventOption = supportsPassiveEvents ? {capture: true, passive: false} : true;

  const addElm = (ctx, elm)=>{elm == null || elm.classList.remove('addElm')};
  const remElm = (ctx, elm)=>{Dom.remove(elm)};

  const convertToData = elm => {
    const ctx = elm == null ? null : Dom.ctx(elm);
    return ctx === null ? null : ctx.data;
  };

  const DEFAULT_EVENT_ARGS = {cancelable: true, bubbles: true, cancelBubble: true};

  const buildEvent = (event, args)=>{
    const e = new Event(event, DEFAULT_EVENT_ARGS);
    Object.assign(e, args);
    return e;
  };

  if (document.caretPositionFromPoint === undefined) {
    HTMLDocument.prototype.caretPositionFromPoint = function (x, y) {
      const range = this.caretRangeFromPoint(x, y);
      return range === null
        ? null : {offsetNode: range.startContainer, offset: range.startOffset};
    };
  }

  const getRangeClientRect = range =>{
    if (range.collapsed) {
      const sc = range.startContainer;
      const so = range.startOffset;
      const tr = document.createRange();
      const result = {width: 0, height: 0, left: undefined, top: 0, right: 0, bottom: 0};
      let dims;
      if (sc.nodeType === document.TEXT_NODE) {
        const text = sc.textContent;
        if (text) {
          if (so < text.length) {
            tr.setStart(sc, so);
            tr.setEnd(sc, so + 1);
            dims = tr.getBoundingClientRect();
          } else {
            tr.setStart(sc, so - 1);
            tr.setEnd(sc, so);
            dims = tr.getBoundingClientRect();
            result.left = dims.right;
          }
        } else {
          dims = sc.parentNode.getBoundingClientRect();
        }
      } else {
        const node = sc.childNodes[so] || sc;
        if (node.nodeType === document.TEXT_NODE) {
          tr.setStart(node, 0);
          return getRangeClientRect(tr);
        } else {
          dims = node.getBoundingClientRect();
        }
      }
      result.height = dims.height;
      result.top = dims.top;
      result.bottom = dims.bottom;

      if (result.left === undefined)
        result.left = dims.left;
      result.right = result.left;
      return result;
    } else {
      return range.getBoundingClientRect();
    }
  };


  util.merge(Dom, {
    Ctx,
    current: Ctx.current,

    supportsPassiveEvents,

    captureEventOption,

    get element() {return Ctx._currentElement},

    _matchesFunc: matches,

    isInView: (elm, regionOrNode)=>{
      const region = regionOrNode.getBoundingClientRect === undefined ?
              regionOrNode : regionOrNode.getBoundingClientRect();
      const bb = elm.getBoundingClientRect();
      const cx = (bb.left+bb.width/2);
      const cy = (bb.top+bb.height/2);

      return cx > region.left && cx < region.right && cy > region.top && cy < region.bottom;
    },

    isAboveBottom: (elm, region)=>{
      if ('getBoundingClientRect' in region)
        region = region.getBoundingClientRect();

      return elm.getBoundingClientRect().top < region.bottom;
    },

    ensureInView: (elm)=>{
      const adjustments = [];
      let {left, right, bottom, top} = elm.getBoundingClientRect();
      for (let sp = Dom.getScrollParent(elm); sp !== null; sp = Dom.getScrollParent(sp)) {
        const pDim = sp.getBoundingClientRect();
        const pBottom = pDim.top + sp.clientHeight;
        const pRight = pDim.left + sp.clientWidth;
        const vdiff = bottom > pBottom
              ? Math.min(bottom - pBottom, top - pDim.top)
              : top < pDim.top
              ?   top - pDim.top
              :   0;
        const hdiff = right > pRight
              ? Math.min(right - pRight, left - pDim.left)
              : left < pDim.left
              ?   left - pDim.left
              :   0;

        if (vdiff != 0 || hdiff != 0) {
          left += hdiff; right += hdiff;
          top += vdiff; bottom += vdiff;
          adjustments.push([sp, sp.scrollLeft + hdiff, sp.scrollTop + vdiff]);
        }
      }
      for(let i = 0; i < adjustments.length; ++i) {
        const [elm, scrollLeft, scrollTop] = adjustments[i];
        elm.scrollTop = scrollTop;
        elm.scrollLeft = scrollLeft;
      }
    },

    getScrollParent: (elm=null)=>{
      if (elm === null) return null;
      elm = elm.parentNode;
      for (;elm !== null; elm = elm.parentNode) {
        if (elm.scrollHeight > elm.clientHeight || elm.scrollWidth > elm.clientWidth)
          return elm;
      }
      return null;
    },

    setClassBySuffix: (name, suffix, elm=Dom.element)=>{
      if (elm === null) return;
      const classes = elm.className.replace(new RegExp('\\s*\\S*'+suffix+'\\b', 'g'), '')
            .replace(/(^ | $)/g,'');

      elm.className = name
        ? (classes.length ? classes + ' ' : '') + name + suffix : classes;
    },

    setClassByPrefix: (name, prefix, elm=Dom.element)=>{
      if (elm === null) return;

      const classes = elm.className.replace(new RegExp('\\s*'+prefix+'\\S*', 'g'), '')
            .replace(/(^ | $)/g,'');

      elm.className = name
        ? (classes.length ? classes + ' ' : '') + prefix + name : classes;
    },

    setClass: (name, isAdd, elm)=>{
      (isAdd ? Dom.addClass : Dom.removeClass)(elm || Dom.element, name);
    },

    setBoolean: (name, isAdd, elm=Dom.element)=>{
      if (elm === null) return;
      if (isAdd)
        elm.setAttribute(name, name);
      else
        elm.removeAttribute(name);
    },

    focus: (elm, selector)=>{
      if (elm == null) return;
      if (typeof selector !== 'string') selector = Dom.FOCUS_SELECTOR;
      const focus = elm.querySelector(selector);
      focus !== null && focus.focus();
    },

    setRange: range =>{
      const sel = window.getSelection();
      sel.rangeCount == 0 || sel.removeAllRanges();
      sel.addRange(range);
    },

    getRange: ()=>{
      const sel = window.getSelection();
      if (sel.rangeCount === 0) return null;
      return sel.getRangeAt(0);
    },

    getBoundingClientRect: object =>{
      if (object instanceof Range)
        return getRangeClientRect(object);
      else if (object.getBoundingClientRect)
        return object.getBoundingClientRect();
      else if (object.left !== undefined)
        return object;
    },

    forEach: (elm, querySelector, func)=>{
      if (elm == null) return;
      const elms = elm.querySelectorAll(querySelector);
      const len = elms.length;
      for(let i = 0; i < len; ++i) func(elms[i]);
    },

    mapToData: (list)=>{
      const len = list.length;
      const result = [];
      for(let i = 0; i < len; ++i) {
        result.push(convertToData(list[i]));
      }
      return result;
    },

    getClosest: (elm=null, selector)=>{
      if (elm !== null && elm.nodeType !== document.ELEMENT_NODE)
        elm = elm.parentNode;
      return elm && elm.closest(selector);
    },

    getClosestCtx: (elm, selector)=>{
      return Dom.ctx(Dom.getClosest(elm, selector));
    },

    searchUpFor(elm=null, func, stopClass) {
      if (elm === null) return null;
      while(elm !== null && elm.nodeType !== DOCUMENT_NODE) {
        if (func(elm)) return elm;
        if (stopClass && Dom.hasClass(elm, stopClass)) return null;
        elm = elm.parentNode;
      }
      return null;
    },

    getUpDownByClass: (elm=null, upClass, downClass)=>{
      elm = elm && elm.closest(`.${upClass}`);
      return elm && elm.getElementsByClassName(downClass)[0];
    },

    matches: (elm, selector)=> matches.call(elm, selector),

    nextSibling: (elm=null, selector)=>{
      if (elm !== null) {
        for(let next = elm.nextElementSibling; next !== null;
            next = next.nextElementSibling) {
          if (matches.call(next, selector)) return next;
        }
      }
      return null;
    },

    childElementIndex: child =>{
      let i = 0;
      while( (child = child.previousElementSibling) != null ) i++;
      return i;
    },

    buildEvent,

    triggerEvent: (node, event, args)=>{
      if (typeof event === 'string')
        event = buildEvent(event, args);

      node.dispatchEvent(event);

      return event;
    },

    hideAndRemove: (elm)=>{
      if (typeof elm === 'string')
        elm = document.getElementById(elm);
      const ctx = Dom.myCtx(elm);
      if (ctx === null) return;
      Dom.addClass(elm, 'remElm');
      ctx.onAnimationEnd(remElm);
    },

    show: (elm)=>{
      if (typeof elm === 'string')
        elm = document.getElementById(elm);

      const ctx = Dom.myCtx(elm);
      if (ctx === null) return;
      Dom.addClass(elm, 'addElm');
      ctx.onAnimationEnd(addElm);
    },


    vendorPrefix: vendorFuncPrefix,

    hasPointerEvents: true,

    get event(){return DomTemplate._currentEvent},

    _helpers: {
      inputValue: (value)=>{
        Dom.setOriginalValue(Dom.current.element, value);
        Dom.updateInput(Dom.current.element, value == null ? '' : ''+value);
      },

      decimal: (value, {format=2}={})=>{
        return value == null ? '' : util.toDp(value, format, true);
      },

      comment: (value)=> document.createComment(value),
    },

    originalValue: elm => elm[original$],
    setOriginalValue: (elm, value)=>{elm[original$] = value},
    restoreOriginalValue: elm =>{
      if (hasOwn(elm, original$))
        elm.value = elm[original$];
    },

    stopEvent: DomTemplate.stopEvent,
    stopPropigation: DomTemplate.stopPropigation,

    setCtx: (elm, ctx=new Ctx(null, Dom.ctx(elm)))=>{
      elm[ctx$] = ctx;
      ctx.firstElement = elm;
      return ctx;
    },

    destroyMeWith: (elm, ctxOrElm)=>{
      const ctx = ctxOrElm[ctx$] ? ctxOrElm[ctx$] : ctxOrElm;
      const elmCtx = elm[ctx$];
      const observers = ctx[destoryObservers$];
      elmCtx[destoryWith$] = (
        (observers === undefined) ? (ctx[destoryObservers$] = new DLinkedList()) : observers
      ).add(elm);
    },

    destroyData: (elm=null)=>{
      const ctx = elm === null ? null : elm[ctx$];
      if (ctx != null) {
        const dw = ctx[destoryWith$];
        dw === undefined || dw.delete();
        const observers = ctx[destoryObservers$];
        if (observers !== undefined) {
          ctx[destoryObservers$] = undefined;
          for (const withElm of observers) {
            const withCtx = withElm[ctx$];
            if (withCtx != null)  {
              withCtx[destoryWith$] = undefined;
            }
            Dom.remove(withElm);
          }
        }

        ctx._destroyData(elm);
        elm[ctx$] = null;
      }
      Dom.destroyChildren(elm);
    },

    removeId: id => Dom.remove(document.getElementById(id)),

    removeAll: elms =>{
      for(let i = elms.length - 1; i >= 0; --i) {
        Dom.remove(elms[i]);
      }
    },

    remove: (elm=null)=>{
      if (elm !== null) {
        Dom.destroyData(elm);
        if (elm.parentNode === null) return false;
        elm.remove();
        return true;
      }
    },

    removeInserts: (start)=>{
      const parent = start.parentNode;
      if (! parent) return;
      const end = start[endMarker$];
      for(let elm = start.nextSibling; elm && elm !== end; elm = start.nextSibling) {
        elm.remove();
        Dom.destroyData(elm);
      }
    },

    removeChildren: (elm=null)=>{
      if (elm === null) return;

      let row;
      while((row = elm.firstChild) !== null) {
        Dom.destroyData(row);
        row.remove();
      }
    },

    destroyChildren: (elm=null)=>{
      if (elm === null) return;

      let iter = elm.firstChild;
      while (iter !== null) {
        const row = iter;
        iter = iter.nextSibling; // incase side affect
        Dom.destroyData(row);
      }
    },

    myCtx: elm => elm == null ? null : elm[ctx$] || null,

    ctx: (elm=null)=>{
      if (elm === null) return;
      if (typeof elm === 'string') elm = document.querySelector(elm);
      let ctx = elm[ctx$];
      while(ctx === undefined && elm.parentNode !== null)
        ctx = (elm = elm.parentNode)[ctx$];
      return ctx === undefined ? null : ctx;
    },

    ctxById: (id)=>{
      const elm = document.getElementById(id);
      return elm === null ? null : elm[ctx$];
    },

    updateElement: (elm)=>{
      const ctx = Dom.ctx(elm);
      ctx !== null && ctx.updateElement(elm);
    },

    replaceElement: (newElm, oldElm, noRemove)=>{
      const ast = oldElm[endMarker$];
      if (ast !== undefined) {
        Dom.removeInserts(oldElm);
        Dom.remove(ast);
      }

      const parentCtx = (oldElm[ctx$] != null && oldElm[ctx$].parentCtx) ||
              Dom.ctx(oldElm.parentNode);
      if (parentCtx !== null) {
        const ctx = newElm[ctx$];
        if (ctx != null) ctx.parentCtx = parentCtx;
      }

      noRemove === 'noRemove' || Dom.destroyData(oldElm);

      oldElm.parentNode && oldElm.parentNode.replaceChild(newElm, oldElm);
      return Dom;
    },

    fragEnd: fragStart => fragStart[endMarker$],

    contains: (parent, elm)=> (parent != null && parent.contains(elm)) ? parent : null,

    updateInput: (input, value)=>{
      if (value !== input.value) {
        input.value = value;
      }
      return value;
    },

    modifierKey: event => event.ctrlKey || event.shiftKey || event.metaKey || event.altKey,

    ctrlOrMeta: event => event.ctrlKey || event.metaKey,

    onPointerUp: (func, elm)=>{
      const $ = Dom.current;
      const ctx = $.ctx;

      const opu = event =>{
        document.removeEventListener('pointerup', opu, true);

        const orig = $.ctx;
        $._ctx = ctx;
        try {
          func(event);
        } catch(ex) {
          Dom.handleException(ex);
        } finally {
          $._ctx = orig;
        }
      };

      document.addEventListener('pointerup', opu, true);
    },

    /**
     * Remove an element and provide a function that inserts it into its original position
     * @param element {Element} The element to be temporarily removed
     * @return {Function} A function that inserts the element into its original position
     **/
    removeToInsertLater: (element)=>{
      const parentNode = element.parentNode;
      const nextSibling = element.nextSibling;
      element.remove();
      if (nextSibling !== null) {
        return ()=> parentNode.insertBefore(element, nextSibling);
      } else {
        return ()=> parentNode.appendChild(element);
      };
    },

    reposition: (pos='below', options)=>{
      const height = window.innerHeight;
      const ps = options.popup.style;
      const bbox = options.boundingClientRect || options.origin.getBoundingClientRect();
      ps.setProperty('left', bbox.left + 'px');
      switch (pos) {
      case 'above':
        ps.removeProperty('top');
        ps.setProperty('bottom', (height - bbox.top) + 'px');
        break;
      case 'below':
        ps.removeProperty('bottom');
        ps.setProperty('top', (bbox.top + bbox.height) + 'px');
        break;
      case 'on':
        ps.removeProperty('bottom');
        ps.setProperty('top', bbox.top + 'px');
      }
      const ppos = options.popup.getBoundingClientRect();
      switch (pos) {
      case 'above':
        if (ppos.top < 0) {
          ps.removeProperty('bottom');
          if (ppos.height + bbox.top + bbox.height > height) {
            ps.setProperty('top', '0');
          } else {
            ps.setProperty('top', (bbox.top + bbox.height) + 'px');
          }
        }
        break;
      case 'below':
        if (ppos.bottom > height) {
          if (ppos.height >= bbox.top) {
            ps.setProperty('top', '0');
          } else {
            ps.setProperty('bottom', (height - bbox.top) + 'px');
            ps.removeProperty('top');
          }
        }
      }
      if (pos !== 'on') {
        const width = window.innerWidth;
        if (ppos.right > width) {
          ps.setProperty('right', '0');
          ps.removeProperty('left');
        }
      }
    },
  });

  return Dom;
});
