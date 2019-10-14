define((require)=>{
  'use strict';
  const {toHex, add} = require('koru/crypto/acc-sha256');

  return s => toHex(add(s));
});
