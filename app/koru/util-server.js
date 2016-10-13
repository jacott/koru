define(function(require, exports, module) {
  const util = require('./util');

  util.engine = 'Server';
  util.Fiber = requirejs.nodeRequire('fibers');

  util.merge(util, {
    waitCallback(future) {
      return function (err, response) {
        if (err) {
          if (err instanceof Error)
            future.throw(err);
          else
            future.throw(new Error(err.toString()));
        } else
          future.return(response);
      };
    },

    callWait(method, caller, ...args) {
      const future = new util.Future;
      method.call(caller, ...args, util.waitCallback(future));
      return future.wait();
    },
  });

  // Fix fibers making future enumerable
  var future = util.Future = requirejs.nodeRequire('fibers/future');
  Object.defineProperty(Function.prototype, 'future', {enumerable: false, value: future});

  var clientThread = {};

  Object.defineProperty(util, 'thread', {configurable: true, get() {
    var current = util.Fiber.current;
    return current ? (current.appThread || (current.appThread = {})) : clientThread;
  }});

  return util;
});
