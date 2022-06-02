define((require) => {
  'use strict';
  const koru            = require('koru');
  const Html            = require('koru/dom/html');
  const util            = require('koru/util');

  const Dom = (cssQuery, parent=document.body) => parent.querySelector(cssQuery);

  const hasClass = (elm, name) => elm?.classList === void 0 ? false : elm.classList.contains(name);
  const addClass = (elm, name) => {elm?.classList.add(name)};
  const removeClass = (elm, name) => {elm?.classList.remove(name)};

  Object.assign(Dom, Html);

  util.merge(Dom, {
    hasClass, addClass, removeClass,

    addClasses: (elm, name) => {
      if (elm != null) {
        const {classList} = elm;
        if (classList === void 0) return;
        for (let i = name.length - 1; i >= 0; --i)
          classList.add(name[i]);
      }
    },

    toggleClass: (elm, name) => {
      if (elm != null) {
        const {classList} = elm;
        return classList.contains(name)
          ? (classList.remove(name), false)
          : (classList.add(name), true);
      }
    },

    nodeIndex: (node) => {
      let i = 0;
      if (node.nextSibling === null) {
        return node.parentNode.childNodes.length - 1;
      }
      while ((node = node.previousSibling) !== null) i++;
      return i;
    },

    walkNode: (node, visitor) => {
      const childNodes = node.childNodes;
      const len = childNodes.length;

      for (let i = 0; i < len; ++i) {
        const elm = childNodes[i];
        switch (visitor(elm, i)) {
        case true: return true;
        case false: continue;
        default:
          if (Dom.walkNode(elm, visitor)) {
            return true;
          }
        }
      }
    },

    handleException: (ex) => {
      if (! (koru.globalErrorCatch && koru.globalErrorCatch(ex))) {
        koru.unhandledException(ex);
      }
    },

    makeMenustartCallback: (callback) => {
      let pointerdown = false;
      return (event) => {
        if (event.type === 'pointerdown') {
          if (event.pointerType !== 'touch') {
            pointerdown = false;
            callback(event, 'menustart');
          } else {
            pointerdown = true;
          }
        } else if (event.pointerType !== 'touch' || pointerdown) {
          pointerdown = false;
          callback(event, 'menustart');
        } else {
          pointerdown = false;
        }
      };
    },
  });

  return Dom;
});
