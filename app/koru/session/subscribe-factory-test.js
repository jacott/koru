isClient && define(function (require, exports, module) {
  /**
   * Build a subscriber for a `session`.
   *
   * See {#koru/session/subscribe}
   **/
  var test, v;
  const ClientSub        = require('koru/session/client-sub');
  const api              = require('koru/test/api');
  const koru             = require('../main');
  const Model            = require('../model/main');
  const login            = require('../user-account/client-login');
  const util             = require('../util');
  require('./client-update');
  const message          = require('./message');
  const publish          = require('./publish');
  const stateFactory     = require('./state').constructor;
  const subscribeFactory = require('./subscribe-factory');
  const TH               = require('./test-helper');

  var subscribe;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.gDict = message.newGlobalDict();

      TH.mockConnectState(v);
      subscribe = subscribeFactory(v.sess ={
        provide: test.stub(),
        state: v.sessState = stateFactory(),
        _rpcs: {},
        _commands: {},
        sendBinary: v.sendBinary = test.stub(),
      });
      assert.calledWith(v.sess.provide, 'P', TH.match(function (func) {
        v.recvP = function (...args) {
          func.call(v.sess, args);
        };
        return true;
      }));
      ['A', 'C', 'R'].forEach(function (type) {
        assert.calledWith(v.sess.provide, type, TH.match(function (func) {
          v['recv'+type] = function (...args) {
            func(args);
          };
          return true;
        }));
      });

      test.spy(v.sess, 'sendP');

      v.pubFunc = test.stub();
      publish({name: "foo", init(...args) {
        v.pubFunc.apply(this, args);
      }});
      api.module();
    },

    tearDown() {
      publish._destroy('foo');
      publish._destroy('foo2');
      v = null;
    },

    "test sendP"() {
      v.sessState.connected(v.sess);
      v.sess.sendP('id', 'foo', [1, 2, 'bar']);

      assert.calledWith(v.sendBinary, 'P', ['id', 'foo', [1, 2, 'bar']]);

      v.sess.sendP('12');

      assert.calledWith(v.sendBinary, 'P', ['12']);
    },

    "test wait for onConnect"() {
      var sub1 = subscribe("foo", 1 ,2);
      refute.called(v.sendBinary);

      v.sessState.connected(v.sess);

      assert.calledWith(v.sendBinary, 'P', [sub1._id, 'foo', [1, 2]]);
    },

    "test not Ready"() {
      v.sessState.connected(v.sess);
      v.sessState.close(false);

      var sub1 = subscribe("foo", 1 ,2);
      refute.called(v.sendBinary);

      v.sessState.connected(v.sess);
      assert.calledWith(v.sendBinary, 'P', [sub1._id, 'foo', [1, 2]]);
    },

    "test build subscribe"() {
      api.new(subscribeFactory);
      test.stub(v.sessState, 'onConnect');
      const mySession = v.sess;
      TH.stubProperty(publish._pubs, 'Library', v.Library = test.stub());
      api.example(() => {
        const subscribe = subscribeFactory(mySession);
        const sub = subscribe("Library");

        assert(sub instanceof ClientSub);
      });
    },

    "test resubscribe onConnect"() {
      test.stub(v.sessState, 'onConnect');
      subscribe = subscribeFactory(v.sess);
      test.stub(v.sess, 'sendP');
      assert.calledWith(v.sessState.onConnect, "10-subscribe", subscribe._onConnect);

      publish({name: "foo2", init() {}});

      var sub1 = subscribe("foo", 1 ,2);
      var sub2 = subscribe("foo2", 3, 4);
      var sub3 = subscribe("foo2", 5, 6);

      v.sess.sendP.reset();
      sub1.waiting = false;

      var pendingCount = v.sessState.pendingCount();

      subscribe._onConnect(v.sess);

      assert.same(v.sessState.pendingCount(), pendingCount + 1);
      assert.isTrue(sub1.waiting);


      assert.calledWith(v.sess.sendP, sub1._id, 'foo', [1, 2]);
      assert.calledWith(v.sess.sendP, sub2._id, 'foo2', [3, 4]);
      assert.calledWith(v.sess.sendP, sub3._id, 'foo2', [5, 6]);
    },

    "test onChange rpc"() {
      test.onEnd(v.sessState.pending.onChange(v.ob = test.stub()));

      assert.same(v.sessState.pendingCount(), 0);

      var sub1 = subscribe("foo", 1 ,2, v.sub1CB = test.stub());
      assert.isTrue(sub1.waiting);

      assert.calledOnceWith(v.ob, true);

      var sub2 = subscribe("foo", 3, 4);
      assert.calledOnce(v.ob);

      assert.same(v.sessState.pendingCount(), 2);

      v.ob.reset();

      v.recvP(sub1._id);
      assert.isFalse(sub1.waiting);

      assert.calledOnce(v.sub1CB);
      assert.isNull(sub1.callback);

      refute.called(v.ob);

      v.recvP(sub2._id);

      assert.calledWith(v.ob, false);

      assert.same(v.sessState.pendingCount(), 0);
    },

    "filtering":{
      setUp() {
        test.stub(publish, '_filterModels');
        publish({name: "foo2", init() {
          this.match('F1', test.stub());
          this.match('F2', test.stub());
          v.sub2isResub = this.isResubscribe;
        }});
      },

      /**
       * Ensure when we stop that all docs in models (matching matches)
       * are removed if not matched
       */
      "test remove unwanted docs"() {
        v.sub = subscribe('foo2');

        refute.called(publish._filterModels);

        v.sub.stop.call({}); // ensure binding

        assert.calledWith(publish._filterModels, {F1: true, F2: true});
      },

      /**
       * All subscriptions should be resubscribed
       */
      "test change userId"() {
        v.sub = subscribe('foo', 123, 456);
        var sub2 = subscribe('foo2', 2);

        v.pubFunc.reset();

        refute(v.sub.isResubscribe);

        login.setUserId(v.sess, util.thread.userId); // no userId change
        refute.called(v.pubFunc);

        subscribe._userId = null;

        login.setUserId(v.sess, util.thread.userId);

        refute(v.sub.isResubscribe);

        assert.calledWith(v.pubFunc, 123, 456);
        assert.same(v.pubFunc.firstCall.thisValue, v.sub);

        assert.isTrue(v.sub2isResub);

        assert.calledWith(publish._filterModels, {F1: true, F2: true});
      },
    },

    "test resubscribe"() {
      v.sub = subscribe('foo', 'x');
      v.pubFunc = function (...args) {
        assert.same(this, v.sub);
        assert.equals(args.slice(), ['x']);
        assert.isTrue(this.isResubscribe);
      };

      v.sub.resubscribe();

      refute(v.sub.isResubscribe);
    },

    "test error on resubscribe"() {
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
    "test userId"() {
      v.sub = subscribe('foo', 123, 456, v.stub = test.stub());
      var origId = koru.util.thread.userId;
      test.onEnd(function () {koru.util.thread.userId = origId});
      koru.util.thread.userId = 'test123';

      assert.same(v.sub.userId, 'test123');
    },

    "test stop before result"() {
      v.sub = subscribe('foo', 123, 456, v.stub = test.stub());
      test.spy(v.sessState, "decPending");
      v.sub.stop();
      assert.called(v.sessState.decPending);
      v.sub.stop();
      assert.calledOnce(v.sessState.decPending);
    },

    "test subscribe"() {
      v.sub = subscribe('foo', 123, 456, v.stub = test.stub());

      assert.calledOnce(v.pubFunc);
      assert.same(v.pubFunc.firstCall.thisValue, v.sub);


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

    "test callback on error" () {
      v.sub = subscribe('foo', 123, 456, v.stub = test.stub());
      refute.called(v.stub);
      v.recvP(v.sub._id, 304, "error msg");
      v.recvP(v.sub._id, 304, "error msg");
      assert.calledOnceWith(v.stub, [304, "error msg"]);
    },

    "test remote stop while waiting"() {
      v.sub = subscribe('foo', 123, 456, v.stub = test.stub());

      assert(v.sub.waiting);

      v.sess.sendP.reset();

      v.recvP(v.sub._id, false);

      assert.isNull(v.sub._id);

      refute.called(v.sess.sendP);
    },

    "test remove stop": {
      setUp() {
        v.sub = subscribe('foo', 123, 456, v.stub = test.stub());
      },

      "while waiting"() {
        assert(v.sub.waiting);

        v.sess.sendP.reset();
        v.recvP(v.sub._id, false);

        assert.isNull(v.sub._id);
        refute.called(v.sess.sendP);
      },

      "while not waiting"() {
        v.recvP(v.sub._id);
        refute(v.sub.waiting);

        v.sess.sendP.reset();
        v.recvP(v.sub._id, false);

        assert.isNull(v.sub._id);
        refute.called(v.sess.sendP);
      },
    },

    "match": {
      setUp() {
        v.Foo = Model.define('Foo').defineFields({name: 'text', age: 'number'});
        test.onEnd(function () {
          Model._destroyModel('Foo', 'drop');
        });
      },

      "test onStop"() {
        v.sub = subscribe('foo');

        v.sub.onStop(v.onstop = test.stub());

        v.sub.stop();

        assert.called(v.onstop);

        v.sub.stop();

        assert.calledOnce(v.onstop);
      },

      "test called on message"() {
        v.sub = subscribe('foo');

        v.sub.match(v.Foo, v.match = test.stub());

        v.recvA('Foo', 'f123', v.attrs = {name: 'bob', age: 5});

        assert.calledWith(v.match, TH.match(function (doc) {
          return doc._id === 'f123';
        }));
      },

      "test resubscribe"() {
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
