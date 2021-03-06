define((require)=>{
  'use strict';
  const Dom             = require('../dom');
  const Form            = require('./form');
  const Modal           = require('./modal');

  const Tpl = Dom.newTemplate(require('../html!./dialog'));
  const $ = Dom.current;

  const modalize = (ctx, elm)=>{
    Modal.init({ctx: ctx, container: elm,
                popup: elm.firstElementChild.firstElementChild,
                handleTab: true,
    });
  };

  Tpl.$extend({
    isOpen() {
      return document.getElementsByClassName('Dialog').length !== 0;
    },

    open(content, nofocus) {
      const elm = Tpl.$autoRender({content: content});
      document.body.appendChild(elm);
      modalize(Dom.myCtx(elm), elm);

      Dom.dontFocus || ((! nofocus && elm.children[1].querySelector(Dom.FOCUS_SELECTOR)) ||
       elm.children[0]).focus();
    },

    close(elm) {
      if (elm) {
        if (typeof elm === 'string')
          elm = document.getElementById(elm);
        Dom.remove(elm && elm.closest('.Dialog'));
        return;
      }

      const dialogs = document.getElementsByClassName('Dialog');
      if (dialogs.length > 0) Dom.remove(dialogs[dialogs.length - 1]);
    },

    closeAll() {
      const dialogs = document.getElementsByClassName('Dialog');
      while (dialogs.length !== 0) {
        const len = dialogs.length;
        Dom.remove(dialogs[len - 1]);
        if (dialogs.length === len) break; // I think this is needed for some versions of IE
      }
    },

    confirm(data) {
      const elm = Tpl.Confirm.$autoRender(data);
      document.body.appendChild(elm);
      modalize(Dom.myCtx(elm), elm);
      if (! data.nofocus) {
        const focus = elm.querySelector(Dom.FOCUS_SELECTOR);
        Dom.dontFocus || focus && focus.focus();
      }
    },
  });

  Tpl.$helpers({
    content() {
      const {content} = this;

      if (Dom.hasClass(content, 'dialogContainer'))
        return content;

      const dc = document.createElement('div');
      dc.className = 'dialogContainer';

      if (Dom.hasClass(content, 'ui-dialog')) {
        dc.appendChild(content);
        return dc;
      }

      const dialog = document.createElement('div');
      dialog.className = 'ui-dialog';

      dc.appendChild(dialog);
      dialog.appendChild(content);

      return dc;
    },
  });

  Tpl.Confirm.$helpers({
    classes() {
      if (this.id) $.element.id = this.id;
      $.element.setAttribute('class', 'ui-dialog '+ (this.classes || ''));
    },

    content() {
      const content = this.content;
      if (content.$autoRender)
        return content.$autoRender(this.data || this);
      return Dom.h(content);
    },
  });

  Tpl.Confirm.$events({
    'click button'(event) {
      const {data} = $.ctx;
      const {onConfirm, callback} = data;
      const confirmed = this.name === 'okay';
      if (onConfirm) {
        if (confirmed)
          onConfirm.call(event.currentTarget, data);
        else
          Tpl.close(event.currentTarget);
      } else
        if (callback)
          callback.call(data, confirmed, event.currentTarget);
      Dom.remove(event.currentTarget);
    },
  });

  Tpl.Confirm.$extend({
    $created: modalize,
  });

  return Tpl;
});
