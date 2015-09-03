define(function(require, exports, module) {
  var Dom = require('../dom');
  var Form = require('./form');
  var Modal = require('./modal');

  var Tpl = Dom.newTemplate(require('../html!./dialog'));
  var $ = Dom.current;

  Tpl.$extend({
    isOpen: function () {
      return document.getElementsByClassName('Dialog').length !== 0;
    },

    open: function (content, nofocus) {
      var elm = Tpl.$autoRender({content: content});
      document.body.appendChild(elm);
      modalize(Dom.getMyCtx(elm), elm);

      if (! nofocus) {
        var focus = elm.querySelector(Dom.FOCUS_SELECTOR);
        focus && focus.focus();
      }
    },

    close: function (elm) {
      if (elm) {
        if (typeof elm === 'string')
          elm = document.getElementById(elm);
        Dom.remove(Dom.getClosestClass(elm, 'Dialog'));
        return;
      }

      var dialogs = document.getElementsByClassName('Dialog');
      if (dialogs.length > 0) Dom.remove(dialogs[dialogs.length - 1]);
    },

    closeAll: function () {
      var dialogs = document.getElementsByClassName('Dialog');
      while (dialogs.length !== 0) {
        var len = dialogs.length;
        Dom.remove(dialogs[len - 1]);
        if (dialogs.length === len) break; // I think this is needed for some versions of IE
      }
    },

    confirm: function (data) {
      var elm = Tpl.Confirm.$autoRender(data);
      document.body.appendChild(elm);
      if (! data.nofocus) {
        var focus = elm.querySelector(Dom.FOCUS_SELECTOR);
        focus && focus.focus();
      }
    },
  });

  Tpl.$helpers({
    content: function () {
      var content = this.content;

      if (Dom.hasClass(content, 'dialogContainer'))
        return content;

      var dc = document.createElement('div');
      dc.className = 'dialogContainer';

      if (Dom.hasClass(content, 'ui-dialog')) {
        dc.appendChild(content);
        return dc;
      }

      var dialog = document.createElement('div');
      dialog.className = 'ui-dialog';

      dc.appendChild(dialog);
      dialog.appendChild(content);

      return dc;
    },
  });

  Tpl.Confirm.$helpers({
    classes: function () {
      $.element.setAttribute('class', 'ui-dialog '+ (this.classes || ''));
    },

    content: function () {
      var content = this.content;
      if (typeof content === 'string')
        return Dom.html(content);
      else
        return content.$autoRender(this.data || this);
    },
  });

  Tpl.Confirm.$events({
    'click button': function (event) {
      var data = $.ctx.data;
      data.callback && data.callback.call(data, this.name === 'okay', event.currentTarget);
      Dom.remove(event.currentTarget);
    },
  });

  Tpl.Confirm.$extend({
    $created: modalize,
  });

  function modalize(ctx, elm) {
    Modal.init({ctx: ctx, container: elm,
      popup: elm.firstElementChild.firstElementChild,
      ignoreTab: true,
    });
  }
  return Tpl;
});
