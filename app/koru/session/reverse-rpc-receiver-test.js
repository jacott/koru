isServer && define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const SessionBase     = require('koru/session/base').constructor;
  const api             = require('koru/test/api');
  const stateFactory    = require('./state').constructor;
  const TH              = require('./test-helper');

  const {stub, spy, util, intercept} = TH;

  const ReverseRpcReceiver = require('./reverse-rpc-receiver');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let sess;

    class MySession extends SessionBase {
      constructor() {
        super();
        this.sendBinary = stub();
      }
    }

    beforeEach(() => {
      sess = new MySession();
    });

    afterEach(() => {});

    test('new', async () => {
      /**
       * Create an reverse rpc handler
       *
       * @param session used to receive rpc calls on

       * @param cmd session command to tie this rpc service to. Defaults to 'F'.

       **/
      const ReverseRpcReceiver = api.class();
      let now = util.dateNow(); intercept(util, 'dateNow', () => now);

      //[
      const reverseRpc = new ReverseRpcReceiver(sess);

      const foo = stub().returns('success');

      reverseRpc.define('foo.rpc', foo);

      const receive = sess._commands.F;
      assert.isFunction(receive);

      await receive(['1234', 'foo.rpc', 1, 2]);

      assert.calledWith(sess.sendBinary, 'F', ['1234', 'r', 'success']);

      assert.calledWith(foo, 1, 2);
      assert.same(foo.lastCall.thisValue, sess);
      //]

      const r2 = new ReverseRpcReceiver(sess, 'Z');
      assert.isFunction(sess._commands.Z);

      const p = sess._commands.Z(['4321', 'iDontExist']);
      assert(isPromise(p));
      await p;

      assert.calledWith(sess.sendBinary, 'Z', ['4321', 'e', 404, 'unknown method: iDontExist']);
    });

    test('error', async () => {
      const reverseRpc = new ReverseRpcReceiver(sess);

      reverseRpc.define('myRpc', () => {throw new koru.Error(400, {name: [['is_invalid']]})});

      await sess._commands.F(['4321', 'myRpc']);

      assert.calledWith(sess.sendBinary, 'F', ['4321', 'e', 400, {name: [['is_invalid']]}]);
    });

    test('define', () => {
      /**
       * Set the ServerConnection for the queue. And send any queued messages to it.
       */
      api.protoMethod();
      //[
      const reverseRpc = new ReverseRpcReceiver(sess);

      function myRpc(arg1, arg2) {}

      reverseRpc.define('myRpc', myRpc);

      assert.same(reverseRpc._rpcs.myRpc, myRpc);
      //]
    });
  });
});
