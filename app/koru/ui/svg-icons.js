define((require, exports, module)=>{
  'use strict';
  const Dom             = require('koru/dom');

  const SvgElm = Dom.h({
    svg: [],
    viewBox: '0 0 24 24',
    class: 'icon',
  }, Dom.SVGNS);

  const use = (icon)=>{
    const svg = SvgElm.cloneNode(false);
    const useElm = document.createElementNS(Dom.SVGNS, 'use');
    useElm.setAttributeNS(Dom.XLINKNS, 'href', '#icon-'+icon);
    svg.appendChild(useElm);
    return svg;
  };

  return {
    use,

    selectMenuDecorator: ({icon}, elm)=>{
      if (icon === void 0) return;
      const fc = elm.previousSibling;
      if (fc !== null && fc.tagName === 'SVG')
        return;

      const svg = use(icon);
      elm.parentNode.insertBefore(svg, elm);
    }
  };
});
