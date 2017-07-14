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
      TH.noInfo();
      assert.same(v.sess.version, undefined);
      assert.same(v.sess.hash, undefined);

      this.stub(koru, 'reload');
      assert.calledWith(v.sess.provide, 'X', TH.match(f=>v.X=f));

      v.sess.addToDict('foo'); // does nothing

      var dict = message.newGlobalDict();
      message.addToDict(dict, 't1');
      message.addToDict(dict, 't2');


      var endict = new Uint8Array(message.encodeDict(dict, []));

      v.X.call(v.sess, ['', 'h123', endict, 'dhash']);

      assert.same(v.sess.globalDict.k2c['t1'], 0xfffd);
      assert.same(v.sess.globalDict.k2c['t2'], 0xfffe);
      assert.same(v.sess.globalDict.k2c['foo'], undefined);
      assert.same(v.sess.dictHash, 'dhash');


      refute.called(koru.reload);
      assert.same(v.sess.hash, 'h123');

      v.X.call(v.sess, ['v10', 'h123', dict, 'dhash2']);

      assert.called(koru.reload);
    },

    "test existing dict"() {
      assert.calledWith(v.sess.provide, 'X', TH.match(f=>v.X=f));
      message.addToDict(v.sess.globalDict, 'hello');
      v.sess.dictHash = 'orig';

      v.X.call(v.sess, ['', 'h123', null]);

      assert.same(v.sess.dictHash, 'orig');
      assert.same(v.sess.globalDict.k2c.hello, 256);
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
        assert.same(v.sess.ws, v.ws);

        assert(v.ws.onmessage);

        var event = {data: v.data = "foo"};
        v.ws.onmessage(event);

        assert(v.actualConn);
        assert.same(v.actualConn.ws, v.ws);
      },

      "test heartbeat when idle"() {
        let now = Date.now();
        this.intercept(util, 'dateNow', ()=>now);

        var event = {data: v.data = "foo"};
        v.ws.onmessage(event);

        assert.same(v.sess.heartbeatInterval, 20000);

        assert.calledWith(koru._afTimeout, v.actualConn._queueHeatBeat, 20000);

        koru._afTimeout.reset();
        now += 15000;
        v.ws.onmessage(event);

        refute.called(koru._afTimeout);

        now += 7000;
        v.actualConn._queueHeatBeat();

        assert.calledWith(koru._afTimeout, v.actualConn._queueHeatBeat, 13000);

        koru._afTimeout.reset();

        now += 14000;
        v.actualConn._queueHeatBeat();

        assert.calledWith(koru._afTimeout, v.actualConn._queueHeatBeat, 10000);
        koru._afTimeout.reset();

        assert.calledOnce(v.ws.send);
        assert.calledWith(v.ws.send, 'H');

        now += 1000;

        v.ws.onmessage(event);
        refute.called(koru._afTimeout);

        v.actualConn._queueHeatBeat();
        assert.calledWith(koru._afTimeout, v.actualConn._queueHeatBeat, 20000);
      },

      "test no response close fails"() {
        TH.noInfo();
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
      assert.same(v.sess._url(), 'wss://test.host:123/ws/4/dev/');
      v.sess.hash = 'h123';
      assert.same(v.sess._pathPrefix(), 'ws/4/dev/h123');
      assert.same(v.sess._pathPrefix({foo: 123}), 'ws/4/dev/h123?foo=123');
      v.sess.dictHash = 'dh1234';
      assert.same(v.sess._pathPrefix(), 'ws/4/dev/h123?dict=dh1234');
      assert.same(v.sess._pathPrefix({bar: 'extra bit'}), 'ws/4/dev/h123?dict=dh1234&bar=extra%20bit');


      refute.called(sessState.connected);

      assert.calledWith(v.sess.provide, 'X', TH.match(f=>v.X=f));
      v.X.call(v.sess, ['', koru.PROTOCOL_VERSION, null]);

      v.ready = true;

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
      v.X.call(v.sess, ['', koru.PROTOCOL_VERSION, null]);

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
      assert.calledWith(v.sess.provide, 'X', TH.match(f=>v.X=f));
      v.X.call(v.sess, ['', koru.PROTOCOL_VERSION, null]);

      assert.calledWith(v.ws.send, ["x", "P", [null]]);
      assert.calledWith(v.ws.send, ["x", "M", [1]]);
      assert.calledWith(v.ws.send, 'SLabc');
    },
  });
});
