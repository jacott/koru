define(function (require, exports, module) {
  var test, v;
  var geddon = require('./test');
  var makeSubject = require('./make-subject');

  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.foo = makeSubject({}, 'onFoo', 'notify');
    },

    tearDown: function () {
      v = null;
    },

    "test observing": function () {
      v.foo.onFoo(v.stub1 = test.stub());
      var handle = v.foo.onFoo(v.stub2 = test.stub());
      var h2 = v.foo.onFoo(v.stub3 = test.stub());

      assert.same(h2.key, handle.key+1);

      handle.stop();

      v.foo.notify(123, 'bar');

      assert.calledWith(v.stub1, 123, 'bar');
      refute.called(v.stub2);
      assert.calledWith(v.stub3, 123);

      assert.same(v.stub3.firstCall.thisValue, h2);
    },
  });
});
