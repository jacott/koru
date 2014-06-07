isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var session = require('../session/main');
  var subscribe = require('./subscribe');
  var publish = require('./publish');
  require('./client-update');
  var Model = require('../model/main');
  var env = require('../env');
  var UserAccount = require('../user-account/main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      test.stub(session, 'sendP');

      v.pubFunc = test.stub();
      publish("foo", function () {
        v.pubFunc.apply(this, arguments);
      });
    },

    tearDown: function () {
      publish._destroy('foo');
      publish._destroy('foo2');
      for(var key in subscribe._subs)
        delete subscribe._subs[key];
      v = null;
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

        UserAccount.notify('change');

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
        assert.equals(env.util.slice(arguments), ['x']);
        assert.isTrue(this.isResubscribe);
      };

      v.sub.resubscribe();

      refute(v.sub.isResubscribe);
    },

    "test error on resubscribe": function () {
      v.sub = subscribe('foo', 'x');
      test.stub(env, 'error');
      v.pubFunc = function () {
        throw new Error('foo error');
      };

      v.sub.resubscribe();

      refute(v.sub.isResubscribe);
      assert.calledWith(env.error, TH.match(/foo error/));
    },



    /**
     * sub.userId should mirror env.userId
     */
    "test userId": function () {
      v.sub = subscribe('foo', 123, 456, v.stub = test.stub());
      var origId = env.util.thread.userId;
      test.onEnd(function () {env.util.thread.userId = origId});
      env.util.thread.userId = 'test123';

      assert.same(v.sub.userId, 'test123');
    },

    "test subscribe": function () {
      v.sub = subscribe('foo', 123, 456, v.stub = test.stub());

      assert.calledOnce(v.pubFunc);
      assert.same(v.pubFunc.thisValues[0], v.sub);


      assert.same(v.sub._id, subscribe._nextId.toString(36));
      assert.same(v.sub.callback, v.stub);
      assert.equals(v.sub.args, [123, 456]);

      session._onMessage({}, 'P'+v.sub._id);

      assert.calledWithExactly(v.stub, null);

      assert.calledWith(session.sendP, 'foo|' + v.sub._id, [123, 456]);
      assert(v.sub);

      assert.same(subscribe._subs[v.sub._id], v.sub);

      v.sub.stop();
      assert.calledWith(session.sendP, '|' + v.sub._id);

      assert.isFalse(v.sub._id in subscribe._subs);
      v.sub = null;
    },

    "match": {
      setUp: function () {
        v.Foo = Model.define('Foo').defineFields({name: 'text', age: 'number'});
        test.onEnd(function () {
          Model._destroyModel('Foo', 'drop');
        });
      },

      "test called on message": function () {
        v.sub = subscribe('foo');

        v.sub.match(v.Foo, v.match = test.stub());

        session._onMessage({}, 'AFoo|f123'+JSON.stringify(v.attrs = {name: 'bob', age: 5}));

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

        v.pubFunc = function () {
          this.match("Baz", v.match);
          this.match("Bar", test.stub());
        };

        var models = {};
        v.sub.resubscribe(models);

        assert.equals(Object.keys(models).sort(), ["Bar", "Foo"]);

        v.sub.resubscribe(models = {});

        assert.equals(Object.keys(models).sort(), ["Bar", "Baz"]);
      },
    },
  });
});
