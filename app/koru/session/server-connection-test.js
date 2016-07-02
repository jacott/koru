isServer && define(function (require, exports, module) {
  var test, v;
  const IdleCheck  = require('../idle-check').singleton;
  const koru       = require('../main');
  const TH         = require('../test');
  const util       = require('../util');
  const match      = require('./match');
  const message    = require('./message');

  const baseSession = require('../session/base');
  const session = baseSession.__initBase__('testServerConnection');
  const Connection  = require('./server-connection')(session);

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.conn = new Connection(v.ws = {
        send: test.stub(), close: test.stub(), on: test.stub(),
      }, 123, v.sessClose = test.stub());
      test.stub(v.conn, 'sendBinary');
      test.intercept(session, 'execWrapper', function (func, conn) {
        var thread = util.thread;
        thread.userId = conn.userId;
        thread.connection = conn;
        func(conn);
      });
      session.globalDict = baseSession.globalDict;
    },

    tearDown() {
      v = null;
    },

    "test match"() {
      v.conn.match.register('Foo', v.m1 = test.stub().returns(true));

      assert.isTrue(v.conn.match.has(v.foo = {constructor: {modelName: 'Foo'}, a: 1}));
      assert.isFalse(v.conn.match.has(v.bar = {constructor: {modelName: 'Bar'}, a: 1}));

      assert.calledWith(v.m1, v.foo);
      refute.calledWith(v.m1, v.bar);
    },

    "onMessage": {
      setUp() {
        v.tStub = test.stub();
        session.provide('t', v.tFunc = function () {
          v.tStub.apply(this, arguments);
        });
        v.thread = {};
        TH.stubProperty(util, 'thread', {get: function () {return v.thread}});
      },

      tearDown() {
        delete session._commands.t;
      },


      "test waitIdle"() {
        test.spy(IdleCheck, 'inc');
        test.spy(IdleCheck, 'dec');
        test.stub(session, '_onMessage', function (conn) {
          assert.called(IdleCheck.inc);
          refute.called(IdleCheck.dec);
          v.success = true;
        });
        v.conn.onMessage('t123');
        assert.called(IdleCheck.inc);
        assert.called(IdleCheck.dec);
        assert(v.success);
      },

      "test thread vars"() {
        v.tStub = function () {
          v.threadUserId = util.thread.userId;
          v.threadConnection = util.thread.connection;
        };

        v.conn.userId = 'tcuid';

        v.conn.onMessage('t123');

        assert.same(v.thread.connection, v.conn);
        assert.same(v.thread.userId, 'tcuid');
      },

      "test queued"() {
        v.calls = [];
        let error;
        let token = 'first';
        session.execWrapper.restore();
        test.intercept(session, 'execWrapper', function (func, conn) {
          v.calls.push(token);
          func(conn);
        });
        test.intercept(session, '_onMessage', function (conn, data) {
          token = 'second';
          try {
            v.calls.push(data);
            switch(data) {
            case 't123':
              assert.equals(v.conn._last, ['t123', null]);
              v.conn.onMessage('t456');
              assert.equals(v.conn._last, ['t456', null]);
              assert.equals(v.calls, ['first', 't123']);
              break;
            case 't456':
              assert.equals(v.conn._last, ['t456', null]);
              break;
            }
          } catch(ex) {
            error = error || ex;
          }
        });
        v.conn.onMessage('t123');

        if (error) throw error;

        assert.equals(v.calls, ['first', 't123', 'second', 't456']);
        assert.equals(v.conn._last, null);
      },
    },

    "test send batched"() {
      var bm = util.thread.batchMessage = {batch: test.stub()};
      test.onEnd(() => util.thread.batchMessage = null);

      v.conn.sendBinary.restore();

      v.conn.sendBinary('M', [1, 2, 3], v.func = test.stub());

      assert.calledWith(bm.batch, v.conn, 'M', [1, 2, 3], v.func);

      refute.called(v.conn.ws.send);
    },

    "test send"() {
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

    "test sendBinary"() {
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

    "test when closed sendBinary"() {
      v.conn.ws = null;
      v.conn.sendBinary.restore();
      refute.exception(() => v.conn.sendBinary('M', [1,2,3]));
    },

    "test set userId"() {
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

    "test sendMatchUpdate"() {
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

    "test added"() {
      v.conn.added('Foo', '123', v.attrs = {name: 'bar', age: 5});

      assert.calledWith(v.conn.sendBinary, 'A', ['Foo', '123', v.attrs]);

      v.conn.added('Foo', '123', v.attrs = {name: 'fbar', age: 5}, {age: 1});

      assert.calledWith(v.conn.sendBinary, 'A', ['Foo', '123', {name: 'fbar'}]);
    },

    "test changed"() {
      v.conn.changed('Foo', '123', v.attrs = {name: 'bar'});

      assert.calledWith(v.conn.sendBinary, 'C', ['Foo', '123', v.attrs]);

      v.conn.changed('Foo', '123', v.attrs = {name: 'fbar', age: 2}, {name: 1});

      assert.calledWith(v.conn.sendBinary, 'C', ['Foo', '123', {age: 2}]);
    },

    "test removed"() {
      v.conn.removed('Foo', '123');

      assert.calledWith(v.conn.sendBinary, 'R', ['Foo', '123']);
    },

    "test closed"() {
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
