define(function(require, exports, module) {
  const koru        = require('koru');
  const Ctx         = require('koru/dom/ctx');
  const DomTemplate = require('koru/dom/template');
  const util        = require('koru/util');
  const Dom         = require('./base');

  const {hasOwn} = util;
  const {ctx$, endMarker$} = require('koru/symbols');

  let vendorTransform;
  const vendorStylePrefix = (() => {
    const style = document.documentElement.style;
    const styles = ['Moz', 'ms',  'webkit', 'o', ''];
    let i = 0;
    for(; i < styles.length; ++i) {
      if (styles[i]+'Transform' in style) break;
    }
    vendorTransform = ('transform' in style) || ! vendorStylePrefix ? 'transform'
      : vendorStylePrefix + 'Transform';
    return styles[i];
  })();

  const vendorFuncPrefix = vendorStylePrefix.toLowerCase();

  const matches = document.documentElement[vendorFuncPrefix+'MatchesSelector'] ||
        document.documentElement.matchesSelector;

  const {DOCUMENT_NODE} = document;
  const origValue$ = Symbol();

  if (document.documentElement.closest === undefined) {
    Element.prototype.closest = function (selector) {
      let elm = this;
      while(elm != null && elm.nodeType !== DOCUMENT_NODE) {
        if (matches.call(elm, selector))
          return elm;
        elm = elm.parentNode;
      }
    };
  }
  require('./next-frame')(Dom);

  Dom.INPUT_SELECTOR = 'input,textarea,select,select>option,[contenteditable="true"]';
  Dom.WIDGET_SELECTOR = Dom.INPUT_SELECTOR+',button,a';
  Dom.FOCUS_SELECTOR = '[tabindex="0"],'+Dom.INPUT_SELECTOR;

  if (document.head.classList === undefined) {
    Dom.hasClass = function (elm, name) {
      return elm != null && new RegExp("\\b" + name + "\\b").test(elm.className);
    };
    Dom.addClass = function (elm, name) {
      if (elm == null || elm.nodeType !== 1) return;
      const className = " " + elm.className + " ";
      elm.className = (className.replace(" " + name + " ", " ") + name).trim();
    };
    Dom.removeClass = function (elm, name) {
      if (elm == null || elm.nodeType !== 1) return;
      const className = " " + elm.className + " ";
      elm.className = (className.replace(" " + name + " ", " ")).trim();
    };
  }

  let supportsPassiveEvents = false;
  window.addEventListener('test', null, Object.defineProperty({}, 'passive', {
    get() { supportsPassiveEvents = true; },
  }));

  const captureEventOption = supportsPassiveEvents ? {capture: true, passive: false} : true;

  util.merge(Dom, {
    Ctx: Ctx,
    current: Ctx.current,

    supportsPassiveEvents,

    captureEventOption,

    get element() {return Ctx._currentElement},

    _matchesFunc: matches,

    wheelDelta(event) {
      return Math.max(-1, Math.min(1, event.wheelDelta || -(event.deltaY || event.deltaX)));
    },

    isInView(elm, regionOrNode) {
      const region = regionOrNode.getBoundingClientRect === undefined ?
              regionOrNode : regionOrNode.getBoundingClientRect();
      const bb = elm.getBoundingClientRect();
      const cx = (bb.left+bb.width/2);
      const cy = (bb.top+bb.height/2);

      return cx > region.left && cx < region.right && cy > region.top && cy < region.bottom;
    },

    isAboveBottom(elm, region) {
      if ('getBoundingClientRect' in region)
        region = region.getBoundingClientRect();

      return elm.getBoundingClientRect().top < region.bottom;
    },

    setClassBySuffix(name, suffix, elm) {
      elm = elm || Dom.element;
      if (!elm) return;
      const classes = elm.className.replace(new RegExp('\\s*\\S*'+suffix+'\\b', 'g'), '')
            .replace(/(^ | $)/g,'');

      if (name)
        elm.className = (classes.length ? classes + ' ' : '') + name + suffix;
      else
        elm.className = classes;
    },

    setClassByPrefix(name, prefix, elm) {
      elm = elm || Dom.element;
      if (!elm) return;

      const classes = elm.className.replace(new RegExp('\\s*'+prefix+'\\S*', 'g'), '')
            .replace(/(^ | $)/g,'');

      if (name)
        elm.className = (classes.length ? classes + ' ' : '') + prefix + name;
      else
        elm.className = classes;
    },

    setClass(name, isAdd, elm) {
      (isAdd ? Dom.addClass : Dom.removeClass)(elm || Dom.element, name);
    },

    setBoolean(name, isAdd, elm) {
      elm = elm || Dom.element;
      if (isAdd)
        elm.setAttribute(name, name);
      else
        elm.removeAttribute(name);
    },

    focus(elm, selector) {
      if (! elm) return;
      if (typeof selector !== 'string') selector = Dom.FOCUS_SELECTOR;
      const focus = elm.querySelector(selector);
      focus !== null && focus.focus();
    },

    setRange(range) {
      const sel = window.getSelection();
      try {
        sel.removeAllRanges();
      } catch (ex) {
        document.body.createTextRange().select();
        document.selection.empty();
      }
      sel.addRange(range);
    },

    getRange() {
      const sel = window.getSelection();
      if (sel.rangeCount === 0) return null;
      return sel.getRangeAt(0);
    },

    getRangeClientRect(range) {
      if (range.collapsed) {
        var sc = range.startContainer;
        var so = range.startOffset;
        var tr = document.createRange();
        var result = {width: 0};
        if (sc.nodeType === document.TEXT_NODE) {
          var text = sc.textContent;
          if (text) {
            if (so < text.length) {
              tr.setStart(sc, so);
              tr.setEnd(sc, so + 1);
              var dims = tr.getBoundingClientRect();
            } else {
              tr.setStart(sc, so - 1);
              tr.setEnd(sc, so);
              var dims = tr.getBoundingClientRect();
              result.left = dims.right;
            }
          } else {
            var dims = sc.parentNode.getBoundingClientRect();
          }
        } else {
          var node = sc.childNodes[so] || sc;
          if (node.nodeType === document.TEXT_NODE) {
            tr.setStart(node, 0);
            return this.getRangeClientRect(tr);
          } else {
            var dims = node.getBoundingClientRect();
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
    },

    selectElm(elm) {
      if (elm) {
        var range = document.createRange();
        range.selectNode(elm);
        Dom.setRange(range);
        return range;
      }
    },

    forEach(elm, querySelector, func) {
      if (! elm) return;
      const elms = elm.querySelectorAll(querySelector);
      const len = elms.length;
      for(let i = 0; i < len; ++i) func(elms[i]);
    },

    mapToData(list) {
      const len = list.length;
      const result = [];
      for(let i = 0; i < len; ++i) {
        result.push(convertToData(list[i]));
      }
      return result;
    },

    getClosest(elm, selector) {
      if (elm && elm.nodeType !== document.ELEMENT_NODE)
        elm = elm.parentNode;
      return elm && elm.closest(selector);
    },

    getClosestCtx(elm, selector) {
      return this.ctx(this.getClosest(elm, selector));
    },

    searchUpFor(elm, func, stopClass) {
      if (! elm) return null;
      while(elm && elm.nodeType !== DOCUMENT_NODE) {
        if (func(elm)) return elm;
        if (stopClass && Dom.hasClass(elm, stopClass)) return null;
        elm = elm.parentNode;
      }
      return null;
    },

    getUpDownByClass(elm, upClass, downClass) {
      elm = elm && elm.closest(`.${upClass}`);
      return elm && elm.getElementsByClassName(downClass)[0];
    },

    matches(elm, selector) {
      return matches.call(elm, selector);
    },

    nextSibling(elm, selector) {
      if (elm) for(let next = elm.nextElementSibling; next !== null;
                   next = next.nextElementSibling) {
        if (matches.call(next, selector)) return next;
      }
      return null;
    },

    childElementIndex(child) {
      let i = 0;
      while( (child = child.previousElementSibling) != null ) i++;
      return i;
    },

    transformTranslate(elm , x, y) {
      elm.style.setProperty(
        vendorTransform, elm.style.getProperty(vendorTransform)
          .replace(/\btranslate\([^)]*\)\s*/, '')+`translate(${x},${y})`);
    },

    buildEvent: buildEvent,

    triggerEvent(node, event, args) {
      if (typeof event === 'string')
        event = buildEvent(event, args);

      if (Event || document.createEvent)
        node.dispatchEvent(event);
      else
        node.fireEvent("on" + event.__name, event);

      return event;
    },

    hideAndRemove(elm) {
      if (typeof elm === 'string')
        elm = document.getElementById(elm);
      const ctx = Dom.myCtx(elm);
      if (ctx === null) return;
      Dom.addClass(elm, 'remElm');
      ctx.onAnimationEnd(remElm);
    },

    show(elm) {
      if (typeof elm === 'string')
        elm = document.getElementById(elm);

      const ctx = Dom.myCtx(elm);
      if (ctx === null) return;
      Dom.addClass(elm, 'addElm');
      ctx.onAnimationEnd(addElm);
    },


    vendorTransform: vendorTransform,
    vendorTransformOrigin: vendorTransform+'Origin',

    vendorPrefix: vendorFuncPrefix,

    hasPointerEvents: true,

    get event(){return DomTemplate._currentEvent},

    _helpers: {
      inputValue(value) {
        Dom.setOriginalValue(Dom.current.element, value);
        Dom.updateInput(Dom.current.element, value == null ? '' : ''+value);
      },

      decimal(value, {format=2}={}) {
        return value == null ? '' : util.toDp(value, format, true);
      },

      comment(value) {
        return document.createComment(value);
      },
    },

    originalValue(elm) {return elm[origValue$]},
    setOriginalValue(elm, value) {elm[origValue$] = value},
    restoreOriginalValue(elm) {
      if (hasOwn(elm, origValue$))
        elm.value = elm[origValue$];
    },

    registerHelpers(helpers) {
      util.merge(this._helpers, helpers);
      return this;
    },

    newTemplate: DomTemplate.newTemplate,

    lookupTemplate(name) {return DomTemplate.lookupTemplate(this, name)},

    stopEvent: DomTemplate.stopEvent,
    stopPropigation: DomTemplate.stopPropigation,

    setCtx(elm, ctx) {
      if (! ctx) {
        ctx = new Ctx(null, Dom.ctx(elm));
      }
      elm[ctx$] = ctx;
      ctx.firstElement = elm;
      return ctx;
    },

    destroyMeWith(elm, ctx) {
      if (ctx[ctx$]) ctx = ctx[ctx$];
      const elmCtx = elm[ctx$];
      const id = getId(elmCtx);
      const observers = ctx.__destoryObservers;
      ((observers === undefined) ? (ctx.__destoryObservers = Object.create(null)) : observers
      )[id] = elm;
      elmCtx.__destoryWith = ctx;
    },

    destroyData(elm) {
      const ctx = elm && elm[ctx$];
      if (ctx != null) {
        const dw = ctx.__destoryWith;
        if (dw !== undefined) {
          ctx.__destoryWith = undefined;
          const observers = dw.__destoryObservers;
          if (observers !== undefined) {
            delete observers[ctx.__id];
            if (util.isObjEmpty(observers))
              dw.__destoryObservers = undefined;
          }
        }
        const observers = ctx && ctx.__destoryObservers;
        if (observers !== undefined) {
          ctx.__destoryObservers = undefined;
          for (const id in observers) {
            const withElm = observers[id];
            const withCtx = withElm[ctx$];
            if (withCtx != null)  {
              withCtx.__destoryWith = undefined;
            }
            Dom.remove(withElm);
          }
        }

        if (ctx.__onDestroy !== undefined) {
          const list = ctx.__onDestroy;
          ctx.__onDestroy = undefined;
          for(let i = list.length - 1; i >=0; --i) {
            const row = list[i];
            if (typeof row === 'function')
              row.call(ctx);
            else
              row.stop();
          }
        }
        ctx.destroyed && ctx.destroyed(ctx, elm);
        const tpl = ctx.template;
        tpl != null && tpl.$destroyed && tpl.$destroyed.call(tpl, ctx, elm);
        elm[ctx$] = null;
      }
      Dom.destroyChildren(elm);
    },

    removeId(id) {
      return this.remove(document.getElementById(id));
    },

    removeAll(elms) {
      for(let i = elms.length - 1; i >= 0; --i) {
        this.remove(elms[i]);
      }
    },

    remove(elm) {
      if (elm != null) {
        Dom.destroyData(elm);
        if (elm.parentNode === null) return false;
        elm.parentNode.removeChild(elm);
        return true;
      }
    },

    removeInserts(start) {
      const parent = start.parentNode;
      if (! parent) return;
      const end = start[endMarker$];
      for(let elm = start.nextSibling; elm && elm !== end; elm = start.nextSibling) {
        parent.removeChild(elm);
        Dom.destroyData(elm);
      }
    },

    removeChildren(elm) {
      if (elm == null) return;

      let row;
      while((row = elm.firstChild) !== null) {
        Dom.destroyData(row);
        elm.removeChild(row);
      }
    },

    destroyChildren(elm) {
      if (elm == null) return;

      let iter = elm.firstChild;
      while (iter !== null) {
        const row = iter;
        iter = iter.nextSibling; // incase side affect
        Dom.destroyData(row);
      }
    },

    myCtx(elm) {
      return elm == null ? null : elm[ctx$];
    },

    ctx(elm) {
      if (typeof elm === 'string')
        elm = document.querySelector(elm);
      if (elm == null) return;
      let ctx = elm[ctx$];
      while(ctx === undefined && elm.parentNode !== null)
        ctx = (elm = elm.parentNode)[ctx$];
      return ctx === undefined ? null : ctx;
    },

    ctxById(id) {
      const elm = document.getElementById(id);
      return elm === null ? null : elm[ctx$];
    },

    updateElement(elm) {
      const ctx = Dom.ctx(elm);
      ctx !== null && ctx.updateElement(elm);
    },

    replaceElement(newElm, oldElm, noRemove) {
      var ast = oldElm[endMarker$];
      if (ast) {
        Dom.removeInserts(oldElm);
        Dom.remove(ast);
      }

      const parentCtx = (oldElm[ctx$] != null && oldElm[ctx$].parentCtx) ||
              Dom.ctx(oldElm.parentNode);
      if (parentCtx !== null) {
        var ctx = newElm[ctx$];
        if (ctx) ctx.parentCtx = parentCtx;
      }

      noRemove === 'noRemove' || Dom.destroyData(oldElm);

      oldElm.parentNode && oldElm.parentNode.replaceChild(newElm, oldElm);
      return this;
    },

    fragEnd(fragStart) {
      return fragStart[endMarker$];
    },

    contains: Element.prototype.contains && Dom.vendorPrefix !== 'ms' ? function (parent, elm) {
      return parent && parent.contains(elm) ? parent : null;
    } : (parent, elm) => {
      while(elm && elm.nodeType !== DOCUMENT_NODE) {
        if (parent === elm) return parent;
        elm = elm.parentNode;
      }
      return null;
    },

    // TODO import by performing a binary search. Also allow passing a
    // hint of the best place to start searching. It might be the upper
    // or lower bound or the point of insertion or not even in the list
    findFirstByCtxData(parent, finder) {
      var iter = parent && parent.firstChild;
      while(iter) {
        var row = iter;
        iter = iter.nextSibling; // incase side affect
        var b = row[ctx$];
        if (b && finder(b.data)) return row;
      }
      return null; // need null for IE
    },

    updateInput(input, value) {
      if (value !== input.value) {
        input.value = value;
      }
      return value;
    },

    modifierKey(event) {
      return event.ctrlKey || event.shiftKey || event.metaKey || event.altKey;
    },

    onPointerUp(func, elm) {
      document.addEventListener('pointerup', opu, true);

      const $ = Dom.current;
      const ctx = $.ctx;

      function opu(event) {
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
      }
    },

    /**
     * Remove an element and provide a function that inserts it into its original position
     * @param element {Element} The element to be temporarily removed
     * @return {Function} A function that inserts the element into its original position
     **/
    removeToInsertLater(element) {
      var parentNode = element.parentNode;
      var nextSibling = element.nextSibling;
      parentNode.removeChild(element);
      if (nextSibling) {
        return function() {parentNode.insertBefore(element, nextSibling)};
      } else {
        return function() {parentNode.appendChild(element)};
      };
    },
  });

  function addElm(ctx, elm) {
    Dom.removeClass(elm, 'addElm');
  }

  function remElm(ctx, elm) {
    Dom.remove(elm);
  }

  const DEFAULT_EVENT_ARGS = {cancelable: true, bubbles: true, cancelBubble: true};

  function buildEvent(event, args) {
    if (Event) {
      var e = new Event(event, DEFAULT_EVENT_ARGS);
    } if (document.createEvent) {
      var e = document.createEvent("Event");
      e.initEvent(event, true, true);
    } else {
      var e = document.createEventObject();
    }
    Object.assign(e, args);
    return e;
  }

  switch(vendorFuncPrefix) {
  case 'ms':
    (function () {
      var m = /\bMSIE (\d+)/.exec(navigator.userAgent);
      if (m) {
        if (+m[1] < 11) {
          Dom.hasPointerEvents = false;
        }
      }
    })();
    break;
  case 'moz':
    (function(){
      // polyfill for focusin, focusout
      var w = window,
          d = w.document;

      if( w.onfocusin === undefined ){
        d.addEventListener('focus'    ,addPolyfill    ,true);
        d.addEventListener('blur'     ,addPolyfill    ,true);
        d.addEventListener('focusin'  ,removePolyfill ,true);
        d.addEventListener('focusout' ,removePolyfill ,true);
      }
      function addPolyfill(e){
        var type = e.type === 'focus' ? 'focusin' : 'focusout';
        var event = new w.CustomEvent(type, { bubbles:true, cancelable:false });
        event.c1Generated = true;
        e.target.dispatchEvent( event );
      }
      function removePolyfill(e){
        if(!e.c1Generated){
          // focus after focusin, so chrome will the first time trigger tow times focusin
          d.removeEventListener('focus'    ,addPolyfill    ,true);
          d.removeEventListener('blur'     ,addPolyfill    ,true);
          d.removeEventListener('focusin'  ,removePolyfill ,true);
          d.removeEventListener('focusout' ,removePolyfill ,true);
        }
        setTimeout(function(){
          d.removeEventListener('focusin'  ,removePolyfill ,true);
          d.removeEventListener('focusout' ,removePolyfill ,true);
        });
      }
    })();
    break;
  }

  const convertToData = elm => {
    const ctx = elm == null ? null : Dom.ctx(elm);
    return ctx === null ? null : ctx.data;
  };

  let globalIds = 0;
  const getId = ctx => {
    const id = ctx.__id;
    return id === undefined ? (ctx.__id = (++globalIds).toString(36)) : id;
  };

  return Dom;
});
