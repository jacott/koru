(function (global, factory) {
typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
typeof define === 'function' && define.amd ? define(['exports'], factory) :
(factory((global.d3 = global.d3 || {})));
}(this, (function (exports) {
  exports.foo = 123;

  function define() {}
  var define = ()=>{};

  let a, b, c;

  define(a, b, c);
})));
