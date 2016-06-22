define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var util = require('../util');
  var message = require('./message');
  var clientSession = require('./main-client');
  var koru = require('../main');
  var SessState = require('./state').__init__;

  var sessState;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      sessState = SessState();
      v.sess = clientSession.__init__(sessState)({
        provide: test.stub(),
        _rpcs: {},
        globalDict: v.gDict = message.newGlobalDict(),
        _commands: {},
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

      v.sess.addToDict('foo'); // does nothing

      var dict = message.newGlobalDict();
      message.addToDict(dict, 't1');
      message.addToDict(dict, 't2');


      var endict = new Uint8Array(message.encodeDict(dict, []));

      v.func.call(v.sess, [1, 'hash,version', endict]);

      assert.same(v.sess.globalDict.k2c['t1'], 0xfffd);
      assert.same(v.sess.globalDict.k2c['t2'], 0xfffe);
      assert.same(v.sess.globalDict.k2c['foo'], undefined);

      refute.called(koru.reload);
      assert.same(v.sess.versionHash, 'hash,version');

      v.func.call(v.sess, [1, 'hash,v2', dict]);

      refute.called(koru.reload);
      assert.same(v.sess.versionHash, 'hash,v2');

      v.func.call(v.sess, [1, 'hashdiff,v2', dict]);

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
        assert.same(v.sess.ws, v.ws);

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
      test.spy(sessState, 'connected');
      test.spy(sessState, 'retry');
      test.spy(sessState, 'close');
      test.stub(koru, 'getLocation').returns({protocol: 'https:', host: 'test.host:123'});

      v.sess.connect();         // connect

      assert.called(v.sess.newWs);
      assert.same(clientSession._url(), 'wss://test.host:123/ws');

      refute.called(sessState.connected);

      v.ready = true;
      v.ws.onopen();            // connect success

      assert.calledWith(sessState.connected, TH.match(function (conn) {
        return conn.ws === v.ws;
      }));

      test.stub(koru, '_afTimeout').returns(v.afTimeoutStop = test.stub());
      TH.noInfo();

      v.ws.onclose({});         // remote close

      assert(sessState.retry.calledAfter(koru._afTimeout));

      refute(sessState.isReady());

      assert.called(sessState.retry);
      assert.calledWith(koru._afTimeout, v.sess.connect, 500);

      v.sess.stop();            // local stop

      assert.called(v.afTimeoutStop);
      assert.called(sessState.close);
      sessState.connected.reset();

      v.sess.connect();         // reconnect
      v.sess.connect();         // reconnect
      v.ws.onopen();            // success

      assert.called(sessState.connected);

      v.afTimeoutStop.reset();
      v.ws.onclose({});         // remote close again

      assert.called(koru._afTimeout);

      v.sess.connect();         // reconnect
      assert.called(v.afTimeoutStop);
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
