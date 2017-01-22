define(function(require, exports, module) {
  var util = require('../util');
  var Dom = require('../dom');
  var Dialog = require('./dialog');

  var Tpl = Dom.newTemplate(module, require('koru/html!./confirm-remove'));

  Tpl.$extend({
    show(name, func, opts) {
      Dialog.confirm(util.merge({
        classes: 'warn',
        okay: 'Remove',
        content: Tpl,
        name: name,
        callback: function(confirmed) {
          confirmed && func();
          Dialog.close();
        },
      }, opts || {}));
    },
  });

  return Tpl;
});
