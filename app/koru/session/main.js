define((require)=>{
  const base = require('./base');

  return require('koru/env!./main')(base);
});
