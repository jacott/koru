define(function(require, exports, module) {
  const Dom    = require('../dom');
  const util   = require('../util');
  const Dialog = require('./dialog');

  const Tpl = module.exports = Dom.newTemplate(module, require('koru/html!./confirm-remove'));

  Tpl.$extend({
    show({
      name,
      title=name ? `Remove ${name}?` :'Are you sure?',
      okay='Remove',
      classes='warn',
      description,
      onConfirm,
    }) {
      Dialog.confirm(Object.assign({
        classes,
        title,
        description,
        okay,
        content: Tpl,
        callback(confirmed) {
          confirmed && onConfirm();
          Dialog.close();
        },
      }));
    },
  });
});
