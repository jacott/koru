define(function(require, exports, module) {
  var util = require('../util');
  var Dom = require('../dom');
  var Modal = require('./modal');

  var Tpl = Dom.newTemplate(module, require('koru/html!./select-menu'));
  var $ = Dom.current;

  Tpl.$extend({
    popup: function (elm, options) {
      Dom.removeId('GlassPane');
      Modal.appendBelow(Tpl.$autoRender(options), elm);
    },

    close: function (ctx, elm) {
      var menu = document.getElementById('GlassPane');
      menu && Dom.remove(menu);
      return menu;
    },

    $destroyed: function (ctx) {
      ctx.data.onClose && ctx.data.onClose();
    },
  });

  Tpl.$helpers({
    content: function () {
      var elm = $.element;
      if (elm.nodeType === document.DOCUMENT_NODE)
        Dom.getMyCtx(elm).updateAllTags();
      else
        return Tpl.List.$autoRender(this);
    },
  });

  Tpl.List.$helpers({
    items: function (callback) {
      util.forEach(this.list, function (row) {
        callback({id: row[0], name: row[1]});
      });
    },
  });

  Tpl.List.$events({
    'click li': function (event) {
      Dom.stopEvent();

      Dom.hasClass(this, 'disabled') ||
        select($.ctx, this, event);
    },
  });

  function select(ctx, elm, event) {
    var data = ctx.data;
    if (data.onSelect(elm, event)) {
      Dom.remove(event.currentTarget.parentNode.parentNode);
    }
  }

  return Tpl;
});
