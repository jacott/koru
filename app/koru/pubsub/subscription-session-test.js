isClient && define((require, exports, module)=>{
  /**
   * Manage Subscription connections
   *
   * See {#../subscription}
   **/
  const koru            = require('koru');
  const MockServer      = require('koru/pubsub/mock-server');
  const Subscription    = require('koru/pubsub/subscription');
  const session         = require('koru/session');
  const SessionBase     = require('koru/session/base').constructor;
  const State           = require('koru/session/state').constructor;
  const TH              = require('koru/test-helper');
  const login           = require('koru/user-account/client-login');
  const util            = require('koru/util');

  const {private$} = require('koru/symbols');

  const {stub, spy, onEnd, stubProperty, match: m, intercept} = TH;

  const SubscriptionSession = require('./subscription-session');

  const mockServer = new MockServer(session);

  class Library extends Subscription {}

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      stubProperty(session, 'state', {value: new State()});
      stub(session, 'sendBinary');
      session.state._state = 'ready';
    });

    afterEach(()=>{
      SubscriptionSession.unload(session);
    });

    test("reconnecting", ()=>{
      const reconnecting = stub(Library.prototype, 'reconnecting');
      const sub1 = Library.subscribe([123, 456]);

      refute.called(reconnecting);
      session.state._onConnect['10-subscribe2']();
      assert.called(reconnecting);
    });

    test("postMessage", ()=>{
      const {state} = session;
      const sub1 = Library.subscribe([123, 456]);
      session.sendBinary.reset();

      const callback = stub();
      sub1.postMessage({add: 789}, callback);
      assert.calledWith(session.sendBinary, 'Q', [sub1._id, 2, null, {add: 789}]);

      mockServer.sendSubResponse([sub1._id, 1, 200]);
      refute.called(callback);

      const callback2 = stub();
      sub1.postMessage({add: 'bad'}, callback2);
      assert.calledWith(session.sendBinary, 'Q', [sub1._id, 3, null, {add: 'bad'}]);

      assert.same(state.pendingCount(), 1);
      mockServer.sendSubResponse([sub1._id, 2, 0, {added: 789}]);
      assert.calledWith(callback, null, {added: 789});

      assert.same(state.pendingCount(), 1);

      mockServer.sendSubResponse([sub1._id, 3, -400, {added: 'is_invalid'}]);
      assert.calledWith(callback2, m(err => err.error == 400 && err.reason.added === 'is_invalid'));

      assert.same(state.pendingCount(), 0);

      sub1.postMessage({add: 987});
      assert.same(state.pendingCount(), 1);
      assert.calledWith(session.sendBinary, 'Q', [sub1._id, 1, null, {add: 987}]);
      session.sendBinary.reset();

      session.state._onConnect['10-subscribe2']();
      assert.calledOnceWith(session.sendBinary, 'Q', ['1', 1, 'Library', [123, 456], 0]);
    });

    test("postMessage before session ready", ()=>{
      const {state} = session;
      session.state._state = 'startup';
      const sub1 = Library.subscribe([123, 456]);
      session.sendBinary.reset();

      const callback = stub();
      sub1.postMessage({add: 789}, callback);

      session.state._state = 'ready';
      session.state._onConnect['10-subscribe2']();
      assert.calledOnceWith(session.sendBinary, 'Q', ['1', 1, 'Library', [123, 456], 0]);
      mockServer.sendSubResponse([sub1._id, 1, 200]);
      assert.same(state.pendingCount(), 0);
    });

    test("not Ready", ()=>{
      const {state} = session;
      state.connected(session);
      state.close(false);

      const sub1 = new Library(session);
      sub1.connect(1, 2);
      refute.called(session.sendBinary);

      sub1.lastSubscribed = 5432;

      state.connected(session);
      assert.calledWith(session.sendBinary, 'Q', [sub1._id, 1, 'Library', [1, 2], 5432]);
    });

    test("change userId", ()=>{
      onEnd(()=>{util.thread.userId = void 0});
      login.setUserId(session, "user123"); // no userId change
      const sub = new Library(session);
      const sub2 = new Library(session);

      const ss = SubscriptionSession.get(session);
      assert.same(ss.userId, "user123");

      sub2.connect(123, 456);

      session.sendBinary.reset();

      login.setUserId(session, util.thread.userId); // no userId change
      refute.called(session.sendBinary);

      login.setUserId(session, "user456");

      assert.calledOnceWith(session.sendBinary, 'Q', ['2', 1, 'Library', [123, 456], 0]);
      session.sendBinary.reset();

      sub2.stop();

      login.setUserId(session, "user123");
      refute.called(session.sendBinary);
    });
  });
});
