define((require)=>{
  'use strict';
  const util            = require('koru/util');

  class KoruError extends Error {
    constructor(error, reason, details) {
      super(typeof reason === 'string' ?
            `${reason} [${error}]` : `${util.inspect(reason)} [${error}]`);
      this.error = error;
      this.reason = reason;
      this.details = details;
    }

    get name() {return 'KoruError'}
  }

  return KoruError;
});
