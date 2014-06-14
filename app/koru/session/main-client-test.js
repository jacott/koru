define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var util = require('../util');
  var message = require('./message');
  var clientSession = require('./main-client');
  var env = require('../env');
  var sync = require('./sync');

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
    },

    tearDown: function () {
      sync._resetCount();
      v = null;
    },

    "test connection cycle": function () {
      v.sess.onConnect("9a", v.onConStub = test.stub());

      assert.same(v.sess._onConnect["9a"][0], v.onConStub);

      test.stub(env, 'getLocation').returns({protocol: 'https:', host: 'test.host:123'});

      v.sess.connect();         // connect

      assert.calledWith(v.sess.newWs, 'wss://test.host:123');
      refute.called(v.onConStub);
      assert.same(v.sess.state, 'closed');

      v.ws.onopen();            // connect success

      assert.same(v.sess.state, 'ready');
      assert.called(v.onConStub);

      test.stub(window, 'setTimeout').returns('c123');
      test.stub(window, 'clearTimeout');
      test.stub(env, 'info');

      v.ws.onclose({});         // remote close

      assert.same(v.sess.state, 'retry');
      assert.calledWith(setTimeout, v.sess.connect, 500);

      v.sess.stop();            // local stop

      assert.calledWith(clearTimeout, 'c123');
      assert.same(v.sess.state, 'closed');
      v.onConStub.reset();

      v.sess.connect();         // reconnect
      v.ws.onopen();            // success

      assert.called(v.onConStub);
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
