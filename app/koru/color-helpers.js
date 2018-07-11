define((require)=>{
  const Dom             = require('koru/dom');
  const util            = require('koru/util');
  const UtilColor       = require('koru/util-color');

  Dom.registerHelpers({
    setBackgroundColor(color=this.color, noAlpha=false) {
      const elm = Dom.current.element;
      UtilColor.setBackgroundColorStyle(
        elm.style, noAlpha && typeof color === 'string' ? color.slice(0, 7) : color);

      UtilColor.addColorClass(elm, color);
    },

    setBackgroundAndBorderColor(color=this.color, noAlpha=false) {
      const elm = Dom.current.element;
      UtilColor.setBackgroundAndBorderColorStyle(
        elm.style, noAlpha && typeof color === 'string' ? color.slice(0, 7) : color);

      UtilColor.addColorClass(elm, color);
    },
  });
});
