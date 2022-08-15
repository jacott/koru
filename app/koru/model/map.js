define((require) => {
  'use strict';
  const {private$}      = require('koru/symbols');

  return {
    [private$]: {makeDoc$: Symbol()},
  };
});
