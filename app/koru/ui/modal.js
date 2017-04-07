define(function(require, exports, module) {
  const Dom  = require('../dom');
  const util = require('../util');

  let topModal = null;

  function keydownCallback(event) {
    switch(event.which) {
    case 9:
      if (topModal.handleTab) {
        if (event.shiftKey) {
          if (Dom.hasClass(event.target, 'startTab')) {
            event.target.parentNode.getElementsByClassName('endTab')[0].focus();
          }
        } else if (Dom.hasClass(event.target, 'endTab')) {
          event.target.parentNode.getElementsByClassName('startTab')[0].focus();
        }
      } else {
        event.stopImmediatePropagation();
        const focus = topModal.focus;
        Dom.remove(topModal.container);
        focus.focus();
        return;
      }
      break;
    case 27:
      if (! topModal.ignoreEscape) {
        Dom.stopEvent(event);
        Dom.remove(topModal.container);
        return;
      }
      break;
    }

    if (topModal.keydownHandler)
      topModal.keydownHandler(event, topModal);
    else if (! Dom.contains(topModal.container, event.target)) {
      Dom.stopEvent(event);
    }
  }

  function retKeydownCallback(event) {
    if (event.which !==9) {
      event.stopImmediatePropagation();
    }
  }

  return exports = {
    init(options) {
      if (topModal == null) {
        document.addEventListener('keydown', keydownCallback, true);
        document.addEventListener('keydown', retKeydownCallback);
      }
      options = util.merge({}, options);
      options.prev = topModal; topModal = options;

      if (! options.focus) options.focus = document.activeElement;
      if (! options.ctx) options.ctx = Dom.myCtx(options.container);
      if (! options.popup) {
        options.popup = options.container.firstElementChild;
        if (options.popup.tagName === 'SPAN')
          options.popup = options.popup.nextElementSibling;
      }
      options.container.addEventListener('pointerdown', callback, true);
      options.container.addEventListener('touchstart', callback, true);
      options.ctx.onDestroy(function () {
        options.container.removeEventListener('pointerdown', callback, true);
        options.container.removeEventListener('touchstart', callback, true);
        if (options === topModal) {
          topModal = topModal.prev;
          if (topModal == null) {
            document.removeEventListener('keydown', keydownCallback, true);
            document.removeEventListener('keydown', retKeydownCallback);
          }
        } else for(let last = topModal, curr = topModal && topModal.prev;
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

    appendAbove(options) {
      return this.append('above', options);
    },

    appendBelow(options) {
      return this.append('below', options);
    },

    reposition(pos, options) {
      pos = pos || 'below';
      const height = window.innerHeight;
      const ps = options.popup.style;
      const bbox = options.boundingClientRect || options.origin.getBoundingClientRect();
      ps.left = bbox.left + 'px';
      switch (pos) {
      case 'above':
        ps.top = '';
        ps.bottom = (height - bbox.top) + 'px';
        break;
      case 'below':
        ps.bottom = '';
        ps.top = (bbox.top + bbox.height) + 'px';
        break;
      case 'on':
        ps.bottom = '';
        ps.top = bbox.top + 'px';
      }
      const ppos = options.popup.getBoundingClientRect();
      switch (pos) {
      case 'above':
        if (ppos.top < 0) {
          ps.bottom = '';
          if (ppos.height + bbox.top + bbox.height > height) {
            ps.top = '0';
          } else {
            ps.top = (bbox.top + bbox.height) + 'px';
          }
        }
        break;
      case 'below':
        if (ppos.bottom > height) {
          if (ppos.height >= bbox.top) {
            ps.top = '0';
          } else {
            ps.bottom = (height - bbox.top) + 'px';
            ps.top = '';
          }
        }
      }
      if (pos !== 'on') {
        const width = window.innerWidth;
        if (ppos.right > width) {
          ps.right = '0';
          ps.left = '';
        }
      }
      return options;
    },

    append(pos, options) {
      options.noAppend || document.body.appendChild(options.container || options.popup);

      if (options.popup) {
        options = util.merge({container: options.popup}, options);
      } else {
        options = exports.init(options);
      }

      const destroyMeWith = options.destroyMeWith;
      if (destroyMeWith) {
        const me = options.container;
        const meCtx = Dom.myCtx(me);
        meCtx && Dom.destroyMeWith(me, Dom.ctx(destroyMeWith) || destroyMeWith);
      }
      return this.reposition(pos, options);
    },

    get topModal() {return topModal},
  };
});
