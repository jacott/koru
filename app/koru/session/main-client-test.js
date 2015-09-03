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
      v.gDict = message.newGlobalDict();
    },

    tearDown: function () {
      sessState._resetPendingCount();
      v = null;
    },

    "test server-to-client broadcast messages": function () {
      v.sess.registerBroadcast("foo", v.foo = test.stub());
      v.sess.registerBroadcast("bar", v.bar = test.stub());
      test.onEnd(function () {
        v.sess.deregisterBroadcast("foo");
        v.sess.deregisterBroadcast("bar");
      });

      assert.calledWith(v.sess.provide, 'B', TH.match(function (arg) {
        v.func = arg;
        return typeof arg === 'function';
      }));

      var data = ['foo', 1, 2, 3];
      var buffer = message.encodeMessage('M', data);

      v.func(buffer.subarray(1));

      assert.calledWith(v.foo, 1, 2, 3);
      refute.called(v.bar);

      data = ['bar', "otherTest"];
      buffer = message.encodeMessage('M', data);
      v.func(buffer.subarray(1));

      assert.calledWith(v.bar, "otherTest");
    },

    "test initial KORU_APP_VERSION": function () {
      test.onEnd(function () {
        delete window.KORU_APP_VERSION;
      });

      window.KORU_APP_VERSION = "hash,v1";

       v.sess = clientSession({
         provide: test.stub(),
         _rpcs: {},
       });

      assert.same(v.sess.versionHash, "hash,v1");
    },

    "test version reconciliation": function () {
      assert.same(v.sess.versionHash, undefined);

      test.stub(koru, 'reload');
      assert.calledWith(v.sess.provide, 'X', TH.match(function (func) {
        return v.func = func;
      }));

      var dict = message.newGlobalDict();
      message.addToDict(dict, 't1');
      message.addToDict(dict, 't2');

      var endict = new Uint8Array(message.encodeDict(dict, []));

      v.func(message.encodeMessage('X', [1, 'hash,version', endict]).subarray(1));

      assert.same(v.sess.globalDict.k2c['t1'], 0x8000);
      assert.same(v.sess.globalDict.k2c['t2'], 0x8001);

      refute.called(koru.reload);
      assert.same(v.sess.versionHash, 'hash,version');

      v.func(message.encodeMessage('X', [1, 'hash,v2', dict], v.gDict).subarray(1));

      refute.called(koru.reload);
      assert.same(v.sess.versionHash, 'hash,v2');

      v.func(message.encodeMessage('X', [1, 'hashdiff,v2', dict], v.gDict).subarray(1));

      assert.called(koru.reload);
    },

    "onmessage": {
      setUp: function () {
        v.ws = {send: test.stub()};
        v.sess = {
          provide: test.stub(),
          _onMessage: function (conn, data) {
            v.actualConn = conn;
            assert.same(data, v.data);
          },
        };
        clientSession(v.sess);

        v.sess.newWs = test.stub().returns(v.ws);

        test.stub(koru, '_afTimeout').returns(v.afTimeoutStop = test.stub());

        v.sess.connect();

        v.readyHeatbeat = function () {
          util.withDateNow(util.dateNow(), function () {
            var event = {data: v.data = "foo"};
            v.ws.onmessage(event);
            util.thread.date += 21000;
            v.actualConn._queueHeatBeat();

            return util.thread.date;
          });
        };
      },

      "test setup": function () {
        assert.calledWith(v.sess.provide, 'K', TH.match.func);
        assert.same(v.sess.connect._ws, v.ws);

        assert(v.ws.onmessage);

        var event = {data: v.data = "foo"};
        v.ws.onmessage(event);

        assert(v.actualConn);
        assert.same(v.actualConn.ws, v.ws);
      },

      "test heartbeat when idle": function () {
        util.withDateNow(util.dateNow(), function () {
          var event = {data: v.data = "foo"};
          v.ws.onmessage(event);

          assert.same(v.sess.heartbeatInterval, 20000);

          assert.calledWith(koru._afTimeout, v.actualConn._queueHeatBeat, 20000);

          koru._afTimeout.reset();
          util.thread.date += 15000;
          v.ws.onmessage(event);

          refute.called(koru._afTimeout);

          util.thread.date += 7000;
          v.actualConn._queueHeatBeat();

          assert.calledWith(koru._afTimeout, v.actualConn._queueHeatBeat, 13000);

          koru._afTimeout.reset();

          util.thread.date += 14000;
          v.actualConn._queueHeatBeat();

          assert.calledWith(koru._afTimeout, v.actualConn._queueHeatBeat, 10000);
          koru._afTimeout.reset();

          assert.calledOnce(v.ws.send);
          assert.calledWith(v.ws.send, 'H');

          util.thread.date += 1000;

          v.ws.onmessage(event);
          refute.called(koru._afTimeout);

          v.actualConn._queueHeatBeat();
          assert.calledWith(koru._afTimeout, v.actualConn._queueHeatBeat, 20000);
        });
      },

      "test no response close fails": function () {
        v.time = v.readyHeatbeat();

        v.ws.close = function () {
          throw new Error("close fail");
        };
        test.spy(v.ws, 'onclose');
        assert.exception(function () {
          v.actualConn._queueHeatBeat();
        }, "Error", "close fail");

        assert.called(v.ws.onclose);
      },

      "test no response close succeeds": function () {
        v.time = v.readyHeatbeat();

        v.ws.close = function () {
          v.ws.onclose({});
        };
        test.spy(v.ws, 'close');
        test.spy(v.ws, 'onclose');
        v.actualConn._queueHeatBeat();

        assert.calledOnce(v.ws.close);
        assert.calledOnce(v.ws.onclose);
      },
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

      test.stub(koru, '_afTimeout').returns(v.afTimeoutStop = test.stub());
      test.stub(koru, 'info');

      v.ws.onclose({});         // remote close

      assert.called(sessState.retry);
      assert.calledWith(koru._afTimeout, v.sess.connect, 500);

      v.sess.stop();            // local stop

      assert.called(v.afTimeoutStop);
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
            assert.equals(message.decodeMessage(data.subarray(1), v.sess.globalDict), [1,2,3,4]);
            return true;
          }
        }));
      },
    },
  });
});
