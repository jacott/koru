define(function(require, exports, module) {
  const util = require('koru/util');

  const colorClass = {};
  const contrastColors = {};
  const boarderColors = {};

  const tmpStyle = {};
  const RGBA_RE = /rgba?\s*\((?:\s*(\d+)\s*,\s*)(?:\s*(\d+)\s*,\s*)(?:\s*(\d+)\s*)(?:,\s*([.\d]+))?\)/;
  const HEX_RE = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i;

  exports = {
    hex2rgb: hex2rgb,

    RGBA_RE: RGBA_RE,

    toRGB(input) {
      if (typeof input === 'string') {
        const match = input.match(RGBA_RE);
        if (match)
          return {
            r: parseInt(match[1]), g: parseInt(match[2]),
            b: parseInt(match[3]), a: match[4] ? parseFloat(match[4]) : 1};
        else
          return hex2rgb(input, 'validate');
      }
      return null;
    },

    toHex(input) {
      const rgb = exports.toRGB(input);
      if (rgb)
        return '#' + rgb2hex(rgb);
      return '';
    },

    rgb2hex(rgb, prefix) {
      if (prefix == null) prefix = '#';
      return prefix + rgb2hex(rgb);
    },

    backgroundColorStyle(color) {
      exports.setBackgroundColorStyle(tmpStyle, color);
      return 'background-color:'+tmpStyle.backgroundColor +
        ";color:"+tmpStyle.color;
    },

    setBackgroundColorStyle(style, color) {
      const uc = color || '#ffffff';
      style.backgroundColor = hex2Style(color);
      style.color = hex2Style(contrastColors[uc] || (
        contrastColors[uc] = contrastColor(uc, '#4d4d4d')));
      return style;
    },

    setBackgroundAndBoarderColorStyle(style, color) {
      color = color || '#ffffff';

      exports.setBackgroundColorStyle(style, color);
      const cc = contrastColors[color];
      style.borderColor = boarderColors[color] || (boarderColors[color] = fade(cc, 30));
    },

    rgb2hsl(rgb) {
      if (typeof rgb === 'string')
        rgb = hex2rgb(rgb);

      const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;

      if (max == min) {
        h = s = 0;
      } else {
        const d = max - min;
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

    hsl2rgb(hsl) {
      let r, g, b;
      const h = hsl.h, s = hsl.s, l = hsl.l;

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

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }

      return {r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255)};
    },

    colorOnLight(color) {
      const lab = hex2lab(color);

      if (lab.l < 60)
        return color;

      lab.l = 60;
      return lab2hex(lab);
    },

    colorClass(color) {
      let cc = colorClass[color];
      if (cc) return cc;

      cc = hex2lab(color);
      const l = cc.l;

      if (l < 60) {
        cc = 'dark';
      } else {
        cc = 'light';
      }
      if (l <= 40 || l >= 85) cc = 'very' + cc;

      return colorClass[color] = cc;
    },

    contrastColor: contrastColor,

    fade: fade,

    hex2Style: hex2Style,

    toRgbStyle: toRgbStyle,

    alphaHexToFrac: alphaHexToFrac,

    alphaFracToHex: alphaFracToHex,
  };

  function fade(color, amount) {
    const match = HEX_RE.exec(color);
    let result = 'rgba(';

    for(let i = 1; i<4; ++i) {
      result += parseInt(match[i], 16) + ',';
    }

    return result + (amount/100) + ')';
  }

  function hex2Style(color) {
    if (! color) return '';
    if (color.length === 7) return color;

    const match = HEX_RE.exec(color) || ['', '00', '00', '00', '00'];
    let result = 'rgba(';

    for(let i = 1; i<4; ++i) {
      result += parseInt(match[i], 16) + ',';
    }

    return result + alphaHexToFrac(match[4]) + ')';
  }

  function contrastColor(color,dark,light) {
    color = hex2lab(color);
    dark = dark ? hex2lab(dark) : {l: 20, a: color.a, b: color.b};
    light = light ? hex2lab(light) : {l: 85, a: dark.a, b: dark.b};

    const {l} = color;

    if (l < 50) {
      color = light;
      if (l > 20) color.l = 99;
    } else {
      color = dark;
      if (l < 75) color.l = 1;
    }
    return lab2hex(color);
  }

  function hex2rgb(color, validate) {
    const match = HEX_RE.exec(color) || (! validate && ['', '00', '00', '00']);

    return match ?
      {r: parseInt(match[1],16), g: parseInt(match[2],16), b: parseInt(match[3],16),
       a: match[4] ? alphaHexToFrac(match[4]) : 1}
    : null;
  }

  function rgb2hex(rgb) {
    let {a} = rgb;
    if (a != null)
      a = alphaFracToHex(rgb.a);

    if (a === 'ff' || a == null)
      a = '';
    return byte2hex(rgb.r)+ byte2hex(rgb.g)+ byte2hex(rgb.b)+a;
  }

  function toRgbStyle(input) {
    const rgb = exports.toRGB(input);

    let result = rgb.r + ', ' + rgb.g + ', ' + rgb.b;

    if (rgb.a !== 1)
      result =  'rgba(' + result + ', ' + alphaHexToFrac(rgb.a);
    else
      result = 'rgb(' + result;

    return result + ')';
  }

  function alphaHexToFrac(a) {
    a = (typeof a === 'string' ? parseInt(a, 16)*10000 : a) - 1280000;
    if (a > 0) a = a*128/127;
    return Math.round((a+1280000)/256)/10000;
  }

  function alphaFracToHex(frac) {
    let a = (frac * 2560000) - 1280000;
    if (a > 0) a = a*127/128;
    a = Math.round(a/10000) + 128;
    return byte2hex(a);
  }

  function hex2lab(color) {
    color = hex2rgb(color);
    const r = rgb2xyz(color.r);
    const g = rgb2xyz(color.g);
    const b = rgb2xyz(color.b);

    const x = xyz2lab((.4124564 * r + .3575761 * g + .1804375 * b) / .95047);
    const y = xyz2lab((.2126729 * r + .7151522 * g + .0721750 * b));
    const z = xyz2lab((.0193339 * r + .1191920 * g + .9503041 * b) / 1.08883);
    return {l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z)};
  }

  function rgb2xyz(r) {
    return (r /= 255) <= .04045 ? r / 12.92 : Math.pow((r + .055) / 1.055, 2.4);
  }

  function xyz2lab(x) {
    return x > .008856 ? Math.pow(x, 1 / 3) : 7.787037 * x + 4 / 29;
  }

  function lab2hex(color) {
    let y = (color.l + 16) / 116, x = y + color.a / 500, z = y - color.b / 200;
    x = lab2xyz(x) * .95047;
    y = lab2xyz(y);
    z = lab2xyz(z) * 1.08883;

    return "#"+
      xyz2hex(3.2404542 * x - 1.5371385 * y - .4985314 * z)+
      xyz2hex(-.969266 * x + 1.8760108 * y + .041556 * z)+
      xyz2hex(.0556434 * x - .2040259 * y + 1.0572252 * z);
  }

  function byte2hex(byte) {
    if (byte == null) return '';
    return byte < 0x10 ? "0"+byte.toString(16) : byte.toString(16);
  }

  function xyz2hex(r) {
    const hex = Math.min(255, Math.max(0, Math.round(
      255 * (r <= .00304 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - .055)))).toString(16);
    return hex.length === 1 ? "0"+hex : hex;
  }


  function lab2xyz(x) {
    return x > .206893034 ? x * x * x : (x - 4 / 29) / 7.787037;
  }

  return exports;
});
