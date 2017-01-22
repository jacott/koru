define(function(require, exports, module) {
  const util = require('koru/util');

  const geddon = {
    _init() {
      this.testCount = this.skipCount = this.assertCount = 0;
    },

    _u: {
      isElement: function(elm) {
        return elm != null && typeof elm === 'object' && typeof elm.isSameNode === 'function';
      },
    },
    inspect: util.inspect,

    extractError: util.extractError,

    util: util,

    abort(ex) {throw ex}
  };

  geddon._init();

  return geddon;
});
