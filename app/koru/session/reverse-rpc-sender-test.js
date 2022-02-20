isServer && define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const ConnTH          = require('koru/session/conn-th-server');
  const RPCQueue        = require('koru/session/rpc-queue');
  const ServerConnection = require('koru/session/server-connection');
  const api             = require('koru/test/api');
  const TH              = require('./test-helper');

  const {stub, spy, util, intercept, match: m} = TH;

  const ReverseRpcSender = require('./reverse-rpc-sender');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('new', () => {
      /**
       * Create an reverse rpc handler
       *
       * @param conn optional ServerConnection
       * @param cmd session command to tie this rpc service to. Defaults to 'F'.
       * @param rpcQueue queue to store messages yet to have a response. This can be a persistent
       * queue. (Defaults to {#../RpcQueue}).
       **/
      const ReverseRpcSender = api.class();
      let now = util.dateNow(); intercept(util, 'dateNow', () => now);

      const mySession = {};

      const conn = ConnTH.mockConnection(void 0, mySession);

      //[
      const cmd = 'F';
      const rpcQueue = new RPCQueue(cmd);
      const reverseRpc = new ReverseRpcSender({conn, cmd, rpcQueue});

      reverseRpc.rpc('foo.rpc', 1, 2);

      const msgId = '1' + reverseRpc.baseId.toString(36);
      assert.equals(rpcQueue.get(msgId), [[msgId, 'foo.rpc', 1, 2], null]);
      //]

      assert.same(reverseRpc.baseId, now.toString(36));

      assert(new ReverseRpcSender().rpcQueue.cmd === 'F');
    });

    test('configureSession', async () => {
      /**
       * Enable a session to receive reverseRpc callbacks
       *
       * @param session the session that initiates the callbacks
       * @param cmd session command to tie this rpc service to. Defaults to 'F'.
       */
      const mySession = {
        provide: stub(),
      };
      api.method();
      //[
      ReverseRpcSender.configureSession(mySession, 'F');
      assert.calledOnceWith(mySession.provide, 'F', m.func);
      //]

      const conn = ConnTH.mockConnection(void 0, mySession);
      const reverseRpc = new ReverseRpcSender({conn});
      const handler = mySession.provide.firstCall.args[1];
      const callback = stub().returns(Promise.resolve(123));

      reverseRpc.rpc('myCall', 1, callback);

      const msgId = '1' + reverseRpc.baseId.toString(36);
      const data = [msgId, 'r', [1, 2, 3]];

      assert.same(await handler.call(conn, data), 123);

      assert.calledWith(callback, null, data[2]);

      await handler.call(conn, data);
      assert.calledOnce(callback);

      callback.reset();

      /** error */

      reverseRpc.rpc('myCall', 1, callback);

      const errData = ['2' + reverseRpc.baseId.toString(36), 'e', 400, {name: [['is_invalid']]}];
      assert.same(await handler.call(conn, errData), 123);

      let errResult;
      assert.calledWithExactly(callback, m((err) => errResult = err));

      assert(errResult instanceof koru.Error);
      assert.equals(errResult.error, 400);
      assert.equals(errResult.reason, {name: [['is_invalid']]});
    });

    test('setConn', () => {
      /**
       * Set the ServerConnection for the queue. And send any queued messages to it.
       */
      api.protoMethod();
      //[
      const reverseRpc = new ReverseRpcSender();

      const conn = {sendBinary: stub()};

      reverseRpc.rpc('foo.rpc', 1, 2);

      reverseRpc.setConn(conn);

      assert.calledWith(conn.sendBinary, 'F', ['1' + reverseRpc.baseId, 'foo.rpc', 1, 2]);

      reverseRpc.rpc('another');

      assert.calledWith(conn.sendBinary, 'F', ['2' + reverseRpc.baseId, 'another']);
      //]
    });

    test('rpc', () => {
      /**
       * perform a remote procedure call.

       * @param name of the method to call
       * @param args the arguments to pass to the method followed by an optional callback
       */

      const conn = {sendBinary: stub()};
      const reverseRpc = new ReverseRpcSender({conn});

      api.protoMethod();

      const handler = {
        error: stub(),
        healthResult: stub(),
      };
      //[
      reverseRpc.rpc('getHealth', 'battery', 'PSU', (err, result) => {
        if (err != null) {
          handler.error(err);
        } else {
          handler.healthResult(result);
        }
      });
      assert.calledWith(conn.sendBinary, 'F', ['1' + reverseRpc.baseId, 'getHealth', 'battery', 'PSU']);
      //]

    });
  });
});
