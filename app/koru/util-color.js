define(function(require, exports, module) {
  var util = require('koru/util');

  var colorClass = {};
  var contrastColors = {};
  var boarderColors = {};

  exports = {
    hex2rgb: hex2rgb,

    rgb2hex: function (rgb) {
      return "#"+ byte2hex(rgb.r)+ byte2hex(rgb.g)+ byte2hex(rgb.b);
    },

    backgroundColorStyle: function (color) {
      var style = {};
      exports.setBackgroundColorStyle(style, color);
      return util.hashToCss(style);
    },

    setBackgroundColorStyle: function (style, color) {
      color = color || '#ffffff';
      style['background-color'] = color;
      style.color = contrastColors[color] || (contrastColors[color] = contrastColor(color, '#4d4d4d'));
    },

    setBackgroundAndBoarderColorStyle: function (style, color) {
      color = color || '#ffffff';

      exports.setBackgroundColorStyle(style, color);
      var cc = contrastColors[color];
      style['border-color'] = boarderColors[cc] || (boarderColors[color] = fade(cc, 30));
    },

    rgb2hsl: function (rgb) {
      if (typeof rgb === 'string')
        rgb = hex2rgb(rgb);

      var r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b);
      var h, s, l = (max + min) / 2;

      if (max == min) {
        h = s = 0;
      } else {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch(max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }

      return {h: h, s: s, l: l};
    },

    hsl2rgb: function (hsl) {
      var r, g, b;
      var h = hsl.h, s = hsl.s, l = hsl.l;

      if (s == 0) {
        r = g = b = l;

      } else {
        function hue2rgb(p, q, t) {
          if(t < 0) t += 1;
          if(t > 1) t -= 1;
          if(t < 1/6) return p + (q - p) * 6 * t;
          if(t < 1/2) return q;
          if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }

      return {r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255)};
    },

    colorOnLight: function (color) {
      var lab = hex2lab(color);

      if (lab.l < 60)
        return color;

      lab.l = 60;
      return lab2hex(lab);
    },

    colorClass: function (color) {
      var cc = colorClass[color];
      if (cc) return cc;

      cc = hex2lab(color);
      var l = cc.l;

      if (l < 60) {
        cc = 'dark';
      } else {
        cc = 'light';
      }
      if (l <= 30 || l >= 75) cc = 'very' + cc;

      return colorClass[color] = cc;
    },

    contrastColor: contrastColor,

    fade: fade,
  };

  function fade(color, amount) {
    var match = /^#(..)(..)(..)$/.exec(color),
        result = 'rgba(';

    for(var i = 1; i<4; ++i) {
      result += parseInt(match[i], 16) + ',';
    }

    return result + (amount/100) + ')';
  }

  function contrastColor(color,dark,light) {
    color = hex2lab(color);
    dark = dark ? hex2lab(dark) : {l: 20, a: color.a, b: color.b};
    light = light ? hex2lab(light) : {l: 85, a: dark.a, b: dark.b};

    var l = color.l;

    if (l < 50) {
      color = light;
      if (l > 20) color.l = 99;
    } else {
      color = dark;
      if (l < 75) color.l = 1;
    }
    return lab2hex(color);
  }

  function hex2rgb(color) {
    var match = /^#(..)(..)(..)$/.exec(color) || ['', '00', '00', '00'];
    return {r: parseInt(match[1],16), g: parseInt(match[2],16), b: parseInt(match[3],16)};
  }

  function hex2lab(color) {
    color = hex2rgb(color);
    var r = rgb2xyz(color.r);
    var g = rgb2xyz(color.g);
    var b = rgb2xyz(color.b);

    var x = xyz2lab((.4124564 * r + .3575761 * g + .1804375 * b) / .95047);
    var y = xyz2lab((.2126729 * r + .7151522 * g + .0721750 * b));
    var z = xyz2lab((.0193339 * r + .1191920 * g + .9503041 * b) / 1.08883);
    return {l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z)};
  }

  function rgb2xyz(r) {
    return (r /= 255) <= .04045 ? r / 12.92 : Math.pow((r + .055) / 1.055, 2.4);
  }

  function xyz2lab(x) {
    return x > .008856 ? Math.pow(x, 1 / 3) : 7.787037 * x + 4 / 29;
  }

  function lab2hex(color) {
    var y = (color.l + 16) / 116, x = y + color.a / 500, z = y - color.b / 200;
    x = lab2xyz(x) * .95047;
    y = lab2xyz(y);
    z = lab2xyz(z) * 1.08883;

    return "#"+
      xyz2hex(3.2404542 * x - 1.5371385 * y - .4985314 * z)+
      xyz2hex(-.969266 * x + 1.8760108 * y + .041556 * z)+
      xyz2hex(.0556434 * x - .2040259 * y + 1.0572252 * z);
  }

  function byte2hex(byte) {
    return byte < 0x10 ? "0"+byte.toString(16) : byte.toString(16);
  }

  function xyz2hex(r) {
    var hex = Math.min(255, Math.max(0, Math.round(255 * (r <= .00304 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - .055)))).toString(16);
    return hex.length === 1 ? "0"+hex : hex;
  }


  function lab2xyz(x) {
    return x > .206893034 ? x * x * x : (x - 4 / 29) / 7.787037;
  }

  return exports;
});
