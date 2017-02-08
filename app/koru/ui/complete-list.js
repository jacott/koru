define(function(require, exports, module) {
  var Dom = require('../dom');
  var Form = require('./form');
  var util = require('../util');
  var Modal = require('./modal');

  var Tpl = Dom.newTemplate(require('../html!./complete-list'));
  var $ = Dom.current;

  var Row = Tpl.Row;
  var v;

  Tpl.$extend({
    $created(ctx, elm) {
      util.forEach(ctx.data, function (row) {
        elm.appendChild(Row.$render(row));
      });
      Dom.addClass(elm.firstChild, 'selected');
    },
    $destroyed() {
      v.input.removeEventListener('blur', close);
      v.input.removeEventListener('keydown', keydown, true);
      v = null;
    },
  });

  Dom.Form.$extend({
    completeList(options) {
      close();
      if (! options.completeList) return;
      v = {
        input: options.input,
        completeList: Tpl.$autoRender(options.completeList),
        callback: options.callback,
      };
      var elm = v.input;
      Modal.appendBelow({origin: elm, popup: v.completeList});
      options.noBlur || elm.addEventListener('blur', close);
      elm.addEventListener('keydown', keydown, true);
    },
  });

  Tpl.$events({
    'pointerdown li'(event) {select(this)},
  });

  function keydown(event) {
    var cur = v.completeList.querySelector('.complete>.selected');

    switch (event.which) {
    case 13: // enter
      select(cur);
      break;
    case 38: // up
      highlight(cur, cur.previousSibling || v.completeList.firstChild);
      break;
    case 40: // down
      highlight(cur, cur.nextSibling || v.completeList.lastChild);
      break;
    default:
      return;
    }

    Dom.stopEvent(event);
  }

  function select(li) {
    if (li) {
      var data = $.data(li);
      if (v.callback)
        v.callback(data);
      else
        v.input.value = data.name;
      close();
    }
  }

  function highlight(curElm, newElm) {
    Dom.removeClass(curElm, 'selected');
    Dom.addClass(newElm, 'selected');

  }

  function close() {
    Dom.remove(v && v.completeList);
  }

  return Tpl;
});
