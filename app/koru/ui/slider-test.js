isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./slider');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      TH.domTearDown();
      v = null;
    },

    "test pointerdown on slider"() {
      var slider = sut.$autoRender({pos: .25, callback: v.callback = test.stub()});

      slider.style.width = '256px';
      slider.style.height = '16px';

      document.body.appendChild(slider);

      test.stub(window, 'requestAnimationFrame').returns(123);

      assert.dom(slider, function () {
        assert.equals(this.getAttribute('touch-action'), 'none');
        var bbox = this.getBoundingClientRect();
        assert.dom('.handle', function () {
          assert.cssNear(this, 'left', 25, .01, '%');
          TH.trigger(this.parentNode, 'pointerdown', {clientX: bbox.left + 128});

          assert.cssNear(this, 'left', 50, .01, '%');

          TH.trigger(this, 'pointermove', {clientX: bbox.left + 192});

          assert.cssNear(this, 'left', 50, .01, '%');

          window.requestAnimationFrame.yield();

          assert.cssNear(this, 'left', 75, .01, '%');

          TH.trigger(this, 'pointerup');

          window.requestAnimationFrame.reset();
          TH.trigger(this, 'pointermove', {clientX: bbox.left + 1});

          refute.called(window.requestAnimationFrame);
        });

        assert.calledWith(v.callback, .5);
        assert.calledWith(v.callback, .75, TH.match(function (ctx) {
          return ctx.data.pos === 0.75;
        }), this);

        assert.same(v.callback.callCount, 3);

        v.callback.reset();

        sut.move(this, 1);
        assert.calledWith(v.callback, 1, TH.match(function (ctx) {
          return ctx.data.pos === 1;
        }), this);

      });
    },

  });
});
