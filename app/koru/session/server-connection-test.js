isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var session = require('../session/main');
  var Connection = require('./server-connection')(session);
  var env = require('../env');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.conn = new Connection(v.ws = {
        send: test.stub(), close: test.stub(), on: test.stub(),
      }, 123);

    },

    tearDown: function () {
      v = null;
    },

    "onMessage": {
      setUp: function () {
        test.stub(env, 'Fiber', function (func) {
          return v.fiber = {run: test.stub(), func: func};
        });
        test.onEnd(function () {
          delete session._commands.t;
        });

        session.provide('t', v.tStub = test.stub());
      },

      "test fiber": function () {
        v.conn.onMessage('t123');

        assert.equals(v.conn._last, ['t123']);

        v.conn.onMessage('t456');

        assert.equals(v.conn._last, ['t456']);

        assert.calledOnce(env.Fiber);
        assert.calledOnce(v.fiber.run);

        refute.called(v.tStub);

        var m123 = v.tStub.withArgs('123');
        var m456 = v.tStub.withArgs('456');

        v.fiber.func();

        assert.called(m123);
        assert.called(m456);

        assert(m123.calledBefore(m456));
      },
    },

    "test set userId": function () {
      var sendUid = v.ws.send.withArgs('VSu456');
      var sendUidCompleted = v.ws.send.withArgs('VC');
      v.conn._subs = {s1: {resubscribe: v.s1 = test.stub()}, s2: {resubscribe: v.s2 = test.stub()}};

      v.conn.userId = 'u456';

      assert.same(v.conn._userId, 'u456');
      assert.same(v.conn.userId, 'u456');

      assert.called(v.s1);
      assert.called(v.s2);

      assert(sendUid.calledBefore(v.s1));
      assert(sendUidCompleted.calledAfter(v.s2));
    },

    "test added": function () {
      v.conn.added('Foo', '123', v.attrs = {name: 'bar', age: 5});

      assert.calledWith(v.ws.send, 'AFoo|123'+JSON.stringify(v.attrs), env.nullFunc);
    },

    "test changed": function () {
      v.conn.changed('Foo', '123', v.attrs = {name: 'bar'});

      assert.calledWith(v.ws.send, 'CFoo|123'+JSON.stringify(v.attrs), env.nullFunc);
    },

    "test removed": function () {
      v.conn.removed('Foo', '123');

      assert.calledWith(v.ws.send, 'RFoo|123', env.nullFunc);
    },

    "test closed": function () {
      v.conn._subs.t1 = {stop: v.t1 = test.stub()};
      v.conn._subs.t2 = {stop: v.t2 = test.stub()};

      v.conn.closed();

      assert.called(v.t1);
      assert.called(v.t2);

      assert.isNull(v.conn._subs);

      v.conn.closed();

       assert.calledOnce(v.t1);
    },
  });
});
