define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./web-socket-sender-factory');
  var SessionBase = require('./base').__initBase__;
  var SessState = require('./state').__init__;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      var base = SessionBase();
      test.stub(base, 'provide');
      v.sess = sut(base, v.state = SessState());
      v.sess.newWs = function () {return v.ws = {}};
    },

    tearDown: function () {
      v = null;
    },

    "test onerror": function () {
      v.sess.connect();
      assert.same(v.ws.onerror, v.ws.onclose);
    },

    "test state": function () {
      assert.same(v.state, v.sess.state);
    },

    "test using separate base": function () {
      var sess1 = SessionBase();
      var sess2 = SessionBase();
      var base = SessionBase();
      sut(sess1, v.state = SessState(), v.wrapper1 = test.stub(), base);
      var bfunc = base._commands.B;
      sut(sess2, v.state = SessState(), v.wrapper2 = test.stub(), base);

      assert.equals(sess1._rpcs, {});
      assert.equals(sess1._commands, {});
      assert.equals(sess2._commands, {});
      assert.equals(Object.keys(base._commands).sort().join(''), 'BKLUWX');
      assert.same(base._commands.B, bfunc);
    },

    "test server-to-client broadcast messages": function () {
      v.sess.registerBroadcast("foo", v.foo = test.stub());
      v.sess.registerBroadcast("bar", v.bar = test.stub());

      assert.equals(v.sess._broadcastFuncs, {foo: TH.match.func, bar: TH.match.func});

      test.onEnd(function () {
        v.sess.deregisterBroadcast("foo");
        v.sess.deregisterBroadcast("bar");
      });

      assert.calledWith(v.sess.provide, 'B', TH.match(function (arg) {
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
      assert.equals(v.sess._broadcastFuncs, {bar: TH.match.func});

    },
  });
});
