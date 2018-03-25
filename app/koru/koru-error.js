define(function(require, exports, module) {
  const util            = require('koru/util');

  class KoruError extends Error {
    constructor(error, reason, details) {
      super(typeof reason === 'string' ?
            `${reason} [${error}]` : `${util.inspect(reason)} [${error}]`);
      this.error = error;
      this.reason = reason;
      this.details = details;
    }
  }
  KoruError.name = KoruError.prototype.name = 'KoruError';

  return KoruError;
});
