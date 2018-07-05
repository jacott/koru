define((require, exports, module)=>{
  const TH              = require('koru/test-helper');
  const stateFactory    = require('./state').constructor;

  const {stub, spy, onEnd} = TH;

  let sessState;
  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      sessState = new stateFactory();
    });

    afterEach(()=>{
      v = {};
      sessState = null;
    });

    test("pending", ()=>{
      assert.same(sessState.pendingCount(), 0);
      onEnd(sessState.pending.onChange(v.change = stub()));

      sessState.incPending();
      assert.calledOnce(v.change);
      assert.calledWith(v.change, true);
      assert.same(sessState.pendingCount(), 1);
      assert.same(sessState.pendingUpdateCount(), 0);

      sessState.incPending(true);
      assert.calledOnce(v.change);
      assert.same(sessState.pendingCount(), 2);
      assert.same(sessState.pendingUpdateCount(), 1);

      sessState.decPending();
      assert.calledOnce(v.change);
      assert.same(sessState.pendingCount(), 1);
      assert.same(sessState.pendingUpdateCount(), 1);

      sessState.decPending(true);
      assert.calledWith(v.change, false);
      assert.same(sessState.pendingCount(), 0);
      assert.same(sessState.pendingUpdateCount(), 0);

      assert.exception(function () {
        sessState.decPending();
      });

      assert.same(sessState.pendingCount(), 0);

      v.change.reset();
      sessState.incPending(true);
      assert.same(sessState.pendingCount(), 1);
      assert.same(sessState.pendingUpdateCount(), 1);
      assert.calledWith(v.change, true);
    });

    test("onConnect", ()=>{
      sessState.onConnect('22', v.conn22_1 = stub());
      assert.exception(function () {
        sessState.onConnect('22', v.conn22_2 = stub());
      });

      sessState.onConnect('10', v.conn10_1 = stub());

      onEnd(sessState.onChange(v.onChange = stub()));

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
    });

    test("pause", ()=>{
      onEnd(sessState.onChange(v.onChange = stub()));

      sessState._state = 'ready';

      sessState.pause();

      assert.calledOnceWith(v.onChange, false);

      assert.isTrue(sessState.isPaused());

    });

    test("retry startup", ()=>{
      onEnd(sessState.onChange(v.onChange = stub()));

      sessState.retry(4404, 'not found');
      sessState.retry(4403, 'forbidden');

      assert.same(sessState._state, 'retry');

      assert.calledOnceWith(v.onChange, false, 4404, 'not found');
    });


    test("retry ready", ()=>{
      onEnd(sessState.onChange(v.onChange = stub()));

      sessState._state = 'ready';

      sessState.close();
      sessState.close();

      assert.same(sessState._state, 'closed');

      assert.calledOnceWith(v.onChange, false);
    });
  });
});
