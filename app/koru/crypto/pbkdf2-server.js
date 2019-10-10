const crypto = require('crypto');

define(()=>{
  'use strict';

  return (password, salt, iterations, keylen, digest) => new Promise((resolve, reject)=>{
    crypto.pbkdf2(password, salt, iterations, keylen>>3,
                  digest.replace(/-/g, ''), (err, key)=>{
      if (err) reject(err);
      else resolve(key);
    });
  });
});
