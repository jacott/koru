isServer && define(function (require, exports, module) {
  var test, v;
  var bt = require('../test');
  var publish = require('./publish');
  var session = require('../session/server-main');

  bt.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
      publish._destroy('foo');
    },

    "test publish": function () {
      publish("foo", v.stub = test.stub());

      assert.same(publish._pubs.foo, v.stub);

      session._onMessage(v.conn = test.stub(), 'Pfoo|a123'+JSON.stringify([1,2,3]));

      assert('a123' in v.conn._subs);

      assert.calledWith(v.stub, 1, 2, 3);
      var sub = v.stub.thisValues[0];
      assert.same(sub.session, v.conn);

      sub.onStop(v.onStop = test.stub());

      session._onMessage(v.conn, 'P|a123');
      assert.called(v.onStop);
      refute('a123' in v.conn._subs);
      session._onMessage(v.conn, 'P|a123');
      assert.calledOnce(v.onStop);
    },
  });
});
