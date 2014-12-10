define(function(require, exports, module) {
  var Dom = require('../dom');
  var Form = require('./form');

  var Tpl = Dom.newTemplate(require('../html!./button-menu'));
  var $ = Dom.current;

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

      Dom.addClass(elm, 'buttonMenu');
    },
  });

  Tpl.$events({
    'click [name=dropMenu]': openList,
  });

  Tpl.$extend({
    $destroyed: function (ctx) {
      Dom.remove(ctx.listElm);
      ctx.hideMenu && ctx.hideMenu();
    },
  });

  Dom.registerHelpers({
    buttonMenu: function (options) {
      var list = (Dom.lookupTemplate.call($.ctx.template, options.list) ||
                  Dom.lookupTemplate(options.list))
            .$render(options.data||{});

      var menu =  Tpl.$autoRender(options);
      var ctx = Dom.getCtx(menu);
      ctx.listElm = document.createElement('div');
      Dom.addClass(ctx.listElm, 'dropMenu');

      menu.insertBefore(list.firstChild, menu.firstElementChild);
      ctx.listElm.appendChild(list);

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
        if (event.type === 'mousedown' && Dom.contains(menu, event.target)) return;
        hideMenu();
      };
      document.addEventListener('mousedown', callback, true);

      var hideMenu = ctx.hideMenu = function () {
        ctx.hideMenu = null;
        ctx.listElm && ctx.listElm.parentNode === menu && menu.removeChild(ctx.listElm);
        document.removeEventListener('mousedown', callback, true);
      };
    }
  }

  return Tpl;
});
