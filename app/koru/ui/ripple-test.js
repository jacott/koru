define((require, exports, module)=>{
  /**
   * Provide a ripple effect when a button is pressed
   **/
  'use strict';
  const Dom             = require('koru/dom');
  const api             = require('koru/test/api');
  const TH              = require('./test-helper');

  const {stub, spy, util} = TH;

  const Ripple = require('./ripple');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      Ripple.stop();
      TH.domTearDown();
    });

    test("start", ()=>{
      /**
       * Start the ripple effect
       **/
      api.method();
      stub(window, 'requestAnimationFrame');
      //[
      const button = Dom.h({button: 'press me', style: 'width:100px;height:30px'});
      document.body.appendChild(button);
      const dim = button.getBoundingClientRect();

      Ripple.start();

      TH.trigger(button, 'pointerdown', {
        clientX: dim.left + 45,
        clientY: dim.top + 24,
      });

      assert.dom('button>.ripple', ripple =>{
        assert.cssNear(ripple, 'width', 100);
        assert.cssNear(ripple, 'height', 30);
        assert.dom('>div', ({style}) =>{
          assert.near(style.getPropertyValue('transform'),
                      "translate(-50%, -50%) translate(45px, 24px) scale(0.0001, 0.0001)");
        });
      });
      //]

      assert.dom(".ripple:not(.animate)", ripple =>{
        window.requestAnimationFrame.yield();
        assert.className(ripple, 'animate');
        assert.same(ripple.nextSibling.data, 'press me');

        assert.dom('>div', ({style}) =>{
          assert.near(style.getPropertyValue('transform'),
                      "translate(-50%, -50%) translate(45px, 24px)");
          refute.className(ripple, 'ripple-finished');
          TH.trigger(document.body, 'pointerup');
          assert.className(ripple, 'ripple-finished');

          TH.trigger(button, 'pointerdown', {
            clientX: dim.left + 15,
            clientY: dim.top + 4,
          });
          refute.className(ripple, 'ripple-finished');
          assert.near(style.getPropertyValue('transform'),
                      "translate(-50%, -50%) translate(15px, 4px) scale(0.0001, 0.0001)");
        });
      });
    });

    test("stop", ()=>{
      /**
       * Stop the ripple effect
       **/
      api.method();
      //[
      const button = Dom.h({button: 'press me', style: 'width:100px;height:30px'});
      document.body.appendChild(button);
      const dim = button.getBoundingClientRect();

      Ripple.start();
      Ripple.stop();

      TH.trigger(button, 'pointerdown', {
        clientX: dim.left + 45,
        clientY: dim.top + 24,
      });

      refute.dom('button>.ripple');
      //]
    });
  });
});
