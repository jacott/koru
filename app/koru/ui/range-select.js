define(function(require, exports, module) {
  var util = require('koru/util');
  var Dom = require('../dom');

  var empty = {};

  Dom.selectRange = function (row, event, selectClass) {
    selectClass = selectClass || 'selected';
    event = event || empty;
    var parent = row.parentNode;
    var selected = parent.getElementsByClassName(selectClass);

    if (event.ctrlKey) {
      var on = ! Dom.hasClass(row, selectClass);
      while(selected.length) {
        Dom.removeClass(selected[0], selectClass);
      }
      Dom.setClass(selectClass, on, row);
    } else if (event.shiftKey) {
      var elm = row.nextSibling;
      while(elm && ! Dom.hasClass(elm, selectClass))
        elm = elm.nextSibling;

      if (elm) for(elm = elm.previousSibling;elm !== row; elm = elm.previousSibling) {
        Dom.addClass(elm, selectClass);
      }
      var elm = row.previousSibling;
      while(elm && ! Dom.hasClass(elm, selectClass))
        elm = elm.previousSibling;

      if (elm) for(elm = elm.nextSibling;elm !== row; elm = elm.nextSibling) {
        Dom.addClass(elm, selectClass);
      }
      Dom.addClass(row, selectClass);
    } else {
      Dom.toggleClass(row, selectClass);
    }

    row = (Dom.hasClass(row, selectClass) ? row : selected[0]);

    return selected;
  };

  return Dom;
});
