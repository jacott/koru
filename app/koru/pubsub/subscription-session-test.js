isClient && define((require, exports, module)=>{
  'use strict';
  /**
   * Manage Subscription connections
   *
   * See {#../subscription}
   **/
  const koru            = require('koru');
  const Model           = require('koru/model');
  const dbBroker        = require('koru/model/db-broker');
  const DocChange       = require('koru/model/doc-change');
  const ModelMap        = require('koru/model/map');
  const Query           = require('koru/model/query');
  const TransQueue      = require('koru/model/trans-queue');
  const MockServer      = require('koru/pubsub/mock-server');
  const Subscription    = require('koru/pubsub/subscription');
  const Session         = require('koru/session');
  const SessionBase     = require('koru/session/base').constructor;
  const State           = require('koru/session/state').constructor;
  const TH              = require('koru/test-helper');
  const login           = require('koru/user-account/client-login');
  const util            = require('koru/util');

  const {private$, inspect$} = require('koru/symbols');

  const {stub, spy, stubProperty, match: m, intercept} = TH;

  const SubscriptionSession = require('./subscription-session');

  const {messageResponse$, connected$} = SubscriptionSession[private$];

  const mockServer = new MockServer(Session);

  class Library extends Subscription {}

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    const origState = Session.state, origSendBinary = Session.sendBinary;
    beforeEach(()=>{
      Session.state = new (origState.constructor)();
      Session.state._state = 'ready';
      Session.sendBinary = stub();
    });

    afterEach(()=>{
      SubscriptionSession.unload(Session);
      Session.state = origState;
      Session.sendBinary = origSendBinary;
    });

    test("reconnecting", ()=>{
      const reconnecting = stub(Library.prototype, 'reconnecting');
      const sub1 = Library.subscribe([123, 456]);

      refute.called(reconnecting);
      Session.sendBinary.reset();
      Session.state._onConnect['10-subscribe2']();
      assert.called(reconnecting);

      assert.calledOnceWith(Session.sendBinary, 'Q', ['1', 1, 'Library', [123, 456], 0]);
    });

    test("reconnecting stopped", ()=>{
      const reconnecting = stub(Library.prototype, 'reconnecting', function () {this.stop()});
      const sub1 = Library.subscribe([123, 456]);

      Session.sendBinary.reset();
      Session.state._onConnect['10-subscribe2']();
      assert.called(reconnecting);

      assert.calledOnceWith(Session.sendBinary, 'Q', ['1']);
    });

    test("postMessage", ()=>{
      const {state} = Session;
      const sub1 = Library.subscribe([123, 456]);
      Session.sendBinary.reset();

      const callback = stub();
      sub1.postMessage({add: 789}, callback);
      assert.calledWith(Session.sendBinary, 'Q', [sub1._id, 2, null, {add: 789}]);

      mockServer.sendSubResponse([sub1._id, 1, 200]);
      refute.called(callback);

      const callback2 = stub();
      sub1.postMessage({add: 'bad'}, callback2);
      assert.calledWith(Session.sendBinary, 'Q', [sub1._id, 3, null, {add: 'bad'}]);

      assert.same(state.pendingCount(), 1);
      mockServer.sendSubResponse([sub1._id, 2, 0, {added: 789}]);
      assert.calledWith(callback, null, {added: 789});

      assert.same(state.pendingCount(), 1);

      mockServer.sendSubResponse([sub1._id, 3, -400, {added: 'is_invalid'}]);
      assert.calledWith(callback2, m(err => err.error == 400 && err.reason.added === 'is_invalid'));

      assert.same(state.pendingCount(), 0);

      sub1.postMessage({add: 987});
      assert.same(state.pendingCount(), 1);
      assert.calledWith(Session.sendBinary, 'Q', [sub1._id, 1, null, {add: 987}]);
      Session.sendBinary.reset();

      Session.state._onConnect['10-subscribe2']();
      assert.calledOnceWith(Session.sendBinary, 'Q', ['1', 1, 'Library', [123, 456], 0]);
    });

    test("postMessage error", ()=>{
      const {state} = Session;
      const sub1 = Library.subscribe([123, 456]);
      Session.sendBinary.reset();

      const callback = stub();
      sub1.postMessage({add: 789}, callback);

      sub1.stop('myError');
      assert.calledWithExactly(callback, 'myError');
    });

    test("postMessage before Session ready", ()=>{
      const {state} = Session;
      Session.state._state = 'startup';
      const sub1 = Library.subscribe([123, 456]);
      Session.sendBinary.reset();

      const callback = stub();
      sub1.postMessage({add: 789}, callback);

      Session.state._state = 'ready';
      Session.state._onConnect['10-subscribe2']();
      assert.calledOnceWith(Session.sendBinary, 'Q', ['1', 1, 'Library', [123, 456], 0]);
      mockServer.sendSubResponse([sub1._id, 1, 200]);
      assert.same(state.pendingCount(), 0);
      assert.calledWithExactly(callback, null);
    });

    test("postMessage error before Session ready", ()=>{
      const {state} = Session;
      Session.state._state = 'startup';
      const sub1 = Library.subscribe([123, 456]);
      Session.sendBinary.reset();

      const callback = stub();
      sub1.postMessage({add: 789}, callback);

      sub1.stop('myError');
      assert.calledWithExactly(callback, 'myError');
    });

    test("not Ready", ()=>{
      const {state} = Session;
      state.connected(Session);
      state.close(false);

      const sub1 = new Library([1, 2], Session);
      sub1.connect();
      refute.called(Session.sendBinary);

      sub1.lastSubscribed = 5432;

      state.connected(Session);
      assert.calledWith(Session.sendBinary, 'Q', [sub1._id, 1, 'Library', [1, 2], 5432]);
    });

    test("change userId", ()=>{
      after(()=>{util.thread.userId = void 0});
      login.setUserId(Session, "user123"); // no userId change
      const sub = new Library(1, Session);
      const sub2 = new Library(2, Session);

      const ss = SubscriptionSession.get(Session);
      assert.same(ss.userId, "user123");

      sub2.connect();

      Session.sendBinary.reset();

      login.setUserId(Session, util.thread.userId); // no userId change
      refute.called(Session.sendBinary);


      stub(sub2, 'userIdChanged');
      login.setUserId(Session, "user456");

      assert.calledWith(sub2.userIdChanged, 'user456');
      refute.called(Session.sendBinary);
      sub2.userIdChanged.reset();

      sub2.stop();

      login.setUserId(Session, "user123");

      refute.called(sub2.userIdChanged);
      assert.calledOnceWith(Session.sendBinary, 'Q', ['2']);
    });

    test("filterModels", ()=>{
      const ss = SubscriptionSession.get(Session);
      let count = 0;
      stub(ss, 'filterDoc', ()=>{TransQueue.isInTransaction() && ++count});
      after(()=>{
        delete ModelMap.Foo;
        delete ModelMap.Bar;
      });
      ModelMap.Foo = {docs: {foo1: {_id: 'foo1'}}};
      ModelMap.Bar = {docs: {bar1: {_id: 'bar1'}, bar2: {_id: 'bar2'}}};
      ss.filterModels(['Foo', 'Bar']);

      assert.calledThrice(ss.filterDoc);
      assert.same(count, 3);
      assert.calledWith(ss.filterDoc, ModelMap.Foo.docs.foo1);
      assert.calledWith(ss.filterDoc, ModelMap.Bar.docs.bar2);
    });

    group("query updates", ()=>{
      let Foo, fooSess, ss;

      const sendMsg = (type, ...args) => {fooSess._commands[type].call(fooSess, args)};

      beforeEach(()=>{
        Foo = Model.define('Foo').defineFields({name: 'text', age: 'number'});
        fooSess = new (Session.constructor)('foo01');
        fooSess.state = new State();
        fooSess.sendBinary = stub();
        ss = SubscriptionSession.get(fooSess);
      });

      afterEach(()=>{
        SubscriptionSession.unload(fooSess);
        Model._destroyModel('Foo', 'drop');
        dbBroker.clearDbId();
        delete Model._databases.foo01;
      });

      test("filterDoc", ()=>{
        const bob = Foo.findById(Foo._insertAttrs({_id: 'bob'}));
        const sam = Foo.findById(Foo._insertAttrs({_id: 'sam'}));
        const sue = Foo.findById(Foo._insertAttrs({_id: 'sue'}));
        const onChange = stub();
        after(Foo.onChange(onChange));
        const has = {bob: true, sam: false};
        ss.match.register('Foo', doc => has[doc._id]);

        assert.isFalse(ss.filterDoc(void 0));

        assert.isFalse(ss.filterDoc(bob));
        refute.called(onChange);
        assert(Foo.findById('bob'));

        assert.isTrue(ss.filterDoc(sam));
        refute(Foo.findById('sam'));
        assert.calledWith(onChange, DocChange.delete(sam, 'fromServer'));

        assert.isTrue(ss.filterDoc(sue));
        refute(Foo.findById('sue'));
        assert.calledWith(onChange, DocChange.delete(sue, 'stopped'));
      });

      test("added", ()=>{
        ss.match.register('Foo', doc => doc.age > 4);
        const insertSpy = spy(Query, 'insertFromServer');
        const attrs = {_id: 'f123', name: 'bob', age: 5};
        sendMsg('A', 'Foo', attrs);

        assert.same(dbBroker.dbId, 'default');

        dbBroker.dbId = 'foo01';
        const foo = Foo.findById('f123');
        assert(foo);

        assert.same(foo.attributes, attrs);
        assert.calledWith(insertSpy, Foo, attrs);
      });

      test("added no match", ()=>{
        dbBroker.dbId = 'foo01';

        ss.match.register('Foo', doc => doc.age < 4);
        const insertSpy = spy(Query, 'insertFromServer');
        const attrs = {_id: 'f123', name: 'bob', age: 5};
        sendMsg('A', 'Foo', attrs);

        refute(Foo.findById('f123'));
      });

      test("changed", ()=>{
        ss.match.register('Foo', doc => doc.age > 4);
        dbBroker.dbId = 'foo01';
        const bob = Foo.findById(Foo._insertAttrs({_id: 'f222', name: 'bob', age: 5}));
        const sam = Foo.findById(Foo._insertAttrs({_id: 'f333', name: 'sam', age: 5}));

        dbBroker.clearDbId();
        sendMsg('C', 'Foo', 'f222', {age: 7});
        sendMsg('C', 'Foo', 'f333', {age: 9});

        assert.equals(bob.attributes, {_id: 'f222', name: 'bob', age: 7});
        assert.equals(sam.attributes, {_id: 'f333', name: 'sam', age: 9});
      });

      test("changed no match", ()=>{
        const handle = ss.match.register('Foo', doc => doc.age > 4 ? doc.age < 10 : void 0);
        dbBroker.dbId = 'foo01';
        const bob = Foo.findById(Foo._insertAttrs({_id: 'f222', name: 'bob', age: 5}));
        const sam = Foo.findById(Foo._insertAttrs({_id: 'f333', name: 'sam', age: 5}));
        const sue = Foo.findById(Foo._insertAttrs({_id: 'f444', name: 'sue', age: 5}));

        const onChange = stub();
        after(Foo.onChange(onChange));

        sendMsg('C', 'Foo', 'f222', {age: 3});

        refute(Foo.findById('f222'));
        assert.calledOnceWith(onChange, DocChange.delete(bob, 'stopped'));

        onChange.reset();
        sendMsg('C', 'Foo', 'f444', {age: 13});

        refute(Foo.findById('f444'));
        assert.calledOnceWith(onChange, DocChange.delete(sue, 'fromServer'));

        sam.attributes.age = 3;
        sendMsg('C', 'Foo', 'f333', {age: 9});
        assert.equals(sam.attributes, {_id: 'f333', name: 'sam', age: 9});

        onChange.reset();
        handle.delete();
        sendMsg('C', 'Foo', 'f333', {age: 6});
        refute(Foo.findById('f222'));
        assert.calledOnceWith(onChange, DocChange.delete(sam, 'stopped'));
      });

      test("remove", ()=>{
        dbBroker.dbId = 'foo01';
        const bob = Foo.findById(Foo._insertAttrs({_id: 'f222', name: 'bob', age: 5}));
        const sam = Foo.findById(Foo._insertAttrs({_id: 'f333', name: 'sam', age: 5}));

        let flag;
        after(Foo.onChange(dc => {
          flag = dc.flag;
        }));

        dbBroker.clearDbId();
        sendMsg('R', 'Foo', 'f222');

        dbBroker.dbId = 'foo01';
        refute(Foo.findById('f222'));
        assert(Foo.findById('f333'));

        assert.same(flag, 'serverUpdate');

        sendMsg('R', 'Foo', 'f333', 'stopped');
        assert.same(flag, 'stopped');
      });

      test("alt session", ()=>{
        dbBroker.dbId = 'foo01';
        const bob = Foo.findById(Foo._insertAttrs({_id: 'f222', name: 'bob', age: 5}));
        fooSess.state.connected(fooSess);

        const fooMatch = ss.match.register('Foo', doc => true);
        const sub = new Library(null, fooSess);
        sub.connect();

        sendMsg('C', 'Foo', 'f222', {age: 7});
        sendMsg('C', 'Foo', 'f222', {age: 6});
        sendMsg('Q', sub._id, 1, 0);
        assert.same(bob.age, 6);
      });
    });
  });
});
