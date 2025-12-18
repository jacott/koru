define((require, exports, module) => {
  'use strict';
  const util            = require('koru/util');

  const {hasOwn} = util;

  return {
    inclusion(doc, field, options={}) {
      const value = doc[field];
      if (! value) {
        const {allowBlank} = options;
        if (allowBlank || (value == null && allowBlank === null)) return;
      }

      if (options.in !== undefined) {
        const list = options.in;
        if (Array.isArray(list)
          ? list.indexOf(value) === -1
          : typeof value !== 'string' || ! hasOwn(list, value)) {
          return this.addError(doc, field, 'not_in_list');
        }
      }

      if ('matches' in options && ! options['matches'].test(value)) {
        return this.addError(doc, field, 'invalid_format');
      }
    },
  };
});
