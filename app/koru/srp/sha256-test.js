define(function (require, exports, module) {
  const TH   = require('koru/test');

  const sut  = require('./sha256');

  TH.testCase(module, {
    "test hash"() {
      assert.same(sut('hello world'),
                  'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    },

  });
});
