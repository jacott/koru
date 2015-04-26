define(function(require, exports, module) {
  var util = require('../util');
  var Dom = require('../dom');

  return exports = {
    _init: function(ctx, glassPane) {
      window.addEventListener('keydown', callback, true);
      window.addEventListener('mousedown', callback, true);
      ctx.onDestroy(function () {
        window.removeEventListener('keydown', callback, true);
        window.removeEventListener('mousedown', callback, true);
      });

      var popup = glassPane.firstChild;

      function callback(event) {
        if (event) {
          if (event.type === 'mousedown') {
            if (Dom.contains(popup, event.target)) return;
          } else if (event.which !== 9 && event.which !== 27) {
            return;
          }
        }

        Dom.remove(glassPane);
      }
    },

    appendBelow: function (glassPane, origin) {
      var ctx = Dom.getMyCtx(glassPane);
      exports._init(ctx, glassPane);
      var popup = glassPane.firstChild;
      var ps = popup.style;
      var bbox = origin.getBoundingClientRect();
      ps.top = (bbox.top + bbox.height) + 'px';
      ps.left = bbox.left + 'px';
      document.body.appendChild(glassPane);
      var ppos = popup.getBoundingClientRect();
      var height = window.innerHeight;
      if (ppos.bottom > height) {
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
