define(function(require, exports, module) {
  var Dom = require('../dom');
  var util = require('../util');
  var uColor = require('../util-color');
  var Slider = require('./slider');
  var Modal = require('./modal');

  var Tpl = Dom.newTemplate(module, require('../html!./color-picker'));
  var $ = Dom.current;
  var ColorPart = Tpl.ColorPart;

  Tpl.$events({
    'input [name=hex]'(event) {
      Tpl.setColor($.ctx, this.value);
    },
    'click [name=apply]'(event) {
      event.preventDefault();
      Dom.stopEvent();
      close(event.currentTarget);
    },

    'click [name=cancel]'(event) {
      Dom.stopEvent();
      close(event.currentTarget, 'cancel');
    },

    'click [data-color]'(event) {
      Dom.stopEvent();

      Tpl.setColor($.ctx, this.getAttribute('data-color'), $.ctx.data.color.a);
    },

    'click [name=custom]'(event) {
      Dom.stopEvent();
      close(event.currentTarget, 'custom');
    },
  });

  function hsl2hex(hsl, prefix) {
    if (! hsl) return null;
    var rgb = uColor.hsl2rgb(hsl);
    rgb.a = hsl.a;
    return uColor.rgb2hex(rgb, prefix);
  }

  function hex2hsl(hex) {
    var rgb = uColor.toRGB(hex);
    if (! rgb) return null;
    var hsl = uColor.rgb2hsl(rgb);
    hsl.a = rgb.a;
    return hsl;
  }

  Tpl.$helpers({
    customButton() {
      if (this.custom)
        return Dom.h({$name: 'custom', button: this.custom[0]});
    },

    palette(color) {
      if ($.element.nodeType === document.ELEMENT_NODE) return;

      var elm = Dom.h({button: '', "$data-color": color, $tabindex: "-1"});
      elm.style.backgroundColor = '#'+color;
      return elm;
    },
    hexValue() {
      var elm = $.element;
      if (document.activeElement !== elm)
        elm.value = hsl2hex(this.color, '');
    },

    hexColorHash() {
      return hsl2hex(this.color, '#');
    },

    alphaLabel() {
      return this.alpha ? '[AA]' : '';
    },

    alphaClass() {
      Dom.setClass('alpha', this.alpha);
    },

    maxlength() {
      $.element.setAttribute('maxlength', this.alpha ? 9 : 7);
    },

    disabled() {
      Dom.setBoolean('disabled', this.error);
    },
  });

  Tpl.$extend({
    $created(ctx, elm) {
      ctx.startTab = elm.getElementsByClassName('startTab')[0];
    },
    setColor(ctx, hex, alpha) {
      var hsla = hex2hsl(hex);
      var data = ctx.data;
      data.error = ! hsla;
      if (hsla) {
        data.color = hsla;
        if (! data.alpha)
          hsla.a = 1;
        else if (alpha != null)
          hsla.a = alpha;
      }
      ctx.updateAllTags();
    },

    choose(color, options, callback) {
      if (arguments.length === 2) {
        callback = options;
        options = false;
      }
      if (! options || typeof options !== 'object')
        options = {alpha: options};

      var alpha = options.alpha;

      var hsla = hex2hsl(color) || {h: 0, s: 0, l: 1, a: 1};
      if (! alpha) hsla.a = 1;
      var data = util.reverseMerge({orig: color, color: hsla, callback: callback}, options);
      var elm = Tpl.$autoRender(data);
      document.body.appendChild(elm);
      Modal.init({
        container: elm,
        handleTab: true,
      });
      elm.querySelector('[name=hex]').focus();
    },

    $destroyed(ctx, elm) {
      ctx.data.callback && ctx.data.callback(null);
    },
  });

  function close(elm, button) {
    var ctx = Dom.getMyCtx(elm);
    if (ctx) {
      var data = ctx.data;

      data.callback && data.callback(button === 'cancel' ? null : button === 'custom' ? ctx.data.custom[1] : hsl2hex(data.color));
      data.callback = null;
      Dom.remove(elm);
    }
  }

  var BG_STYLES = {
    s(color) {
      return [hsl2hex(util.reverseMerge({s: 0, a: 1}, color), '#'),
              hsl2hex(util.reverseMerge({s: 1, a: 1}, color), '#')];
    },

    l(color) {
      return ["#000000",
              hsl2hex(util.reverseMerge({l: 0.5, a: 1}, color), '#') + " 50%, #FFFFFF"];
    },

    a(color) {
      return [uColor.hex2Style(hsl2hex(util.reverseMerge({a: 0}, color)), '#'),
              hsl2hex(util.reverseMerge({a: 1}, color), '#')];
    },
  };

  function setSliderBG(elm, part, color) {
    var bgStyle = BG_STYLES[part];
    if(! bgStyle) return;

    var colors = bgStyle(color);

    elm.style.backgroundImage = "linear-gradient(90deg, " + colors[0] + " 0%," + colors[1] + " 100%)";
  }

  ColorPart.$helpers({
    name() {
      return this.part.toUpperCase();
    },

    value() {
      var elm = $.element;
      if (elm !== document.activeElement)
        elm.value  = Math.round($.ctx.parentCtx.data.color[this.part]*this.max) || '0';
    },

    partClass() {
      Dom.addClass($.element, this.part);
    },

    slider() {
      var ctx = $.ctx;
      var part = this.part;
      var cpCtx = ctx.parentCtx;
      var data = cpCtx.data;

      var hsla = data.color;
      var elm = $.element;

      if (elm.nodeType === document.ELEMENT_NODE) {
        var slCtx = Slider.$ctx(elm);
        slCtx.data.pos = hsla[part];

        if (! Dom.hasClass($.element, 'ui-dragging')) {
          slCtx.updateAllTags();
          setSliderBG(elm, part, data.color);
        }

        return;
      }

      var elm = Slider.$autoRender({pos: hsla[part], callback(pos, ctx, slider) {
        cpCtx.startTab.focus();
        data.error = null;
        hsla = data.color;
        hsla[part] = pos;
        cpCtx.updateAllTags();
      }});

      setSliderBG(elm, part, data.color);
      return elm;
    },
  });

  ColorPart.$events({
    'input input'(event) {
      Dom.stopEvent();
      var ctx = $.ctx;
      var data = ctx.data;
      var num = +this.value;
      if (num !== num) return;
      var cpCtx = ctx.parentCtx;

      cpCtx.data.color[data.part] = Math.max(0, Math.min(num / data.max, 1));
      cpCtx.updateAllTags();
    },
  });

  return Tpl;
});
