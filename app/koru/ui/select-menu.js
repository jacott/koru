define(function(require, exports, module) {
  var util = require('../util');
  var Dom = require('../dom');
  var Modal = require('./modal');

  var Tpl = Dom.newTemplate(module, require('koru/html!./select-menu'));
  var $ = Dom.current;

  function keydownHandler(event, details) {
    Dom.stopEvent();
    switch(event.which) {
    case 13: // enter
      var sel = details[1].getElementsByClassName('selected')[0];
      if (sel && ! Dom.hasClass(sel, 'hide')) select(details[0], sel, event);
      break;
    case 38: // up
      var nextElm = function () {nSel = nSel.previousElementSibling};
      var firstElm = function () {
        if (curr)
          return curr.previousElementSibling;
        var lis = mElm.getElementsByTagName('li');
        return lis[lis.length - 1];
      };
      // fall through
    case 40: // down
      var nextElm = nextElm || function () {nSel = nSel.nextElementSibling};
      var firstElm = firstElm || function () {return curr ? curr.nextElementSibling : mElm.getElementsByTagName('li')[0]};
      var mElm = details[1];
      var curr = mElm.getElementsByClassName('selected')[0];
      for (var nSel = firstElm(); nSel; nextElm()) {
        if (Dom.hasClass(nSel, 'hide')) continue;
        Dom.addClass(nSel, 'selected');
        Dom.removeClass(curr, 'selected');
        break;
      }
    }
  }

  Tpl.$extend({
    popup: function (elm, options, pos) {
      var menu = Tpl.$autoRender(options);
      Dom.getMyCtx(menu).originElm = elm;
      Modal.append(pos, menu, elm, keydownHandler);
      Dom.focus(menu);
    },

    close: function (ctx, elm) {
      var menu = document.getElementsByClassName('glassPane');
      if (! menu.length) return;
      menu = menu[menu.length - 1];
      menu && Dom.remove(menu);
      return menu;
    },

    $destroyed: function (ctx) {
      ctx.data.onClose && ctx.data.onClose();
    },

    searchRegExp: searchRegExp,
  });

  function searchRegExp(value) {
    return new RegExp(".*"+
                      util.regexEscape(value||"").replace(/\s+/g, '.*') +
                      ".*", "i");
  }


  Tpl.$helpers({
    content: function () {
      var elm = $.element;
      if (elm.nodeType === document.DOCUMENT_NODE)
        Dom.getMyCtx(elm).updateAllTags();
      else
        return Tpl.List.$autoRender(this);
    },
    search: function () {
      if ($.element.nodeType !== document.DOCUMENT_NODE && this.search)
        return Tpl.Search.$autoRender(this);
    },
  });

  Tpl.List.$helpers({
    items: function (callback) {
      util.forEach(this.list, function (row) {
        callback({id: row[0], name: row[1]});
      });
    },
  });

  Tpl.List.Item.$helpers({
    name: function () {
      if ($.ctx.parentCtx.data.selected === this.id)
        Dom.addClass($.element.parentNode, 'selected');
      return this.name;
    },
  });

  Tpl.List.$events({
    'click li': function (event) {
      Dom.stopEvent();

      Dom.hasClass(this, 'disabled') ||
        select($.ctx.parentCtx, this, event);
    },
  });

  Tpl.Search.$events({
    'input input': function (event) {
      Dom.stopEvent();
      var func = $.ctx.data.search;
      var searchRe = searchRegExp(this.value);
      util.forEach(event.currentTarget.parentNode.getElementsByTagName('li'), function (li) {
        Dom.setClass('hide', ! func(searchRe, $.data(li)), li);
      });
    },
  });

  function select(ctx, elm, event) {
    var data = ctx.data;
    if (data.onSelect(elm, event)) {
      var elm = ctx.originElm;
      Dom.remove(ctx.element());
      elm && elm.focus();
    }
  }

  return Tpl;
});
