define(function (require, exports, module) {
  /**
   * Build WebSocket clients (senders).
   **/
  var test, v;
  const koru         = require('koru');
  const message      = require('koru/session/message');
  const api          = require('koru/test/api');
  const util         = require('koru/util');
  const SessionBase  = require('./base').constructor;
  const stateFactory = require('./state').constructor;
  const TH           = require('./test-helper');
  const sut          = require('./web-socket-sender-factory');

  TH.testCase(module, {
    setUp () {
      test = this;
      v = {};
      const base = new SessionBase('foo');
      test.stub(base, 'provide');
      v.sess = sut(base, v.state = stateFactory());
      v.sess.newWs = ()=> v.ws = {};
      api.module();
    },

    tearDown () {
      v = null;
    },

    "test initialization"() {
      /**
       *
       **/
      const webSocketSenderFactory = api.new(sut);
      api.example(() => {
        const mySession = webSocketSenderFactory(new SessionBase('foo'), stateFactory());
        const wsConnection = {};
        mySession.newWs = test.stub().returns(wsConnection);

        mySession.connect();

        assert.called(mySession.newWs);
        assert.same(wsConnection.binaryType, 'arraybuffer');
      });
    },

    "test onerror"() {
      v.sess.connect();
      assert.same(v.ws.onerror, v.ws.onclose);
    },

    "test onStop callbacks"() {
      v.sess.onStop(v.c1 = test.stub());
      v.sess.onStop(v.c2 = test.stub());

      v.sess.stop();
      assert.called(v.c1);
      assert.called(v.c2);
    },

    "test pause"() {
      v.sess.connect();
      v.ws.close = this.stub();

      v.sess.onStop(v.c1 = test.stub());

      this.spy(v.sess.state, 'retry');

      v.sess.pause();
      assert.called(v.ws.close);

      refute.called(v.c1);

      refute.called(v.sess.state.retry);
      assert.same(v.sess.state._state, 'paused');

      v.sess.connect();

      assert.same(v.sess.state._state, 'startup');
    },

    "test heartbeat adjust time"() {
      this.onEnd(_=>{util.adjustTime(-util.timeAdjust)});

      let kFunc;
      assert.calledWith(v.sess.provide, 'K', TH.match(f => kFunc = f));

      let now = Date.now();
      this.intercept(util, 'dateNow', ()=>now);

      v.sess.connect();
      this.onEnd(v.ws.onclose);

      v.ws.send = this.stub();

      v.sess._queueHeatBeat();
      now += 234;
      kFunc.call(v.sess, ''+(now - 400));

      assert.equals(util.timeAdjust, -283);

      kFunc.call(v.sess, ''+(now + 800));

      assert.equals(util.timeAdjust, 634);

      kFunc.call(v.sess, ''+(now));
      assert.equals(util.timeAdjust, 634);
    },

    "test state"() {
      assert.same(v.state, v.sess.state);
    },

    "test unload"() {
      assert.calledWith(v.sess.provide, 'U', TH.match(arg => {
        v.func = arg;
        return typeof arg === 'function';
      }));

      this.stub(koru, 'unload');

      v.func.call(v.sess, "hhh123:koru/foo");

      assert.same(v.sess.hash, 'hhh123');
      assert.calledWith(koru.unload, 'koru/foo');
    },

    "test batched messages"() {
      v.sess._commands.f = v.f = test.stub();
      v.sess._commands.g = v.g = test.stub();

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
      webSocketSenderFactory(sess1, v.state = stateFactory(), v.wrapper1 = test.stub(), base);
      var bfunc = base._commands.B;
      webSocketSenderFactory(sess2, v.state = stateFactory(), v.wrapper2 = test.stub(), base);

      assert.equals(sess1._rpcs, {});
      assert.equals(sess1._commands, {});
      assert.equals(sess2._commands, {});
      assert.equals(Object.keys(base._commands).sort().join(''), 'BKLUWX');
      assert.same(base._commands.B, bfunc);
    },

    "test newVersion"() {
      TH.noInfo();
      this.stub(koru, 'reload');
      assert.calledWith(v.sess.provide, 'X', TH.match(arg => v.func = arg));

      v.func.call(v.sess, ['v1.2.3', 'h123', {0: 0}]);

      assert.called(koru.reload);

      koru.reload.reset();

      v.sess.newVersion = this.stub();

      v.func.call(v.sess, ['v1.2.3', 'h123', {0: 0}]);
      refute.called(koru.reload);
      assert.calledWith(v.sess.newVersion, {newVersion: 'v1.2.3', hash: 'h123'});
      assert.same(v.sess.newVersion.lastCall.thisValue, v.sess);
    },

    "test server-to-client broadcast messages"() {
      v.sess.registerBroadcast("foo", v.foo = test.stub());
      test.spy(koru, 'onunload');
      v.sess.registerBroadcast(module, "bar", v.bar = test.stub());

      assert.equals(v.sess._broadcastFuncs, {foo: TH.match.func, bar: TH.match.func});

      test.onEnd(function () {
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
        v.sess.ws.close = this.stub();
        v.sendBinary = this.stub(v.sess, 'sendBinary');
      },

      "test stop"() {
        v.sess.stop();

        assert.calledOnce(v.ws.close);
      },

      "test sendBinary"() {
        v.sendBinary.restore();
        v.sess.state.isReady = this.stub().returns(true);
        const send = v.sess.ws.send = this.stub();
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
