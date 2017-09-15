define(function(require, exports, module) {
  const Dom             = require('../dom');
  const util            = require('../util');

  const Tpl = Dom.newTemplate(module, require('../html!./slider'));
  const $ = Dom.current;

  Tpl.$helpers({
    position() {
      $.element.style.left = this.pos*100+'%';
    },
  });

  Tpl.$events({
    'pointerdown .slider'(event) {
      Dom.stopEvent();

      document.addEventListener('pointermove', adjust, true);
      document.addEventListener('pointerup', cancel, true);

      const {ctx} = $;
      const {data} = ctx;
      ctx.cancel = cancel;

      let x = event.clientX;

      const sliderElm = this;
      const width = sliderElm.clientWidth;

      let handle = event.target;

      if (handle === sliderElm) {
        handle = sliderElm.firstElementChild;
        const bbox = sliderElm.getBoundingClientRect();

        data.pos = (x - bbox.left) / width;
      }

      const handleStyle = handle.style;
      handleStyle.willChange = 'left';

      const xMin = x - (width * data.pos);
      let af = null;

      Dom.addClass(sliderElm, 'ui-dragging');

      draw();

      function adjust(event) {
        x = event.clientX;

        if (! af)
          af = window.requestAnimationFrame(draw);
      }

      function cancel() {
        ctx.cancel = null;
        if (af) {
          window.cancelAnimationFrame(af);
          af = null;
        }
        document.removeEventListener('pointermove', adjust, true);
        document.removeEventListener('pointerup', cancel, true);
        Dom.removeClass(sliderElm, 'ui-dragging');
        handleStyle.willChange = '';
        const {data} = ctx;
        data.callback && data.callback(data.pos, ctx, sliderElm);
      }

      function draw() {
        af = null;
        data.pos = Math.max(Math.min(width, x - xMin), 0) / width;

        handleStyle.left = data.pos*100+'%';

        data.callback && data.callback(data.pos, ctx, sliderElm);
      }
    },
  });

  Tpl.$extend({
    $destroyed(ctx) {
      ctx.cancel && ctx.cancel();
    },

    move(sliderElm, pos) {
      const ctx = Dom.myCtx(sliderElm);
      const {data} = ctx;
      data.pos = pos;

      sliderElm.style.left = pos*100+'%';

      data.callback && data.callback(pos, ctx, sliderElm);
    },
  });

  return Tpl;
});
