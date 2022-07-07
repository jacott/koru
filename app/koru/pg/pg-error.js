define((require, exports, module) => {
  'use strict';
  const util            = require('koru/util');

  const TRANSLATE = {
    23505: 409,
    57014: 504,
  };

  class PgError extends Error {
    constructor(details, queryStr, paramValues) {
      const {message} = details;
      super(typeof message === 'function' ? message() : message);
      this.details = details;
      this.queryStr = queryStr;
      this.paramValues = paramValues;
      this.severity = details.severity;
      this.code = details.code;
      this.error = TRANSLATE[this.code] ?? 400;
    }

    toString() {
      let {message, hint, position, code, severity} = this.details;
      if (this.code !== void 0) {
        message += ` (${code})`;
      }
      if (typeof this.queryStr === 'string') {
        if (position !== void 0) {
          message += '\n\n' + this.queryStr + `\n${''.padEnd(position - 1, '-')}^`;
        } else {
          message += '\n\n' + this.queryStr;
        }
      }
      if (hint !== void 0) {
        message += '\nHint: ' + hint;
      }

      if (this.paramValues !== void 0) {
        message += '\nParams: ' + util.inspect(this.paramValues);
      }
      return `PgError(${severity}): ${message}`;
    }
  }

  PgError.prototype.severity = 'FATAL';
  PgError.prototype.name = 'PgError';

  return PgError;
});
