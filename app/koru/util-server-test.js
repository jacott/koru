define(function (require, exports, module) {
  var test, v;
  const TH   = require('./test');
  const sut  = require('./util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test waitCallback": function () {
      var future = {throw: test.stub(), return: test.stub()};

      var func = sut.waitCallback(future);

      func(v.foo = new Error("foo"));

      assert.calledWith(future.throw, v.foo);
      refute.called(future.return);

      func(null, "message");
      assert.calledWith(future.return, "message");
      assert.calledOnce(future.throw);
      func(123);
      assert.calledWith(future.throw, TH.match(err => err.message === "123"));
    },

    "test engine": function () {
      assert.same(sut.engine, 'Server');
    },
  });
});
