define(function (require, exports, module) {
  const geddon      = require('./test');

  const makeSubject = require('./make-subject');
  var test, v;

  geddon.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.foo = makeSubject({}, 'onFoo', 'notify');
    },

    tearDown() {
      v = null;
    },

    "test observing"() {
      v.foo.onFoo(v.stub1 = test.stub());
      const handle = v.foo.onFoo(v.stub2 = test.stub());
      const h2 = v.foo.onFoo(v.stub3 = test.stub());

      handle.stop();

      v.foo.notify(123, 'bar');

      assert.calledWith(v.stub1, 123, 'bar');
      refute.called(v.stub2);
      assert.calledWith(v.stub3, 123);

      assert.same(v.stub3.firstCall.thisValue, h2);
    },
  });
});
