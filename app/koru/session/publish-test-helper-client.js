define(function(require, exports, module) {
  const util  = require('koru/util');

  const publishTH = {
    mockSubscribe() {
      return {};
    },
  };

  module.exports = publishTH;
});
