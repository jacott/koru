define((require)=>{
  'use strict';
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

    if (! Dom.contains(topModal.container, event.target)) {
      Dom.stopEvent(event);
    }
  };

  const retKeydownCallback = (event)=>{
    if (event.which !== 9) {
      event.stopImmediatePropagation();
    }
  };

  const Modal = {
    init: options =>{
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
        if (! Dom.contains(options.popup, event.target)) {
          Dom.stopEvent(event);
          Dom.remove(options.container);
        }
      };
      options.container.addEventListener('click', callback, true);
      options.ctx.onDestroy(()=>{
        options.container.removeEventListener('click', callback, true);
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

    appendAbove: options => Modal.append('above', options),

    appendBelow: options => Modal.append('below', options),

    append: (pos, options)=>{
      options.noAppend || document.body.appendChild(options.container || options.popup);

      options = Modal.init(options);

      const {destroyMeWith} = options;
      if (destroyMeWith != null) {
        const me = options.container;
        const meCtx = Dom.myCtx(me);
        meCtx && Dom.destroyMeWith(
          me, destroyMeWith.nodeType !== undefined ? Dom.ctx(destroyMeWith) : destroyMeWith);
      }
      Dom.reposition(pos, options);
    },

    get topModal() {return topModal},
  };

  return Modal;
});
