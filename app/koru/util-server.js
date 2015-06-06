define(function(require, exports, module) {
  var util = require('./util');

  util.engine = 'Server';
  util.Fiber = requirejs.nodeRequire('fibers');

  // Fix fibers making future enumerable
  var future = requirejs.nodeRequire('fibers/future');
  delete Function.prototype.future;
  Object.defineProperty(Function.prototype, 'future', {enumerable: false, value: future});


  Object.defineProperty(util, 'thread', {configurable: true, get: function () {
    return util.Fiber.current ? (util.Fiber.current.appThread || (util.Fiber.current.appThread = {})) : {};
  }});

  return util;
});
