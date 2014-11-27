define(function(require, exports, module) {
  var util = require('../util');
  var Dom = require('../dom');

  var Tpl = Dom.newTemplate(module, require('../html!./slider'));
  var $ = Dom.current;

  Tpl.$helpers({
    position: function () {
      $.element.style.left = this.pos*100+'%';
    },
  });

  Tpl.$events({
    'mousedown .slider>.handle': function (event) {
      Dom.stopEvent();

      document.addEventListener('mousemove', adjust, true);
      document.addEventListener('mouseup', cancel, true);

      var slider = this.parentNode;
      var handleStyle = this.style;
      handleStyle.willChange = 'left';
      var ctx = $.ctx;
      var data = ctx.data;
      ctx.cancel = cancel;

      var width = slider.clientWidth;
      var xMin = event.clientX - (width * data.pos);
      var x, af = null;

      Dom.addClass(slider, 'ui-dragging');

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
        Dom.removeClass(slider, 'ui-dragging');
        handleStyle.willChange = '';
      }

      function draw() {
        af = null;
        data.pos = Math.max(Math.min(width, x - xMin), 0) / width;

        handleStyle.left = data.pos*100+'%';

        data.callback && data.callback(data.pos, ctx, slider);
      }
    },
  });

  Tpl.$extend({
    $destroyed: function (ctx) {
      ctx.cancel && ctx.cancel();
    },
  });

  return Tpl;
});
