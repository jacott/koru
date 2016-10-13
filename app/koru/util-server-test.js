define(function (require, exports, module) {
  var test, v;
  const TH   = require('./test');

  const util  = require('./util');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test waitCallback"() {
      var future = {throw: test.stub(), return: test.stub()};

      var func = util.waitCallback(future);

      func(v.foo = new Error("foo"));

      assert.calledWith(future.throw, v.foo);
      refute.called(future.return);

      func(null, "message");
      assert.calledWith(future.return, "message");
      assert.calledOnce(future.throw);
      func(123);
      assert.calledWith(future.throw, TH.match(err => err.message === "123"));
    },

    "test callWait"() {
      const wait = this.stub().returns("success");
      const future = {wait};
      function myFuture() {return future}
      const method = this.stub();
      this.stub(util, "waitCallback").returns("waitCallback-call");
      const myThis = {method};

      this.intercept(util, 'Future', myFuture);

      assert.same(util.callWait(method, myThis, "foo", 1, 2), "success");


      assert.calledWith(method, "foo", 1, 2, "waitCallback-call");
      assert.same(method.firstCall.thisValue, myThis);

      assert.calledWith(util.waitCallback, future);
      assert.called(wait);
      assert(method.calledBefore(wait));
    },

    "test engine"() {
      assert.same(util.engine, 'Server');
    },
  });
});
