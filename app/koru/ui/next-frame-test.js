isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
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

      assert.isTrue(nf.isEmpty());


      nf.nextFrame(v.stub = test.stub());

      assert.isFalse(nf.isEmpty());

      nf.cancel();

      assert.isTrue(nf.isEmpty());

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

      assert.isTrue(nf.isEmpty());

      refute.called(v.cafStub);
    },

    "test flush": function () {
      var nf = nextFrame();

      nf.nextFrame(v.s1 = test.stub());
      nf.nextFrame(v.s2 = test.stub());

      nf.flush();

      assert.called(v.s1);
      assert.called(v.s2);

      assert.isTrue(nf.isEmpty());
      assert.calledWith(v.cafStub, 123);
    },
  });
});
