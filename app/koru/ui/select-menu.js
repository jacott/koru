define(function(require, exports, module) {
  var util = require('../util');
  var Dom = require('../dom');
  var Modal = require('./modal');
  require('./each');

  var Tpl = Dom.newTemplate(module, require('koru/html!./select-menu'));
  var $ = Dom.current;

  function keydownHandler(event, details) {
    switch(event.which) {
    case 13: // enter
      var sel = details.container.getElementsByClassName('selected')[0];
      if (sel && ! Dom.hasClass(sel, 'hide')) select(details.ctx, sel, event);
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
      var mElm = details.container.firstChild;
      var curr = mElm.getElementsByClassName('selected')[0];
      for (var nSel = firstElm(); nSel; nextElm()) {
        if (Dom.hasClass(nSel, 'hide')) continue;
        Dom.removeClass(curr, 'selected');
        Dom.addClass(nSel, 'selected');
        Dom.isInView(nSel, mElm) ||
          nSel.scrollIntoView(event.which === 38);
        break;
      }
      break;
    default:
      return; // don't stop event
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  Tpl.$extend({
    popup: function (elm, options, pos) {
      var menu = Tpl.$autoRender(options);
      options.rendered && options.rendered(menu.firstElementChild);
      var ctx = Dom.getMyCtx(menu);
      ctx.focusElm = document.activeElement;
      ctx.focusRange = Dom.getRange();

      Modal.append(pos, {
        container: menu,
        boundingClientRect: options.boundingClientRect || elm.getBoundingClientRect(),
        keydownHandler: keydownHandler,
      });
      Dom.focus(menu);
      return menu.firstChild;
    },

    close: function (ctx, elm) {
      var menu = document.getElementsByClassName('glassPane');
      if (! menu.length) return;
      menu = menu[menu.length - 1];
      menu && Dom.remove(menu);
      return menu;
    },

    nameSearch: function (regexp, line) {
      return regexp.test(line.name);
    },

    $created: function (ctx) {
      var selected = ctx.data.selected;
      if (selected != null) {
        if (typeof selected === 'object')
          ctx.selected = Array.isArray(selected) ? util.toMap(selected) : selected;
        else {
          ctx.selected = {};
          ctx.selected[selected] = true;
        }
      }
    },

    $destroyed: function (ctx) {
      var elm = ctx.focusElm;
      elm && elm.focus();
      var range = ctx.focusRange;
      range && Dom.setRange(range);
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
        callback(Array.isArray(row) ? {id: row[0], name: row[1]} : row);
      });
    },
  });

  Tpl.List.Item.$helpers({
    name: function () {
      var selected = Tpl.$ctx().selected;

      if (selected && selected[this.id || this._id])
        Dom.addClass($.element.parentNode, 'selected');
      return this.name;
    },
  });

  Tpl.List.$events({
    'mousedown': function () {
      Dom.stopEvent();
    },
    'click li': function (event) {
      Dom.stopEvent();

      Dom.hasClass(this, 'disabled') ||
        select($.ctx.parentCtx, this, event);
    },
  });

  Tpl.Search.$events({
    'input input': function (event) {
      Dom.stopEvent();
      var options = $.ctx.data;
      var func = options.search;
      var searchRe = searchRegExp(this.value);
      util.forEach(event.currentTarget.parentNode.getElementsByTagName('li'), function (li) {
        Dom.setClass('hide', ! func(searchRe, $.data(li)), li);
      });
      options.searchDone && options.searchDone(this, event.currentTarget.parentNode);
    },
  });

  function select(ctx, elm, event) {
    var data = ctx.data;
    var activeElement = document.activeElement;
    if (data.onSelect(elm, event)) {
      if (activeElement !== document.activeElement) {
        ctx.focusRange = ctx.focusElm = null;
      }

      Dom.remove(ctx.element());
    }
  }

  return Tpl;
});
