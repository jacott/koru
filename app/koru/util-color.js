define(function(require, exports, module) {
  var util = require('koru/util');

  var contrastColors = {};
  var boarderColors = {};

  exports = {
    hex2rgb: hex2rgb,

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

    colorOnLight: function (color) {
      var lab = hex2lab(color);

      if (lab.l < 60)
        return color;

      lab.l = 60;
      return lab2hex(lab);
    },

    colorClass: function (color) {
      color = hex2lab(color);
      var l = color.l;

      if (l < 50) {
        color = 'dark';
      } else {
        color = 'light';
      }
      if (l <= 20 || l >= 75) color = 'very ' + color;

      return color;
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

  function xyz2hex(r) {
    var hex = Math.min(255, Math.max(0, Math.round(255 * (r <= .00304 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - .055)))).toString(16);
    return hex.length === 1 ? "0"+hex : hex;
  }


  function lab2xyz(x) {
    return x > .206893034 ? x * x * x : (x - 4 / 29) / 7.787037;
  }

  return exports;
});
