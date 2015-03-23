isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./idle-check');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.idleCheck = sut();
    },

    tearDown: function () {
      v = null;
    },

    "test already Idle": function () {
      v.idleCheck.waitIdle(v.stub = test.stub());

      assert.called(v.stub);
    },

    "test multiple listeners": function () {
      v.idleCheck.inc();
      v.idleCheck.inc();

      v.idleCheck.waitIdle(v.stub1 = test.stub());
      v.idleCheck.waitIdle(v.stub2 = test.stub());

      v.idleCheck.dec();

      refute.called(v.stub1);
      refute.called(v.stub2);

      v.idleCheck.dec();

      assert.called(v.stub1);
      assert.called(v.stub2);

      v.idleCheck.inc();

      v.idleCheck.waitIdle(v.stub3 = test.stub());
      v.idleCheck.dec();

      assert.calledOnce(v.stub1);
      assert.calledOnce(v.stub3);
    },
  });
});
