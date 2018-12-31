isClient && define((require, exports, module)=>{
  /**
   * Manage Subscription connections
   *
   * See {#../subscription}
   **/
  const koru            = require('koru');
  const MockServer      = require('koru/pubsub/mock-server');
  const Subscription    = require('koru/pubsub/subscription');
  const SessionBase     = require('koru/session/base').constructor;
  const State           = require('koru/session/state').constructor;
  const TH              = require('koru/test-helper');
  const login           = require('koru/user-account/client-login');
  const util            = require('koru/util');

  const {private$} = require('koru/symbols');

  const {stub, spy, onEnd, stubProperty, match: m, intercept} = TH;

  const SubscriptionSession = require('./subscription-session');

  const session = new SessionBase(module.id);

  const mockServer = new MockServer(session);

  class Library extends Subscription {}

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      session.state = new State();
      session.sendBinary = stub();
      session.state._state = 'ready';
    });

    afterEach(()=>{
      SubscriptionSession.unload(session);
    });

    test("pendingCount", ()=>{
      const {state} = session;
      const sub1 = new Library(session);
      sub1.onConnect(()=>{
        throw new Error('pc='+state.pendingCount());
      });
      sub1.connect('a');
      assert.same(state.pendingCount(), 1);
      assert.same(state.pendingUpdateCount(), 0);
      sub1.connect('b');
      assert.same(state.pendingCount(), 1);

      mockServer.sendSubResponse([sub1._id, 1, 200]);
      mockServer.sendSubResponse([sub1._id, 3, 200]);
      assert.same(state.pendingCount(), 1);

      let ex;
      try {
        mockServer.sendSubResponse([sub1._id, 2, 200]);
      } catch(_ex) {
        ex = _ex;
      }
      assert.same(ex.message, 'pc=1');

      assert.same(state.pendingCount(), 0);


      sub1.connect('b');
      assert.same(state.pendingCount(), 1);

      sub1.stop();
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
      onEnd(()=>{util.thread.userId = undefined});
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

      assert.calledOnceWith(session.sendBinary, 'Q', ['2', 2, 'Library', [123, 456], undefined]);
      session.sendBinary.reset();

      sub2.stop();

      login.setUserId(session, "user123");
      refute.called(session.sendBinary);
    });
  });
});
