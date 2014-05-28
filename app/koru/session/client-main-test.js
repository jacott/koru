define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var session = require('./client-main');
  var util = require('../util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.send = test.stub(session, 'send');
    },

    tearDown: function () {
      v = null;
      delete session._rpcs['foo.bar'];
    },

    "connect": {
      setUp: function () {
        v.origOnConnect = session._onConnect;
        session._onConnect = [];
      },

      tearDown: function () {
        session._onConnect = v.origOnConnect;
      },


      "test onConnect": function () {
        session.onConnect(v.stub = test.stub);

        assert.same(session._onConnect[0], v.stub);
      },
    },

    "test rpc": function () {
      var fooId;
      session.defineRpc('foo.rpc', rpcSimMethod);
      session.defineRpc('foo.s2', rpcSimMethod2);

      assert.isFalse(session.isSimulation);
      session.rpc('foo.rpc', 1, 2, 3);
      assert.isFalse(session.isSimulation);

      assert.equals(v.args, [1, 2, 3]);
      assert.same(v.thisValue, util.thread);

      assert.same(session._msgId, fooId);

      session.rpc('foo.s2');

      assert.same(session._msgId, fooId+1);

      function rpcSimMethod(one, two, three) {
        v.thisValue = this;
        v.args = util.slice(arguments);
        fooId = session._msgId;
        assert.calledWith(v.send, 'M', fooId.toString(36)+"|foo.rpc"+JSON.stringify(v.args));
        v.send.reset();
        assert.isTrue(session.isSimulation);
        session.rpc('foo.s2', 'aaa');
        assert.same(session._msgId, fooId);

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

      session.rpc('foo.rpc', 'b', v.bstub = test.stub());
      assert.equals(v.args, ['b']);

      session.rpc('foo.rpc', 'c', v.cstub = test.stub());
      var msgId = session._msgId;

      session._onMessage({}, 'M'+ msgId.toString(36) + '|e404,error Msg');

      assert.calledWithExactly(v.cstub, TH.match(function (err) {
        assert.same(err.error, 404);
        assert.same(err.reason, 'error Msg');
        return true;
      }));

      session._onMessage({}, 'M'+ (msgId-1).toString(36) + '|r[1,2,3]');

      session._onMessage({}, 'M'+ (msgId-1).toString(36) + '|r[1,2,3]');

      assert.calledOnce(v.bstub);

      assert.calledWithExactly(v.bstub, null, TH.match(function (result) {
        assert.equals(result, [1,2,3]);
        return true;
      }));

      function rpcSimMethod() {
        v.args = util.slice(arguments);
      }
    },

    "test sendP": function () {
      session.sendP('foo', [1, 2, 'bar']);

      assert.calledWith(session.send, 'P', 'foo' + JSON.stringify([1, 2, 'bar']));

      session.sendP('|12');

      assert.calledWith(session.send, 'P', '|12');
    },

  });
});
