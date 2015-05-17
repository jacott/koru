define(function(require, exports, module) {
  var util = require('../util');
  var Dom = require('../dom');

  return exports = {
    _init: function(ctx, container) {
      container.addEventListener('keydown', callback, true);
      container.addEventListener('mousedown', callback, true);
      ctx.onDestroy(function () {
        container.removeEventListener('keydown', callback, true);
        container.removeEventListener('mousedown', callback, true);
      });

      var popup = container.firstChild;

      function callback(event) {
        if (event) {
          if (event.type === 'mousedown') {
            if (Dom.contains(popup, event.target)) return;
          } else if (event.which !== 9 && event.which !== 27) {
            return;
          }
        }

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
      var isNested = ! popup;
      if (isNested) {
        popup = container.firstChild;
      } else {
        container = popup;
      }
      if (isNested) {
        var ctx = Dom.getMyCtx(container);
        exports._init(ctx, container);
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
