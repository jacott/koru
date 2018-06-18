isClient && define(function (require, exports, module) {
  const TH        = require('koru/test-helper');

  const nextFrame = require('./next-frame');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      v.rafStub = this.stub(window, 'requestAnimationFrame').returns(123);
      v.cafStub = this.stub(window, 'cancelAnimationFrame');
    },

    tearDown() {
      v = null;
    },

    "test nextFrame init"() {
      const nf = nextFrame(v.nf = {});

      assert.same(nf, v.nf);

      assert.isFalse(nf.isPendingNextFrame());


      nf.nextFrame(v.stub = this.stub());

      assert.isTrue(nf.isPendingNextFrame());

      nf.cancelNextFrame();

      assert.isFalse(nf.isPendingNextFrame());

      refute.called(v.stub);

      assert.calledWith(v.cafStub, 123);
    },

    "test queing"() {
      const nf = nextFrame();

      nf.nextFrame(v.s1 = this.stub());
      nf.nextFrame(v.s2 = this.stub());

      v.rafStub.yield();

      assert.called(v.s1);
      assert.called(v.s2);

      assert.isFalse(nf.isPendingNextFrame());

      refute.called(v.cafStub);
    },

    "test flush"() {
      const nf = nextFrame();

      nf.nextFrame(v.s1 = this.stub());
      nf.nextFrame(v.s2 = this.stub());

      nf.flushNextFrame();

      assert.called(v.s1);
      assert.called(v.s2);

      assert.isFalse(nf.isPendingNextFrame());
      assert.calledWith(v.cafStub, 123);
    },
  });
});
