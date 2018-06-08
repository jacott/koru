if (! (window.PointerEvent && window.Element && window.Element.prototype.setPointerCapture))
  requirejs.polyfill_pep = 'koru/polyfill/pep';

define(function(require, exports, module) {
  const pf = require('koru/polyfill!pep');

  if (pf !== undefined && pf.PointerEvent === window.PointerEvent)
    window.PointerEvent.pep = true;
});
