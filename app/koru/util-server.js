const {AsyncLocalStorage} = require('async_hooks');

define((require) => {
  'use strict';
  const Future          = require('koru/future');
  const KoruError       = require('koru/koru-error');
  const util            = require('./util');

  util.engine = 'Server';

  util.waitCallback = (future, callTimeout=util.thread.callTimeout ?? 20*1000) => {
    let cto = callTimeout === 0
        ? 0
        : setTimeout(() => {
          cto = 0;
          future.isResolved || future.resolve([{error: 504, reason: 'Timed out'}]);
        }, callTimeout);

    return (err, response) => {
      if (cto != 0) {
        clearTimeout(cto);
        cto = 0;
      }
      if (future.isResolved) return;
      if (err != null) {
        if (err instanceof Error) {
          future.reject(err);
        } else {
          future.resolve([{error: err.error ?? 500, reason: err.reason ?? err.toString()}]);
        }
      } else {
        future.resolve([null, response]);
      }
    };
  };

  util.callWait = async (method, caller, ...args) => {
    const future = new Future();
    method.call(caller, ...args, util.waitCallback(future));
    const [err, response] = await future.promise;
    if (err != null) {
      throw new KoruError(err.error, err.reason);
    }
    return response;
  };

  const clientThread = {};

  const koruThreadLocal = globalThis.__koruThreadLocal;

  Object.defineProperty(util, 'thread', {configurable: true, get() {
    return koruThreadLocal.getStore();
  }});

  return util;
});
