var $ = Bart.current;

Bart.Form.SelectList = {
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
        if (event.type === 'mousedown') Bart.remove(ctx.listElm);
      } else {
        var button = this;
        button.appendChild(ctx.listElm = list.$autoRender());
        var listCtx = Bart.getCtx(ctx.listElm);
        var callback = function (event) {
          if (event.type === 'mousedown') {
              if (Bart.parentOf(button, event.target)) return;
          } else if (event.which !== 9 && event.which !== 27) {
            return;
          }

          Bart.remove(ctx.listElm);
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
    if (Bart.hasClass(this, 'disabled')) return;
    Bart.stopEvent();
    func(this, event);
  };
}

App.loaded('Bart.Form.SelectList', Bart.Form.SelectList);
