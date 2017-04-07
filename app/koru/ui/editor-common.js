define(function(require, exports, module) {
  const util = require('koru/util');
  const Dom  = require('../dom');

  const IGNORE_OPTIONS = {"class": true, type: true, atList: true};

  exports.addAttributes = (elm, options) => {
    for(let key in options) {
      if (key in IGNORE_OPTIONS) continue;
      elm.setAttribute(key, options[key]);
    }

  };

  const {getRange, setRange} = Dom;

  if (Dom.vendorPrefix === 'ms') {
    exports.insert = arg => {
      let range = getRange();
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

      range = getRange();
      if (arg.nodeType === document.TEXT_NODE &&
          range.startContainer.nodeType === document.TEXT_NODE) {
        range = document.createRange();
        range.selectNode(arg);
        range.collapse(false);
        setRange(range);
      }
      return true;
    };
  } else {
    exports.insert = arg => {
      if (typeof arg === 'string') {
        return document.execCommand('insertText', 0, arg);
      }

      let t;
      if (arg.nodeType === document.DOCUMENT_FRAGMENT_NODE) {
        t = document.createElement('div');
        t.appendChild(arg);
        t = t.innerHTML;
      } else {
        t = arg.outerHTML;
      }
      return document.execCommand("insertHTML", 0, t);
    };
  }

});
