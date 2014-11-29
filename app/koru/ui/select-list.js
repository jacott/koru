define(function(require, exports, module) {
  var Dom = require('../dom');
  var Form = require('./form');

  var $ = Dom.current;

  Dom.Form.SelectList = {
    attach: function (template, options) {
      var list = template.List;
      template.$events({
        'focus': openList,
        'mousedown': openList,
      });

      var events = {};

      events['click ' + (options.selector || 'li')] = actionItem(options.onChoose);
      list.$events(events);

      events = null;

      var ctx, button;

      function openList(event) {
        ctx = $.ctx;

        if (ctx.listElm) {
          if (event.type === 'mousedown' && !Dom.parentOf(ctx.listElm, event.target))
            Dom.remove(ctx.listElm);
        } else {
          button = this;
          button.appendChild(ctx.listElm = list.$autoRender());
          var listCtx = Dom.getCtx(ctx.listElm);
          button.addEventListener('keydown', callback, true);
          document.addEventListener('mousedown', callback, true);
          listCtx.onDestroy(function () {
            ctx.listElm = null;
            button.removeEventListener('keydown', callback, true);
            document.removeEventListener('mousedown', callback, true);
          });
        }
      }

      function callback(event) {
        if (event) {
          if (event.type === 'mousedown') {
            if (Dom.parentOf(button, event.target)) return;
          } else if (event.which !== 9 && event.which !== 27) {
            return;
          }
        }

        Dom.remove(ctx.listElm);
      }

      function actionItem(func) {
        return function (event) {
          if (Dom.hasClass(this, 'disabled')) return;
          Dom.stopEvent();
          if (func(this, event) !== false)
            Dom.remove(ctx.listElm);
        };
      }
    },
  };

  return Dom.Form.SelectList;
});
