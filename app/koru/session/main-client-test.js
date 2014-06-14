define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var util = require('../util');
  var message = require('./message');
  var clientSession = require('./main-client');
  var env = require('../env');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.sess = clientSession({
        provide: test.stub(),
        _rpcs: {},
      });
      v.sess.newWs = test.stub().returns(v.ws = {
        send: test.stub(),
        close: test.stub(),
      });
      assert.calledWith(v.sess.provide, 'M', TH.match(function (func) {
        v.recvM = function () {
          func(message.encodeMessage('M', util.slice(arguments)).subarray(1));
        };
        return true;
      }));
    },

    tearDown: function () {
      v = null;
    },

    "test connection cycle": function () {
      v.sess.onConnect(v.onConStub = test.stub());

      assert.same(v.sess._onConnect[0], v.onConStub);

      test.stub(env, 'getLocation').returns({protocol: 'https:', host: 'test.host:123'});

      v.sess.connect();         // connect

      assert.calledWith(v.sess.newWs, 'wss://test.host:123');
      refute.called(v.onConStub);
      assert.same(v.sess.state, 'closed');

      v.ws.onopen();            // connect success

      assert.same(v.sess.state, 'ready');
      assert.called(v.onConStub);

      test.stub(window, 'setTimeout').returns('c123');
      test.stub(window, 'clearTimeout');
      test.stub(env, 'info');

      v.ws.onclose({});         // remote close

      assert.same(v.sess.state, 'retry');
      assert.calledWith(setTimeout, v.sess.connect, 500);

      v.sess.stop();            // local stop

      assert.calledWith(clearTimeout, 'c123');
      assert.same(v.sess.state, 'closed');
      v.onConStub.reset();

      v.sess.connect();         // reconnect
      v.ws.onopen();            // success

      assert.called(v.onConStub);
    },

    "test before connected": function () {
      test.stub(message, 'encodeMessage', function (type, msg) {
        return ['x', type, msg];
      });
      v.sess.sendBinary('P', [null]);
      v.sess.sendBinary('M', [1]);
      v.sess.send('S', 'Labc');

      assert.equals(v.sess._waitFuncs, [['P', [null]], ['M', [1]], 'SLabc']);

      v.sess.connect();
      v.ws.onopen();

      assert.calledWith(v.ws.send, 'X1');
      assert.calledWith(v.ws.send, ["x", "P", [null]]);
      assert.calledWith(v.ws.send, ["x", "M", [1]]);
      assert.calledWith(v.ws.send, 'SLabc');
    },


    /**
     * Ensure docs are tested against matches after subscriptions have returned.
     * Any unwanted docs should be removed.
     */
    "reconnect": {
      "test replay messages": function () {
        v.sess.connect();
        v.ws.onopen();
        v.sess.rpc("foo.bar", 1, 2);
        v.sess.rpc("foo.baz", 1, 2);
        v.sess.stop();
        v.sendBinary = test.stub(v.sess, 'sendBinary');
        v.recvM("1", 'r');

        v.sess.connect(); v.ws.onopen();

        assert.calledWith(v.sendBinary, 'M', ["2", "foo.baz", 1, 2]);
        assert.calledOnce(v.sendBinary); // foo.bar replied so not resent
      },
    },

    "open connection": {
      setUp: function () {
        v.sess.connect();
        v.ws.onopen();
        v.sendBinary = test.stub(v.sess, 'sendBinary');
      },

      "test stop": function () {
        v.sess.stop();

        assert.calledOnce(v.ws.close);
      },

      "test sendBinary": function () {
        v.sendBinary.restore();
        v.sess.sendBinary('M', [1,2,3,4]);

        assert.calledWith(v.ws.send, TH.match(function (data) {
          if (data[0] === 'M'.charCodeAt(0)) {
            assert.equals(message.decodeMessage(data.subarray(1)), [1,2,3,4]);
            return true;
          }
        }));
      },

      "test sendP": function () {
        v.sess.sendP('id', 'foo', [1, 2, 'bar']);

        assert.calledWith(v.sendBinary, 'P', ['id', 'foo', [1, 2, 'bar']]);

        v.sess.sendP('12');

        assert.calledWith(v.sendBinary, 'P', ['12']);
      },

      "test rpc": function () {
        var fooId;
        v.sess._rpcs['foo.rpc'] = rpcSimMethod;
        v.sess._rpcs['foo.s2'] = rpcSimMethod2;

        assert.isFalse(v.sess.isSimulation);
        v.sess.rpc('foo.rpc', 1, 2, 3);
        assert.isFalse(v.sess.isSimulation);

        assert.equals(v.args, [1, 2, 3]);
        assert.same(v.thisValue, util.thread);

        assert.same(v.sess._msgId, fooId);

        v.sess.rpc('foo.s2');

        assert.same(v.sess._msgId, fooId+1);

        function rpcSimMethod(one, two, three) {
          v.thisValue = this;
          v.args = util.slice(arguments);
          fooId = v.sess._msgId;
          assert.calledWith(v.sendBinary, 'M', [fooId.toString(36), "foo.rpc"].concat(v.args));
          v.ws.send.reset();
          assert.isTrue(v.sess.isSimulation);
          v.sess.rpc('foo.s2', 'aaa');
          assert.same(v.sess._msgId, fooId);

          assert.isTrue(v.sess.isSimulation);
          assert.same(v.s2Name, 'aaa');
          assert.same(v.s2This, util.thread);
          refute.called(v.ws.send);
        }

        function rpcSimMethod2(name) {
          v.s2Name = name;
          v.s2This = this;
          assert.isTrue(v.sess.isSimulation);
        }
      },

      "test server only rpc": function () {
        refute.exception(function () {
          v.sess.rpc('foo.rpc', 1, 2, 3);
        });

        assert.calledWith(v.sendBinary, 'M', [v.sess._msgId.toString(36), "foo.rpc", 1, 2, 3]);
      },

      "test callback rpc": function () {
        v.sess._rpcs['foo.rpc'] = rpcSimMethod;

        v.sess.rpc('foo.rpc', 'a');
        assert.equals(v.args, ['a']);

        v.sess.rpc('foo.rpc', 'b', v.bstub = test.stub());
        assert.equals(v.args, ['b']);

        v.sess.rpc('foo.rpc', 'c', v.cstub = test.stub());
        var msgId = v.sess._msgId;

        v.recvM(msgId.toString(36), 'e', '404,error Msg');

        assert.calledWithExactly(v.cstub, TH.match(function (err) {
          assert.same(err.error, 404);
          assert.same(err.reason, 'error Msg');
          return true;
        }));

        v.recvM((msgId - 1).toString(36), 'r', [1,2,3]);
        v.recvM((msgId - 1).toString(36), 'r', [1,2,3]);

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
        var handle = v.sess.rpc.onChange(v.ob = test.stub());
        test.onEnd(function () {
          handle.stop();
        });

        assert.isFalse(v.sess.rpc.waiting());

        v.sess.sendM('foo.rpc', [1, 2]);

        assert.calledOnceWith(v.ob, true);

        v.sess.sendM('foo.rpc');
        assert.calledOnce(v.ob);

        assert.isTrue(v.sess.rpc.waiting());

        v.ob.reset();

        var msgId = v.sess._msgId;
        v.recvM((msgId - 1).toString(36), 'r');

        refute.called(v.ob);

        v.recvM(msgId.toString(36), 'r');

        assert.calledWith(v.ob, false);

        assert.isFalse(v.sess.rpc.waiting());
      }
    },
  });
});
