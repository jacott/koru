define(function(require, exports, module) {
  const Dom   = require('../dom');
  const util  = require('../util');
  require('./each');
  const Modal = require('./modal');

  const Tpl = module.exports = Dom.newTemplate(module, require('koru/html!./select-menu'));
  const $ = Dom.current;

  function keydownHandler(event, details) {
    let nextElm, firstElm, curr, nSel;
    switch(event.which) {
    case 13: // enter
      const sel = details.container.getElementsByClassName('selected')[0];
      if (sel && ! Dom.hasClass(sel, 'hide')) select(details.ctx, sel, event);
      break;
    case 38: // up
      nextElm = function () {nSel = nSel.previousElementSibling};
      firstElm = function () {
        if (curr)
          return curr.previousElementSibling;
        const lis = mElm.getElementsByTagName('li');
        return lis[lis.length - 1];
      };
      // fall through
    case 40: // down
      nextElm = nextElm || function () {nSel = nSel.nextElementSibling};
      firstElm = firstElm ||
        (() => curr ? curr.nextElementSibling : mElm.getElementsByTagName('li')[0]);
      const mElm = details.container.firstChild;
      curr = mElm.getElementsByClassName('selected')[0];
      for (let nSel = firstElm(); nSel; nextElm()) {
        if (Dom.hasClass(nSel, 'hide') || Dom.hasClass(nSel, 'disabled')) continue;
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

    Dom.stopEvent(event);
  }

  Tpl.$extend({
    popup(elm, options, pos) {
      const elmCtx = Dom.getCtx(elm);
      const menu = Tpl.$autoRender(options);
      options.rendered && options.rendered(menu.firstElementChild);
      const ctx = Dom.getMyCtx(menu);
      elmCtx && Dom.destroyMeWith(menu, elmCtx);
      ctx.focusElm = document.activeElement;
      ctx.focusRange = Dom.getRange();

      Modal.append(pos, {
        container: menu,
        boundingClientRect: options.boundingClientRect || elm.getBoundingClientRect(),
        keydownHandler: keydownHandler,
      });
      options.noFocus || Dom.focus(menu);
      return menu.firstChild;
    },

    close(ctx, elm) {
      const menu = document.getElementsByClassName('glassPane');
      if (! menu.length) return;
      menu = menu[menu.length - 1];
      menu && Dom.remove(menu);
      return menu;
    },

    nameSearch(regexp, line) {
      return regexp.test(line.name);
    },

    $created(ctx) {
      const selected = ctx.data.selected;
      if (selected != null) {
        if (typeof selected === 'object')
          ctx.selected = Array.isArray(selected) ? util.toMap(selected) : selected;
        else {
          ctx.selected = {};
          ctx.selected[selected] = true;
        }
      }
    },

    $destroyed(ctx) {
      const elm = ctx.focusElm;
      elm && elm.focus();
      const range = ctx.focusRange;
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
    content() {
      const elm = $.element;
      if (elm.nodeType === document.DOCUMENT_NODE)
        Dom.getMyCtx(elm).updateAllTags();
      else
        return Tpl.List.$autoRender(this);
    },
    search() {
      if ($.element.nodeType !== document.DOCUMENT_NODE && this.search)
        return Tpl.Search.$autoRender(this);
    },
  });

  Tpl.List.$helpers({
    items(callback) {
      $.ctx.parentCtx.callback = callback;
      util.forEach(this.list, function (row, index) {
        if (typeof row === 'string')
          callback({parent: {class: row.indexOf(' ') === -1 ? row : row.split(' ')}});
        else
          callback(Array.isArray(row) ? {id: row[0], name: row[1]} : row);
      });
    },
  });

  Tpl.List.Item.$helpers({
    name() {
      const ctx = Tpl.$ctx();
      const elm = $.element;
      const selected = ctx.selected;
      const decorator = ctx.data.decorator;

      const parent = this.parent;
      if (parent) {
        for (let key in parent) {
          const li = elm.parentNode;
          if (key === 'class') {
            const classes = parent.class;
            if (typeof classes === 'string')
              Dom.addClass(li, classes);
            else
              Dom.addClasses(li, classes);
          } else {
            li.setAttribute(key, parent[key]);
          }
        }
      }

      if (selected && selected[this.id || this._id])
        Dom.addClass(elm.parentNode, 'selected');
      decorator && decorator(this, elm);
      return this.name;
    },
  });

  Tpl.List.$events({
    'mousedown'() {
      Dom.stopEvent();
    },
    'click li'(event) {
      Dom.stopEvent();

      Dom.hasClass(this, 'disabled') ||
        select($.ctx.parentCtx, this, event);
    },
  });

  Tpl.Search.$events({
    'input input'(event) {
      Dom.stopEvent();
      const options = $.ctx.data;
      const func = options.search;
      const searchRe = searchRegExp(this.value);
      util.forEach(event.currentTarget.parentNode.getElementsByTagName('li'), li => {
        Dom.setClass('hide', ! func(searchRe, $.data(li)), li);
      });
      options.searchDone && options.searchDone(this, event.currentTarget.parentNode);
    },
  });

  function select(ctx, elm, event) {
    const data = ctx.data;
    const activeElement = document.activeElement;
    if (data.onSelect(elm, event)) {
      if (activeElement !== document.activeElement) {
        ctx.focusRange = ctx.focusElm = null;
      }

      Dom.remove(ctx.element());
    }
  }
});
