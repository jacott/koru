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

      v.func('1hash,version');

      refute.called(koru.reload);
      assert.same(v.sess.versionHash, 'hash,version');

      v.func('1hash,v2');

      refute.called(koru.reload);
      assert.same(v.sess.versionHash, 'hash,v2');

      v.func('1hashdiff,v2');

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

        v.rafStub = test.stub(window, 'requestAnimationFrame').returns(123);
        v.cafStub = test.stub(window, 'cancelAnimationFrame');

        v.stoStub = test.stub(koru, 'setTimeout').returns(456);
        v.ctoStub = test.stub(koru, 'clearTimeout');

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

          assert.calledWith(v.stoStub, v.actualConn._queueHeatBeat, 20000);

          v.stoStub.reset();
          util.thread.date += 15000;
          v.ws.onmessage(event);

          refute.called(v.stoStub);

          util.thread.date += 7000;
          v.actualConn._queueHeatBeat();

          assert.calledWith(v.stoStub, v.actualConn._queueHeatBeat, 13000);

          v.stoStub.reset();
          refute.called(v.rafStub);

          util.thread.date += 14000;
          v.actualConn._queueHeatBeat();

          assert.calledOnce(v.rafStub, v.actualConn._queueHeatBeat);
          v.rafStub.reset();

          v.actualConn._queueHeatBeat();

          refute.called(v.rafStub);
          assert.calledWith(v.stoStub, v.actualConn._queueHeatBeat, 10000);
          v.stoStub.reset();

          assert.calledOnce(v.ws.send);
          assert.calledWith(v.ws.send, 'H');

          util.thread.date += 1000;

          v.ws.onmessage(event);
          refute.called(v.stoStub);

          v.actualConn._queueHeatBeat();
          assert.calledWith(v.stoStub, v.actualConn._queueHeatBeat, 20000);
        });
      },

      "test no response close fails": function () {
        v.time = v.readyHeatbeat();
        v.actualConn._queueHeatBeat();

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
        v.actualConn._queueHeatBeat();

        v.ws.close = function () {
          v.ws.onclose({});
        };
        test.spy(v.ws, 'close');
        test.spy(v.ws, 'onclose');
        v.actualConn._queueHeatBeat();

        assert.calledOnce(v.ws.close);
        assert.calledOnce(v.ws.onclose);
      },

      "test cancel requestAnimationFrame": function () {
        v.time = v.readyHeatbeat();

        v.ws.onmessage({data: "foo"});

        assert.calledOnce(v.cafStub);
        assert.calledWith(v.cafStub, 123);

        v.ws.onmessage({data: "foo"});
        assert.calledOnce(v.cafStub);
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
