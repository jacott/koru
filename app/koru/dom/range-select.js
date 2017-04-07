define(function(require, exports, module) {
  const util = require('koru/util');
  const Dom  = require('./dom-client');

  const empty = {};

  Dom.selectRange = function (row, event, selectClass) {
    selectClass = selectClass || 'selected';
    event = event || empty;
    const parent = row.parentNode;
    const selected = parent.getElementsByClassName(selectClass);

    if (event.ctrlKey) {
      Dom.toggleClass(row, selectClass);
    } else if (event.shiftKey) {
      let elm = row.nextSibling;
      while(elm && ! Dom.hasClass(elm, selectClass))
        elm = elm.nextSibling;

      if (elm) for(elm = elm.previousSibling;elm !== row; elm = elm.previousSibling) {
        Dom.addClass(elm, selectClass);
      }
      elm = row.previousSibling;
      while(elm && ! Dom.hasClass(elm, selectClass))
        elm = elm.previousSibling;

      if (elm) for(elm = elm.nextSibling;elm !== row; elm = elm.nextSibling) {
        Dom.addClass(elm, selectClass);
      }
      Dom.addClass(row, selectClass);
    } else {
      const on = ! Dom.hasClass(row, selectClass);
      while(selected.length) {
        Dom.removeClass(selected[0], selectClass);
      }
      Dom.setClass(selectClass, on, row);
    }

    row = (Dom.hasClass(row, selectClass) ? row : selected[0]);

    return selected;
  };

  return Dom;
});
