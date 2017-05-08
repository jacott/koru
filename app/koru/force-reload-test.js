isClient && define(function (require, exports, module) {
  const koru = require('koru');
  const TH   = require('./test');

  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test reload"(done) {
      this.onEnd(_=> {koru.unload('koru/force-reload')});
      this.stub(koru, 'reload', _=> {
        assert(true);
        done();
      });

      require(['./force-reload']);
    },
  });
});
