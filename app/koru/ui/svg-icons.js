define((require, exports, module)=>{
  'use strict';
  const Dom             = require('koru/dom');

  const SvgElm = Dom.h({
    svg: [],
    class: 'icon',
  }, Dom.SVGNS);

  const use = (icon)=>{
    const svg = SvgElm.cloneNode(false);
    svg.setAttribute('name', icon);
    const useElm = document.createElementNS(Dom.SVGNS, 'use');
    useElm.setAttributeNS(Dom.XLINKNS, 'href', '#icon-'+icon);
    svg.appendChild(useElm);
    return svg;
  };

  Dom.registerHelpers({
    svgIcon: (name, attributes)=>{
      if (! Dom.current.isElement()) {
        const icon = use(name);
        for (const name in attributes) {
          icon.setAttribute(name, attributes[name]);
        }
        return icon;
      }
    }
  });


  return {
    use,

    add: (id, symbol) =>{
      if (! (symbol instanceof globalThis.SVGElement))
        symbol = Dom.h({symbol, viewBox: "0 0 24 24"}, Dom.SVGNS);

      symbol.setAttribute('id', "icon-"+id);
      document.querySelector('#SVGIcons>defs').appendChild(symbol);
    },

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
