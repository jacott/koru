define((require)=>{
  'use strict';
  const base = require('./base');

  return require('koru/env!./main')(base);
});
