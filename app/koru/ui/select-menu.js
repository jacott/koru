define((require, exports, module)=>{
  'use strict';
  const Dom             = require('koru/dom');
  const Each            = require('koru/ui/each');
  const ListSelector    = require('koru/ui/list-selector');
  const Modal           = require('koru/ui/modal');
  const util            = require('koru/util');

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

  const searchRegExp = value => new RegExp(
    ".*"+util.regexEscape(value||"").replace(/\s+/g, '.*') + ".*", "i");

  Tpl.$extend({
    popup(elm, options, pos) {
      const elmCtx = Dom.ctx(elm);
      const menu = Tpl.$autoRender(options);
      const ctx = Dom.myCtx(menu);
      ListSelector.attach({
        ul: menu.querySelector('ul.ui-ul'),
        ctx,
        keydownElm: document,
        onClick: (elm, event)=>{select(ctx, elm, event)},
      });
      options.rendered && options.rendered(menu.firstElementChild);
      elmCtx && Dom.destroyMeWith(menu, elmCtx);
      ctx.focusElm = document.activeElement;
      ctx.focusRange = Dom.getRange();

      Modal.append(pos, {
        align: options.align,
        container: menu,
        boundingClientRect: options.boundingClientRect || elm.getBoundingClientRect(),
      });
      Dom.dontFocus || options.noFocus || Dom.focus(menu.firstChild);
      return menu.firstChild;
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
      if (elm.nodeType === document.ELEMENT_NODE)
        Dom.myCtx(elm).updateAllTags();
      else
        return Tpl.List.$autoRender(this);
    },
    search() {
      if ($.element.nodeType !== document.ELEMENT_NODE && this.search)
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

      const li = elm.parentNode;

      if (this.parent !== void 0) {
        const {parent} = this;
        for (let key in parent) {
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
      if (this.icon !== void 0) {
        li.setAttribute('icon', this.icon);
      }

      const id = this.id !== void 0 ? this.id : this._id;
      if (selected !== void 0 && selected[id])
        elm.parentNode.classList.add('selected');
      decorator !== void 0 && decorator(this, elm);
      return this.name;
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
