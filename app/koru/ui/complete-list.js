define((require)=>{
  'use strict';
  const Dom             = require('../dom');
  const util            = require('../util');
  const Form            = require('./form');

  const Tpl = Dom.newTemplate(require('../html!./complete-list'));
  const $ = Dom.current;

  const {Row} = Tpl;
  let v;

  const keydown = (event)=>{
    const cur = v.completeList.querySelector('.complete>.selected');

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
  };

  const select = (li)=>{
    if (li) {
      const data = $.data(li);
      if (v.callback)
        v.callback(data);
      else
        v.input.value = data.name;
      close();
    }
  };

  const highlight = (curElm, newElm)=>{
    Dom.removeClass(curElm, 'selected');
    Dom.addClass(newElm, 'selected');

  };

  const close = ()=>{
    Dom.remove(v && v.completeList);
  };

  Tpl.$extend({
    $created(ctx, elm) {
      util.forEach(ctx.data, row =>{elm.appendChild(Row.$render(row))});
      Dom.addClass(elm.firstChild, 'selected');
    },
    $destroyed() {
      v.input.removeEventListener('blur', close);
      v.input.removeEventListener('keydown', keydown, true);
      v = undefined;
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
      const elm = v.input;
      document.body.appendChild(v.completeList);
      Dom.reposition('below', {origin: elm, popup: v.completeList});
      options.noBlur || elm.addEventListener('blur', close);
      elm.addEventListener('keydown', keydown, true);
    },
  });

  Tpl.$events({
    'pointerdown li'(event) {select(this)},
  });

  return Tpl;
});
