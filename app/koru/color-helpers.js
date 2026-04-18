define((require) => {
  'use strict';
  const Dom             = require('koru/dom');
  const util            = require('koru/util');
  const UtilColor       = require('koru/util-color');

  const alphac = (color, noAlpha) =>
    noAlpha && typeof color === 'string' ? color.slice(0, 7) : color;

  Dom.registerHelpers({
    setFgBgColor(color = this.color, backgroundColor = this.backgroundColor, noAlpha = false) {
      const elm = Dom.current.element;
      UtilColor.setFgBgColorStyle(
        elm.style,
        alphac(color, noAlpha),
        alphac(backgroundColor, noAlpha),
      );

      UtilColor.addColorClass(elm, backgroundColor);
    },

    setBackgroundColor(color = this.color, noAlpha = false) {
      const elm = Dom.current.element;
      UtilColor.setBackgroundColorStyle(elm.style, alphac(color, noAlpha));

      UtilColor.addColorClass(elm, color);
    },

    setBackgroundAndBorderColor(color = this.color, noAlpha = false) {
      const elm = Dom.current.element;
      UtilColor.setBackgroundAndBorderColorStyle(elm.style, alphac(color, noAlpha));

      UtilColor.addColorClass(elm, color);
    },
  });
});
