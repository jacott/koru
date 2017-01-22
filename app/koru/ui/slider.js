define(function(require, exports, module) {
  var util = require('../util');
  var Dom = require('../dom');

  var Tpl = Dom.newTemplate(module, require('../html!./slider'));
  var $ = Dom.current;

  Tpl.$helpers({
    position() {
      $.element.style.left = this.pos*100+'%';
    },
  });

  Tpl.$events({
    'mousedown .slider'(event) {
      Dom.stopEvent();

      document.addEventListener('mousemove', adjust, true);
      document.addEventListener('mouseup', cancel, true);

      var ctx = $.ctx;
      var data = ctx.data;
      ctx.cancel = cancel;

      var x = event.clientX;

      var sliderElm = this;
      var width = sliderElm.clientWidth;

      var handle = event.target;

      if (handle === sliderElm) {
        handle = sliderElm.firstElementChild;
        var bbox = sliderElm.getBoundingClientRect();

        data.pos = (x - bbox.left) / width;
      }

      var handleStyle = handle.style;
      handleStyle.willChange = 'left';

      var xMin = x - (width * data.pos);
      var af = null;

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
        document.removeEventListener('mousemove', adjust, true);
        document.removeEventListener('mouseup', cancel, true);
        Dom.removeClass(sliderElm, 'ui-dragging');
        handleStyle.willChange = '';
        var data = ctx.data;
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
      var ctx = Dom.getMyCtx(sliderElm);
      var data = ctx.data;
      data.pos = pos;

      sliderElm.style.left = pos*100+'%';

      data.callback && data.callback(pos, ctx, sliderElm);
    },
  });

  return Tpl;
});
