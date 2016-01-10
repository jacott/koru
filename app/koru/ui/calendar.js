define(function(require, exports, module) {
  var Dom = require('../dom');
  var Modal = require('./modal');
  var util = require('../util');

  var Tpl = Dom.newTemplate(module, require('koru/html!./calendar'));
  var $ = Dom.current;

  var MONTH_NAMES = [
    'January','February','March','April','May','June','July','August','September','October','November','December'
  ];
  var DAY = 24*60*60*1000;
  var TR = Dom.html({tag: 'tr'});
  var TD = Dom.html({tag: 'td'});
  var MCLASS = ['previous', 'current', 'next'];

  Tpl.$helpers({
    monthName: function () {
      return MONTH_NAMES[this.getMonth()];
    },

    dates: function () {
      var today = util.newDate();
      var som = new Date(Date.UTC(this.getFullYear(), this.getMonth(), 1));
      var day = (som.getUTCDay() + 6) % 7;
      var sd = +som - day*DAY;
      var eom = new Date(Date.UTC(this.getFullYear(), this.getMonth()+1, 1) - DAY);
      day = (7 - eom.getUTCDay()) % 7;
      var ed = +eom + day*DAY;

      var prevm = new Date(sd).getUTCMonth();
      var pd = prevm === this.getMonth() ? 0 : -1;

      var frag = document.createDocumentFragment();
      var tr = TR.cloneNode();

      var dom = this.getDate();

      for (; sd-9000 < ed; sd += DAY) { // 9000 is a fudge factor
        var c = new Date(sd);
        var cDom = c.getUTCDate();
        var currm = c.getUTCMonth();
        if (currm !== prevm) {
          ++pd; prevm = currm;
        }

        var td = TD.cloneNode();
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
    'click [name=previous],[name=next]': function (event) {
      Dom.stopEvent();

      var date = $.ctx.data;
      var delta = this.getAttribute('name') === 'next' ? 1 : -1;
      var expM = new Date(date.getFullYear(), date.getMonth() + delta, 1);
      for (var i = 0; i < 4; ++i) {
        var nd = new Date(expM.getFullYear(), expM.getMonth(), date.getDate() - i);
        if (nd.getMonth() === expM.getMonth()) break;
      }
      $.ctx.updateAllTags(nd);
    },

    'mousedown': function (event) {
      Dom.stopEvent();
    },

    'click :not(.dow)>td': selectDate,
  });

  function selectDate(event) {
    Dom.stopEvent();

    var day = +this.textContent;
    var date = $.ctx.data;
    var offset = Dom.hasClass(this, 'previous') ? -1 : Dom.hasClass(this, 'next') ? 1 : 0;

    date = new Date(Date.UTC(date.getFullYear(), date.getMonth() + offset, day));

    var input = $.ctx._input;
    var newDate = util.dateInputFormat(date);
    if (input.value !== newDate) {
      input.value = newDate;
      Dom.triggerEvent(input, 'change');
    }

    Dom.remove(event.currentTarget);
  }

  Tpl.$extend({
    register: function (template, css, options) {
      if (css)
        css = ' '+css;
      else
        css = '';
      template.$event('click'+css, open);
      template.$event('focusin'+css, open);
      template.$event('focusout'+css, function (event) {
        Dom.remove(Dom.getCtx(this)._koruCalendar);
      });
      template.$event('keyup'+css, function (event) {
        if (event.which !== 27) return;
        var ctx = Dom.getMyCtx(this);
        if (! (ctx && ctx._koruCalendar)) return;
        Dom.remove(ctx._koruCalendar);
        Dom.stopEvent();
      });

      template.$event('keydown'+css, function (event) {
        switch(event.which) {
        case 27:
          Dom.stopEvent();
          return;
        case 38:
          var value = -DAY;
          break;
        case 40:
          var value = DAY;
          break;
        default:
          return;
        }
        var ctx = Dom.getMyCtx(this);
        if (! (ctx && ctx._koruCalendar)) return;
        Dom.stopEvent();
        ctx = Dom.getCtx(ctx._koruCalendar);
        var date = +ctx.data;
        date += value;
        date = new Date(date);

        this.value = util.dateInputFormat(date);
        ctx.updateAllTags(date);
      });

      function open(event) {
        var ctx = Dom.getMyCtx(this);
        if (! ctx) ctx = Dom.setCtx(this);
        Dom.remove(ctx._koruCalendar);

        var date = Date.parse(this.value);

        if (date !== date) date = util.dateNow();
        date = new Date(date);
        var popup = Tpl.$autoRender(date);
        ctx._koruCalendar = popup;
        ctx.onDestroy(function () {
          Dom.remove(ctx._koruCalendar);
        });
        var cCtx = Dom.getMyCtx(popup);
        cCtx._input = this;

        cCtx.onDestroy(function () {
          ctx._koruCalendar = null;
        });

        options && options.customize && options.customize(popup, this);

        Modal.appendBelow({container: popup, origin: this, popup: popup});
      }
    },
  });

  return Tpl;
});
