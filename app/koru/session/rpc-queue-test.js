isClient && define((require, exports, module)=>{
  'use strict';
  /**
   * Default queue for RPC messages to be sent. This queue is for an
   * in memory queue but can be replaced by a persistent queue for
   * offline-mode.
   **/
  const Random = require('koru/random');
  const TH     = require('koru/test-helper');
  const api    = require('koru/test/api');

  const {stub, spy} = TH;

  const sut  = require('./rpc-queue');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("constructor", ()=>{
      /**
       * Build a new queue
       **/
      const RPCQueue = api.class();

      const queue = new RPCQueue();

      let data, func;

      queue.push({checkMsgId() {}}, data = [12, 'save'], func = stub());
      assert.equals(queue.get(12), [data, func]);
    });

    test("push updates nextMsgId", ()=>{
      /**
       * enque msg and call session.checkMsgId
       **/
      const queue = new sut();
      const session = {checkMsgId: stub()};
      queue.push(session, ['50'+'abcdef', 'list']);
      assert.calledWith(session.checkMsgId, '50abcdef');
    });

    test("resend", ()=>{
      /**
       * Iterating over the queue returns messages in msgId order.
       **/
      api.protoMethod('resend');

      const session = {
        _msgId: 0,
        sendBinary(type, data) {
          assert.same(type, 'M');
          ans.push(data);
        },
        checkMsgId() {},
      };

      const queue = new sut();
      queue.push(session, ['50'+Random.id(), 'list']);
      queue.push(session, ['6'+Random.id(), 'get', 423]);
      queue.push(session, ['8'+Random.id(), 'get', 5]);

      const ans = [];
      queue.resend(session);

      assert.same(session._msgId.toString(36), '50');


      assert.equals(ans, [[TH.match(/^6/), 'get', 423], [TH.match(/^8/), 'get', 5],
                          [TH.match(/^50/), 'list']]);
    });
  });
});
