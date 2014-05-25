var $ = Koru.current;

Koru.Form.SelectList = {
  attach: function (template, options) {
    var list = template.List;
    template.$events({
      'focus': openList,
      'mousedown': openList,
    });

    var events = {};

    events['mousedown ' + (options.selector || 'li')] = actionItem(options.onChoose);
    list.$events(events);

    events = null;

    function openList(event) {
      var ctx = $.ctx;

      if (ctx.listElm) {
        if (event.type === 'mousedown') Koru.remove(ctx.listElm);
      } else {
        var button = this;
        button.appendChild(ctx.listElm = list.$autoRender());
        var listCtx = Koru.getCtx(ctx.listElm);
        var callback = function (event) {
          if (event.type === 'mousedown') {
              if (Koru.parentOf(button, event.target)) return;
          } else if (event.which !== 9 && event.which !== 27) {
            return;
          }

          Koru.remove(ctx.listElm);
        };
        button.addEventListener('keydown', callback, true);
        document.addEventListener('mousedown', callback, true);
        listCtx.onDestroy(function () {
          ctx.listElm = null;
          button.removeEventListener('keydown', callback, true);
          document.removeEventListener('mousedown', callback, true);
        });
      }
    }
  },
};

function actionItem(func) {
  return function (event) {
    if (Koru.hasClass(this, 'disabled')) return;
    Koru.stopEvent();
    func(this, event);
  };
}

App.loaded('Koru.Form.SelectList', Koru.Form.SelectList);
