define((require, exports, module)=>{
  'use strict';
  const ColorHelpers    = require('koru/color-helpers');
  const Eyedropper      = require('koru/ui/eyedropper');
  const Dom             = require('../dom');
  const util            = require('../util');
  const uColor          = require('../util-color');
  const Modal           = require('./modal');
  const Slider          = require('./slider');

  const Tpl = Dom.newTemplate(module, require('../html!./color-picker'));
  const $ = Dom.current;
  const {ColorPart} = Tpl;

  const close = (elm, button)=>{
    const ctx = Dom.myCtx(elm);
    if (ctx) {
      const data = ctx.data;

      data.callback === undefined || data.callback(
        button === 'cancel' ? null : button === 'custom' ? ctx.data.custom[1] : hsl2hex(data.color));
      data.callback = null;
      Dom.remove(elm);
    }
  };

  Tpl.$events({
    'input [name=hex]'(event) {
      Tpl.setColor($.ctx, this.value);
    },

    'click .eyedropper'(event) {
      Dom.stopEvent();
      const name = this.getAttribute('name').slice(0, -11);
      const button = this.nextElementSibling;
      const {ctx} = $;

      Eyedropper.pick((err, color) => {
        if (err == null && color != null) {
          Tpl.setColor(ctx, color);
        }
      });
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
    const rgb = uColor.hsl2rgb(hsl);
    rgb.a = hsl.a;
    return uColor.rgb2hex(rgb, prefix);
  }

  function hex2hsl(hex) {
    const rgb = uColor.toRGB(hex);
    if (! rgb) return null;
    const hsl = uColor.rgb2hsl(rgb);
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

      const elm = Dom.h({button: [], "data-color": color, $tabindex: "-1"});
      elm.style.backgroundColor = '#'+color;
      return elm;
    },
    hexValue() {
      const elm = $.element;
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
      const hsla = hex2hsl(hex);
      const data = ctx.data;
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

    choose({modalPos, anchor, color, callback, alpha=false, custom, customFieldset}) {
      const hsla = hex2hsl(color) || {h: 0, s: 0, l: 1, a: 1};
      if (! alpha) hsla.a = 1;
      const data = {orig: color, color: hsla, callback, alpha, custom, customFieldset};
      const container = Tpl.$autoRender(data);
      const popup = container.querySelector('.ui-dialog');
      if (anchor === undefined) {
        container.classList.add('Dialog', 'Confirm');
        document.body.appendChild(container);
        Modal.init({container, popup, handleTab: true});
      } else {
        Modal.append(modalPos, {
          container, popup, handleTab: true,
          boundingClientRect: Dom.getBoundingClientRect(anchor),
        });
      }
      Dom.dontFocus || popup.querySelector('[name=hex]').focus();
    },

    $destroyed(ctx, elm) {
      ctx.data.callback && ctx.data.callback(null);
    },
  });

  const BG_STYLES = {
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
    const bgStyle = BG_STYLES[part];
    if(! bgStyle) return;

    const colors = bgStyle(color);

    elm.style.backgroundImage = "linear-gradient(90deg, " + colors[0] + " 0%," + colors[1] + " 100%)";
  }

  ColorPart.$helpers({
    name() {
      return this.part.toUpperCase();
    },

    value() {
      const elm = $.element;
      if (elm !== document.activeElement)
        elm.value  = Math.round($.ctx.parentCtx.data.color[this.part]*this.max) || '0';
    },

    partClass() {
      Dom.addClass($.element, this.part);
    },

    slider() {
      const ctx = $.ctx;
      const part = this.part;
      const cpCtx = ctx.parentCtx;
      const data = cpCtx.data;

      const hsla = data.color;
      const elm = $.element;

      if (elm.nodeType === document.ELEMENT_NODE) {
        const slCtx = Slider.$ctx(elm);
        slCtx.data.pos = hsla[part];

        if (! Dom.hasClass($.element, 'ui-dragging')) {
          slCtx.updateAllTags();
          setSliderBG(elm, part, data.color);
        }

        return;
      }

      const slider = Slider.$autoRender({pos: hsla[part], callback(pos, ctx, slider) {
        cpCtx.startTab.focus();
        data.error = null;
        const hsla = data.color;
        hsla[part] = pos;
        cpCtx.updateAllTags();
      }});

      setSliderBG(slider, part, data.color);
      return slider;
    },
  });

  ColorPart.$events({
    'input input'(event) {
      Dom.stopEvent();
      const ctx = $.ctx;
      const data = ctx.data;
      const num = +this.value;
      if (num !== num) return;
      const cpCtx = ctx.parentCtx;

      cpCtx.data.color[data.part] = Math.max(0, Math.min(num / data.max, 1));
      cpCtx.updateAllTags();
    },
  });

  return Tpl;
});
