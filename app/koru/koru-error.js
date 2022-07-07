define((require) => {
  'use strict';
  const util            = require('koru/util');

  class KoruError extends Error {
    constructor(error, reason) {
      super(typeof reason === 'string' ? reason : {toString() {return util.inspect(reason)}});
      this.error = error;
      this.reason = reason;
    }

    toString() {
      const {reason} = this;
      return typeof reason === 'string'
        ? `${reason} [${this.error}]`
        : `${util.inspect(reason)} [${this.error}]`;
    }

    get name() {return 'KoruError'}
  }

  return KoruError;
});
