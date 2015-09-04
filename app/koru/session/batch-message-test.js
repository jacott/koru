isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./batch-message');
  var message = require('./message');
  var koru = require('../main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.sess = {globalDict: message.newGlobalDict()};
      v.conn1 = {sessId: 1, ws: {send: test.stub()}};
      v.conn2 = {sessId: 2, ws: {send: test.stub()}};
      v.conn3 = {sessId: 3, ws: {send: test.stub()}};
    },

    tearDown: function () {
      v = null;
    },

    "test batch release": function () {
      var bm = new sut(v.sess);

      bm.batch(v.conn1, 'A', [1, v.obj = {a: 1}, 3], v.filter = test.stub().returns("filtered"));
      bm.batch(v.conn2, 'A', [1, v.obj, 3], v.filter);
      bm.batch(v.conn3, 'A', [1, {a: 1}, 3], v.filter);

      test.stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2');
      bm.release();

      assert.calledWith(message.encodeMessage, 'A', "filtered", v.sess.globalDict);
      assert.calledWith(v.conn1.ws.send, 'enc', {binary: true});
      assert.calledWith(v.conn2.ws.send, 'enc', {binary: true});
      assert.calledWith(v.conn3.ws.send, 'enc2', {binary: true});
    },

    "test type changes": function () {
      var bm = new sut(v.sess);
      bm.batch(v.conn1, 'A', [1], v.filter = test.stub().returns("filtered"));
      bm.batch(v.conn2, 'B', [1]);

      test.stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2');
      bm.release();

      assert.calledWith(v.conn1.ws.send, 'enc', {binary: true});
      assert.calledWith(v.conn2.ws.send, 'enc2', {binary: true});
    },

    "test filterchanges": function () {
      var bm = new sut(v.sess);
      bm.batch(v.conn1, 'A', [1]);
      bm.batch(v.conn2, 'C', [1]);

      test.stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2');
      bm.release();

      assert.calledWith(v.conn1.ws.send, 'enc', {binary: true});
      assert.calledWith(v.conn2.ws.send, 'enc2', {binary: true});
    },

    "test conn same then one conn": function () {
      var bm = new sut(v.sess);
      bm.batch(v.conn1, 'A', [1]);
      bm.batch(v.conn1, 'C', [1]);
      bm.batch(v.conn2, 'A', [4]);

      test.stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2');
      bm.release();

      assert.calledWith(message.encodeMessage, 'W', [['A', [1]], ['C', [1]]], v.sess.globalDict);
      assert.calledWith(message.encodeMessage, 'A', [4], v.sess.globalDict);
      assert.calledOnceWith(v.conn1.ws.send, 'enc', {binary: true});
      assert.calledOnceWith(v.conn2.ws.send, 'enc2', {binary: true});
    },

    "test conn same eob": function () {
      var bm = new sut(v.sess);
      bm.batch(v.conn1, 'A', [1]);
      bm.batch(v.conn1, 'C', [1]);

      test.stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('bad');
      bm.release();

      assert.calledWith(message.encodeMessage, 'W', [['A', [1]], ['C', [1]]], v.sess.globalDict);
      assert.calledOnceWith(v.conn1.ws.send, 'enc', {binary: true});
    },

    "test conn same then many conns": function () {
      var bm = new sut(v.sess);
      bm.batch(v.conn1, 'A', [1]);
      bm.batch(v.conn1, 'C', [1]);
      bm.batch(v.conn1, 'A', [4]);
      bm.batch(v.conn2, 'A', [4]);

      test.stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2')
        .onCall(2).returns('bad');
      bm.release();

      assert.calledWith(message.encodeMessage, 'W', [['A', [1]], ['C', [1]]], v.sess.globalDict);
      assert.calledWith(message.encodeMessage, 'A', [4], v.sess.globalDict);
      assert.calledWith(v.conn1.ws.send, 'enc', {binary: true});
      assert.calledWith(v.conn1.ws.send, 'enc2', {binary: true});
      assert.calledOnceWith(v.conn2.ws.send, 'enc2', {binary: true});
    },

    "test closed conn": function () {
      var bm = new sut(v.sess);
      bm.batch(v.conn1, 'A', [4]);
      bm.batch(v.conn2, 'A', [4]);
      bm.batch(v.conn1, 'C', [4]);

      test.stub(message, 'encodeMessage').onCall(0).returns('enc').onCall(1).returns('enc2');
      v.conn1.close = function () {
        v.conn1.ws = null;
      };
      v.conn1.ws.send = function () {
        test.stub(koru, 'info');
        throw new Error("closed");
      };

      bm.release();

      assert.calledWith(koru.info, 'batch send exception');
      assert.calledWith(message.encodeMessage, 'A', [4], v.sess.globalDict);
      assert.calledOnceWith(v.conn2.ws.send, 'enc', {binary: true});
    },

    "test batch abort": function () {
      var bm = new sut(v.sess);

      bm.batch(v.conn1, 'A', [1, 2, 3], undefined);

      bm.abort();

      bm.release();

      refute.called(v.conn1.ws.send);
    },
  });
});
