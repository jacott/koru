define((require, exports, module)=>{
  'use strict';
  const Dom             = require('../dom');
  const Dialog          = require('./dialog');

  const Tpl = Dom.newTemplate(module, require('koru/html!./confirm-remove'));

  Tpl.$extend({
    show({
      name,
      title=name ? `Remove ${name}?` :'Are you sure?',
      okay='Remove',
      classes='warn',
      description,
      onConfirm,
    }) {
      Dialog.confirm({
        classes,
        title,
        description,
        okay,
        content: Tpl,
        onConfirm,
      });
    },
  });

  return Tpl;
});
