define((require, exports, module)=>{
  const util            = require('koru/util');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd, intercept, match: m} = TH;

  const koru = require('./main');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      v = {};
    });

    test("getHashOrigin", ()=>{
      stub(koru, 'getLocation').returns({protocol: 'p', host: 'h', pathname: 'n'});

      assert.same(koru.getHashOrigin(), 'p//hn');
    });

    test("koru.global", ()=>{
      assert.same(koru.global, window);
    });

    test("runFiber", ()=>{
      koru.runFiber(() => {v.success = true});
      assert(v.success);

      stub(koru, 'error');
      koru.runFiber(()=>{throw new Error("Foo")});
      assert.calledWith(koru.error, TH.match(/Foo/));
    });

    group("afTimeout", ()=>{
      beforeEach(()=>{
        assert.same(TH.Core._origAfTimeout, koru._afTimeout);
        stub(window, 'setTimeout').returns(7766);
        stub(window, 'clearTimeout');

        stub(window, 'requestAnimationFrame').returns(123);
        stub(window, 'cancelAnimationFrame');
      });

      test("zero timeout", ()=>{
        koru._afTimeout(v.stub = stub());

        refute.called(setTimeout);
        assert.calledWith(window.requestAnimationFrame, TH.match.func);

        window.requestAnimationFrame.yield();
        assert.called(v.stub);
      });

      test("-ve timeout", ()=>{
        koru._afTimeout(v.stub = stub(), -3);

        refute.called(setTimeout);
        assert.calledWith(window.requestAnimationFrame);
      });

      test("running", ()=>{
        const stop = koru._afTimeout(v.stub = stub(), 1234);

        assert.calledWith(setTimeout, TH.match.func, 1234);

        refute.called(v.stub);
        setTimeout.yield();

        assert.calledWith(window.requestAnimationFrame, TH.match.func);

        refute.called(v.stub);
        window.requestAnimationFrame.yield();

        assert.called(v.stub);

        stop();

        refute.called(window.clearTimeout);
        refute.called(window.cancelAnimationFrame);
      });

      test("canceling before timeout", ()=>{
        const stop = koru._afTimeout(v.stub = stub(), 1234);

        stop();

        assert.calledWith(window.clearTimeout, 7766);
        refute.called(window.cancelAnimationFrame);

        stop();

        assert.calledOnce(window.clearTimeout);
        refute.called(window.cancelAnimationFrame);
      });

      test("canceling after timeout", ()=>{
        const stop = koru._afTimeout(v.stub = stub(), 1234);

        setTimeout.yield();

        stop();

        refute.called(window.clearTimeout);
        assert.called(window.cancelAnimationFrame, 123);

        stop();

        refute.called(window.clearTimeout);
        assert.calledOnce(window.cancelAnimationFrame);
      });

      test("cancel gt 24 days", ()=>{
        const cb = stub();
        let handle = 100;
        const incCounter = ()=> ++handle;
        window.setTimeout.invokes(incCounter);
        let now = Date.now(); intercept(Date, 'now', ()=>now);

        const stop = koru._afTimeout(cb, 45*util.DAY);

        assert.calledWith(window.setTimeout, m.func, 20*util.DAY);
        window.setTimeout.yieldAndReset();

        stop();

        assert.calledWith(window.clearTimeout, 102);
      });

      test("gt 24 days", ()=>{
        const cb = stub();
        let handle = 100;
        const incCounter = ()=> ++handle;
        window.setTimeout.invokes(incCounter);
        let now = Date.now(); intercept(Date, 'now', ()=>now);

        const stop = koru._afTimeout(cb, 45*util.DAY);

        assert.calledWith(window.setTimeout, m.func, 20*util.DAY);
        now+=20*util.DAY;
        window.setTimeout.yieldAndReset();

        assert.calledWith(window.setTimeout, m.func, 20*util.DAY);
        now+=21*util.DAY;
        refute.called(window.requestAnimationFrame);
        window.setTimeout.yieldAndReset();

        assert.calledWith(window.setTimeout, m.func, 4*util.DAY);
        now+=4*util.DAY;
        refute.called(window.requestAnimationFrame);
        window.setTimeout.yieldAndReset();

        assert.calledOnceWith(window.requestAnimationFrame, m.func);
        refute.called(cb);
        window.requestAnimationFrame.yieldAndReset();
        assert.called(cb);
      });

    });
  });
});
