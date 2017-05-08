define(function (require, exports, module) {
  const koru                 = require('../main');
  const util                 = require('../util');
  const message              = require('./message');
  const stateFactory         = require('./state').constructor;
  const TH                   = require('./test-helper');

  const sessionClientFactory = require('./main-client');
  var v, sessState;

  TH.testCase(module, {
    setUp() {
      v = {};
      sessState = stateFactory();
      v.sess = sessionClientFactory({
        provide: this.stub(),
        _rpcs: {},
        globalDict: v.gDict = message.newGlobalDict(),
        _commands: {},
      }, sessState);
      v.sess.newWs = this.stub().returns(v.ws = {
        send: this.stub(),
        close: this.stub(),
      });
      v.ready = false;
      TH.mockConnectState(v);
    },

    tearDown() {
      sessState._resetPendingCount();
      v = null;
    },

    "test initial KORU_APP_VERSION"() {
      this.onEnd(() => delete window.KORU_APP_VERSION);

      window.KORU_APP_VERSION = "v1,hash";

       v.sess = sessionClientFactory({
         provide: this.stub(),
         _rpcs: {},
       }, sessState);

      assert.same(v.sess.version, "v1");
      assert.same(v.sess.hash, "hash");
    },

    "test version reconciliation"() {
      assert.same(v.sess.version, undefined);
      assert.same(v.sess.hash, undefined);

      this.stub(koru, 'reload');
      assert.calledWith(v.sess.provide, 'X', TH.match(func => v.func = func));

      v.sess.addToDict('foo'); // does nothing

      var dict = message.newGlobalDict();
      message.addToDict(dict, 't1');
      message.addToDict(dict, 't2');


      var endict = new Uint8Array(message.encodeDict(dict, []));

      v.func.call(v.sess, [1, 'v3', endict]);

      assert.same(v.sess.globalDict.k2c['t1'], 0xfffd);
      assert.same(v.sess.globalDict.k2c['t2'], 0xfffe);
      assert.same(v.sess.globalDict.k2c['foo'], undefined);

      refute.called(koru.reload);
      assert.same(v.sess.version, 'v3');

      v.func.call(v.sess, [1, 'v2', dict]);

      refute.called(koru.reload);
      assert.same(v.sess.version, 'v3');

      v.func.call(v.sess, [1, 'v10', dict]);

      assert.called(koru.reload);
    },

    "onmessage": {
      setUp() {
        v.ws = {send: this.stub()};
        v.sess = {
          provide: this.stub(),
          _onMessage(conn, data) {
            v.actualConn = conn;
            assert.same(data, v.data);
          },
        };
        sessionClientFactory(v.sess, sessState);

        v.sess.newWs = this.stub().returns(v.ws);

        this.stub(koru, '_afTimeout').returns(v.afTimeoutStop = this.stub());

        v.sess.connect();

        v.readyHeatbeat = () => {
          util.withDateNow(util.dateNow(), () => {
            var event = {data: v.data = "foo"};
            v.ws.onmessage(event);
            util.thread.date += 21000;
            v.actualConn._queueHeatBeat();

            return util.thread.date;
          });
        };
      },

      "test setup"() {
        assert.calledWith(v.sess.provide, 'K', TH.match.func);
        assert.same(v.sess.ws, v.ws);

        assert(v.ws.onmessage);

        var event = {data: v.data = "foo"};
        v.ws.onmessage(event);

        assert(v.actualConn);
        assert.same(v.actualConn.ws, v.ws);
      },

      "test heartbeat when idle"() {
        util.withDateNow(util.dateNow(), () => {
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

      "test no response close fails"() {
        v.time = v.readyHeatbeat();

        v.ws.close = () => {throw new Error("close fail")};
        this.spy(v.ws, 'onclose');
        assert.exception(() => {
          v.actualConn._queueHeatBeat();
        }, "Error", "close fail");

        assert.called(v.ws.onclose);
      },

      "test no response close succeeds"() {
        v.time = v.readyHeatbeat();

        v.ws.close = () => {
          v.ws.onclose({});
        };
        this.spy(v.ws, 'close');
        this.spy(v.ws, 'onclose');
        v.actualConn._queueHeatBeat();

        assert.calledOnce(v.ws.close);
        assert.calledOnce(v.ws.onclose);
      },
    },

    "test connection cycle"() {
      this.spy(sessState, 'connected');
      this.spy(sessState, 'retry');
      this.spy(sessState, 'close');
      this.stub(koru, 'getLocation').returns({protocol: 'https:', host: 'test.host:123'});

      v.sess.connect();         // connect

      assert.called(v.sess.newWs);
      assert.same(sessionClientFactory._url(), 'wss://test.host:123/ws');

      refute.called(sessState.connected);

      v.ready = true;
      v.ws.onopen();            // connect success

      assert.calledWith(sessState.connected, TH.match(conn => conn.ws === v.ws));

      this.stub(koru, '_afTimeout').returns(v.afTimeoutStop = this.stub());
      TH.noInfo();

      v.ws.onclose({code: 4404, reason: 'not found'});         // remote close

      assert(sessState.retry.calledAfter(koru._afTimeout));

      assert.calledWith(sessState.retry, 4404, 'not found');

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

    "test before connected"() {
      this.stub(message, 'encodeMessage', (type, msg) => ['x', type, msg]);
      v.sess.sendBinary('P', [null]);
      v.sess.sendBinary('M', [1]);
      v.sess.send('S', 'Labc');

      assert.equals(v.sess._waitSends, [['P', [null]], ['M', [1]], 'SLabc']);

      v.sess.connect();
      v.ready = true;
      v.ws.onopen();

      assert.calledWith(v.ws.send, 'X3');
      assert.calledWith(v.ws.send, ["x", "P", [null]]);
      assert.calledWith(v.ws.send, ["x", "M", [1]]);
      assert.calledWith(v.ws.send, 'SLabc');
    },


    "open connection": {
      setUp() {
        v.sess.connect();
        v.ws.onopen();
        v.sendBinary = this.stub(v.sess, 'sendBinary');
      },

      "test stop"() {
        v.sess.stop();

        assert.calledOnce(v.ws.close);
      },

      "test sendBinary"() {
        v.ready = true;
        v.sendBinary.restore();
        v.sess.sendBinary('M', [1,2,3,4]);

        assert.calledWith(v.ws.send, TH.match(data  => {
          if (data[0] === 'M'.charCodeAt(0)) {
            assert.equals(message.decodeMessage(data.subarray(1), v.sess.globalDict), [1,2,3,4]);
            return true;
          }
        }));
      },
    },
  });
});
