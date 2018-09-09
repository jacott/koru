define((require)=>{
  const Dom             = require('../dom');

  let topModal = null;

  const keydownCallback = (event)=>{
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
        Dom.dontFocus || focus.focus();
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
  };

  const retKeydownCallback = (event)=>{
    if (event.which !==9) {
      event.stopImmediatePropagation();
    }
  };

  const Modal = {
    init(options) {
      options = Object.assign({container: options.container || options.popup}, options);
      options.ctx = Dom.myCtx(options.container) || Dom.myCtx(options.popup);
      if (options.ctx == null)
        throw new Error("Can't initialize modal without Ctx");
      if (topModal == null) {
        document.addEventListener('keydown', keydownCallback, true);
        document.addEventListener('keydown', retKeydownCallback);
      }
      options.prev = topModal; topModal = options;

      if (! options.focus) options.focus = document.activeElement;
      if (! options.popup) {
        options.popup = options.container.firstElementChild;
        if (options.popup.tagName === 'SPAN')
          options.popup = options.popup.nextElementSibling;
      }
      const callback = event =>{
        Dom.contains(options.popup, event.target) ||
          Dom.remove(options.container);
      };
      options.container.addEventListener('pointerdown', callback, true);
      options.container.addEventListener('touchstart', callback, true);
      options.ctx.onDestroy(()=>{
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

      return options;
    },

    appendAbove(options) {
      return this.append('above', options);
    },

    appendBelow(options) {
      return this.append('below', options);
    },

    reposition(pos='below', options) {
      const height = window.innerHeight;
      const ps = options.popup.style;
      const bbox = options.boundingClientRect || options.origin.getBoundingClientRect();
      ps.setProperty('left', bbox.left + 'px');
      switch (pos) {
      case 'above':
        ps.removeProperty('top');
        ps.setProperty('bottom', (height - bbox.top) + 'px');
        break;
      case 'below':
        ps.removeProperty('bottom');
        ps.setProperty('top', (bbox.top + bbox.height) + 'px');
        break;
      case 'on':
        ps.removeProperty('bottom');
        ps.setProperty('top', bbox.top + 'px');
      }
      const ppos = options.popup.getBoundingClientRect();
      switch (pos) {
      case 'above':
        if (ppos.top < 0) {
          ps.removeProperty('bottom');
          if (ppos.height + bbox.top + bbox.height > height) {
            ps.setProperty('top', '0');
          } else {
            ps.setProperty('top', (bbox.top + bbox.height) + 'px');
          }
        }
        break;
      case 'below':
        if (ppos.bottom > height) {
          if (ppos.height >= bbox.top) {
            ps.setProperty('top', '0');
          } else {
            ps.setProperty('bottom', (height - bbox.top) + 'px');
            ps.removeProperty('top');
          }
        }
      }
      if (pos !== 'on') {
        const width = window.innerWidth;
        if (ppos.right > width) {
          ps.setProperty('right', '0');
          ps.removeProperty('left');
        }
      }
      return options;
    },

    append(pos, options) {
      options.noAppend || document.body.appendChild(options.container || options.popup);

      options = Modal.init(options);

      const {destroyMeWith} = options;
      if (destroyMeWith != null) {
        const me = options.container;
        const meCtx = Dom.myCtx(me);
        meCtx && Dom.destroyMeWith(
          me, destroyMeWith.nodeType !== undefined ? Dom.ctx(destroyMeWith) : destroyMeWith);
      }
      return this.reposition(pos, options);
    },

    get topModal() {return topModal},
  };

  return Modal;
});
