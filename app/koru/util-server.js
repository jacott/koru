define((require)=>{
  const KoruError       = require('koru/koru-error');
  const util            = require('./util');

  util.engine = 'Server';
  util.Fiber = requirejs.nodeRequire('fibers');

  util.waitCallback = (future, callTimeout=util.thread.callTimeout) => {
    let cto = callTimeout === 0 ? 0
        : setTimeout(()=>{
          cto = 0;
          future.isResolved() || future.throw(new KoruError(504, 'Timed out'));
        }, callTimeout === undefined ? 20*1000 : callTimeout);

    return (err, response) => {
      if (cto != 0) {
        clearTimeout(cto);
        cto = 0;
      }
      if (future.isResolved()) return;
      if (err) {
        if (err instanceof Error)
          future.throw(err);
        else
          future.throw(new Error(err.toString()));
      } else
        future.return(response);
    };
  };

  util.callWait = (method, caller, ...args)=>{
    const future = new util.Future;
    method.call(caller, ...args, util.waitCallback(future));
    return future.wait();
  };

  // Fix fibers making future enumerable
  const future = util.Future = requirejs.nodeRequire('fibers/future');
  Object.defineProperty(Function.prototype, 'future', {enumerable: false, value: future});

  const clientThread = {};

  Object.defineProperty(util, 'thread', {configurable: true, get() {
    const current = util.Fiber.current;
    return current ? (current.appThread || (current.appThread = {})) : clientThread;
  }});

  return util;
});
