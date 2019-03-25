define((require)=>{
  'use strict';
  const AccSha256       = require('koru/srp/acc-sha256');
  const util            = require('koru/util');

  const nodeCrypto = isServer ? requirejs.nodeRequire('crypto') : undefined;

  const {idLen, u32Id, u8Id, id} = util;

  const toFrac = Math.pow(2, -32);

  const ab4 = new ArrayBuffer(4);
  const u32 = new Uint32Array(ab4);
  const u8 = new Uint8Array(ab4);

  const shaStr = '1';

  const crypto = ! nodeCrypto && typeof window !== "undefined" &&
          window.crypto.getRandomValues && window.crypto;

  const getBytes = nodeCrypto ? numBytes=>nodeCrypto.randomBytes(numBytes)
          : numBytes=>{
            const bytes = new Uint8Array(numBytes);
            crypto.getRandomValues(bytes);
            return bytes;
          };

  const prng = (seedArray)=> AccSha256.add(seedArray.join(''));

  const prngGetBytes = (h, numBytes)=>{
    const size = ((numBytes+3)>>2)<<3;
    const ab = new ArrayBuffer(Math.max(32, size));
    const u32 = new Uint32Array(ab);
    for(let i = 0; i < numBytes; i += 32) {
      AccSha256.add(shaStr, h);
      u32.set(h, i>>2);
    }

    const ui8 = new Uint8Array(ab);

    return ui8;
  };

  class Random {
    constructor(...tokens) {
      this.words = tokens.length == 0
        ? (nodeCrypto || crypto
           ? undefined
           : prng([Date.now(), window.innerHeight, window.innerWidth,
                   navigator.userAgent, Math.random()]))
      : prng(tokens);
    }

    fraction() {
      if (this.words !== undefined) {
        return (AccSha256.add(shaStr, this.words)[0]>>>0) * toFrac;
      }
      if (nodeCrypto === undefined)
        crypto.getRandomValues(u32);
      else
        u8.set(nodeCrypto.randomBytes(4));

      return u32[0] * toFrac;
    }

    hexString(digits) {
      const numBytes = (digits+1)>>1;
      let bytes = this.words === undefined ? getBytes(numBytes)
            : prngGetBytes(this.words, numBytes);
      let result = '';
      for(let i = 0; i < numBytes; ++i) {
        const hex = bytes[i].toString(16);
        result += hex.length === 1 ?  `0${hex}` : hex;
      }

      return result.length == digits ? result : result.slice(0, digits);
    }

    id() {
      if (this.words !== undefined) {
        u32Id.set(AccSha256.add(shaStr, this.words));
      } else if (nodeCrypto === undefined)
        crypto.getRandomValues(u32Id);
      else
        u8Id.set(nodeCrypto.randomBytes(idLen));

      return id();
    }
  };

  const random = new Random();
  Random.global = random;
  Random.id = ()=> (util.thread.random || random).id();
  Random.hexString = value =>  (util.thread.random || random).hexString(value);

  return Random;
});
