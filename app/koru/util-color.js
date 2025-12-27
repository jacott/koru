define((require, exports, module) => {
  'use strict';
  const util            = require('koru/util');

  const colorClass = {};
  const contrastColors = {};
  const borderColors = {};

  let tmpStyleResult = '';
  const tmpStyle = {setProperty: (name, value) => {tmpStyleResult += `${name}:${value};`}};
  const RGBA_RE = /rgba?\s*\((?:\s*(\d+)\s*,\s*)(?:\s*(\d+)\s*,\s*)(?:\s*(\d+)\s*)(?:,\s*([.\d]+))?\)/;
  const HEX_RE = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i;
  const SMALL_HEX_RE = /^#?([\da-f])([\da-f])([\da-f])([\da-f])?$/i;

  const DARK = 60, VERY_DARK = 40, VERY_LIGHT = 85;

  const fade = (color, amount) => {
    const match = HEX_RE.exec(color);
    let result = 'rgba(';

    for (let i = 1; i < 4; ++i) {
      result += parseInt(match[i], 16) + ',';
    }

    return result + (amount / 100) + ')';
  };

  const hex2Style = (color) => {
    if (! color) return '';
    if (color.length === 7) return color;

    const match = (color.length > 5
      ? HEX_RE.exec(color)
      : SMALL_HEX_RE.exec(color)) ?? ['', '00', '00', '00', '00'];
    let result = 'rgba(';

    for (let i = 1; i < 4; ++i) {
      result += parseInt(match[i], 16) + ',';
    }

    return result + alphaHexToFrac(match[4]) + ')';
  };

  const contrastColor = (color, dark, light) => {
    color = hex2lab(color);
    dark = dark ? hex2lab(dark) : {l: 20, a: color.a, b: color.b};
    light = light ? hex2lab(light) : {l: 85, a: dark.a, b: dark.b};

    const {l} = color;

    if (l < DARK) {
      color = light;
      if (l > VERY_DARK) color.l = 99;
    } else {
      color = dark;
      if (l < VERY_LIGHT) color.l = 1;
    }
    return lab2hex(color);
  };

  const hex2rgb = (color, validate) => {
    let match = null;
    if (color != null) {
      if (color.length > 5) {
        match = HEX_RE.exec(color);
      } else {
        const m = SMALL_HEX_RE.exec(color);
        if (m !== null) {
          match = ['', m[1] + m[1], m[2] + m[2], m[3] + m[3], m[4] ? m[4] + m[4] : undefined];
        }
      }
    }

    if (match === null) {
      if (validate) return null;
      match = ['', '0', '0', '0'];
    }

    return {
      r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16),
      a: match[4] ? alphaHexToFrac(match[4]) : 1};
  };

  const rgb2hex = (rgb) => {
    const a = rgb.a == null ? '' : alphaFracToHex(rgb.a);
    return byte2hex(rgb.r) + byte2hex(rgb.g) + byte2hex(rgb.b) + (a === 'ff' ? '' : a);
  };

  const toRgbStyle = (input) => {
    const rgb = UtilColor.toRGB(input);
    const result = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

    if (rgb.a !== 1) {
      return `rgba(${result}, ${alphaHexToFrac(rgb.a)})`;
    } else {
      return `rgb(${result})`;
    }
  };

  const alphaHexToFrac = (a) => {
    if (typeof a === 'number') {
      return Math.round(a * 10000) / 10000;
    }

    a = parseInt(a, 16) * 10000 - 1280000;
    if (a > 0) a = a * 128 / 127;
    return Math.round((a + 1280000) / 256) / 10000;
  };

  const alphaFracToHex = (frac) => {
    let a = (frac * 2560000) - 1280000;
    if (a > 0) a = a * 127 / 128;
    return byte2hex(Math.round(a / 10000) + 128);
  };

  const hex2lab = (color) => {
    const rgb = typeof color === 'string' || color == null ? hex2rgb(color) : color;
    const r = rgb2xyz(rgb.r);
    const g = rgb2xyz(rgb.g);
    const b = rgb2xyz(rgb.b);

    const x = xyz2lab((.4124564 * r + .3575761 * g + .1804375 * b) / .95047);
    const y = xyz2lab((.2126729 * r + .7151522 * g + .0721750 * b));
    const z = xyz2lab((.0193339 * r + .1191920 * g + .9503041 * b) / 1.08883);
    return {l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z)};
  };

  const rgb2xyz = (r) => (r /= 255) <= .04045 ? r / 12.92 : Math.pow((r + .055) / 1.055, 2.4);

  const xyz2lab = (x) => x > .008856 ? Math.pow(x, 1/3) : 7.787037 * x + 4/29;

  const lab2hex = (color) => {
    const c1 = (color.l + 16) / 116,
    x = lab2xyz(c1 + color.a / 500) * .95047,
    y = lab2xyz(c1),
    z = lab2xyz(c1 - color.b / 200) * 1.08883;

    return '#' +
      xyz2hex(3.2404542 * x - 1.5371385 * y - .4985314 * z) +
      xyz2hex(-.969266 * x + 1.8760108 * y + .041556 * z) +
      xyz2hex(.0556434 * x - .2040259 * y + 1.0572252 * z);
  };

  const byte2hex = (byte) => byte == null
    ? ''
    : byte < 0x10 ? '0' + byte.toString(16) : byte.toString(16);

  const xyz2hex = (r) => {
    const hex = Math.min(255, Math.max(0, Math.round(
      255 * (r <= .00304 ? 12.92 * r : 1.055 * Math.pow(r, 1/2.4) - .055)))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  const lab2xyz = (x) => x > .206893034 ? x * x * x : (x - 4/29) / 7.787037;

  const UtilColor = {
    hex2rgb,

    RGBA_RE,

    toRGB(input) {
      if (typeof input === 'string') {
        const match = input.match(RGBA_RE);
        if (match) {
          return {
            r: parseInt(match[1]), g: parseInt(match[2]),
            b: parseInt(match[3]), a: match[4] ? parseFloat(match[4]) : 1};
        } else {
          return hex2rgb(input, 'validate');
        }
      }
      return input;
    },

    toHex(input) {
      const rgb = UtilColor.toRGB(input);
      return rgb ? '#' + rgb2hex(rgb) : '';
    },

    rgb2hex(rgb, prefix='#') {
      return prefix + rgb2hex(rgb);
    },

    backgroundColorStyle(color) {
      tmpStyleResult = '';
      UtilColor.setBackgroundColorStyle(tmpStyle, color);
      return tmpStyleResult;
    },

    setBackgroundColorStyle(style, color) {
      const uc = color || '#ffffff';
      style.setProperty('background-color', hex2Style(color));
      style.setProperty('color', hex2Style(contrastColors[uc] ??= contrastColor(uc, '#4d4d4d')));
      return style;
    },

    setColorAndContrastStyleVars(style, color, colorName='color', contrastName='contrastColor') {
      color = color || {r: 255, g: 255, b: 255, a: 1};
      style.setProperty('--' + colorName, toRgbStyle(color));
      style.setProperty('--' + contrastName, toRgbStyle(
        contrastColors[color] ??= contrastColor(color, '#4d4d4d')));
      return style;
    },

    setBackgroundAndBorderColorStyle(style, color) {
      color = color || '#ffffff';
      UtilColor.setBackgroundColorStyle(style, color);
      const cc = contrastColors[color];
      style.setProperty('border-color', borderColors[color] ??= fade(cc, 30));
    },

    rgb2hsl(rgb) {
      if (typeof rgb === 'string') {
        rgb = hex2rgb(rgb);
      }

      const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h, s;
      const l = (max + min) / 2;

      if (max == min) {
        h = s = 0;
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }

      return {h, s, l};
    },

    hsl2rgb(hsl) {
      let r, g, b;
      const {h, s, l} = hsl;

      if (s == 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };

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

      if (lab.l < DARK) {
        return color;
      }

      lab.l = DARK;
      return lab2hex(lab);
    },

    colorClass(color) {
      let cc = colorClass[color];
      if (cc) return cc;

      cc = hex2lab(color);
      const l = cc.l;

      if (l < DARK) {
        cc = 'dark';
      } else {
        cc = 'light';
      }
      if (l <= VERY_DARK || l >= VERY_LIGHT) cc = 'very' + cc;

      return colorClass[color] = cc;
    },

    contrastColor,

    fade,

    hex2Style,

    toRgbStyle,

    alphaHexToFrac,

    alphaFracToHex,

    addColorClass({classList}, color) {
      const cc = UtilColor.colorClass(color);

      if (classList.contains(cc)) return;

      classList.remove('dark', 'verydark', 'light', 'verylight');
      classList.add(cc);
    },
  };

  return UtilColor;
});
