define(function(require, exports, module) {
  const util  = require('koru/util');

  return function (publishTH) {
    return {
      __proto__: publishTH,

      mockSubscribe() {
      },
    };
  };
});
