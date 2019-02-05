isClient && define((require, exports, module)=>{
  /**
   * Manage Subscription connections
   *
   * See {#../subscription}
   **/
  const koru            = require('koru');
  const MockServer      = require('koru/pubsub/mock-server');
  const Subscription    = require('koru/pubsub/subscription');
  const Session         = require('koru/session');
  const SessionBase     = require('koru/session/base').constructor;
  const State           = require('koru/session/state').constructor;
  const TH              = require('koru/test-helper');
  const login           = require('koru/user-account/client-login');
  const util            = require('koru/util');

  const {private$, inspect$} = require('koru/symbols');

  const {stub, spy, onEnd, stubProperty, match: m, intercept} = TH;

  const SubscriptionSession = require('./subscription-session');

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
      Session.state._onConnect['10-subscribe2']();
      assert.called(reconnecting);
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
      onEnd(()=>{util.thread.userId = void 0});
      login.setUserId(Session, "user123"); // no userId change
      const sub = new Library(1, Session);
      const sub2 = new Library(2, Session);

      const ss = SubscriptionSession.get(Session);
      assert.same(ss.userId, "user123");

      sub2.connect();

      Session.sendBinary.reset();

      login.setUserId(Session, util.thread.userId); // no userId change
      refute.called(Session.sendBinary);

      login.setUserId(Session, "user456");

      assert.calledOnceWith(Session.sendBinary, 'Q', ['2', 1, 'Library', 2, 0]);
      Session.sendBinary.reset();

      sub2.stop();

      login.setUserId(Session, "user123");
      refute.called(Session.sendBinary);
    });
  });
});
