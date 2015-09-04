isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var subscribeFactory = require('./subscribe');
  var publish = require('./publish');
  require('./client-update');
  var Model = require('../model/main');
  var koru = require('../main');
  var login = require('../user-account/client-login');
  var message = require('./message');
  var util = require('../util');
  var sessState = require('./state');

  var subscribe;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.gDict = message.newGlobalDict();

      TH.mockConnectState(v);
      subscribe = subscribeFactory(v.sess ={
        provide: test.stub(),
        _rpcs: {},
        sendBinary: v.sendBinary = test.stub(),
      });
      assert.calledWith(v.sess.provide, 'P', TH.match(function (func) {
        v.recvP = function () {
          func(util.slice(arguments));
        };
        return true;
      }));
      ['A', 'C', 'R'].forEach(function (type) {
        assert.calledWith(v.sess.provide, type, TH.match(function (func) {
          v['recv'+type] = function () {
            func(util.slice(arguments));
          };
          return true;
        }));
      });

      test.spy(v.sess, 'sendP');

      v.pubFunc = test.stub();
      publish("foo", function () {
        v.pubFunc.apply(this, arguments);
      });
    },

    tearDown: function () {
      sessState._resetPendingCount();
      publish._destroy('foo');
      publish._destroy('foo2');
      if (subscribe) for(var key in subscribe._subs)
        delete subscribe._subs[key];
      v = null;
    },

    "test sendP": function () {
      subscribe._onConnect();
      v.sess.sendP('id', 'foo', [1, 2, 'bar']);

      assert.calledWith(v.sendBinary, 'P', ['id', 'foo', [1, 2, 'bar']]);

      v.sess.sendP('12');

      assert.calledWith(v.sendBinary, 'P', ['12']);
    },

    "test filterModels": function () {
      test.stub(publish, '_filterModels');

      var sub1 = subscribe("foo", 1 ,2);

      sub1.filterModels('fuz', 'bar');

      assert.calledWith(publish._filterModels, {fuz: true, bar: true});
    },

    "test wait for onConnect": function () {
      var sub1 = subscribe("foo", 1 ,2);
      refute.called(v.sendBinary);

      subscribe._onConnect();

      assert.calledWith(v.sendBinary, 'P', [sub1._id, 'foo', [1, 2]]);
    },

    "test not Ready": function () {
      subscribe._onConnect();
      sessState.notify(false);

      var sub1 = subscribe("foo", 1 ,2);
      refute.called(v.sendBinary);

      subscribe._onConnect();
      assert.calledWith(v.sendBinary, 'P', [sub1._id, 'foo', [1, 2]]);
    },

    "test resubscribe onConnect": function () {
      assert.calledWith(sessState.onConnect, "10", subscribe._onConnect);

      publish("foo2", function () {});

      var sub1 = subscribe("foo", 1 ,2);
      var sub2 = subscribe("foo2", 3, 4);
      var sub3 = subscribe("foo2", 5, 6);

      v.sess.sendP.reset();
      sub1.waiting = false;

      var pendingCount = sessState.pendingCount();

      subscribe._onConnect();

      assert.same(sessState.pendingCount(), pendingCount + 1);
      assert.isTrue(sub1.waiting);


      assert.calledWith(v.sess.sendP, sub1._id, 'foo', [1, 2]);
      assert.calledWith(v.sess.sendP, sub2._id, 'foo2', [3, 4]);
      assert.calledWith(v.sess.sendP, sub3._id, 'foo2', [5, 6]);
    },

    "test onChange rpc": function () {
      test.onEnd(sessState.pending.onChange(v.ob = test.stub()));

      assert.same(sessState.pendingCount(), 0);

      var sub1 = subscribe("foo", 1 ,2, v.sub1CB = test.stub());
      assert.isTrue(sub1.waiting);

      assert.calledOnceWith(v.ob, true);

      var sub2 = subscribe("foo", 3, 4);
      assert.calledOnce(v.ob);

      assert.same(sessState.pendingCount(), 2);

      v.ob.reset();

      v.recvP(sub1._id);
      assert.isFalse(sub1.waiting);

      assert.calledOnce(v.sub1CB);
      assert.isNull(sub1.callback);

      refute.called(v.ob);

      v.recvP(sub2._id);

      assert.calledWith(v.ob, false);

      assert.same(sessState.pendingCount(), 0);
    },

    "filtering":{
      setUp: function () {
        test.stub(publish, '_filterModels');
        publish("foo2", function () {
          this.match('F1', test.stub());
          this.match('F2', test.stub());
          v.sub2isResub = this.isResubscribe;
        });
      },

      /**
       * Ensure when we stop that all docs in models (matching matches)
       * are removed if not matched
       */
      "test remove unwanted docs": function () {
        v.sub = subscribe('foo2');

        refute.called(publish._filterModels);

        v.sub.stop();

        assert.calledWith(publish._filterModels, {F1: true, F2: true});
      },

      /**
       * All subscriptions should be resubscribed
       */
      "test change userId": function () {
        v.sub = subscribe('foo', 123, 456);
        var sub2 = subscribe('foo2', 2);

        v.pubFunc.reset();

        refute(v.sub.isResubscribe);

        login.notify('change'); // no userId change
        refute.called(v.pubFunc);

        subscribe._userId = null;

        login.notify('change');

        refute(v.sub.isResubscribe);

        assert.calledWith(v.pubFunc, 123, 456);
        assert.same(v.pubFunc.thisValues[0], v.sub);

        assert.isTrue(v.sub2isResub);

        assert.calledWith(publish._filterModels, {F1: true, F2: true});
      },
    },

    "test resubscribe": function () {
      v.sub = subscribe('foo', 'x');
      v.pubFunc = function () {
        assert.same(this, v.sub);
        assert.equals(koru.util.slice(arguments), ['x']);
        assert.isTrue(this.isResubscribe);
      };

      v.sub.resubscribe();

      refute(v.sub.isResubscribe);
    },

    "test error on resubscribe": function () {
      v.sub = subscribe('foo', 'x');
      test.stub(koru, 'error');
      v.pubFunc = function () {
        throw new Error('foo error');
      };

      v.sub.resubscribe();

      refute(v.sub.isResubscribe);
      assert.calledWith(koru.error, TH.match(/foo error/));
    },



    /**
     * sub.userId should mirror koru.userId
     */
    "test userId": function () {
      v.sub = subscribe('foo', 123, 456, v.stub = test.stub());
      var origId = koru.util.thread.userId;
      test.onEnd(function () {koru.util.thread.userId = origId});
      koru.util.thread.userId = 'test123';

      assert.same(v.sub.userId, 'test123');
    },

    "test subscribe": function () {
      v.sub = subscribe('foo', 123, 456, v.stub = test.stub());

      assert.calledOnce(v.pubFunc);
      assert.same(v.pubFunc.thisValues[0], v.sub);


      assert.same(v.sub._id, subscribe._nextId.toString(36));
      assert.same(v.sub.callback, v.stub);
      assert.equals(v.sub.args, [123, 456]);

      v.recvP(v.sub._id);

      assert.calledWithExactly(v.stub, null);

      assert.calledWith(v.sess.sendP, v.sub._id, 'foo', [123, 456]);
      assert(v.sub);

      assert.same(subscribe._subs[v.sub._id], v.sub);

      var subId = v.sub._id;
      v.sub.stop();
      assert.calledWith(v.sess.sendP, subId);
      assert.isTrue(v.sub.isStopped());

      assert.isFalse(subId in subscribe._subs);
      assert.isNull(v.sub._id);

      v.sess.sendP.reset();
      v.sub.stop();
      refute.called(v.sess.sendP);

      v.sub = null;
    },

    "test remote stop while waiting": function () {
      v.sub = subscribe('foo', 123, 456, v.stub = test.stub());

      assert(v.sub.waiting);

      v.sess.sendP.reset();

      v.recvP(v.sub._id, false);

      assert.isNull(v.sub._id);

      refute.called(v.sess.sendP);
    },

    "test remove stop": {
      setUp: function () {
        v.sub = subscribe('foo', 123, 456, v.stub = test.stub());
      },

      "while waiting": function () {
        assert(v.sub.waiting);

        v.sess.sendP.reset();
        v.recvP(v.sub._id, false);

        assert.isNull(v.sub._id);
        refute.called(v.sess.sendP);
      },

      "while not waiting": function () {
        v.recvP(v.sub._id);
        refute(v.sub.waiting);

        v.sess.sendP.reset();
        v.recvP(v.sub._id, false);

        assert.isNull(v.sub._id);
        refute.called(v.sess.sendP);
      },
    },

    "match": {
      setUp: function () {
        v.Foo = Model.define('Foo').defineFields({name: 'text', age: 'number'});
        test.onEnd(function () {
          Model._destroyModel('Foo', 'drop');
        });
      },

      "test onStop": function () {
        v.sub = subscribe('foo');

        v.sub.onStop(v.onstop = test.stub());

        v.sub.stop();

        assert.called(v.onstop);

        v.sub.stop();

        assert.calledOnce(v.onstop);
      },

      "test called on message": function () {
        v.sub = subscribe('foo');

        v.sub.match(v.Foo, v.match = test.stub());

        v.recvA('Foo', 'f123', v.attrs = {name: 'bob', age: 5});

        assert.calledWith(v.match, TH.match(function (doc) {
          return doc._id === 'f123';
        }));
      },

      "test resubscribe": function () {
        v.pubFunc = function () {
          this.match(v.Foo, test.stub());
          this.match("Bar", test.stub());
        };

        v.sub = subscribe('foo');

        v.sub.onStop(v.onstop = test.stub());

        v.pubFunc = function () {
          this.match("Baz", v.match);
          this.match("Bar", test.stub());
        };

        var models = {};
        v.sub.resubscribe(models);

        assert.called(v.onstop);

        assert.equals(Object.keys(models).sort(), ["Bar", "Foo"]);

        v.sub.resubscribe(models = {});

        assert.calledOnce(v.onstop);

        assert.equals(Object.keys(models).sort(), ["Bar", "Baz"]);
      },
    },
  });
});
