define((require) => {
  'use strict';
  const util            = require('koru/util');
  const Dom             = require('./dom-client');

  const empty = {};

  Dom.selectRange = (row, event=empty, selectClass='selected') => {
    const parent = row.parentNode;
    const selected = parent.getElementsByClassName(selectClass);

    if (Dom.ctrlOrMeta(event)) {
      Dom.toggleClass(row, selectClass);
    } else if (event.shiftKey) {
      let elm = row.nextSibling;
      while (elm !== null && ! Dom.hasClass(elm, selectClass)) {
        elm = elm.nextSibling;
      }

      if (elm !== null) for (elm = elm.previousSibling; elm !== row; elm = elm.previousSibling) {
        Dom.addClass(elm, selectClass);
      }
      elm = row.previousSibling;
      while (elm !== null && ! Dom.hasClass(elm, selectClass)) {
        elm = elm.previousSibling;
      }

      if (elm !== null) for (elm = elm.nextSibling; elm !== row; elm = elm.nextSibling) {
        Dom.addClass(elm, selectClass);
      }
      Dom.addClass(row, selectClass);
    } else {
      const on = ! Dom.hasClass(row, selectClass);
      while (selected.length) {
        Dom.removeClass(selected[0], selectClass);
      }
      Dom.setClass(selectClass, on, row);
    }

    row = (Dom.hasClass(row, selectClass) ? row : selected[0]);

    return selected;
  };

  return Dom;
});
