define(function(require, exports, module) {
  var util = require('../util');
  var Dom = require('../dom');

  var topModal = null;

  function keydownCallback(event) {
    if (event.which !== 9 && event.which !== 27) {
      topModal.keydownHandler && topModal.keydownHandler(event, topModal);
      return;
    }

    event.stopImmediatePropagation();
    if (event.which !==9) event.preventDefault();
    Dom.remove(topModal.container);
  }

  return exports = {
    _init: function(ctx, container, keydownHandler) {
      if (topModal == null)
        document.addEventListener('keydown', keydownCallback, true);
      var mymodal = topModal = {ctx: ctx, container: container, keydownHandler: keydownHandler, prev: topModal};
      container.addEventListener('mousedown', callback, true);
      ctx.onDestroy(function () {
        container.removeEventListener('mousedown', callback, true);
        if (mymodal === topModal) {
          topModal = topModal.prev;
          if (topModal == null)
            document.removeEventListener('keydown', keydownCallback, true);
        } else for(var last = topModal, curr = topModal.prev;
                 curr; last = curr, curr = curr.prev) {
          if (mymodal === curr) {
            last.prev = curr.prev;
          }
        }
      });

      var popup = container.firstChild;

      function callback(event) {
        if (Dom.contains(popup, event.target)) return;
        Dom.remove(container);
      }
    },

    appendAbove: function (container, origin, popup) {
      return this.append('above', container, origin, popup);
    },

    appendBelow: function (container, origin, popup) {
      return this.append('below', container, origin, popup);
    },

    append: function (pos, container, origin, popup) {
      var height = window.innerHeight;
      var isNested = ! popup || typeof popup === 'function';
      if (isNested) {
        var keydownHandler = popup;
        popup = container.firstChild;
      } else {
        container = popup;
      }
      if (isNested) {
        var ctx = Dom.getMyCtx(container);
        exports._init(ctx, container, keydownHandler);
      }

      var ps = popup.style;
      var bbox = origin.getBoundingClientRect();
      ps.left = bbox.left + 'px';
      if (pos === 'above') {
        ps.bottom = (height - bbox.top) + 'px';
      } else {
        ps.top = (bbox.top + bbox.height) + 'px';
      }
      document.body.appendChild(container);
      var ppos = popup.getBoundingClientRect();
      if (pos === 'above') {
        if (ppos.top < 0) {
          ps.bottom = '';
          if (ppos.height + bbox.top + bbox.height > height) {
            ps.top = '0';
          } else {
            ps.top = (bbox.top + bbox.height) + 'px';
          }
        }
      } else if (ppos.bottom > height) {
        if (ppos.height >= bbox.top) {
          ps.top = '0';
        } else {
          ps.bottom = (height - bbox.top) + 'px';
          ps.top = '';
        }
      }
      var width = window.innerWidth;
      if (ppos.right > width) {
        ps.right = '0';
        ps.left = '';
      }

    },
  };
});
