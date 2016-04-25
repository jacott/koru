define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var util = require('../util');
  var message = require('./message');
  var rpc = require('./client-rpc-base');
  var koru = require('../main');
  var sessState = require('./state').__init__;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.state = sessState();
      TH.mockConnectState(v, v.state);
      v.sess = rpc({
        provide: test.stub(),
        _rpcs: {},
        _commands: {},
        sendBinary: v.sendBinary = test.stub(),
        state: v.state,
        globalDict: message.newGlobalDict(),
      });
      assert.calledWith(v.sess.provide, 'M', TH.match(function (func) {
        v.recvM = function (...args) {
          func.call(v.sess, args);
        };
        return true;
      }));
    },

    tearDown: function () {
      v = null;
    },

    /**
     * Ensure docs are tested against matches after subscriptions have returned.
     * Any unwanted docs should be removed.
     */
    "reconnect": {
      "test replay messages": function () {
        assert.calledWith(v.state.onConnect, "20", v.sess._onConnect);
        v.sess.rpc("foo.bar", 1, 2);
        v.sess.rpc("foo.baz", 1, 2);
        v.sess.state._state = 'retry';
        v.sendBinary.reset();
        v.recvM("1", 'r');

        v.sess._onConnect(v.sess);

        assert.calledWith(v.sendBinary, 'M', ["2", "foo.baz", 1, 2]);
        assert.calledOnce(v.sendBinary); // foo.bar replied so not resent
      },
    },

    "test server only rpc": function () {
      refute.exception(function () {
        v.sess.rpc('foo.rpc', 1, 2, 3);
      });

      assert.calledWith(v.sendBinary, 'M', [v.sess._msgId.toString(36), "foo.rpc", 1, 2, 3]);
    },

    "test callback rpc": function () {
      test.stub(koru, 'globalCallback');

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

      v.sess.rpc('foo.rpc', 'x');
      msgId = v.sess._msgId;

      v.recM(msgId.toString(36), 'e', '404,global cb');
      assert.calledOnceWith(koru.globalCallback, 404, 'global cb');

      function rpcSimMethod(...args) {
        v.args = args.slice();
      }
    },

    "test onChange rpc": function () {
      v.ready = true;
      test.onEnd(v.state.pending.onChange(v.ob = test.stub()));

      assert.same(v.state.pendingCount(), 0);

      v.sess.sendM('foo.rpc', [1, 2]);

      assert.calledOnceWith(v.ob, true);

      v.sess.sendM('foo.rpc');
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


    "test rpc": function () {
      v.ready = true;
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

      function rpcSimMethod(...args) {
        v.thisValue = this;
        v.args = args.slice();
        fooId = v.sess._msgId;
        assert.calledWith(v.sendBinary, 'M', [fooId.toString(36), "foo.rpc"].concat(v.args));
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

    "test server only rpc": function () {
      v.ready = true;
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

      v.recvM(msgId.toString(36), 'e', '404', 'error Msg');

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

      function rpcSimMethod(...args) {
        v.args = args.slice();
      }
    },

    "test onChange rpc": function () {
      test.onEnd(v.state.pending.onChange(v.ob = test.stub()));

      assert.same(v.state.pendingCount(), 0);

      assert.isFalse(v.sess.isRpcPending());
      v.sess.sendM('foo.rpc', [1, 2]);
      assert.isTrue(v.sess.isRpcPending());

      assert.calledOnceWith(v.ob, true);

      v.sess.sendM('foo.rpc');
      assert.calledOnce(v.ob);

      assert.same(v.state.pendingCount(), 2);

      v.ob.reset();

      var msgId = v.sess._msgId;
      v.recvM((msgId - 1).toString(36), 'r');

      refute.called(v.ob);

      v.recvM(msgId.toString(36), 'r');

      assert.calledWith(v.ob, false);
      assert.isFalse(v.sess.isRpcPending());

      assert.same(v.state.pendingCount(), 0);
    }
  });
});
