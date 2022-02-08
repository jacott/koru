define((require, exports, module) => {
  'use strict';
  const Dom             = require('koru/dom');

  const SvgElm = Dom.h({
    svg: [],
    class: 'icon',
  }, Dom.SVGNS);

  const use = (icon, attrs) => Dom.svgUse('#icon-'+icon, attrs);

  const createIcon = (icon, title) => {
    const svg = SvgElm.cloneNode(false);
    svg.setAttribute('name', icon);
        if (title !== void 0) {
      svg.appendChild(Dom.h({title}, Dom.SVGNS));
    }
    svg.appendChild(use(icon));
    return svg;
  };

  Dom.registerHelpers({
    svgIcon: (name, attributes) => {
      if (! Dom.current.isElement()) {
        const icon = createIcon(name);
        for (const name in attributes) {
          icon.setAttribute(name, attributes[name]);
        }
        return icon;
      }
    }
  });


  return {
    use,
    setIcon: (useElm, icon) => useElm.setAttributeNS(Dom.XLINKNS, 'href', '#icon-'+icon),

    createIcon,

    add: (id, symbol) => {
      if (! (symbol instanceof globalThis.SVGElement))
        symbol = Dom.h({symbol, viewBox: '0 0 24 24'}, Dom.SVGNS);

      symbol.setAttribute('id', 'icon-'+id);
      document.querySelector('#SVGIcons>defs').appendChild(symbol);
    },

    selectMenuDecorator: ({icon}, elm) => {
      if (icon === void 0) return;
      const fc = elm.previousSibling;
      if (fc !== null && fc.tagName === 'SVG')
        return;

      elm.parentNode.insertBefore(createIcon(icon), elm);
    }
  };
});
