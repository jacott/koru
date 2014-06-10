define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var session = require('./main');
  var util = require('../util');
  var message = require('./message');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.send = test.stub(session, 'send');
      v.sendBinary = test.stub(session, 'sendBinary');
      session._forgetMs();
    },

    tearDown: function () {
      session._forgetMs();
      v = null;
      delete session._rpcs['foo.rpc'];
      delete session._rpcs['foo.s2'];
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

      /**
       * Ensure docs are tested against matches after subscriptions have returned.
       * Any unwanted docs should be removed.
       */
      "//test reconnect": function () {
      },
    },

    "test sendBinary": function () {
      v.sendBinary.restore();
      v.stub = test.stub(session.connect._ws, 'send');
      session.sendBinary('M', [1,2,3,4]);

      assert.calledWith(v.stub, TH.match(function (data) {
        assert.same(data[0], 'M'.charCodeAt(0));
        assert.equals(message.decode(data.subarray(1)), [1,2,3,4]);
        return true;
      }));
    },

    "test server only rpc": function () {
      refute.exception(function () {
        session.rpc('foo.rpc', 1, 2, 3);
      });

      assert.called(v.sendBinary, 'M', session._msgId.toString(36)+"|foo.rpc"+JSON.stringify([1, 2, 3]));
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
        assert.calledWith(v.sendBinary, 'M', [fooId.toString(36), "foo.rpc"].concat(v.args));
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

    "test callback rpc": function () {
      session.defineRpc('foo.rpc', rpcSimMethod);

      session.rpc('foo.rpc', 'a');
      assert.equals(v.args, ['a']);

      session.rpc('foo.rpc', 'b', v.bstub = test.stub());
      assert.equals(v.args, ['b']);

      session.rpc('foo.rpc', 'c', v.cstub = test.stub());
      var msgId = session._msgId;

      session._onMessage({}, message.encodeToBinary([msgId.toString(36), 'e', '404,error Msg'], ['M'.charCodeAt(0)]));

      assert.calledWithExactly(v.cstub, TH.match(function (err) {
        assert.same(err.error, 404);
        assert.same(err.reason, 'error Msg');
        return true;
      }));

      session._onMessage({}, message.encodeToBinary([(msgId - 1).toString(36), 'r', [1,2,3]], ['M'.charCodeAt(0)]));

      session._onMessage({}, message.encodeToBinary([(msgId - 1).toString(36), 'r', [1,2,3]], ['M'.charCodeAt(0)]));

      assert.calledOnce(v.bstub);

      assert.calledWithExactly(v.bstub, null, TH.match(function (result) {
        assert.equals(result, [1,2,3]);
        return true;
      }));

      function rpcSimMethod() {
        v.args = util.slice(arguments);
      }
    },

    "test onChange rpc": function () {
      var handle = session.rpc.onChange(v.ob = test.stub());
      test.onEnd(function () {
        handle.stop();
      });

      assert.isFalse(session.rpc.waiting());

      session.sendM('foo.rpc', [1, 2]);

      assert.calledOnceWith(v.ob, true);

      session.sendM('foo.rpc');
      assert.calledOnce(v.ob);

      assert.isTrue(session.rpc.waiting());

      v.ob.reset();

      var msgId = session._msgId;
      session._onMessage({}, message.encodeToBinary([(msgId - 1).toString(36), 'r'], ['M'.charCodeAt(0)]));

      refute.called(v.ob);

      session._onMessage({}, message.encodeToBinary([msgId.toString(36), 'r'], ['M'.charCodeAt(0)]));

      assert.calledWith(v.ob, false);

      assert.isFalse(session.rpc.waiting());
    },

    "test sendP": function () {
      session.sendP('foo', [1, 2, 'bar']);

      assert.calledWith(session.send, 'P', 'foo' + JSON.stringify([1, 2, 'bar']));

      session.sendP('|12');

      assert.calledWith(session.send, 'P', '|12');
    },

  });
});
