define((require, exports, module)=>{
  const util                    = require('koru/util');

  const {inspect, extractError} = util;

  const Core = {
    _init() {
      this.testCount = this.skipCount = this.assertCount = 0;
    },

    util: {},
    inspect,
    extractError,

    __elidePoint: undefined,
    lastText: undefined,
    test: undefined,

    abort(ex) {throw ex}
  };

  Core._init();

  return Core;
});
