define(function(require, exports, module) {
  require('koru/dom/html-doc');
  const util            = require('koru/util');
  const Dom             = require('./base');

  const {endMarker$} = require('koru/symbols');

  Dom._helpers = {};

  util.merge(Dom, {
    replaceElement(newElm, oldElm, noRemove) {
      const ast = oldElm[endMarker$];
      if (ast !== undefined) {
        Dom.removeInserts(oldElm);
        Dom.remove(ast);
      }

      oldElm.parentNode && oldElm.parentNode.replaceChild(newElm, oldElm);
      return this;
    },

  });

  return Dom;
});
