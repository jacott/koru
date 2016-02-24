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
    'input [name=hex]': function (event) {
      Tpl.setColor($.ctx, this.value);
    },
    'click [name=apply]': function (event) {
      event.preventDefault();
      Dom.stopEvent();
      close(event.currentTarget);
    },

    'click [name=cancel]': function (event) {
      Dom.stopEvent();
      close(event.currentTarget, 'cancel');
    },

    'click [data-color]': function (event) {
      Dom.stopEvent();

      Tpl.setColor($.ctx, this.getAttribute('data-color'), $.ctx.data.color.a);
    },

    'click [name=custom]': function (event) {
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
    customButton: function () {
      if (this.custom)
        return Dom.html({tag: 'button', name: 'custom', text: this.custom[0]});
    },

    palette: function (color) {
      if ($.element.nodeType === document.ELEMENT_NODE) return;

      var elm = Dom.h({button: '', "$data-color": color, $tabindex: "-1"});
      elm.style.backgroundColor = '#'+color;
      return elm;
    },
    hexValue: function () {
      var elm = $.element;
      if (document.activeElement !== elm)
        elm.value = hsl2hex(this.color, '');
    },

    hexColorHash: function () {
      return hsl2hex(this.color, '#');
    },

    alphaLabel: function () {
      return this.alpha ? '[AA]' : '';
    },

    alphaClass: function () {
      Dom.setClass('alpha', this.alpha);
    },

    maxlength: function () {
      $.element.setAttribute('maxlength', this.alpha ? 9 : 7);
    },

    disabled: function () {
      Dom.setBoolean('disabled', this.error);
    },
  });

  Tpl.$extend({
    $created: function (ctx, elm) {
      ctx.startTab = elm.getElementsByClassName('startTab')[0];
    },
    setColor: function (ctx, hex, alpha) {
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

    choose: function (color, options, callback) {
      if (arguments.length === 2) {
        callback = options;
        options = false;
      }
      if (! options || typeof options !== 'object')
        options = {alpha: options};

      var alpha = options.alpha;

      var hsla = hex2hsl(color) || {h: 0, s: 0, l: 1, a: 1};
      if (! alpha) hsla.a = 1;
      var data = util.reverseExtend({orig: color, color: hsla, callback: callback}, options);
      var elm = Tpl.$autoRender(data);
      document.body.appendChild(elm);
      Modal.init({
        container: elm,
        handleTab: true,
      });
      elm.querySelector('[name=hex]').focus();
    },

    $destroyed: function (ctx, elm) {
      ctx.data.callback && ctx.data.callback(null);
      Tpl.$detachEvents(elm);
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
    s: function (color) {
      return [hsl2hex(util.reverseExtend({s: 0, a: 1}, color), '#'),
              hsl2hex(util.reverseExtend({s: 1, a: 1}, color), '#')];
    },

    l: function (color) {
      return ["#000000",
              hsl2hex(util.reverseExtend({l: 0.5, a: 1}, color), '#') + " 50%, #FFFFFF"];
    },

    a: function (color) {
      return [uColor.hex2Style(hsl2hex(util.reverseExtend({a: 0}, color)), '#'),
              hsl2hex(util.reverseExtend({a: 1}, color), '#')];
    },
  };

  function setSliderBG(elm, part, color) {
    var bgStyle = BG_STYLES[part];
    if(! bgStyle) return;

    var colors = bgStyle(color);

    elm.style.backgroundImage = "linear-gradient(90deg, " + colors[0] + " 0%," + colors[1] + " 100%)";
  }

  ColorPart.$helpers({
    name: function () {
      return this.part.toUpperCase();
    },

    value: function () {
      var elm = $.element;
      if (elm !== document.activeElement)
        elm.value  = Math.round($.ctx.parentCtx.data.color[this.part]*this.max) || '0';
    },

    partClass: function () {
      Dom.addClass($.element, this.part);
    },

    slider: function () {
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

      var elm = Slider.$autoRender({pos: hsla[part], callback: function (pos, ctx, slider) {
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
    'input input': function (event) {
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
