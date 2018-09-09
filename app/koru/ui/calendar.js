define((require, exports, module)=>{
  const Dom             = require('../dom');
  const util            = require('../util');
  const Modal           = require('./modal');

  const Tpl = Dom.newTemplate(module, require('koru/html!./calendar'));
  const $ = Dom.current;

  const MONTH_NAMES = [
    'January','February','March','April','May','June','July',
    'August','September','October','November','December'
  ];
  const DAY = 24*60*60*1000;
  const TR = Dom.h({tr: ''});
  const TD = Dom.h({td: ''});
  const MCLASS = ['previous', 'current', 'next'];

  Tpl.$helpers({
    monthName() {
      return MONTH_NAMES[this.getMonth()];
    },

    dates() {
      const today = util.newDate();
      const som = new Date(Date.UTC(this.getFullYear(), this.getMonth(), 1));
      let day = (som.getUTCDay() + 6) % 7;
      let sd = +som - day*DAY;
      const eom = new Date(Date.UTC(this.getFullYear(), this.getMonth()+1, 1) - DAY);
      day = (7 - eom.getUTCDay()) % 7;
      const ed = +eom + day*DAY;

      let prevm = new Date(sd).getUTCMonth();
      let pd = prevm === this.getMonth() ? 0 : -1;

      const frag = document.createDocumentFragment();
      let tr = TR.cloneNode();

      const dom = this.getDate();

      for (; sd-9000 < ed; sd += DAY) { // 9000 is a fudge factor
        const c = new Date(sd);
        const cDom = c.getUTCDate();
        const currm = c.getUTCMonth();
        if (currm !== prevm) {
          ++pd; prevm = currm;
        }

        const td = TD.cloneNode();
        Dom.addClass(td, MCLASS[pd+1]);
        if (today.getDate() === cDom &&
            today.getMonth() === c.getUTCMonth() &&
            today.getFullYear() === c.getUTCFullYear())
          Dom.addClass(td, 'today');

        pd === 0 && dom === cDom && Dom.addClass(td, 'select');
        td.textContent = c.getUTCDate();
        tr.appendChild(td);
        if (c.getUTCDay() === 0) {
          frag.appendChild(tr);
          tr = TR.cloneNode();
        }
      }

      return frag;
    },
  });

  Tpl.$events({
    'click [name=previous],[name=next]'(event) {
      Dom.stopEvent();
      const date = $.ctx.data;
      const delta = this.getAttribute('name') === 'next' ? 1 : -1;
      const expM = new Date(date.getFullYear(), date.getMonth() + delta, 1);
      let nd;
      for (let i = 0; i < 4; ++i) {
        nd = new Date(expM.getFullYear(), expM.getMonth(), date.getDate() - i);
        if (nd.getMonth() === expM.getMonth()) break;
      }
      $.ctx.updateAllTags(nd);
    },

    'pointerdown'(event) {
      Dom.stopEvent();
    },

    'click :not(.dow)>td': selectDate,
  });

  function selectDate(event) {
    Dom.stopEvent();

    const day = +this.textContent;
    let date = $.ctx.data;
    const offset = Dom.hasClass(this, 'previous') ? -1 : Dom.hasClass(this, 'next') ? 1 : 0;

    date = new Date(Date.UTC(date.getFullYear(), date.getMonth() + offset, day));

    const input = $.ctx._input;
    const newDate = util.dateInputFormat(date);
    if (input.value !== newDate) {
      input.value = newDate;
      Dom.triggerEvent(input, 'change');
    }

    Dom.remove(event.currentTarget);
  }

  Tpl.$extend({
    register(template, css, options) {
      if (css)
        css = ' '+css;
      else
        css = '';
      template.$event('click'+css, open);
      template.$event('focusin'+css, open);
      template.$event('focusout'+css, function (event) {
        Dom.remove(Dom.ctx(this)._koruCalendar);
      });
      template.$event('keyup'+css, function (event) {
        if (event.which !== 27) return;
        const ctx = Dom.myCtx(this);
        if (! (ctx && ctx._koruCalendar)) return;
        Dom.remove(ctx._koruCalendar);
        Dom.stopEvent();
      });

      template.$event('keydown'+css, function (event) {
        let value = 0;
        switch(event.which) {
        case 27:
          Dom.stopEvent();
          return;
        case 38:
          value = -DAY;
          break;
        case 40:
          value = DAY;
          break;
        default:
          return;
        }
        const ctx = Dom.myCtx(this);
        if (ctx && ctx._koruCalendar) {
          Dom.stopEvent();
          const calCtx = Dom.ctx(ctx._koruCalendar);
          const date = new Date(+calCtx.data + value);

          this.value = util.dateInputFormat(date);
          calCtx.updateAllTags(date);
        }
      });

      function open(event) {
        const ctx = Dom.myCtx(this) || Dom.setCtx(this);
        Dom.remove(ctx._koruCalendar);

        let date = Date.parse(this.value);

        if (date !== date) date = util.dateNow();
        date = new Date(date);
        const popup = Tpl.$autoRender(date);
        ctx._koruCalendar = popup;
        ctx.onDestroy(()=>{Dom.remove(ctx._koruCalendar)});
        const cCtx = Dom.myCtx(popup);
        cCtx._input = this;

        cCtx.onDestroy(()=>{ctx._koruCalendar = null});

        options && options.customize && options.customize(popup, this);

        document.body.appendChild(popup);
        Modal.reposition('below', {origin: this, popup});
      }
    },
  });

  return Tpl;
});
