define(function (require, exports, module) {
  var test, v;
  const TH               = require('../test');
  const defaultSessState = require('./state');

  var sessState;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      sessState = new defaultSessState.__init__();
    },

    tearDown() {
      v = sessState = null;
    },

    "test pending"() {
      assert.same(sessState.pendingCount(), 0);
      test.onEnd(sessState.pending.onChange(v.change = test.stub()));

      sessState.incPending();
      assert.calledOnce(v.change);
      assert.calledWith(v.change, true);
      assert.same(sessState.pendingCount(), 1);

      sessState.incPending();
      assert.calledOnce(v.change);

      sessState.decPending();
      assert.calledOnce(v.change);
      assert.same(sessState.pendingCount(), 1);

      sessState.decPending();
      assert.calledWith(v.change, false);
      assert.same(sessState.pendingCount(), 0);

      assert.exception(function () {
        sessState.decPending();
      });

      assert.same(sessState.pendingCount(), 0);

      v.change.reset();
      sessState.incPending();
      assert.same(sessState.pendingCount(), 1);
      assert.calledWith(v.change, true);
    },

    "test onConnect"() {
      sessState.onConnect('22', v.conn22_1 = test.stub());
      assert.exception(function () {
        sessState.onConnect('22', v.conn22_2 = test.stub());
      });

      sessState.onConnect('10', v.conn10_1 = test.stub());

      test.onEnd(sessState.onChange(v.onChange = test.stub()));

      sessState.connected(v.conn = {});

      assert.same(v.conn22_1.firstCall.args[0], v.conn);

      assert(v.conn22_1.calledAfter(v.conn10_1));
      assert(v.onChange.calledAfter(v.conn22_1));
      assert.calledWith(v.onChange, true);

      assert.same(sessState._state, 'ready');

      assert(sessState.isReady());
      refute(sessState.isClosed());

      sessState.stopOnConnect('22');

      assert.equals(sessState._onConnect['22'], undefined);
    },

    "test retry startup"() {
      test.onEnd(sessState.onChange(v.onChange = test.stub()));

      sessState.retry(4404, 'not found');
      sessState.retry(4403, 'forbidden');

      assert.same(sessState._state, 'retry');

      assert.calledOnceWith(v.onChange, false, 4404, 'not found');
    },


    "test retry ready"() {
      test.onEnd(sessState.onChange(v.onChange = test.stub()));

      sessState._state = 'ready';

      sessState.close();
      sessState.close();

      assert.same(sessState._state, 'closed');

      assert.calledOnceWith(v.onChange, false);
    },
  });
});
