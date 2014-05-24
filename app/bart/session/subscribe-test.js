isClient && define(function (require, exports, module) {
  var test, v;
  var bt = require('../test');
  var session = require('../session/main');
  var subscribe = require('./subscribe');

  bt.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test subscribe": function () {
      test.stub(session, 'sendP');
      var handle = subscribe('foo', 123, 456, v.stub = test.stub());

      assert.same(handle._id, subscribe._nextId.toString(16));
      assert.same(handle.callback, v.stub);
      assert.equals(handle.args, [123, 456]);

      session._onMessage({}, 'P'+handle._id);

      assert.calledWithExactly(v.stub, null);

      assert.calledWith(session.sendP, 'foo|' + handle._id, [123, 456]);
      assert(handle);

      assert.same(subscribe._subs[handle._id], handle);

      handle.stop();
      assert.calledWith(session.sendP, '|' + handle._id);

      assert.isFalse(handle._id in subscribe._subs);
    },
  });
});
