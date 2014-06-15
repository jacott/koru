define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var connectState = require('./connect-state');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.origOnConnect = connectState._onConnect;
      connectState._onConnect = {};
      v.origState = connectState._state;
      connectState._state = 'closed';
    },

    tearDown: function () {
      connectState._onConnect = v.origOnConnect;
      connectState._state = v.origState;
      v = null;
    },

    "test connected": function () {
      connectState.onConnect('22', v.conn22_1 = test.stub());
      connectState.onConnect('22', v.conn22_2 = test.stub());

      connectState.onConnect('10', v.conn10_1 = test.stub());

      test.onEnd(connectState.onChange(v.onChange = test.stub()));

      connectState.connected(v.conn = {});

      assert.same(v.conn22_1.thisValues[0], v.conn);

      assert(v.conn22_1.calledAfter(v.conn10_1));
      assert(v.conn22_2.calledAfter(v.conn22_1));

      assert(v.onChange.calledAfter(v.conn22_2));
      assert.calledWith(v.onChange, true);

      assert.same(connectState._state, 'ready');

      assert(connectState.isReady());
      refute(connectState.isClosed());

      connectState.stopOnConnect('22', v.conn22_2);

      assert.equals(connectState._onConnect['22'], [v.conn22_1]);
    },

    "test retry": function () {
      test.onEnd(connectState.onChange(v.onChange = test.stub()));

      connectState.retry();
      connectState.retry();

      assert.same(connectState._state, 'retry');

      assert.calledOnceWith(v.onChange, false);
    },


    "test retry": function () {
      test.onEnd(connectState.onChange(v.onChange = test.stub()));

      connectState._state = 'ready';

      connectState.close();
      connectState.close();

      assert.same(connectState._state, 'closed');

      assert.calledOnceWith(v.onChange, false);
    },
  });
});
