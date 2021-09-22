define((require) => {
  'use strict';
  const KoruError       = require('koru/koru-error');
  const util            = require('./util');

  util.engine = 'Server';
  util.Fiber = requirejs.nodeRequire('fibers');

  util.waitCallback = (future, callTimeout=util.thread.callTimeout ?? 20*1000) => {
    let cto = callTimeout === 0
        ? 0
        : setTimeout(() => {
          cto = 0;
          future.isResolved() || future.return([{error: 504, reason: 'Timed out'}]);
        }, callTimeout);

    return (err, response) => {
      if (cto != 0) {
        clearTimeout(cto);
        cto = 0;
      }
      if (future.isResolved()) return;
      if (err != null) {
        if (err instanceof Error) {
          future.throw(err);
        } else {
          future.return([{error: err.error ?? 500, reason: err.reason ?? err.toString()}]);
        }
      } else {
        future.return([null, response]);
      }
    };
  };

  util.callWait = (method, caller, ...args) => {
    const future = new util.Future();
    method.call(caller, ...args, util.waitCallback(future));
    const [err, response] = future.wait();
    if (err != null) {
      throw new KoruError(err.error, err.reason);
    }
    return response;
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
