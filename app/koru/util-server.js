define(function(require, exports, module) {
  var util = require('./util');

  util.engine = 'Server';
  util.Fiber = requirejs.nodeRequire('fibers');

  // Fix fibers making future enumerable
  var future = util.Future = requirejs.nodeRequire('fibers/future');
  Object.defineProperty(Function.prototype, 'future', {enumerable: false, value: future});

  var clientThread = {};

  Object.defineProperty(util, 'thread', {configurable: true, get: function () {
    var current = util.Fiber.current;
    return current ? (current.appThread || (current.appThread = {})) : clientThread;
  }});

  return util;
});
