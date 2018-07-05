define((require, exports, module)=>{
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

  const {stub, spy, onEnd, intercept} = TH;

  const sut = require('./web-socket-sender-factory');

  let v = {};
  TH.testCase(module, {
    setUp () {
      const base = new SessionBase('foo');
      stub(base, 'provide');
      v.sess = sut(base, v.state = stateFactory());
      v.sess.newWs = ()=> v.ws = {};
    },

    tearDown () {
      v = {};
    },

    "test initialization"() {
      /**
       *
       **/
      const new_webSocketSenderFactory = api.new(sut);
      //[
      const mySession = new_webSocketSenderFactory(new SessionBase('foo'), stateFactory());
      const wsConnection = {};
      mySession.newWs = stub().returns(wsConnection);

      mySession.connect();

      assert.called(mySession.newWs);
      assert.same(wsConnection.binaryType, 'arraybuffer');
      //]
    },

    "test onerror"() {
      v.sess.connect();
      assert.same(v.ws.onerror, v.ws.onclose);
    },

    "test onStop callbacks"() {
      v.sess.onStop(v.c1 = stub());
      v.sess.onStop(v.c2 = stub());

      v.sess.stop();
      assert.called(v.c1);
      assert.called(v.c2);
    },

    "test pause"() {
      v.sess.connect();
      v.ws.close = stub();

      v.sess.onStop(v.c1 = stub());

      spy(v.sess.state, 'retry');

      v.sess.pause();
      assert.called(v.ws.close);

      refute.called(v.c1);

      refute.called(v.sess.state.retry);
      assert.same(v.sess.state._state, 'paused');

      v.sess.connect();

      assert.same(v.sess.state._state, 'startup');
    },

    "test heartbeat adjust time"() {
      onEnd(_=>{util.adjustTime(-util.timeAdjust)});

      let kFunc;
      assert.calledWith(v.sess.provide, 'K', TH.match(f => kFunc = f));

      let now = Date.now();
      intercept(util, 'dateNow', ()=>now);

      v.sess.connect();
      onEnd(v.ws.onclose);

      v.ws.send = stub();

      now += 120000;
      v.sess[private$].queueHeatBeat();
      now += 234;
      kFunc.call(v.sess, ''+(now - 400));

      assert.equals(util.timeAdjust, -283);
      assert.near(util.timeUncertainty, 234);
      util.adjustTime(16, 40);

      now += 120000;
      v.sess[private$].queueHeatBeat();
      now += 105;
      kFunc.call(v.sess, ''+(now + 800));

      assert.equals(util.timeAdjust, 586);
      assert.near(util.timeUncertainty, 53);


      now += 120000;
      v.sess[private$].queueHeatBeat();
      now += 120;
      kFunc.call(v.sess, ''+(now));
      assert.equals(util.timeAdjust, 586);
      assert.near(util.timeUncertainty, 66);
    },

    "test state"() {
      assert.same(v.state, v.sess.state);
    },

    "test unload"() {
      assert.calledWith(v.sess.provide, 'U', TH.match(arg => {
        v.func = arg;
        return typeof arg === 'function';
      }));

      stub(koru, 'unload');

      v.func.call(v.sess, "hhh123:koru/foo");

      assert.same(v.sess.hash, 'hhh123');
      assert.calledWith(koru.unload, 'koru/foo');
    },

    "test batched messages"() {
      v.sess._commands.f = v.f = stub();
      v.sess._commands.g = v.g = stub();

      assert.calledWith(v.sess.provide, 'W', TH.match(arg => {
        v.func = arg;
        return typeof arg === 'function';
      }));

      var data = [['f', ['foo', 1, 2, 3]], ['g', ['gee', 'waz']]];
      v.func.call(v.sess, data);

      assert.calledWith(v.f, ['foo', 1, 2, 3]);
      assert.calledWith(v.g, ['gee', 'waz']);
      assert.same(v.f.firstCall.thisValue, v.sess);
      assert.same(v.g.firstCall.thisValue, v.sess);
    },

    "test using separate base"() {
      const webSocketSenderFactory = api.new(sut);
      var sess1 = new SessionBase('foo1');
      var sess2 = new SessionBase('foo2');
      var base = new SessionBase('foo3');
      webSocketSenderFactory(sess1, v.state = stateFactory(), v.wrapper1 = stub(), base);
      var bfunc = base._commands.B;
      webSocketSenderFactory(sess2, v.state = stateFactory(), v.wrapper2 = stub(), base);

      assert.equals(sess1._rpcs, {});
      assert.equals(sess1._commands, {});
      assert.equals(sess2._commands, {});
      assert.equals(Object.keys(base._commands).sort().join(''), 'BKLUWX');
      assert.same(base._commands.B, bfunc);
    },

    "test newVersion"() {
      TH.noInfo();
      stub(koru, 'reload');
      assert.calledWith(v.sess.provide, 'X', TH.match(arg => v.func = arg));

      v.func.call(v.sess, ['v1.2.3', 'h123', {0: 0}]);

      assert.called(koru.reload);

      koru.reload.reset();

      v.sess.newVersion = stub();

      v.func.call(v.sess, ['v1.2.3', 'h123', {0: 0}]);
      refute.called(koru.reload);
      assert.calledWith(v.sess.newVersion, {newVersion: 'v1.2.3', hash: 'h123'});
      assert.same(v.sess.newVersion.lastCall.thisValue, v.sess);
    },

    "test server-to-client broadcast messages"() {
      v.sess.registerBroadcast("foo", v.foo = stub());
      spy(koru, 'onunload');
      v.sess.registerBroadcast(module, "bar", v.bar = stub());

      assert.equals(v.sess._broadcastFuncs, {foo: TH.match.func, bar: TH.match.func});

      onEnd(function () {
        v.sess.deregisterBroadcast("foo");
        v.sess.deregisterBroadcast("bar");
      });

      assert.calledWith(v.sess.provide, 'B', TH.match(arg => {
        v.func = arg;
        return typeof arg === 'function';
      }));

      var data = ['foo', 1, 2, 3];

      v.func(data);

      assert.calledWith(v.foo, 1, 2, 3);
      refute.called(v.bar);

      data = ['bar', "otherTest"];
      v.func(data);

      assert.calledWith(v.bar, "otherTest");

      v.sess.deregisterBroadcast('foo');
      assert.equals(v.sess._broadcastFuncs, {foo: null, bar: TH.match.func});
      assert.calledWith(koru.onunload, module);
      koru.onunload.yield();
      assert.equals(v.sess._broadcastFuncs, {foo: null, bar: null});
    },

    "open connection": {
      setUp() {
        v.sess.connect();
        v.sess.ws.close = stub();
        v.sendBinary = stub(v.sess, 'sendBinary');
      },

      "test stop"() {
        v.sess.stop();

        assert.calledOnce(v.ws.close);
      },

      "test sendBinary"() {
        v.sendBinary.restore();
        v.sess.state.isReady = stub().returns(true);
        const send = v.sess.ws.send = stub();
        v.sess.sendBinary('M', [1,2,3,4]);

        assert.calledWith(send, TH.match(data  => {
          if (data[0] === 'M'.charCodeAt(0)) {
            assert.equals(message.decodeMessage(data.subarray(1), v.sess.globalDict), [1,2,3,4]);
            return true;
          }
        }));
      },
    },
  });
});
