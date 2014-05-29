define(function(require, exports, module) {
  var Dom = require('../dom');
  var Form = require('./form');

  var Tpl = Dom.newTemplate(require('../html!./dialog'));
  var $ = Dom.current;

  var count = 0;

  Tpl.$extend({
    isOpen: function () {
      return count !== 0;
    },

    open: function (content) {
      document.body.appendChild(Tpl.$autoRender({content: content}));
    },

    close: function (elm) {
      if (elm) {
        if (typeof elm === 'string')
          elm = document.getElementById(elm);
        Dom.remove(Dom.getClosest(elm, '.Dialog'));
        return;
      }

      var dialogs = document.getElementsByClassName('Dialog');
      if (dialogs.length > 0) Dom.remove(dialogs[dialogs.length - 1]);
    },

    confirm: function (data) {
      document.body.appendChild(Tpl.Confirm.$autoRender(data));
    },

    $created: modalize,

    $destroyed: cancelModalize,
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
      Dom.remove(event.currentTarget);
      data.callback && data.callback.call(data, this.name === 'okay');
    },
  });

  Tpl.Confirm.$extend({
    $created: modalize,

    $destroyed: cancelModalize,
  });

  function modalize(ctx, elm) {
    ++count;
    Form.modalize(elm, function (event) {
      Dom.remove(elm);
    });
  }

  function cancelModalize() {
    --count;
    Dom.Form.cancelModalize();
  }

  return Tpl;
});
