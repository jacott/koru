define((require, exports, module)=>{
  'use strict';
  /**
   * Attach rpc to a session
   **/
  const Random          = require('koru/random');
  const SessionBase     = require('koru/session/base').constructor;
  const RPCQueue        = require('koru/session/rpc-queue');
  const api             = require('koru/test/api');
  const koru            = require('../main');
  const util            = require('../util');
  const message         = require('./message');
  const stateFactory    = require('./state').constructor;
  const TH              = require('./test-helper');

  const {stub, spy} = TH;

  const sut = require('./client-rpc-base');

  let v = {};

  TH.testCase(module, ({after, beforeEach, afterEach, group, test})=>{
    beforeEach( ()=>{
      v.state = stateFactory();
      TH.mockConnectState(v, v.state);

      class MySession extends SessionBase {
        constructor() {
          super();
          this.state = v.state;
          this.sendBinary = v.sendBinary = stub();
        }
      }
      stub(Random.global, 'id').returns('rid1');
      v.sess = sut(new MySession());

      v.recvM = (...args)=>{v.sess._commands.M.call(v.sess, args)};
    });

    afterEach( ()=>{
      v = {};
    });

    test("setup", ()=>{
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
    });

    test("replaceRpcQueue", ()=>{
      /**
       * Replace the rpc queue with a different one.
       **/
      const rpcQueue = new RPCQueue();
      sut(v.sess, {rpcQueue});
      api.protoMethod('replaceRpcQueue', {subject: v.sess});

      const cb = stub();
      v.sess.rpc('foo.rpc', 1, 2, 3, cb);
      v.sess.rpc('bar.rpc', 'x');

      const myQueue = {
        push: stub(),
      };

      v.sess.replaceRpcQueue(myQueue);

      assert.calledWith(myQueue.push, v.sess, ['1rid1', 'foo.rpc', 1, 2, 3], cb);
      assert.calledWith(myQueue.push, v.sess, ['2rid1', 'bar.rpc', 'x'], null);
    });

    test("checkMsgId", ()=>{
      /**
       * Ensure than next msgId will be greater than this one
       **/
      const rpcQueue = new RPCQueue();
      sut(v.sess, {rpcQueue});
      api.protoMethod('checkMsgId', {subject: v.sess});

      const id = 40+Random.id();
      assert.equals(v.sess._sendM('foo'), '1rid1');
      v.sess.checkMsgId(id);
      assert.equals(v.sess._sendM('foo'), '15rid1');
      v.sess.checkMsgId(id);
      assert.equals(v.sess._sendM('foo'), '16rid1');
    });

    test("lastRpc", ()=>{
      /**
       * Return lastRpc msgId to use with {##cancelRpc}
       **/
      api.protoProperty('lastMsgId');
      v.sess.rpc('foo.rpc', 1, 2, 3);
      assert.same(v.sess.lastMsgId, '1rid1');
    });

    test("cancelRpc", ()=>{
      /**
       * Return lastRpc msgId to use with {##cancelRpc}
       **/
      const rpcQueue = new RPCQueue();
      sut(v.sess, {rpcQueue});
      api.protoMethod('cancelRpc', {subject: v.sess});

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
    });

    group("reconnect", ()=>{
      /**
       * Ensure docs are tested against matches after subscriptions have returned.
       * Any unwanted docs should be removed.
       **/
      test("replay messages",  ()=>{
        assert.calledWith(v.state.onConnect, "20-rpc", TH.match(func => v.onConnect = func));
        v.sess.rpc("foo.bar", 1, 2);
        v.sess.rpc("foo.baz", 1, 2);
        v.state._state = 'retry';
        v.sendBinary.reset();
        v.recvM("1rid1", 'r');

        v.onConnect(v.sess);

        assert.calledWith(v.sendBinary, 'M', ["2rid1", "foo.baz", 1, 2]);
        assert.calledOnce(v.sendBinary); // foo.bar replied so not resent
      });
    });

    test("callback rpc",  ()=>{
      stub(koru, 'globalCallback');

      v.sess.defineRpc('foo.rpc', rpcSimMethod);

      v.sess.rpc('foo.rpc', 'a');
      const msgIdA = v.sess.lastMsgId;
      assert.equals(v.args, ['a']);


      v.sess.rpc('foo.rpc', 'b', v.bstub = stub());
      const msgIdB = v.sess.lastMsgId;
      assert.equals(v.args, ['b']);

      v.sess.rpc('foo.rpc', 'c', v.cstub = stub());
      const msgIdC = v.sess.lastMsgId;
      v.recvM(msgIdC, 'e', '404', 'error Msg');

      assert.calledWithExactly(v.cstub, TH.match(err=>{
        assert.same(err.error, 404);
        assert.same(err.reason, 'error Msg');
        return true;
      }));

      refute.called(v.bstub);

      v.recvM(msgIdB, 'r', [1,2,3]);
      v.recvM(msgIdB, 'r', [1,2,3]);

      assert.calledOnce(v.bstub);

      assert.calledWithExactly(v.bstub, null, TH.match(result=>(
        assert.equals(result, [1,2,3]), true)));

      v.sess.rpc('foo.rpc', 'x');
      const msgIdX = v.sess.lastMsgId;

      v.recvM(msgIdX, 'e', '404', 'global cb');
      assert.calledOnceWith(koru.globalCallback, TH.match(err => {
        assert.equals(err.error, 404);
        assert.equals(err.reason, 'global cb');
        return true;
      }));

      function rpcSimMethod(...args) {
        v.args = args.slice();
      }
    });

    test("rpc",  ()=>{
      v.ready = true;
      let _msgId = 0, fooId;
      v.sess.defineRpc('foo.rpc', rpcSimMethod);
      v.sess.defineRpcGet('foo.s2', rpcSimMethod2);

      refute(v.sess.isSimulation);
      v.sess.rpc('foo.rpc', 1, 2, 3);
      assert.isFalse(v.sess.isSimulation);
      assert.same(v.state.pendingCount(), 1);
      assert.same(v.state.pendingUpdateCount(), 1);


      assert.equals(v.args, [1, 2, 3]);
      assert.same(v.thisValue, util.thread);

      assert.same(v.sess.lastMsgId, '1rid1');

      v.sess.rpc('foo.s2');

      assert.same(v.state.pendingCount(), 2);
      assert.same(v.state.pendingUpdateCount(), 1);

      assert.same(v.sess.lastMsgId, '2rid1');

      v.recvM('2rid1', 'r');

      assert.same(v.state.pendingCount(), 1);
      assert.same(v.state.pendingUpdateCount(), 1);

      v.recvM('1rid1', 'r');

      assert.same(v.state.pendingCount(), 0);
      assert.same(v.state.pendingUpdateCount(), 0);

      function rpcSimMethod(...args) {
        v.thisValue = this;
        v.args = args.slice();
        fooId = (++_msgId).toString(36)+'rid1';
        assert.calledWith(v.sendBinary, 'M', [fooId, "foo.rpc"].concat(v.args));
        assert.isTrue(v.sess.isSimulation);
        v.sess.rpc('foo.s2', 'aaa');
        assert.same(v.sess.lastMsgId, fooId);

        assert.isTrue(v.sess.isSimulation);
        assert.same(v.s2Name, 'aaa');
        assert.same(v.s2This, util.thread);
      }

      function rpcSimMethod2(name) {
        v.s2Name = name;
        v.s2This = this;
        assert.isTrue(v.sess.isSimulation);
        refute.exception(()=>{v.sess.rpc('foo.remote')});
      }
    });

    test("server only rpc",  ()=>{
      v.ready = true;
      refute.exception(()=>{v.sess.rpc('foo.rpc', 1, 2, 3)});

      assert.same(v.state.pendingCount(), 1);
      assert.same(v.state.pendingUpdateCount(), 1);


      assert.calledWith(v.sendBinary, 'M', [
        v.sess.lastMsgId, "foo.rpc", 1, 2, 3]);
    });

    test("onChange rpc",  ()=>{
      after(v.state.pending.onChange(v.ob = stub()));

      assert.same(v.state.pendingCount(), 0);

      assert.isFalse(v.sess.isRpcPending());
      v.sess.rpc('foo.rpc', [1, 2]);
      const msgId1 = v.sess.lastMsgId;
      assert.isTrue(v.sess.isRpcPending());

      assert.calledOnceWith(v.ob, true);

      v.sess.rpc('foo.rpc');
      assert.calledOnce(v.ob);

      assert.same(v.state.pendingCount(), 2);
      assert.same(v.state.pendingUpdateCount(), 2);

      v.ob.reset();

      v.recvM(msgId1, 'r');

      refute.called(v.ob);

      v.recvM(v.sess.lastMsgId, 'r');

      assert.calledWith(v.ob, false);
      assert.isFalse(v.sess.isRpcPending());

      assert.same(v.state.pendingCount(), 0);
      assert.same(v.state.pendingUpdateCount(), 0);
    });  });
});
