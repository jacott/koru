define(function (require, exports, module) {
  var test, v;
  const SessionBase = require('./base').__initBase__;
  const SessState   = require('./state').__init__;
  const TH          = require('./test-helper');
  const sut         = require('./web-socket-sender-factory');

  TH.testCase(module, {
    setUp () {
      test = this;
      v = {};
      const base = SessionBase('foo');
      test.stub(base, 'provide');
      v.sess = sut(base, v.state = SessState());
      v.sess.newWs = function () {return v.ws = {}};
    },

    tearDown () {
      v = null;
    },

    "test onerror" () {
      v.sess.connect();
      assert.same(v.ws.onerror, v.ws.onclose);
    },

    "test onStop callbacks" () {
      v.sess.onStop(v.c1 = test.stub());
      v.sess.onStop(v.c2 = test.stub());

      v.sess.stop();
      assert.called(v.c1);
      assert.called(v.c2);
    },

    "test state" () {
      assert.same(v.state, v.sess.state);
    },

    "test batched messages" () {
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

    "test using separate base" () {
      var sess1 = SessionBase('foo1');
      var sess2 = SessionBase('foo2');
      var base = SessionBase('foo3');
      sut(sess1, v.state = SessState(), v.wrapper1 = test.stub(), base);
      var bfunc = base._commands.B;
      sut(sess2, v.state = SessState(), v.wrapper2 = test.stub(), base);

      assert.equals(sess1._rpcs, {});
      assert.equals(sess1._commands, {});
      assert.equals(sess2._commands, {});
      assert.equals(Object.keys(base._commands).sort().join(''), 'BKLUWX');
      assert.same(base._commands.B, bfunc);
    },

    "test server-to-client broadcast messages" () {
      v.sess.registerBroadcast("foo", v.foo = test.stub());
      v.sess.registerBroadcast("bar", v.bar = test.stub());

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

    },
  });
});
