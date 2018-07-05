define((require)=>{
  const {private$} = require('koru/symbols');

  return {
    [private$]: {makeDoc$: Symbol()}
  };
});
