define((require)=>{
  'use strict';
  const util            = require('koru/util');

  class KoruError extends Error {
    constructor(error, reason) {
      super(typeof reason === 'string' ?
            `${reason} [${error}]` : `${util.inspect(reason)} [${error}]`);
      this.error = error;
      this.reason = reason;
    }

    get name() {return 'KoruError'}
  }

  return KoruError;
});
