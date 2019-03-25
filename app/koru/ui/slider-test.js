isClient && define((require, exports, module)=>{
  'use strict';
  const TH              = require('./test-helper');

  const sut = require('./slider');

  const {stub, onEnd} = TH;

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      TH.domTearDown();
    });

    test("pointerdown on slider", ()=>{
      const callback = stub();
      const slider = sut.$autoRender({pos: .25, callback});
      document.body.appendChild(slider);

      slider.style.width = '256px';
      slider.style.height = '16px';

      document.body.appendChild(slider);

      stub(window, 'requestAnimationFrame').returns(123);

      assert.dom(slider, function () {
        assert.equals(this.getAttribute('touch-action'), 'none');
        const bbox = this.getBoundingClientRect();
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

        assert.calledWith(callback, .5);
        assert.calledWith(callback, .75, TH.match(ctx => ctx.data.pos === 0.75), this);

        assert.same(callback.callCount, 3);

        callback.reset();

        sut.move(this, 1);
        assert.calledWith(callback, 1, TH.match(ctx => ctx.data.pos === 1), this);

      });
    });

  });
});
