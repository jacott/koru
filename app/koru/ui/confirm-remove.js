define(function(require, exports, module) {
  const Dom    = require('../dom');
  const util   = require('../util');
  const Dialog = require('./dialog');

  const Tpl = module.exports = Dom.newTemplate(module, require('koru/html!./confirm-remove'));

  Tpl.$extend({
    show(name, func, opts) {
      Dialog.confirm(util.merge({
        classes: 'warn',
        okay: 'Remove',
        content: Tpl,
        name: name,
        callback(confirmed) {
          confirmed && func();
          Dialog.close();
        },
      }, opts || {}));
    },
  });
});
