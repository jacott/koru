define(function (require, exports, module) {
  var test, v;
  var geddon = require('../test');
  var session = require('./client-main');
  var util = require('../util');


  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.send = test.stub(session, 'send');
    },

    tearDown: function () {
      v = null;
      delete session._rpcs['foo.bar'];
    },

    "test rpc": function () {
      session.defineRpc('foo.rpc', rpcSimMethod);
      session.defineRpc('foo.s2', rpcSimMethod2);

      assert.isFalse(session.isSimulation);
      session.rpc('foo.rpc', 1, 2, 3);
      assert.isFalse(session.isSimulation);

      assert.equals(v.args, [1, 2, 3]);
      assert.same(v.thisValue, util.thread);

      function rpcSimMethod(one, two, three) {
        v.thisValue = this;
        v.args = util.slice(arguments);
        assert.calledWith(v.send, 'M', "foo.rpc"+JSON.stringify(v.args));
        v.send.reset();
        assert.isTrue(session.isSimulation);
        session.rpc('foo.s2', 'aaa');
        assert.isTrue(session.isSimulation);
        assert.same(v.s2Name, 'aaa');
        assert.same(v.s2This, util.thread);
        refute.called(v.send);
      }

      function rpcSimMethod2(name) {
        v.s2Name = name;
        v.s2This = this;
        assert.isTrue(session.isSimulation);
      }
    },

    "test rpc with callback": function () {
      session.defineRpc('foo.rpc', rpcSimMethod);

      session.rpc('foo.rpc', 'a');
      assert.equals(v.args, ['a']);

      session.rpc('foo.rpc', 'b', test.stub());
      assert.equals(v.args, ['b']);

      function rpcSimMethod() {
        v.args = util.slice(arguments);
      }

    },

  });
});
