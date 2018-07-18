define((require, exports, module)=>{
  const Dom             = require('../dom');

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

      const {ctx} = $;
      const {data} = ctx;
      const sliderElm = this;
      const width = sliderElm.clientWidth;
      let x = event.clientX;

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

      const adjust = (event)=>{
        x = event.clientX;

        if (! af)
          af = window.requestAnimationFrame(draw);
      };

      const cancel = ()=>{
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
      };
      ctx.cancel = cancel;

      const draw = ()=>{
        af = null;
        data.pos = Math.max(Math.min(width, x - xMin), 0) / width;

        handleStyle.left = data.pos*100+'%';

        data.callback && data.callback(data.pos, ctx, sliderElm);
      };

      document.addEventListener('pointermove', adjust, true);
      document.addEventListener('pointerup', cancel, true);


      Dom.addClass(sliderElm, 'ui-dragging');

      draw();
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
