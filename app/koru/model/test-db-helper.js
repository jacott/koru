define((require)=>{
  'use strict';
  const TH              = require('koru/env!./test-db-helper');

  TH.fullReload = (...args)=>{
    args.forEach(d => d.$reload(true));
  };

  return TH;
});
