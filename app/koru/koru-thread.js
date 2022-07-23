define((require, exports, module) => {
  'use strict';
  const {private$}      = require('koru/symbols');

  class KoruThread {
    constructor(conn) {
      if (conn !== void 0) {
        this.userId = conn.userId;
        this.connection = conn;
      }
    }

    finally(callback) {
      (this[private$] ??= []).push(callback);
    }

    static runFinally(kt) {
      const cbs = kt[private$];
      if (cbs === void 0) return;
      for (const cb of cbs) {
        try {
          cb();
        } catch (err) {
          this.koru.unhandledException(err);
        }
      }
    }
  }

  return KoruThread;
});
