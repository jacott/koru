var $ = Koru.current;
var Form = Koru.Form;
var Tpl = Form.ButtonMenu;
var Button = Tpl.Button;


var IGNORE = {data: true, list: true};

Tpl.$helpers({
  attrs: function () {
    var elm = $.element;
    var data = this;

    for(var attr in data) {
      if (! (attr in IGNORE))
        elm.setAttribute(attr, data[attr]);
    }

    Koru.addClass(elm, 'buttonMenu');
  },
});

Tpl.$events({
  'click [name=dropMenu]': openList,
});

Tpl.$extend({
  $destroyed: function (ctx) {
    Koru.remove(ctx.listElm);
  },
});

Koru.registerHelpers({
  buttonMenu: function (options) {
    var list = (Koru.lookupTemplate.call($.ctx.template, options.list) ||
                Koru.lookupTemplate(options.list))
          .$render(options.data||{});

    var menu =  Tpl.$autoRender(options);
    var ctx = Koru.getCtx(menu);
    ctx.listElm = document.createElement('div');
    Koru.addClass(ctx.listElm, 'dropMenu');
    menu.insertBefore(list.firstElementChild, menu.firstElementChild);
    ctx.listElm.appendChild(list);
    ctx.onDestroy(function () {
      Koru.remove(ctx.listElm);
      ctx.listElm = null;
      ctx.hideMenu && ctx.hideMenu();
    });
    return menu;
  },
});

function openList(event) {
  var ctx = $.ctx;
  var menu = event.currentTarget;

  if (ctx.listElm.parentNode === menu) {
    ctx.hideMenu();
  } else {
    menu.appendChild(ctx.listElm);
    var callback = function (event) {
      if (event.type === 'mousedown' && Koru.parentOf(menu, event.target)) return;
      ctx.hideMenu();
    };
    document.addEventListener('mousedown', callback, true);

    ctx.hideMenu = function () {
      ctx.hideMenu = null;
      ctx.listElm && ctx.listElm.parentNode === menu && menu.removeChild(ctx.listElm);
      document.removeEventListener('mousedown', callback, true);
    };
  }
}
