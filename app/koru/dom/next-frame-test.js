isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('koru/test');
  var nextFrame = require('./next-frame');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.rafStub = test.stub(window, 'requestAnimationFrame').returns(123);
      v.cafStub = test.stub(window, 'cancelAnimationFrame');
    },

    tearDown: function () {
      v = null;
    },

    "test nextFrame init": function () {
      var nf = nextFrame(v.nf = {});

      assert.same(nf, v.nf);

      assert.isFalse(nf.isPendingNextFrame());


      nf.nextFrame(v.stub = test.stub());

      assert.isTrue(nf.isPendingNextFrame());

      nf.cancelNextFrame();

      assert.isFalse(nf.isPendingNextFrame());

      refute.called(v.stub);

      assert.calledWith(v.cafStub, 123);
    },

    "test queing": function () {
      var nf = nextFrame();

      nf.nextFrame(v.s1 = test.stub());
      nf.nextFrame(v.s2 = test.stub());

      v.rafStub.yield();

      assert.called(v.s1);
      assert.called(v.s2);

      assert.isFalse(nf.isPendingNextFrame());

      refute.called(v.cafStub);
    },

    "test flush": function () {
      var nf = nextFrame();

      nf.nextFrame(v.s1 = test.stub());
      nf.nextFrame(v.s2 = test.stub());

      nf.flushNextFrame();

      assert.called(v.s1);
      assert.called(v.s2);

      assert.isFalse(nf.isPendingNextFrame());
      assert.calledWith(v.cafStub, 123);
    },
  });
});
