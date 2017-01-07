define(function (require, exports, module) {
  /**
   * Build WebSocket clients (senders).
   **/
  var test, v;
  const koru         = require('koru');
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
      v.sess.newWs = function () {return v.ws = {}};
      api.module();
    },

    tearDown () {
      v = null;
    },

    "compareVersion": {
      setUp() {
        assert.calledWith(v.sess.provide, 'X', TH.match(f => v.func = f));
        v.conn = {version: 'v1.2.2', hash: 'h123'};
        this.stub(koru, 'reload');
      },

      "test override"() {
        this.stub(util, 'compareVersion');
        const compareVersion = v.sess.compareVersion = this.stub();

        v.func.call(v.conn, [2, 'v1.2.3', []]);

        refute.called(util.compareVersion);
        assert.calledWith(compareVersion, v.conn, 'v1.2.3');
      },

      "test compareVersion"() {
        v.func.call(v.conn, [2, 'v1.2.2', []]);
        v.func.call(v.conn, [2, 'v1.2.1', []]);

        refute.called(koru.reload);

        v.func.call(v.conn, [2, 'v1.2.10', []]);

        assert.called(koru.reload);
      },

      "test no version,hash"() {
        v.conn.version = null;
        v.func.call(v.conn, [2, 'v123', []]);

        refute.called(koru.reload);

        assert.same(v.conn.version, 'v123');
      },

      "test old version but good hash"() {
        v.func.call(v.conn, [2, 'v1.2.3,h123', []]);

        refute.called(koru.reload);
      },
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

    "test state"() {
      assert.same(v.state, v.sess.state);
    },

    "test unload"() {
      assert.calledWith(v.sess.provide, 'U', TH.match(arg => {
        v.func = arg;
        return typeof arg === 'function';
      }));

      this.stub(koru, 'unload');

      v.func.call(v.sess, "v1.3.4-45-g1234,hhh123:koru/foo");

      assert.same(v.sess.version, 'v1.3.4-45-g1234');
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
  });
});
