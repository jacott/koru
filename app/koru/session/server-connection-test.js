isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var session = require('../session/base');
  var Connection = require('./server-connection')(session);
  var koru = require('../main');
  var util = require('../util');
  var message = require('./message');
  var match = require('./match');
  var IdleCheck = require('../idle-check').singleton;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.conn = new Connection(v.ws = {
        send: test.stub(), close: test.stub(), on: test.stub(),
      }, 123, v.sessClose = test.stub());
      test.stub(v.conn, 'sendBinary');
    },

    tearDown: function () {
      v = null;
    },

    "test match": function () {
      v.conn.match.register('Foo', v.m1 = test.stub().returns(true));

      assert.isTrue(v.conn.match.has(v.foo = {constructor: {modelName: 'Foo'}, a: 1}));
      assert.isFalse(v.conn.match.has(v.bar = {constructor: {modelName: 'Bar'}, a: 1}));

      assert.calledWith(v.m1, v.foo);
      refute.calledWith(v.m1, v.bar);
    },

    "onMessage": {
      setUp: function () {
        test.stub(koru, 'Fiber', function (func) {
          return v.fiber = {run: test.stub(), func: func};
        });
        test.onEnd(function () {
          delete session._commands.t;
        });

        v.tStub = test.stub();
        session.provide('t', v.tFunc = function () {
          v.tStub.apply(this, arguments);
        });
      },

      "test waitIdle": function () {
        test.spy(IdleCheck, 'inc');
        test.spy(IdleCheck, 'dec');
        test.stub(session, '_onMessage', function (conn) {
          assert.called(IdleCheck.inc);
          refute.called(IdleCheck.dec);
          v.success = true;
        });
        v.conn.onMessage('t123');
        refute.called(IdleCheck.inc);
        v.fiber.func();
        assert.called(IdleCheck.dec);
        assert(v.success);
      },

      "test thread vars": function () {
        v.tStub = function () {
          v.threadUserId = util.thread.userId;
          v.threadConnection = util.thread.connection;
        };

        v.conn.userId = 'tcuid';

        v.conn.onMessage('t123');
        v.fiber.func();

        assert.same(v.threadConnection, v.conn);
        assert.same(v.threadUserId, 'tcuid');
      },

      "test fiber": function () {
        v.conn.onMessage('t123');

        assert.equals(v.conn._last, ['t123']);

        v.conn.onMessage('t456');

        assert.equals(v.conn._last, ['t456']);

        assert.calledOnce(koru.Fiber);
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

    "test send batched": function () {
      var bm = util.thread.batchMessage = {batch: test.stub()};
      test.onEnd(function () {util.thread.batchMessage = null});

      v.conn.sendBinary.restore();

      v.conn.sendBinary('M', [1, 2, 3], v.func = test.stub());

      assert.calledWith(bm.batch, v.conn, 'M', [1, 2, 3], v.func);

      refute.called(v.conn.ws.send);
    },

    "test send": function () {
      v.conn.send('X', 'FOO');
      assert.calledWith(v.ws.send, 'XFOO');

      test.stub(koru, 'info');
      refute.exception(function () {
        v.conn.ws.send = test.stub().throws(v.error = new Error('foo'));
        v.conn.send('X', 'FOO');
      });

      assert.called(v.sessClose);
      assert.called(koru.info);

      v.sessClose.reset();
      koru.info.reset();
      v.conn.ws = null;
      refute.exception(function () {
        v.conn.send('X', 'FOO');
      });

      refute.called(v.sessClose);
      refute.called(koru.info);
    },

    "test sendBinary": function () {
      v.conn.sendBinary.restore();
      v.conn.sendBinary('M', [1,2,3]);

      assert.calledWith(v.ws.send, TH.match(function (data) {
        assert.same(data[0], 'M'.charCodeAt(0));
        assert.equals(message.decodeMessage(data.subarray(1)), [1,2,3]);
        return true;
      }, {binary: true, mask: true}));

      test.stub(koru, 'info');
      refute.exception(function () {
        v.conn.ws.send = test.stub().throws(v.error = new Error('foo'));
        v.conn.sendBinary('X', ['FOO']);
      });

      assert.called(koru.info);

      koru.info.reset();
      v.conn.ws = null;
      refute.exception(function () {
        v.conn.sendBinary('X', ['FOO']);
      });

      refute.called(koru.info);

      v.conn.ws = {send: test.stub()};
      v.conn.sendBinary('OneArg');
      assert.calledWith(v.conn.ws.send, 'OneArg', {binary: true});
    },

    "test when closed sendBinary": function () {
      v.conn.ws = null;
      v.conn.sendBinary.restore();
      refute.exception(function () {
        v.conn.sendBinary('M', [1,2,3]);
      });
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

    "test sendMatchUpdate": function () {
      v.doc = {
        constructor: {modelName: 'Foo'},
        _id: 'f123',
        attributes: {name: 'x'},
        $withChanges: test.stub().withArgs('changes')
          .returns(v.before = {constructor: {modelName: 'Foo'}, _id: 'f123', attributes: {name: 'y'}}),
        $asChanges: test.stub().withArgs('changes')
          .returns(v.changes= {changes: true}),
      };
      refute(v.conn.sendMatchUpdate(v.doc));
      refute.called(v.conn.sendBinary);
      v.conn.match.register('Foo', function (doc) {
        return v.func(doc);
      });

      // added
      v.func = function (doc) {return v.doc === doc};
      assert.same(v.conn.sendMatchUpdate(v.doc, 'changes'), 'added');
      assert.calledWith(v.doc.$withChanges, 'changes');
      assert.calledOnceWith(v.conn.sendBinary, 'A', ['Foo', 'f123', v.doc.attributes]);

      // changed
      v.conn.sendBinary.reset();
      v.doc.$withChanges.reset();
      v.func = function (doc) {return v.doc === doc || doc === v.before};
      assert.same(v.conn.sendMatchUpdate(v.doc, 'changes'), 'changed');
      assert.calledWith(v.doc.$withChanges, 'changes');
      assert.calledOnceWith(v.conn.sendBinary, 'C', ['Foo', 'f123', v.changes]);

      // removed
      v.doc.$withChanges.reset();
      v.conn.sendBinary.reset();
      v.func = function (doc) {return doc === v.before};
      assert.same(v.conn.sendMatchUpdate(v.doc, 'changes'), 'removed');
      assert.calledOnceWith(v.conn.sendBinary, 'R', ['Foo', 'f123']);
    },

    "test added": function () {
      v.conn.added('Foo', '123', v.attrs = {name: 'bar', age: 5});

      assert.calledWith(v.conn.sendBinary, 'A', ['Foo', '123', v.attrs]);

      v.conn.added('Foo', '123', v.attrs = {name: 'fbar', age: 5}, {age: 1});

      assert.calledWith(v.conn.sendBinary, 'A', ['Foo', '123', {name: 'fbar'}]);
    },

    "test changed": function () {
      v.conn.changed('Foo', '123', v.attrs = {name: 'bar'});

      assert.calledWith(v.conn.sendBinary, 'C', ['Foo', '123', v.attrs]);

      v.conn.changed('Foo', '123', v.attrs = {name: 'fbar', age: 2}, {name: 1});

      assert.calledWith(v.conn.sendBinary, 'C', ['Foo', '123', {age: 2}]);
    },

    "test removed": function () {
      v.conn.removed('Foo', '123');

      assert.calledWith(v.conn.sendBinary, 'R', ['Foo', '123']);
    },

    "test closed": function () {
      v.conn.onClose(v.close1 = test.stub());
      v.conn.onClose(v.close2 = test.stub());
      v.conn._subs.t1 = {stop: v.t1 = test.stub()};
      v.conn._subs.t2 = {stop: v.t2 = test.stub()};

      v.conn.close();

      assert.calledWith(v.close1, v.conn);
      assert.calledWith(v.close2, v.conn);

      assert.called(v.t1);
      assert.called(v.t2);

      assert.isNull(v.conn._subs);
      assert.isNull(v.conn.ws);

      v.conn.close();

      assert.calledOnce(v.t1);
    },
  });
});
