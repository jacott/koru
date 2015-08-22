define(function(require, exports, module) {
  var util = require('../util');
  var Dom = require('../dom');

  var topModal = null;

  function keydownCallback(event) {
    switch(event.which) {
    case 9:
      if (! topModal.ignoreTab) {
        event.stopImmediatePropagation();
        var focus = topModal.focus;
        Dom.remove(topModal.container);
        focus.focus();
        return;
      }
      break;
    case 27:
      if (! topModal.ignoreEscape) {
        event.stopImmediatePropagation();
        event.preventDefault();
        Dom.remove(topModal.container);
        return;
      }
      break;
    }

    if (topModal.keydownHandler)
      topModal.keydownHandler(event, topModal);
    else if (! Dom.contains(topModal.container, event.target)) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  }

  function retKeydownCallback(event) {
    if (event.which !==9) {
      event.stopImmediatePropagation();
    }
  }

  return exports = {
    init: function(options) {
      if (topModal == null) {
        document.addEventListener('keydown', keydownCallback, true);
        document.addEventListener('keydown', retKeydownCallback);
      }
      options = util.extend({}, options);
      options.prev = topModal; topModal = options;

      if (! options.focus) options.focus = document.activeElement;
      if (! options.ctx) options.ctx = Dom.getMyCtx(options.container);
      if (! options.popup) options.popup = options.container.firstElementChild;
      options.container.addEventListener('mousedown', callback, true);
      options.ctx.onDestroy(function () {
        options.container.removeEventListener('mousedown', callback, true);
        if (options === topModal) {
          topModal = topModal.prev;
          if (topModal == null) {
            document.removeEventListener('keydown', keydownCallback, true);
            document.removeEventListener('keydown', retKeydownCallback);
          }
        } else for(var last = topModal, curr = topModal && topModal.prev;
                 curr; last = curr, curr = curr.prev) {
          if (options === curr) {
            last.prev = curr.prev;
          }
        }
      });

      function callback(event) {
        if (Dom.contains(options.popup, event.target)) return;
        Dom.remove(options.container);
      }
      return options;
    },

    appendAbove: function (options) {
      return this.append('above', options);
    },

    appendBelow: function (options) {
      return this.append('below', options);
    },

    append: function (pos, options) {
      var height = window.innerHeight;
      var isNested = ! options.popup;
      if (isNested) {
        options = exports.init(options);
      } else {
        options = util.extend({container: options.popup}, options);
      }

      var ps = options.popup.style;
      var bbox = options.origin.getBoundingClientRect();
      ps.left = bbox.left + 'px';
      if (pos === 'above') {
        ps.bottom = (height - bbox.top) + 'px';
      } else {
        ps.top = (bbox.top + bbox.height) + 'px';
      }
      document.body.appendChild(options.container);
      var ppos = options.popup.getBoundingClientRect();
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
