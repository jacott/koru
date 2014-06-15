define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var sessState = require('./state');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.origOnConnect = sessState._onConnect;
      sessState._onConnect = {};
      v.origState = sessState._state;
      sessState._state = 'closed';
    },

    tearDown: function () {
      sessState._onConnect = v.origOnConnect;
      sessState._state = v.origState;
      v = null;
    },

    "test notification": function () {
      assert.isFalse(sessState.inSync());
      test.onEnd(sessState.pending.onChange(v.change = test.stub()));

      sessState.incPending();
      assert.calledOnce(v.change);
      assert.calledWith(v.change, true);
      assert.isTrue(sessState.inSync());

      sessState.incPending();
      assert.calledOnce(v.change);

      sessState.decPending();
      assert.calledOnce(v.change);
      assert.isTrue(sessState.inSync());

      sessState.decPending();
      assert.calledWith(v.change, false);
      assert.isFalse(sessState.inSync());

      assert.exception(function () {
        sessState.decPending();
      });

      assert.isFalse(sessState.inSync());

      v.change.reset();
      sessState.incPending();
      assert.isTrue(sessState.inSync());
      assert.calledWith(v.change, true);
    },

    "test connected": function () {
      sessState.onConnect('22', v.conn22_1 = test.stub());
      sessState.onConnect('22', v.conn22_2 = test.stub());

      sessState.onConnect('10', v.conn10_1 = test.stub());

      test.onEnd(sessState.onChange(v.onChange = test.stub()));

      sessState.connected(v.conn = {});

      assert.same(v.conn22_1.thisValues[0], v.conn);

      assert(v.conn22_1.calledAfter(v.conn10_1));
      assert(v.conn22_2.calledAfter(v.conn22_1));

      assert(v.onChange.calledAfter(v.conn22_2));
      assert.calledWith(v.onChange, true);

      assert.same(sessState._state, 'ready');

      assert(sessState.isReady());
      refute(sessState.isClosed());

      sessState.stopOnConnect('22', v.conn22_2);

      assert.equals(sessState._onConnect['22'], [v.conn22_1]);
    },

    "test retry": function () {
      test.onEnd(sessState.onChange(v.onChange = test.stub()));

      sessState.retry();
      sessState.retry();

      assert.same(sessState._state, 'retry');

      assert.calledOnceWith(v.onChange, false);
    },


    "test retry": function () {
      test.onEnd(sessState.onChange(v.onChange = test.stub()));

      sessState._state = 'ready';

      sessState.close();
      sessState.close();

      assert.same(sessState._state, 'closed');

      assert.calledOnceWith(v.onChange, false);
    },
  });
});
