define((require, exports, module)=>{
  const AccSha256       = require('koru/srp/acc-sha256');
  const util            = require('koru/util');

  const nodeCrypto = isServer ? requirejs.nodeRequire('crypto') : undefined;

  const {idLen} = util;
  const idBytes = ((2*idLen-1)>>2)<<2;

  const toFrac = Math.pow(2, -32);

  const ab4 = new ArrayBuffer(4);
  const u32 = new Uint32Array(ab4);
  const u8 = new Uint8Array(ab4);

  const zero = '0000';
  const abId = new ArrayBuffer(idBytes);
  const u32Id = new Uint32Array(abId);
  const u8Id = new Uint8Array(abId);

  const shaStr = '1';

  const CHARS = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

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
    const size = ((numBytes+3)>>2)<<2;
    const ab = new ArrayBuffer(size);
    const u32 = new Uint32Array(ab);
    for(let i = 0; i < numBytes; i += 64) {
      AccSha256.add(shaStr, h);
      u32.set(h, i>>4);
    }
  };

  class RandomGenerator {
    constructor(seedArray) {
      this.words = seedArray === undefined ? undefined : prng(seedArray);
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

      let result = '';
      for(let i = 0; i < idLen; ++i) {
        result += CHARS[u8Id[i] % 62];
      }

      return result.slice(0, idLen);
    }
  };

  let seed = nodeCrypto || crypto ? undefined
        : [Date.now(), window.innerHeight, window.innerWidth, navigator.userAgent, Math.random()];


  const random = new RandomGenerator(seed);
  const create = (...args)=> new RandomGenerator(args.length ? args : undefined);
  random.create = create;

  return {
    create,
    id() {
      return (util.thread.random || random).id();
    },
    hexString(value) {
      return (util.thread.random || random).hexString(value);
    },
    global: random,
  };
});
