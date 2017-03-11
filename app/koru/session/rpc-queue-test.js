isClient && define(function (require, exports, module) {
  /**
   * Default queue for RPC messages to be sent. This queue is for an
   * in memory queue but can be replaced by a persistent queue for
   * offline-mode.
   **/
  const api = require('koru/test/api');
  const TH  = require('koru/test');

  const sut  = require('./rpc-queue');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      api.module();
    },

    tearDown() {
      v = null;
    },

    "test new"() {
      /**
       * Build a new queue
       **/
      const new_RPCQueue = api.new();

      const queue = new_RPCQueue();

      queue.push(12, 'hello');
      assert.same(queue.get(12), 'hello');
    },

    "test resend"() {
      /**
       * Iterating over the queue returns messages in msgId order.
       **/
      api.protoMethod('resend');

      const queue = new sut();
      queue.push(50, ['msg for 50']);
      queue.push(6, ['msg for 6']);
      queue.push(8, ['msg for 8']);

      const ans = [];
      queue.resend({sendBinary(type, data) {
        assert.same(type, 'M');
        ans.push(data);
      }});

      assert.equals(ans, ['msg for 6', 'msg for 8', 'msg for 50']);
    },
  });
});
