define((require, exports, module)=>{
  'use strict';
  const {private$}      = require('koru/symbols');
  const koru            = require('../main');
  const util            = require('../util');
  const message         = require('./message');
  const stateFactory    = require('./state').constructor;
  const TH              = require('./test-helper');

  const sessionClientFactory = require('./main-client');

  const {stub, spy, intercept} = TH;

  let v = {}, sessState = null;

  TH.testCase(module, ({after, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      sessState = stateFactory();
      v.sess = sessionClientFactory({
        provide: stub(),
        _rpcs: {},
        globalDict: v.gDict = message.newGlobalDict(),
        _commands: {},
      }, sessState);
      v.sess.newWs = stub().returns(v.ws = {
        send: stub(),
        close: stub(),
      });
      v.ready = false;
      TH.mockConnectState(v);
    });

    afterEach(()=>{
      sessState._resetPendingCount();
      sessState = null;
      v = {};
    });

    test("initial KORU_APP_VERSION", ()=>{
      after(() => window.KORU_APP_VERSION=void 0);

      window.KORU_APP_VERSION = "v1,hash";

       v.sess = sessionClientFactory({
         provide: stub(),
         _rpcs: {},
       }, sessState);

      assert.same(v.sess.version, "v1");
      assert.same(v.sess.hash, "hash");
    });

    test("version reconciliation", ()=>{
      TH.noInfo();
      assert.same(v.sess.version, undefined);
      assert.same(v.sess.hash, undefined);

      stub(koru, 'reload');
      assert.calledWith(v.sess.provide, 'X', TH.match(f=>v.X=f));

      v.sess.addToDict('foo'); // does nothing

      const dict = message.newGlobalDict();
      message.addToDict(dict, 't1');
      message.addToDict(dict, 't2');


      const endict = new Uint8Array(message.encodeDict(dict, []));

      v.X.call(v.sess, ['', 'h123', endict, 'dhash']);

      assert.same(v.sess.globalDict.k2c['t1'], 0xfffd);
      assert.same(v.sess.globalDict.k2c['t2'], 0xfffe);
      assert.same(v.sess.globalDict.k2c['foo'], undefined);
      assert.same(v.sess.dictHash, 'dhash');


      refute.called(koru.reload);
      assert.same(v.sess.hash, 'h123');

      v.X.call(v.sess, ['v10', 'h123', dict, 'dhash2']);

      assert.called(koru.reload);
    });

    test("existing dict", ()=>{
      assert.calledWith(v.sess.provide, 'X', TH.match(f=>v.X=f));
      message.addToDict(v.sess.globalDict, 'hello');
      v.sess.dictHash = 'orig';

      v.X.call(v.sess, ['', 'h123', null]);

      assert.same(v.sess.dictHash, 'orig');
      assert.same(v.sess.globalDict.k2c.hello, 256);
    });

    group("onmessage", ()=>{
      beforeEach(()=>{
        v.ws = {send: stub()};
        v.sess = {
          provide: stub(),
          _onMessage(conn, data) {
            v.actualConn = conn;
            assert.same(data, v.data);
          },
        };
        sessionClientFactory(v.sess, sessState);

        v.sess.newWs = stub().returns(v.ws);

        stub(koru, '_afTimeout').returns(v.afTimeoutStop = stub());

        v.sess.connect();

        v.readyHeatbeat = () => {
          try {
            let now = util.dateNow(); intercept(Date, 'now', ()=>now);

            const event = {data: v.data = "foo"};
            v.ws.onmessage(event);
            now += 21000;
            v.actualConn[private$].queueHeatBeat();

            return util.thread.date;
          } finally {
            Date.now.restore();
          }
        };
      });

      afterEach(()=>{
        util.adjustTime(-util.timeAdjust);
      });

      test("setup", ()=>{
        assert.same(v.sess.ws, v.ws);

        assert(v.ws.onmessage);

        const event = {data: v.data = "foo"};
        v.ws.onmessage(event);

        assert(v.actualConn);
        assert.same(v.actualConn.ws, v.ws);
      });

      test("heartbeat when idle", ()=>{
        let now = Date.now();
        intercept(Date, 'now', ()=>now);

        const event = {data: v.data = "foo"};
        v.ws.onmessage(event);

        assert.same(v.sess.heartbeatInterval, 20000);

        assert.calledWith(koru._afTimeout, TH.match.func, 20000);

        koru._afTimeout.reset();
        now += 15000;
        v.ws.onmessage(event);

        refute.called(koru._afTimeout);

        now += 7000;
        v.actualConn[private$].queueHeatBeat();

        assert.equals(koru._afTimeout.lastCall.args, [TH.match.func, 13000]);

        now += 14000;
        koru._afTimeout.lastCall.yield();

        assert.calledWith(koru._afTimeout, TH.match.func, 10000);
        koru._afTimeout.reset();

        assert.calledOnce(v.ws.send);
        assert.calledWith(v.ws.send, 'H');

        now += 1000;

        v.ws.onmessage(event);
        refute.called(koru._afTimeout);

        v.actualConn[private$].queueHeatBeat();
        assert.calledWith(koru._afTimeout, TH.match.func, 20000);
      });

      test("no response close fails", ()=>{
        TH.noInfo();
        v.time = v.readyHeatbeat();

        v.ws.close = () => {throw new Error("close fail")};
        const onclose = spy(v.ws, 'onclose');
        assert.exception(() => {
          v.actualConn[private$].queueHeatBeat();
        }, "Error", "close fail");

        refute.called(onclose);
      });

      test("no response close succeeds", ()=>{
        TH.noInfo();
        v.time = v.readyHeatbeat();

        const close = v.ws.close = stub();
        v.actualConn[private$].queueHeatBeat();

        assert.calledOnce(close);
      });
    });

    test("connection cycle", ()=>{
      spy(sessState, 'connected');
      spy(sessState, 'retry');
      spy(sessState, 'close');
      stub(koru, 'getLocation').returns({protocol: 'https:', host: 'test.host:123'});

      v.sess.connect();         // connect

      assert.called(v.sess.newWs);
      assert.same(v.sess._url(), 'wss://test.host:123/ws/6/dev/');
      v.sess.hash = 'h123';
      assert.same(v.sess._pathPrefix(), 'ws/6/dev/h123');
      assert.same(v.sess._pathPrefix({foo: 123}), 'ws/6/dev/h123?foo=123');
      v.sess.dictHash = 'dh1234';
      assert.same(v.sess._pathPrefix(), 'ws/6/dev/h123?dict=dh1234');
      assert.same(v.sess._pathPrefix({bar: 'extra bit'}), 'ws/6/dev/h123?dict=dh1234&bar=extra%20bit');


      refute.called(sessState.connected);

      assert.calledWith(v.sess.provide, 'X', TH.match(f=>v.X=f));
      v.X.call(v.sess, ['', koru.PROTOCOL_VERSION, null]);

      v.ready = true;

      assert.calledWith(sessState.connected, TH.match(conn => conn.ws === v.ws));

      stub(koru, '_afTimeout').returns(v.afTimeoutStop = stub());
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
    });

    test("before connected", ()=>{
      stub(message, 'encodeMessage', (type, msg) => ['x', type, msg]);
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
    });
  });
});
