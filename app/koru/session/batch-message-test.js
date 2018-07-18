isServer && define((require, exports, module)=>{
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
      v.conn1 = {sessId: 1, ws: {send: stub()}};
      v.conn2 = {sessId: 2, ws: {send: stub()}};
      v.conn3 = {sessId: 3, ws: {send: stub()}};
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
      assert.calledWith(v.conn1.ws.send, 'enc', {binary: true});
      assert.calledWith(v.conn2.ws.send, 'enc', {binary: true});
      assert.calledWith(v.conn3.ws.send, 'enc2', {binary: true});
    });

    test("type changes", ()=>{
      const bm = new sut(v.conn);
      bm.batch(v.conn1, 'A', [1], v.filter = stub().returns("filtered"));
      bm.batch(v.conn2, 'B', [1]);

      stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2');
      bm.release();

      assert.calledWith(v.conn1.ws.send, 'enc', {binary: true});
      assert.calledWith(v.conn2.ws.send, 'enc2', {binary: true});
    });

    test("filterchanges", ()=>{
      const bm = new sut(v.conn);
      bm.batch(v.conn1, 'A', [1]);
      bm.batch(v.conn2, 'C', [1]);

      stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2');
      bm.release();

      assert.calledWith(v.conn1.ws.send, 'enc', {binary: true});
      assert.calledWith(v.conn2.ws.send, 'enc2', {binary: true});
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
      assert.calledOnceWith(v.conn1.ws.send, 'enc', {binary: true});
      assert.calledOnceWith(v.conn2.ws.send, 'enc2', {binary: true});
    });

    test("conn same eob", ()=>{
      const bm = new sut(v.conn);
      bm.batch(v.conn1, 'A', [1]);
      bm.batch(v.conn1, 'C', [1]);

      stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('bad');
      bm.release();

      assert.calledWith(message.encodeMessage, 'W', [['A', [1]], ['C', [1]]], v.sess.globalDict);
      assert.calledOnceWith(v.conn1.ws.send, 'enc', {binary: true});
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
      assert.calledWith(v.conn1.ws.send, 'enc', {binary: true});
      assert.calledWith(v.conn1.ws.send, 'enc2', {binary: true});
      assert.calledOnceWith(v.conn2.ws.send, 'enc2', {binary: true});
    });

    test("closed conn", ()=>{
      const bm = new sut(v.conn);
      bm.batch(v.conn1, 'A', [4]);
      bm.batch(v.conn2, 'A', [4]);
      bm.batch(v.conn1, 'C', [4]);

      stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2');
      v.conn1.close = ()=>{v.conn1.ws = null};
      v.conn1.ws.send = ()=>{
        stub(koru, 'info');
        throw new Error("closed");
      };

      bm.release();

      assert.calledWith(koru.info, 'batch send exception');
      assert.calledWith(message.encodeMessage, 'A', [4], v.sess.globalDict);
      assert.calledOnceWith(v.conn2.ws.send, 'enc', {binary: true});
    });

    test("batch abort", ()=>{
      const bm = new sut(v.conn);

      bm.batch(v.conn1, 'A', [1, 2, 3], undefined);

      bm.abort();

      bm.release();

      refute.called(v.conn1.ws.send);
    });
  });
});
