define(function(require, exports, module) {
  var util = require('koru/util');
  var Dom = require('../dom');

  var IGNORE_OPTIONS = {"class": true, type: true, atList: true};

  exports.addAttributes = function (elm, options) {
    for(var key in options) {
      if (key in IGNORE_OPTIONS) continue;
      elm.setAttribute(key, options[key]);
    }

  };

  var getRange = Dom.getRange;
  var setRange = Dom.setRange;

  if (Dom.vendorPrefix === 'ms') {
    exports.insert = function (arg) {
      var range = getRange();
      document.execCommand("ms-beginUndoUnit");
      if (typeof arg === 'string')
        arg = document.createTextNode(arg);

      try {
        range.collapsed || range.deleteContents();
        range.insertNode(arg);
      } catch(ex) {
        return false;
      }
      document.execCommand("ms-endUndoUnit");

      var range = getRange();
      if (arg.nodeType === document.TEXT_NODE && range.startContainer.nodeType === document.TEXT_NODE) {
        range = document.createRange();
        range.selectNode(arg);
        range.collapse(false);
        setRange(range);
      }
      return true;
    };
  } else {
    exports.insert = function (arg) {
      if (typeof arg === 'string') {
        return document.execCommand('insertText', 0, arg);
      }

      if (arg.nodeType === document.DOCUMENT_FRAGMENT_NODE) {
        var t = document.createElement('div');
        t.appendChild(arg);
        t = t.innerHTML;
      } else {
        var t = arg.outerHTML;
      }
      return document.execCommand("insertHTML", 0, t);
    };
  }

});
