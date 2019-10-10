define(()=>{
  'use strict';

  const {TextEncoder, crypto} = window;

  return async (password, salt, iterations, keylen, digest)=>{
    const enc = new TextEncoder();
    const saltArray = enc.encode(salt);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      {name: "PBKDF2"},
      false,
      ["deriveBits"]
    );
    return await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltArray,
        iterations,
        hash: digest
      },
      keyMaterial,
      keylen
    );
  };
});
