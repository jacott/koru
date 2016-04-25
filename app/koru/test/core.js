define(function(require, exports, module) {
  var util = require('koru/util');
  var geddon = {
    _init: function () {
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

    abort: function (ex) {throw ex}
  };

  geddon._init();

  return geddon;
});
