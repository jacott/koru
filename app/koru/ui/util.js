define(function(require, exports, module) {
  var util = require('koru/util');

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

  var DOCUMENT_NODE = document.DOCUMENT_NODE;


  return function (Dom) {
    util.extend(Dom, {
      _matchesFunc: matches,

      MOUSEWHEEL_EVENT: vendorFuncPrefix === 'moz' ? 'wheel' : 'mousewheel',

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
        if (typeof html === 'object' && ('nodeType' in html)) return html;
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
          case "content": case "html":
            content = typeof value === 'string' ? Dom.html(value) : value;
            break;
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
        else if (Array.isArray(content))
          content.forEach(function (item) {
            elm.appendChild(Dom.html(item));
          });
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
        elm = elm || Dom.element;
        if (!elm) return;
        var classes = elm.className.replace(new RegExp('\\s*\\S*'+suffix+'\\b', 'g'), '').replace(/(^ | $)/g,'');

        if (name)
          elm.className = (classes.length ? classes + ' ' : '') + name + suffix;
        else
          elm.className = classes;
      },

      setClassByPrefix: function (name, suffix, elm) {
        elm = elm || Dom.element;
        if (!elm) return;

        var classes = elm.className.replace(new RegExp('\\s*'+suffix+'\\S*', 'g'), '').replace(/(^ | $)/g,'');

        if (name)
          elm.className = (classes.length ? classes + ' ' : '') + suffix + name;
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

      forEach: function (elm, querySelector, func) {
        if (! elm) return;
        var elms = elm.querySelectorAll(querySelector);
        for(var i = 0; i < elms.length; ++i) {
          func(elms[i]);
        }
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

      transformTranslate: function (elm , x, y) {
        elm.style[vendorTransform] = elm.style[vendorTransform].replace(/\btranslate\([^)]*\)\s*/, '')+'translate('+x+','+y+')';
      },

      vendorTransform: vendorTransform,
      vendorTransformOrigin: vendorTransform+'Origin',

      vendorPrefix: vendorFuncPrefix,

      hasPointerEvents: true,

      INPUT_SELECTOR: 'input,textarea,select,select>option,[contenteditable="true"]',
    });

    switch(vendorFuncPrefix) {
    case 'webkit': Dom.animationEndEventName = 'webkitAnimationEnd'; break;
    case 'ms': Dom.animationEndEventName = 'MSAnimationEnd'; break;
    default: Dom.animationEndEventName = 'animationend';
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
  };
});
