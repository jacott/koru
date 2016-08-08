define(function(require, exports, module) {
  var util = require('koru/util');
  var koru = require('koru/main');
  var Dom = require('./base');
  var DomTemplate = require('./template');

  var DOCUMENT_NODE = document.DOCUMENT_NODE;

  var koruEvent = null;

  util.extend(Dom, {
    updateInput: function (input, value) {
      if (value !== input.value) {
        input.value = value;
      }
      return value;
    },

    modifierKey: function (event) {
      return event.ctrlKey || event.shiftKey || event.metaKey || event.altKey;
    },

    onMouseUp: onMouseUp,

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
  });

  require('./next-frame')(Dom);

  Dom.INPUT_SELECTOR = 'input,textarea,select,select>option,[contenteditable="true"]';
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

  function onMouseUp(func, elm) {
    document.addEventListener('mouseup', omu, true);

    var $ = Dom.current;

    var ctx = $.ctx;

    function omu(event) {
      document.removeEventListener('mouseup', omu, true);

      var orig = $.ctx;
      $._ctx = ctx;
      try {
        func(event);
      } catch(ex) {
        Dom.handleException(ex);
      } finally {
        $._ctx = orig;
      }
    }
  }

  return Dom;
});
