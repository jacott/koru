isClient && define(function (require, exports, module) {
  const koru = require('koru');
  const Dom  = require('koru/dom');
  const TH   = require('koru/ui/test-helper');
  const util = require('koru/util');

  const sut  = require('./zoom-drag');
  var v;

  const {near} = TH.match;

  TH.testCase(module, {
    setUp() {
      v = {};
      v.target = Dom.h({
        $style: 'position:absolute;top:51px;left:17px;width:400px;height:100px;'});
      document.body.appendChild(v.target);
      v.target.setPointerCapture = this.stub();
      v.target.releasePointerCapture = this.stub();
    },

    tearDown() {
      TH.domTearDown();
      v = null;
    },

    "test click"() {
      const {target} = v;
      const event = Dom.buildEvent('pointerdown', {
        pointerId: 1, clientX: 123+17, clientY: 45+51});
      this.onEnd(sut.start({
        event,
        target,
        onComplete(zoomDrag, {click}) {
          v.click = click;
          v.geom = Object.assign({}, zoomDrag);
        }
      }));

      assert.same(v.geom, undefined);

      TH.trigger(target, 'pointerup', {pointerId: 1});

      assert.isTrue(v.click);

      assert.equals(v.geom, {
        scale: 1, midX: 123, midY: 45, adjustX: 0, adjustY: 0});
    },

    "test two pointerdown same id"() {
      const {target} = v;
      const event = Dom.buildEvent('pointerdown', {
        pointerId: 1, clientX: 123, clientY: 45});
      this.onEnd(sut.start({
        event,
        target,
        onComplete(zoomDrag, {click}) {v.click = click}
      }));

      TH.trigger(target, event);

      TH.trigger(target, 'pointerup', {pointerId: 1});

      assert.isTrue(v.click);
    },

    "test drag"() {
      const raf = this.stub(window, 'requestAnimationFrame').returns(123);
      const {target} = v;
      const event = new window.PointerEvent('pointerdown', {
        pointerId: 1, clientX: 123, clientY: 145});
      const onChange = this.stub();
      this.onEnd(sut.start({
        event,
        target,
        onChange,
        onComplete(geom, {click}) {
          v.click = click;
          v.geom = Object.assign({}, geom);
        }
      }));

      refute.called(onChange);

      // not pass threshold (default 10**2)
      TH.trigger(target, 'pointermove', {pointerId: 1, clientX: 122, clientY: 150});
      refute.called(raf);
      TH.trigger(target, 'pointermove', {pointerId: 1, clientX: 104, clientY: 155});
      assert.called(raf);
      TH.trigger(target, 'pointermove', {pointerId: 1, clientX: 105, clientY: 155});
      assert.calledOnce(raf);

      refute.called(onChange);
      raf.yieldAll().reset();
      assert.calledWith(onChange, {
        scale: 1, midX: 123-17, midY: 145-51, adjustX: -18, adjustY: 10});

      onChange.reset();
      TH.trigger(target, 'pointermove', {pointerId: 1, clientX: 100, clientY: 55});
      raf.yieldAll().reset();
      assert.calledWith(onChange, {
        scale: 1, midX: 123-17, midY: 145-51, adjustX: -23, adjustY: -90});

      TH.trigger(target, 'pointerup', {pointerId: 1});

      assert.equals(v.geom, {
        scale: 1, midX: 123-17, midY: 145-51, adjustX: -23, adjustY: -90});

      assert.isFalse(v.click);
    },

    "wheelZoom": {
      setUp() {
        v.now = Date.now();
        this.intercept(util, 'dateNow', ()=>v.now);
        this.stub(koru, 'afTimeout').returns(this.stub());
        v.raf = this.stub(window, 'requestAnimationFrame').returns(123);
        const event = new window.WheelEvent('wheel', {
          deltaY: -79.5, clientX: 117, clientY: 155});
        v.start = (opts={}) => {
          this.onEnd(sut.start(Object.assign({
            event, target: v.target,
            updateDelay: 200,
            onChange: v.onChange = this.stub(),
            onComplete(geom, {click}) {
              v.geom = Object.assign({}, geom);
            }
          }, opts)));
        };
      },

      "test modifier prevents timeout"() {
        const {raf} = v;
        const isFinished = this.stub(ev => ev.foo == 2);
        v.start({isFinished});

        TH.keyup(v.target, 16);
        raf.yieldAll().reset();
        refute.called(koru.afTimeout);

        assert.called(v.onChange);
        v.onChange.reset();
        TH.trigger(v.target, 'pointermove', {clientX: 101, clientY: 155, foo: 4});
        raf.yieldAll().reset();
        refute(v.geom);
        assert.calledWith(v.onChange, {
          scale: near(1.22), midX: 84, midY: 104, adjustX: 0, adjustY: 0});


        TH.keyup(v.target, 17, {foo: 2});

        assert.equals(v.geom, {
          scale: near(1.22), midX: 84, midY: 104, adjustX: 0, adjustY: 0});

        assert.calledWith(isFinished, TH.match(ev => ev.which = 16));

        assert.calledWith(isFinished, TH.match(ev => ev.clientX == 101));
      },

      "test timeout"() {
        v.start();
        const {target, onChange, raf} = v;
        assert.calledWith(koru.afTimeout, TH.match.func, 200);
        TH.trigger(target, 'wheel', {
          deltaMode: 0, deltaY: -79.5, clientX: 117, clientY: 155});

        assert.calledOnce(koru.afTimeout);

        refute.called(onChange);

        raf.yieldAll().reset();
        assert.calledWith(onChange, {
          scale: near(1.488, 0.001), midX: 117-17, midY: 155-51, adjustX: 0, adjustY: 0});

        onChange.reset();

        v.now += 35;

        TH.trigger(document, 'wheel', {deltaMode: 0, deltaY: 200, clientX: 117, clientY: 155});
        raf.yieldAll().reset();
        assert.calledWith(onChange, {
          scale: near(0.903, 0.001), midX: 100, midY: 104, adjustX: 0, adjustY: 0});

        assert.calledOnce(koru.afTimeout);

        v.now += 7;

        koru.afTimeout.yield();

        assert.calledWith(koru.afTimeout, TH.match.func, 193);

        assert.same(v.geom, undefined);

        v.now += 194;
        koru.afTimeout.lastCall.yield();

        assert.equals(v.geom, {
          scale: near(0.903, 0.001), midX: 100, midY: 104, adjustX: 0, adjustY: 0});
      },

      "test mouseMove when wheelZoom"() {
        v.start();
        this.stub(window, 'cancelAnimationFrame');
        TH.trigger(v.target, 'wheel', {deltaMode: 1, deltaY: 2, clientX: 117, clientY: 155});
        TH.trigger(v.target, 'pointermove', {clientX: 101, clientY: 155});
        assert.calledWith(window.cancelAnimationFrame, 123);
        v.raf.reset();
        assert.calledWith(v.onChange, {
          scale: near(1.069, 0.001), midX: 100, midY: 104, adjustX: 0, adjustY: 0});
        assert.equals(v.geom, {
          scale: near(1.069, 0.001), midX: 100, midY: 104, adjustX: 0, adjustY: 0});

        TH.trigger(v.target, 'wheel', {deltaY: 10.5, clientX: 100, clientY: 104});
        refute.called(v.raf);
      },
    },

    "test touch pinchZoom"() {
      this.spy(Dom, 'stopEvent');
      const raf = this.stub(window, 'requestAnimationFrame').returns(123);
      const {target} = v;
      const event = Dom.buildEvent('touchstart', {
        touches: [{clientX: 123+17, clientY: 45+51},
                  {clientX: 100+17, clientY: 155+51}]
      });
      const onChange = this.stub();
      this.onEnd(sut.start({
        event,
        target,
        onChange,
        onComplete(geom, {click}) {
          v.click = click;
          v.geom = Object.assign({}, geom);
        }
      }));

      assert.calledWith(Dom.stopEvent, event);

      TH.trigger(target, 'touchmove', {test: 1, touches: [
        {clientX: 123+17, clientY: 45+51}, {clientX: 115+17, clientY: 85+51}
      ]});
      assert.calledWith(Dom.stopEvent, TH.match(e => e.test === 1));

      raf.yieldAll().reset();
      assert.calledWith(onChange, {
        scale: near(0.363, 0.001), midX: 111.5, midY: 100, adjustX: 7.5, adjustY: -35});

      onChange.reset();
      TH.trigger(target, 'touchmove', {touches: [
        {clientX: 100+17, clientY: 55+51}, {clientX: 115+17, clientY: 85+51}
      ]});
      raf.yieldAll().reset();
      assert.calledWith(onChange, {
        scale: near(0.298, 0.001), midX: 111.5, midY: 100, adjustX: -4, adjustY: -30});

      TH.trigger(target, 'touchend', {touches: [{clientX: 100+17, clientY: 55+51}]});

      assert.equals(v.geom, {
        scale: near(0.298, 0.001), midX: 111.5, midY: 100, adjustX: -4, adjustY: -30});

      assert.isFalse(v.click);
    },

    "test pinchZoom"() {
      const raf = this.stub(window, 'requestAnimationFrame').returns(123);
      const {target} = v;
      const event = Dom.buildEvent('pointerdown', {
        pointerId: 1, clientX: 123+17, clientY: 45+51
      });
      const onChange = this.stub();
      this.onEnd(sut.start({
        event,
        target,
        onChange,
        onComplete(geom, {click}) {
          v.click = click;
          v.geom = Object.assign({}, geom);
        }
      }));

      TH.trigger(target, 'pointerdown', {pointerId: 2, clientX: 100+17, clientY: 155+51});

      refute.called(onChange);

      TH.trigger(target, 'pointermove', {pointerId: 2, clientX: 115+17, clientY: 85+51});
      raf.yieldAll().reset();
      assert.calledWith(onChange, {
        scale: near(0.363, 0.001), midX: 111.5, midY: 100, adjustX: 7.5, adjustY: -35});

      onChange.reset();
      TH.trigger(target, 'pointermove', {pointerId: 1, clientX: 100+17, clientY: 55+51});
      raf.yieldAll().reset();
      assert.calledWith(onChange, {
        scale: near(0.298, 0.001), midX: 111.5, midY: 100, adjustX: -4, adjustY: -30});

      TH.trigger(target, 'pointerup', {pointerId: 1});

      assert.same(v.geom, undefined);
      TH.trigger(target, 'pointerup', {pointerId: 2});

      assert.equals(v.geom, {
        scale: near(0.298, 0.001), midX: 111.5, midY: 100, adjustX: -4, adjustY: -30});

      assert.isFalse(v.click);
    },

    "test constrainZoom"() {
      const raf = this.stub(window, 'requestAnimationFrame').returns(123);
      const {target} = v;
      const event = Dom.buildEvent('pointerdown', {
        pointerId: 1, clientX: 123+17, clientY: 45+51
      });
      const onChange = this.stub();
      this.onEnd(sut.start({
        event, target,
        constrainZoom: 'x',
        onChange,
        onComplete() {},
      }));

      TH.trigger(target, 'pointerdown', {pointerId: 2, clientX: 100+17, clientY: 155+51});

      TH.trigger(target, 'pointermove', {pointerId: 1, clientX: 150+17, clientY: 55+51});
      raf.yieldAll().reset();
      assert.calledWith(onChange, {
        scale: near(2.174, 0.001), midX: 111.5, midY: 100, adjustX: 13.5, adjustY: 5});
    },
  });
});
