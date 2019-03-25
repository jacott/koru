define((require)=>{
  'use strict';
  const {toHex, add} = require('koru/srp/acc-sha256');

  return s => toHex(add(s));
});
