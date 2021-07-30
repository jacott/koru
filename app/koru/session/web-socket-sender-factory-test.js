define((require, exports, module) => {
  'use strict';
  /**
   * Build WebSocket clients (senders).
   **/
  const koru            = require('koru');
  const message         = require('koru/session/message');
  const {private$}      = require('koru/symbols');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const SessionBase     = require('./base').constructor;
  const stateFactory    = require('./state').constructor;
  const TH              = require('./test-helper');

  const {stub, spy, intercept} = TH;

  const sut = require('./web-socket-sender-factory');

  let v = {};
  TH.testCase(module, ({after, beforeEach, afterEach, group, test}) => {
    beforeEach(() => {
      const base = new SessionBase('foo');
      stub(base, 'provide');
      v.sess = sut(base, v.state = stateFactory());
      v.sess.newWs = () => v.ws = {};
    });

    afterEach(() => {
      v = {};
    });

    test('initialization', () => {
      /**
       *
       **/
      const webSocketSenderFactory = api.custom();
      //[
      const mySession = webSocketSenderFactory(new SessionBase('foo'), stateFactory());
      const wsConnection = {};
      mySession.newWs = stub().returns(wsConnection);

      mySession.start();

      assert.called(mySession.newWs);
      assert.same(wsConnection.binaryType, 'arraybuffer');
      //]
      assert.same(mySession.connect, mySession.start);
    });

    test('onerror', () => {
      v.sess.start();
      assert.same(v.ws.onerror.toString(), '() => {}');
    });

    test('onStop callbacks', () => {
      v.sess.onStop(v.c1 = stub());
      v.sess.onStop(v.c2 = stub());

      v.sess.stop();
      assert.called(v.c1);
      assert.called(v.c2);
    });

    test('pause', () => {
      v.sess.start();
      v.ws.close = stub();

      v.sess.onStop(v.c1 = stub());

      spy(v.sess.state, 'retry');

      v.sess.pause();
      assert.called(v.ws.close);

      refute.called(v.c1);

      refute.called(v.sess.state.retry);
      assert.same(v.sess.state._state, 'paused');

      v.sess.start();

      assert.same(v.sess.state._state, 'startup');
    });

    test('heartbeat adjust time', () => {
      after((_) => {util.adjustTime(- util.timeAdjust)});

      let kFunc;
      assert.calledWith(v.sess.provide, 'K', TH.match((f) => kFunc = f));

      let now = Date.now();
      intercept(Date, 'now', () => now);

      v.sess.start();
      after(v.ws.onclose);

      v.ws.send = stub();

      now += 120000;
      v.sess[private$].queueHeatBeat();
      now += 234;
      kFunc.call(v.sess, '' + (now-400));

      assert.equals(util.timeAdjust, -283);
      assert.near(util.timeUncertainty, 234);
      util.adjustTime(16, 40);

      now += 120000;
      v.sess[private$].queueHeatBeat();
      now += 105;
      kFunc.call(v.sess, '' + (now+800));

      assert.equals(util.timeAdjust, 853);
      assert.near(util.timeUncertainty, 53);

      now += 120000;
      v.sess[private$].queueHeatBeat();
      now += 120;
      kFunc.call(v.sess, '' + (now));
      assert.equals(util.timeAdjust, 60);
      assert.near(util.timeUncertainty, 66);
    });

    test('state', () => {
      assert.same(v.state, v.sess.state);
    });

    test('unload', () => {
      assert.calledWith(v.sess.provide, 'U', TH.match((arg) => {
        v.func = arg;
        return typeof arg === 'function';
      }));

      stub(koru, 'unload');

      v.func.call(v.sess, 'hhh123:koru/foo');

      assert.same(v.sess.hash, 'hhh123');
      assert.calledWith(koru.unload, 'koru/foo');
    });

    test('batched messages', () => {
      v.sess._commands.f = v.f = stub();
      v.sess._commands.g = v.g = stub();

      assert.calledWith(v.sess.provide, 'W', TH.match((arg) => {
        v.func = arg;
        return typeof arg === 'function';
      }));

      const data = [['f', ['foo', 1, 2, 3]], ['g', ['gee', 'waz']]];
      v.func.call(v.sess, data);

      assert.calledWith(v.f, ['foo', 1, 2, 3]);
      assert.calledWith(v.g, ['gee', 'waz']);
      assert.same(v.f.firstCall.thisValue, v.sess);
      assert.same(v.g.firstCall.thisValue, v.sess);
    });

    test('using separate base', () => {
      const webSocketSenderFactory = api.custom();
      const sess1 = new SessionBase('foo1');
      const sess2 = new SessionBase('foo2');
      const base = new SessionBase('foo3');
      webSocketSenderFactory(sess1, v.state = stateFactory(), v.wrapper1 = stub(), base);
      const bfunc = base._commands.B;
      webSocketSenderFactory(sess2, v.state = stateFactory(), v.wrapper2 = stub(), base);

      assert.equals(sess1._rpcs, {});
      assert.equals(sess1._commands, {});
      assert.equals(sess2._commands, {});
      assert.equals(Object.keys(base._commands).sort().join(''), 'BKLUWX');
      assert.same(base._commands.B, bfunc);
    });

    test('newVersion', () => {
      TH.noInfo();
      stub(koru, 'reload');
      assert.calledWith(v.sess.provide, 'X', TH.match((arg) => v.func = arg));

      v.func.call(v.sess, ['v1.2.3', 'h123', {0: 0}]);

      assert.called(koru.reload);

      koru.reload.reset();

      v.sess.newVersion = stub();

      v.func.call(v.sess, ['v1.2.3', 'h123', {0: 0}]);
      refute.called(koru.reload);
      assert.calledWith(v.sess.newVersion, {newVersion: 'v1.2.3', hash: 'h123'});
      assert.same(v.sess.newVersion.lastCall.thisValue, v.sess);
    });

    test('server-to-client broadcast messages', () => {
      v.sess.registerBroadcast('foo', v.foo = stub());
      spy(koru, 'onunload');
      v.sess.registerBroadcast(module, 'bar', v.bar = stub());

      assert.equals(v.sess._broadcastFuncs, {foo: TH.match.func, bar: TH.match.func});

      after(function () {
        v.sess.deregisterBroadcast('foo');
        v.sess.deregisterBroadcast('bar');
      });

      assert.calledWith(v.sess.provide, 'B', TH.match((arg) => {
        v.func = arg;
        return typeof arg === 'function';
      }));

      let data = ['foo', 1, 2, 3];

      v.func(data);

      assert.calledWith(v.foo, 1, 2, 3);
      refute.called(v.bar);

      data = ['bar', 'otherTest'];
      v.func(data);

      assert.calledWith(v.bar, 'otherTest');

      v.sess.deregisterBroadcast('foo');
      assert.equals(v.sess._broadcastFuncs, {foo: null, bar: TH.match.func});
      assert.calledWith(koru.onunload, module);
      koru.onunload.yield();
      assert.equals(v.sess._broadcastFuncs, {foo: null, bar: null});
    });

    group('open connection', () => {
      beforeEach(() => {
        v.sess.start();
        v.sess.ws.close = stub();
        v.sendBinary = stub(v.sess, 'sendBinary');
      });

      test('stop', () => {
        v.sess.stop();

        assert.calledOnce(v.ws.close);
      });

      test('sendBinary', () => {
        v.sendBinary.restore();
        v.sess.state.isReady = stub().returns(true);
        const send = v.sess.ws.send = stub();
        v.sess.sendBinary('M', [1, 2, 3, 4]);

        assert.calledWith(send, TH.match((data) => {
          if (data[0] === 'M'.charCodeAt(0)) {
            assert.equals(message.decodeMessage(data.subarray(1), v.sess.globalDict), [1, 2, 3, 4]);
            return true;
          }
        }));
      });
    });
  });
});
