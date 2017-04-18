define(function (require, exports, module) {
  /**
   * Attach rpc to a session
   **/
  const Random       = require('koru/random');
  const SessionBase  = require('koru/session/base').constructor;
  const RPCQueue     = require('koru/session/rpc-queue');
  const api          = require('koru/test/api');
  const koru         = require('../main');
  const util         = require('../util');
  const message      = require('./message');
  const stateFactory = require('./state').constructor;
  const TH           = require('./test-helper');

  const sut = require('./client-rpc-base');
  var test, v;

  TH.testCase(module, {
    setUp () {
      test = this;
      v = {};
      v.state = stateFactory();
      TH.mockConnectState(v, v.state);

      class MySession extends SessionBase {
        constructor() {
          super();
          this.state = v.state;
          this.sendBinary = v.sendBinary = test.stub();
        }
      }
      this.stub(Random.global, 'id').returns('rid1');
      v.sess = sut(new MySession());

      v.recvM = function (...args) {
        v.sess._commands.M.call(v.sess, args);
      };
      api.module();
    },

    tearDown () {
      v = null;
    },

    "test setup"() {
      /**
       * Wire up rpc to a session
       *
       * @param session attach rpc methods to this session

       * @param rpcQueue queue to store messages yet to have a
       * response. This can be a persistent queue like
       * {#koru/session/rcp-idb-queue}

       **/
      api.custom(sut);

      const rpcQueue = new RPCQueue();
      sut(v.sess, {rpcQueue});
      v.sess.rpc('foo.rpc', 1, 2);
      assert.equals(rpcQueue.get('1rid1'), [['1rid1', 'foo.rpc', 1, 2], null]);
    },

    "test lastRpc"() {
      /**
       * Return lastRpc msgId to use with {##cancelRpc}
       **/
      api.protoProperty('lastMsgId');
      v.sess.rpc('foo.rpc', 1, 2, 3);
      assert.same(v.sess.lastMsgId, '1rid1');
    },

    "test cancelRpc"() {
      /**
       * Return lastRpc msgId to use with {##cancelRpc}
       **/
      const rpcQueue = new RPCQueue();
      sut(v.sess, {rpcQueue});
      api.method('cancelRpc', v.sess);

      v.sess.rpc('foo.rpc', 1, 2, 3);
      const msgId = v.sess.lastMsgId;
      assert.same(v.sess.state.pendingCount(), 1);
      assert.same(v.sess.state.pendingUpdateCount(), 1);

      assert.isTrue(v.sess.cancelRpc(msgId));
      assert.same(v.sess.state.pendingCount(), 0);

      assert.equals(rpcQueue.get('1rid1'), undefined);
      refute(v.sess.cancelRpc(msgId));
      assert.same(v.sess.state.pendingCount(), 0);
      assert.same(v.sess.state.pendingUpdateCount(), 0);

      v.sess.defineRpcGet('foo.get', arg => {});
      v.sess.rpc('foo.get', 1);
      assert.same(v.sess.state.pendingCount(), 1);
      assert.same(v.sess.state.pendingUpdateCount(), 0);

      const msgId2 = v.sess.lastMsgId;
      v.sess.cancelRpc(msgId2);
      assert.same(v.sess.state.pendingCount(), 0);
      assert.same(v.sess.state.pendingUpdateCount(), 0);
    },

    "reconnect": {
      /**
       * Ensure docs are tested against matches after subscriptions have returned.
       * Any unwanted docs should be removed.
       **/
      "test replay messages" () {
        assert.calledWith(v.state.onConnect, "20-rpc", TH.match(func => v.onConnect = func));
        v.sess.rpc("foo.bar", 1, 2);
        v.sess.rpc("foo.baz", 1, 2);
        v.state._state = 'retry';
        v.sendBinary.reset();
        v.recvM("1rid1", 'r');

        v.onConnect(v.sess);

        assert.calledWith(v.sendBinary, 'M', ["2rid1", "foo.baz", 1, 2]);
        assert.calledOnce(v.sendBinary); // foo.bar replied so not resent
      },
    },

    "test server only rpc" () {
      v.sess.rpc('foo.rpc', 1, 2, 3);

      assert.calledWith(v.sendBinary, 'M', [v.sess._msgId.toString(36), "foo.rpc", 1, 2, 3]);
    },

    "test callback rpc" () {
      test.stub(koru, 'globalCallback');

      v.sess.defineRpc('foo.rpc', rpcSimMethod);

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

      v.sess.rpc('foo.rpc', 'x');
      msgId = v.sess._msgId;

      v.recM(msgId.toString(36), 'e', '404,global cb');
      assert.calledOnceWith(koru.globalCallback, 404, 'global cb');

      function rpcSimMethod(...args) {
        v.args = args.slice();
      }
    },

    "test onChange rpc" () {
      v.ready = true;
      test.onEnd(v.state.pending.onChange(v.ob = test.stub()));

      assert.same(v.state.pendingCount(), 0);

      v.sess.rpc('foo.rpc', [1, 2]);

      assert.calledOnceWith(v.ob, true);

      v.sess.rpc('foo.rpc');
      assert.calledOnce(v.ob);

      assert.same(v.state.pendingCount(), 1);

      v.ob.reset();

      var msgId = v.sess._msgId;
      v.recvM((msgId - 1).toString(36), 'r');

      refute.called(v.ob);

      v.recvM(msgId.toString(36), 'r');

      assert.calledWith(v.ob, false);

      assert.same(v.state.pendingCount(), 0);
    },


    "test rpc" () {
      v.ready = true;
      var fooId;
      v.sess.defineRpc('foo.rpc', rpcSimMethod);
      v.sess.defineRpcGet('foo.s2', rpcSimMethod2);

      refute(v.sess.isSimulation);
      v.sess.rpc('foo.rpc', 1, 2, 3);
      assert.isFalse(v.sess.isSimulation);
      assert.same(v.state.pendingCount(), 1);
      assert.same(v.state.pendingUpdateCount(), 1);


      assert.equals(v.args, [1, 2, 3]);
      assert.same(v.thisValue, util.thread);

      assert.same(v.sess._msgId, fooId);

      v.sess.rpc('foo.s2');

      assert.same(v.state.pendingCount(), 2);
      assert.same(v.state.pendingUpdateCount(), 1);

      assert.same(v.sess._msgId, fooId+1);

      v.recvM('2rid1', 'r');

      assert.same(v.state.pendingCount(), 1);
      assert.same(v.state.pendingUpdateCount(), 1);

      v.recvM('1rid1', 'r');

      assert.same(v.state.pendingCount(), 0);
      assert.same(v.state.pendingUpdateCount(), 0);



      function rpcSimMethod(...args) {
        v.thisValue = this;
        v.args = args.slice();
        fooId = v.sess._msgId;
        assert.calledWith(v.sendBinary, 'M', [fooId.toString(36)+'rid1', "foo.rpc"].concat(v.args));
        assert.isTrue(v.sess.isSimulation);
        v.sess.rpc('foo.s2', 'aaa');
        assert.same(v.sess._msgId, fooId);

        assert.isTrue(v.sess.isSimulation);
        assert.same(v.s2Name, 'aaa');
        assert.same(v.s2This, util.thread);
      }

      function rpcSimMethod2(name) {
        v.s2Name = name;
        v.s2This = this;
        assert.isTrue(v.sess.isSimulation);
        refute.exception(function () {v.sess.rpc('foo.remote')});
      }
    },

    "test server only rpc" () {
      v.ready = true;
      refute.exception(function () {
        v.sess.rpc('foo.rpc', 1, 2, 3);
      });

      assert.same(v.state.pendingCount(), 1);
      assert.same(v.state.pendingUpdateCount(), 1);


      assert.calledWith(v.sendBinary, 'M', [v.sess._msgId.toString(36)+'rid1', "foo.rpc", 1, 2, 3]);
    },

    "test callback rpc" () {
      v.sess.defineRpc('foo.rpc', rpcSimMethod);

      v.sess.rpc('foo.rpc', 'a');
      assert.equals(v.args, ['a']);

      v.sess.rpc('foo.rpc', 'b', v.bstub = test.stub());
      assert.equals(v.args, ['b']);

      v.sess.rpc('foo.rpc', 'c', v.cstub = test.stub());
      var msgId = v.sess._msgId;

      v.recvM(msgId.toString(36)+'rid1', 'e', '404', 'error Msg');

      assert.calledWithExactly(v.cstub, TH.match(function (err) {
        assert.same(err.error, 404);
        assert.same(err.reason, 'error Msg');
        return true;
      }));

      v.recvM((msgId - 1).toString(36)+'rid1', 'r', [1,2,3]);
      v.recvM((msgId - 1).toString(36)+'rid1', 'r', [1,2,3]);

      assert.calledOnce(v.bstub);

      assert.calledWithExactly(v.bstub, null, TH.match(function (result) {
        assert.equals(result, [1,2,3]);
        return true;
      }));

      function rpcSimMethod(...args) {
        v.args = args.slice();
      }
    },

    "test onChange rpc" () {
      test.onEnd(v.state.pending.onChange(v.ob = test.stub()));

      assert.same(v.state.pendingCount(), 0);

      assert.isFalse(v.sess.isRpcPending());
      v.sess.rpc('foo.rpc', [1, 2]);
      assert.isTrue(v.sess.isRpcPending());

      assert.calledOnceWith(v.ob, true);

      v.sess.rpc('foo.rpc');
      assert.calledOnce(v.ob);

      assert.same(v.state.pendingCount(), 2);
      assert.same(v.state.pendingUpdateCount(), 2);

      v.ob.reset();

      var msgId = v.sess._msgId;
      v.recvM((msgId - 1).toString(36)+'rid1', 'r');

      refute.called(v.ob);

      v.recvM(msgId.toString(36)+'rid1', 'r');

      assert.calledWith(v.ob, false);
      assert.isFalse(v.sess.isRpcPending());

      assert.same(v.state.pendingCount(), 0);
      assert.same(v.state.pendingUpdateCount(), 0);
    }
  });
});
