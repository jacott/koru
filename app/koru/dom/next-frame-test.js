isClient && define((require, exports, module)=>{
  const TH              = require('koru/test-helper');

  const {stub, spy, onEnd} = TH;

  const nextFrame = require('./next-frame');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    let rafStub, cafStub;
    beforeEach(()=>{
      rafStub = stub(window, 'requestAnimationFrame').returns(123);
      cafStub = stub(window, 'cancelAnimationFrame');
    });

    test("nextFrame init", ()=>{
      const exp = {};
      const nf = nextFrame(exp);

      assert.same(nf, exp);

      assert.isFalse(nf.isPendingNextFrame());

      const func = stub();

      nf.nextFrame();

      assert.isTrue(nf.isPendingNextFrame());

      nf.cancelNextFrame();

      assert.isFalse(nf.isPendingNextFrame());

      refute.called(func);

      assert.calledWith(cafStub, 123);
    });

    test("queing", ()=>{
      const nf = nextFrame();
      const s1 = stub(), s2 = stub();

      nf.nextFrame(s1);
      nf.nextFrame(s2);

      rafStub.yield();

      assert.called(s1);
      assert.called(s2);

      assert.isFalse(nf.isPendingNextFrame());

      refute.called(cafStub);
    });

    test("flush", ()=>{
      const nf = nextFrame();
      const s1 = stub(), s2 = stub();

      nf.nextFrame(s1);
      nf.nextFrame(s2);

      nf.flushNextFrame();

      assert.called(s1);
      assert.called(s2);

      assert.isFalse(nf.isPendingNextFrame());
      assert.calledWith(cafStub, 123);
    });
  });
});
