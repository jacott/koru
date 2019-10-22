define((require, exports, module)=>{
  'use strict';
  const Dom             = require('../dom');
  const util            = require('../util');
  require('./each');
  const Modal           = require('./modal');

  const Tpl = Dom.newTemplate(module, require('koru/html!./select-menu'));
  const $ = Dom.current;

  const select = (ctx, elm, event)=>{
    const data = ctx.data;
    const activeElement = document.activeElement;
    if (data.onSelect(elm, event)) {
      if (activeElement !== document.activeElement) {
        ctx.focusRange = ctx.focusElm = null;
      }

      Dom.remove(ctx.element());
    }
  };

  const keydownHandler = (event, details)=>{
    let nextElm, firstElm, curr, nSel;
    switch(event.which) {
    case 13: // enter
      const sel = details.container.getElementsByClassName('selected')[0];
      if (sel !== void 0 && ! sel.classList.contains('hide'))
        select(details.ctx, sel, event);
      break;
    case 38: // up
      nextElm = ()=>{nSel = nSel.previousElementSibling};
      firstElm = ()=>{
        if (curr)
          return curr.previousElementSibling;
        const lis = mElm.getElementsByTagName('li');
        return lis[lis.length - 1];
      };
      // fall through
    case 40: // down
      if (nextElm === undefined) nextElm = ()=>{nSel = nSel.nextElementSibling};
      if (firstElm === undefined)
        firstElm = () => curr ? curr.nextElementSibling : mElm.getElementsByTagName('li')[0];
      const mElm = details.container.firstChild;
      curr = mElm.getElementsByClassName('selected')[0];
      for (nSel = firstElm(); nSel; nextElm()) {
        const cl = nSel.classList;
        if (cl.contains('hide') || cl.contains('disabled') || cl.contains('sep')) continue;
        curr !== void 0 && curr.classList.remove('selected');
        cl.add('selected');
        Dom.ensureInView(nSel);
        break;
      }
      break;
    default:
      return; // don't stop event
    }

    Dom.stopEvent(event);
  };

  const searchRegExp = value => new RegExp(
    ".*"+util.regexEscape(value||"").replace(/\s+/g, '.*') + ".*", "i");

  Tpl.$extend({
    popup(elm, options, pos) {
      const elmCtx = Dom.ctx(elm);
      const menu = Tpl.$autoRender(options);
      options.rendered && options.rendered(menu.firstElementChild);
      const ctx = Dom.myCtx(menu);
      elmCtx && Dom.destroyMeWith(menu, elmCtx);
      ctx.focusElm = document.activeElement;
      ctx.focusRange = Dom.getRange();

      Modal.append(pos, {
        align: options.align,
        container: menu,
        boundingClientRect: options.boundingClientRect || elm.getBoundingClientRect(),
        keydownHandler,
      });
      Dom.dontFocus || options.noFocus || Dom.focus(menu.firstChild);
      return menu.firstChild;
    },

    close(ctx, elm) {
      const menu = document.getElementsByClassName('glassPane');
      if (menu.length == 0) return;
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
      ctx.data.onClose && ctx.data.onClose(ctx);
      const elm = ctx.focusElm;
      Dom.dontFocus || (elm && elm.focus());
      const range = ctx.focusRange;
      range && Dom.setRange(range);
    },

    searchRegExp,
  });


  Tpl.$helpers({
    content() {
      const elm = $.element;
      if (elm.nodeType === document.DOCUMENT_NODE)
        Dom.myCtx(elm).updateAllTags();
      else
        return Tpl.List.$autoRender(this);
    },
    search() {
      if ($.element.nodeType !== document.DOCUMENT_NODE && this.search)
        return Tpl.Search.$autoRender(this);
    },
  });

  Tpl.List.$helpers({
    items() {
      const {list} = this;
      if (list !== void 0) return list.map(row =>{
        if (typeof row === 'string')
          return {parent: {class: row.indexOf(' ') === -1 ? row : row.split(' ')}};
        else
          return row;
      });
    },
  });

  Tpl.List.Item.$helpers({
    name() {
      const ctx = Tpl.$ctx();
      const elm = $.element;
      const {selected} = ctx;
      const {decorator} = ctx.data;

      const {parent} = this;
      if (parent !== void 0) {
        for (let key in parent) {
          const li = elm.parentNode;
          if (key === 'class') {
            const classes = parent.class;
            if (typeof classes === 'string')
              li.classList.add(classes);
            else
              li.classList.add(...classes);
          } else {
            li.setAttribute(key, parent[key]);
          }
        }
      }

      const id = this.id !== void 0 ? this.id : this._id;
      if (selected !== void 0 && selected[id])
        elm.parentNode.classList.add('selected');
      decorator !== void 0 && decorator(this, elm);
      return this.name;
    },
  });

  Tpl.List.$events({
    'pointerover .ui-ul>li:not(.selected):not(.disabled)'(event) {
      const curr = event.currentTarget.getElementsByClassName('selected')[0];
      curr !== void 0 && curr.classList.remove('selected');
      this.classList.add('selected');
    },

    'click .ui-ul>li:not(.disabled)'(event) {
      Dom.stopEvent();
      select($.ctx.parentCtx, this, event);
    },
  });

  Tpl.List.$extend({
    $created(ctx, elm) {
      let moved = false;
      const pu = event => {
        Dom.stopEvent(event);
        if (! moved) return;
        const li = event.target.closest('.ui-ul>li:not(.disabled)');
        if (li != null) {
          select(ctx.parentCtx, li, event);
        }
      };

      let x = 0, y  = 0;

      const pm = event =>{
        if (x == 0) {
          x = event.clientX;
          y = event.clientY;
        } else {
          let xd = x - event.clientX, yd = y - event.clientY;
          moved = (xd*xd + yd*yd > 100);
        }
      };

      elm.addEventListener('pointerup', pu, true);
      elm.addEventListener('pointermove', pm, true);
      ctx.onDestroy(()=>{
        elm.removeEventListener('pointerup', pu, true);
        elm.removeEventListener('pointermove', pm, true);
      });
    },
  });

  Tpl.Search.$events({
    'input input'(event) {
      Dom.stopEvent();
      const options = $.ctx.data;
      const func = options.search;
      const searchRe = searchRegExp(this.value);
      util.forEach(event.currentTarget.parentNode.getElementsByTagName('li'), li => {
        li.classList.toggle('hide', ! func(searchRe, $.data(li)));
      });
      options.searchDone && options.searchDone(this, event.currentTarget.parentNode);
    },
  });

  return Tpl;
});
