define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var sync = require('./sync');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      sync._resetCount();
      v = null;
    },

    "test notification": function () {
      assert.isFalse(sync.waiting());
      test.onEnd(sync.onChange(v.change = test.stub()));

      sync.inc();
      assert.calledOnce(v.change);
      assert.calledWith(v.change, true);
      assert.isTrue(sync.waiting());

      sync.inc();
      assert.calledOnce(v.change);

      sync.dec();
      assert.calledOnce(v.change);
      assert.isTrue(sync.waiting());

      sync.dec();
      assert.calledWith(v.change, false);
      assert.isFalse(sync.waiting());

      assert.exception(function () {
        sync.dec();
      });

      assert.isFalse(sync.waiting());

      v.change.reset();
      sync.inc();
      assert.isTrue(sync.waiting());
      assert.calledWith(v.change, true);
    },
  });
});
