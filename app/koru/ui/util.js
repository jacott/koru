define(function(require, exports, module) {
  var util = require('koru/util');
  var Dom = require('../dom-base');

  var vendorTransform;
  var vendorStylePrefix = (function () {
    var style = document.documentElement.style;
    var styles = ['webkit', 'Moz',  'ms', 'o', ''];
    for(var i = 0; i < styles.length; ++i) {
      if (styles[i]+'Transform' in style) break;
    }
    vendorTransform = ('transform' in style) || ! vendorStylePrefix ? 'transform' : vendorStylePrefix + 'Transform';
    return styles[i];
  })();

  var vendorFuncPrefix = vendorStylePrefix.toLowerCase();

  var matches = document.documentElement[vendorFuncPrefix+'MatchesSelector'] || document.documentElement.matchesSelector;

  var DOCUMENT_NODE = document.DOCUMENT_NODE;

  util.extend(Dom, {
    _matchesFunc: matches,

    MOUSEWHEEL_EVENT: vendorFuncPrefix === 'moz' ? 'wheel' : 'mousewheel',

    wheelDelta: function (event) {
      return Math.max(-1, Math.min(1, event.wheelDelta || -(event.deltaY || event.deltaX)));
    },

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

    isInView: function (elm, region) {
      if ('getBoundingClientRect' in region)
        region = region.getBoundingClientRect();
      var bb = elm.getBoundingClientRect();
      var cx = (bb.left+bb.width/2);
      var cy = (bb.top+bb.height/2);

      return cx > region.left && cx < region.right && cy > region.top && cy < region.bottom;
    },

    setClassBySuffix: function (name, suffix, elm) {
      elm = elm || Dom.element;
      if (!elm) return;
      var classes = elm.className.replace(new RegExp('\\s*\\S*'+suffix+'\\b', 'g'), '').replace(/(^ | $)/g,'');

      if (name)
        elm.className = (classes.length ? classes + ' ' : '') + name + suffix;
      else
        elm.className = classes;
    },

    setClassByPrefix: function (name, prefix, elm) {
      elm = elm || Dom.element;
      if (!elm) return;

      var classes = elm.className.replace(new RegExp('\\s*'+prefix+'\\S*', 'g'), '').replace(/(^ | $)/g,'');

      if (name)
        elm.className = (classes.length ? classes + ' ' : '') + prefix + name;
      else
        elm.className = classes;
    },

    setClass: function (name, isAdd, elm) {
      (isAdd ? Dom.addClass : Dom.removeClass)(elm || Dom.element, name);
    },

    setBoolean: function (name, isAdd, elm) {
      elm = elm || Dom.element;
      if (isAdd)
        elm.setAttribute(name, name);
      else
        elm.removeAttribute(name);
    },

    focus: function (elm, selector) {
      if (!elm) return;
      if (typeof selector !== 'string') selector = Dom.INPUT_SELECTOR;
      var focus = elm.querySelector(selector);
      focus && focus.focus();
    },

    forEach: function (elm, querySelector, func) {
      if (! elm) return;
      var elms = elm.querySelectorAll(querySelector);
      var len = elms.length;
      for(var i = 0; i < len; ++i) {
        func(elms[i]);
      }
    },

    mapToData: function (list) {
      var len = list.length;
      var result = [];
      for(var i = 0; i < len; ++i) {
        result.push(convertToData(list[i]));
      }
      return result;
    },

    getClosest: function (elm, selector) {
      if (elm && elm.nodeType !== document.ELEMENT_NODE)
        elm = elm.parentNode;
      while(elm && elm.nodeType !== DOCUMENT_NODE) {
        if (matches.call(elm, selector))
          return elm;
        elm = elm.parentNode;
      }
    },

    searchUpFor: function (elm, func, stopClass) {
      if (! elm) return null;
      while(elm && elm.nodeType !== DOCUMENT_NODE) {
        if (func(elm)) return elm;
        if (stopClass && Dom.hasClass(elm, stopClass)) return null;
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

    getUpDownByClass: function (elm, upClass, downClass) {
      elm = Dom.getClosestClass(elm, upClass);
      return elm && elm.getElementsByClassName(downClass)[0];
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

    childElementIndex: function (child) {
      var i = 0;
      while( (child = child.previousElementSibling) != null ) i++;
      return i;
    },

    transformTranslate: function (elm , x, y) {
      elm.style[vendorTransform] = elm.style[vendorTransform].replace(/\btranslate\([^)]*\)\s*/, '')+'translate('+x+','+y+')';
    },

    vendorTransform: vendorTransform,
    vendorTransformOrigin: vendorTransform+'Origin',

    vendorPrefix: vendorFuncPrefix,

    hasPointerEvents: true,

    INPUT_SELECTOR: 'input,textarea,select,select>option,[contenteditable="true"]',
  });

  Dom.animationEndEventName = 'animationend';

  switch(vendorFuncPrefix) {
  case 'webkit':
    Dom.animationEndEventName = 'webkitAnimationEnd';
    break;
  case 'ms':
    Dom.animationEndEventName = 'MSAnimationEnd';
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
        if(!e.c1Generated){ // focus after focusin, so chrome will the first time trigger tow times focusin
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

  function convertToData(elm) {
    var ctx = elm && Dom.getCtx(elm);
    return ctx && ctx.data;
  }
  return Dom;
});
