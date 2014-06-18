define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var util = require('../util');
  var message = require('./message');
  var clientSession = require('./main-client');
  var koru = require('../main');
  var sessState = require('./state');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.sess = clientSession({
        provide: test.stub(),
        _rpcs: {},
      });
      v.sess.newWs = test.stub().returns(v.ws = {
        send: test.stub(),
        close: test.stub(),
      });
      v.ready = false;
      TH.mockConnectState(v);
    },

    tearDown: function () {
      sessState._resetPendingCount();
      v = null;
    },

    "test connection cycle": function () {
      test.stub(koru, 'getLocation').returns({protocol: 'https:', host: 'test.host:123'});

      v.sess.connect();         // connect

      assert.calledWith(v.sess.newWs, 'wss://test.host:123/ws');
      refute.called(sessState.connected);

      v.ready = true;
      v.ws.onopen();            // connect success

      assert.calledWith(sessState.connected, TH.match(function (conn) {
        return conn.ws === v.ws;
      }));

      test.stub(window, 'setTimeout').returns('c123');
      test.stub(window, 'clearTimeout');
      test.stub(koru, 'info');

      v.ws.onclose({});         // remote close

      assert.called(sessState.retry);
      assert.calledWith(setTimeout, v.sess.connect, 500);

      v.sess.stop();            // local stop

      assert.calledWith(clearTimeout, 'c123');
      assert.called(sessState.close);
      sessState.connected.reset();

      v.sess.connect();         // reconnect
      v.ws.onopen();            // success

      assert.called(sessState.connected);
    },

    "test before connected": function () {
      test.stub(message, 'encodeMessage', function (type, msg) {
        return ['x', type, msg];
      });
      v.sess.sendBinary('P', [null]);
      v.sess.sendBinary('M', [1]);
      v.sess.send('S', 'Labc');

      assert.equals(v.sess._waitSends, [['P', [null]], ['M', [1]], 'SLabc']);

      v.sess.connect();
      v.ready = true;
      v.ws.onopen();

      assert.calledWith(v.ws.send, 'X1');
      assert.calledWith(v.ws.send, ["x", "P", [null]]);
      assert.calledWith(v.ws.send, ["x", "M", [1]]);
      assert.calledWith(v.ws.send, 'SLabc');
    },


    "open connection": {
      setUp: function () {
        v.sess.connect();
        v.ws.onopen();
        v.sendBinary = test.stub(v.sess, 'sendBinary');
      },

      "test stop": function () {
        v.sess.stop();

        assert.calledOnce(v.ws.close);
      },

      "test sendBinary": function () {
        v.ready = true;
        v.sendBinary.restore();
        v.sess.sendBinary('M', [1,2,3,4]);

        assert.calledWith(v.ws.send, TH.match(function (data) {
          if (data[0] === 'M'.charCodeAt(0)) {
            assert.equals(message.decodeMessage(data.subarray(1)), [1,2,3,4]);
            return true;
          }
        }));
      },
    },
  });
});
