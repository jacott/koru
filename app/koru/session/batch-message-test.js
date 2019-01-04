isServer && define((require, exports, module)=>{
  /**
   * BatchMessage is used to bundle multi server-to-client messages automatically
   **/
  const api             = require('koru/test/api');
  const koru            = require('../main');
  const message         = require('./message');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd} = TH;

  const sut = require('./batch-message');

  let v= {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.sess = {globalDict: message.newGlobalDict()};
      v.conn = {_session: v.sess};
      v.conn1 = {sessId: 1, sendEncoded: stub()};
      v.conn2 = {sessId: 2, sendEncoded: stub()};
      v.conn3 = {sessId: 3, sendEncoded: stub()};
    });

    afterEach(()=>{
      v = {};
    });

    test("batch release",  ()=>{
      const bm = new sut(v.conn);

      bm.batch(v.conn1, 'A', [1, v.obj = {a: 1}, 3], v.filter = stub().returns("filtered"));
      bm.batch(v.conn2, 'A', [1, v.obj, 3], v.filter);
      bm.batch(v.conn3, 'A', [1, {a: 1}, 3], v.filter);

      stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2');
      bm.release();

      assert.calledWith(message.encodeMessage, 'A', "filtered", v.sess.globalDict);
      assert.calledWith(v.conn1.sendEncoded, 'enc');
      assert.calledWith(v.conn2.sendEncoded, 'enc');
      assert.calledWith(v.conn3.sendEncoded, 'enc2');
    });

    test("type changes", ()=>{
      const bm = new sut(v.conn);
      bm.batch(v.conn1, 'A', [1], v.filter = stub().returns("filtered"));
      bm.batch(v.conn2, 'B', [1]);

      stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2');
      bm.release();

      assert.calledWith(v.conn1.sendEncoded, 'enc');
      assert.calledWith(v.conn2.sendEncoded, 'enc2');
    });

    test("filterchanges", ()=>{
      const bm = new sut(v.conn);
      bm.batch(v.conn1, 'A', [1]);
      bm.batch(v.conn2, 'C', [1]);

      stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2');
      bm.release();

      assert.calledWith(v.conn1.sendEncoded, 'enc');
      assert.calledWith(v.conn2.sendEncoded, 'enc2');
    });

    test("conn same then one conn", ()=>{
      const bm = new sut(v.conn);
      bm.batch(v.conn1, 'A', [1]);
      bm.batch(v.conn1, 'C', [1]);
      bm.batch(v.conn2, 'A', [4]);

      stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2');
      bm.release();

      assert.calledWith(message.encodeMessage, 'W', [['A', [1]], ['C', [1]]], v.sess.globalDict);
      assert.calledWith(message.encodeMessage, 'A', [4], v.sess.globalDict);
      assert.calledOnceWith(v.conn1.sendEncoded, 'enc');
      assert.calledOnceWith(v.conn2.sendEncoded, 'enc2');
    });

    test("conn same eob", ()=>{
      const bm = new sut(v.conn);
      bm.batch(v.conn1, 'A', [1]);
      bm.batch(v.conn1, 'C', [1]);

      stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('bad');
      bm.release();

      assert.calledWith(message.encodeMessage, 'W', [['A', [1]], ['C', [1]]], v.sess.globalDict);
      assert.calledOnceWith(v.conn1.sendEncoded, 'enc');
    });

    test("conn same then many conns", ()=>{
      const bm = new sut(v.conn);
      bm.batch(v.conn1, 'A', [1]);
      bm.batch(v.conn1, 'C', [1]);
      bm.batch(v.conn1, 'A', [4]);
      bm.batch(v.conn2, 'A', [4]);

      stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2')
        .onCall(2).returns('bad');
      bm.release();

      assert.calledWith(message.encodeMessage, 'W', [['A', [1]], ['C', [1]]], v.sess.globalDict);
      assert.calledWith(message.encodeMessage, 'A', [4], v.sess.globalDict);
      assert.calledWith(v.conn1.sendEncoded, 'enc');
      assert.calledWith(v.conn1.sendEncoded, 'enc2');
      assert.calledOnceWith(v.conn2.sendEncoded, 'enc2');
    });

    test("batchBroadcast", ()=>{
      /**
       * Send identical message to a collection of connections

       * @param iter an iterator over a collection of connections
       * @param type of message
       * @param args for message
       * @param [func] lazy mapper of args
       **/
      api.protoMethod();
      const bm = new sut(v.conn);
      bm.batchBroadcast([v.conn1, v.conn2], 'A', [2], (args)=>args.map(n => n*2));

      stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('bad');
      bm.release();

      assert.calledWith(message.encodeMessage, 'A', [4], v.sess.globalDict);
      assert.calledOnceWith(v.conn1.sendEncoded, 'enc');
      assert.calledOnceWith(v.conn2.sendEncoded, 'enc');
    });

    test("batch abort", ()=>{
      const bm = new sut(v.conn);

      bm.batch(v.conn1, 'A', [1, 2, 3], void 0);

      bm.abort();

      bm.release();

      refute.called(v.conn1.sendEncoded);
    });
  });
});
