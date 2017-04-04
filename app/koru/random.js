define(function(require, exports, module) {
  const util  = require('koru/util');
  /**
   * random.js
   *
   * Copyright (C) 2011--2014 Meteor Development Group
   * License: MIT
   *
   * Based on code from Meteor.com: meteor/packages/random/random.js
   */

  // We use cryptographically strong PRNGs (crypto.getRandomBytes() on the server,
  // window.crypto.getRandomValues() in the browser) when available. If these
  // PRNGs fail, we fall back to the Alea PRNG, which is not cryptographically
  // strong, and we seed it with various sources such as the date, Math.random,
  // and window size on the client.  When using crypto.getRandomValues(), our
  // primitive is hexString(), from which we construct fraction(). When using
  // window.crypto.getRandomValues() or alea, the primitive is fraction and we use
  // that to construct hex string.

  const nodeCrypto = isServer && requirejs.nodeRequire('crypto');
  const {idLen} = util;

  // see http://baagoe.org/en/wiki/Better_random_numbers_for_javascript
  // for a full discussion and Alea implementation.
  function Alea (...args) {
    function Mash() {
      let n = 0xefc8249d;

      function mash(data) {
        data = data.toString();
        for (let i = 0; i < data.length; i++) {
          n += data.charCodeAt(i);
          let h = 0.02519603282416938 * n;
          n = h >>> 0;
          h -= n;
          h *= n;
          n = h >>> 0;
          h -= n;
          n += h * 0x100000000; // 2^32
        }
        return (n >>> 0) * 2.3283064365386963e-10; // 2^-32
      };

      mash.version = 'Mash 0.9';
      return mash;
    }

    let s0 = 0, s1 = 0, s2 = 0, c = 1;

    if (args.length == 0) {
      args = [+new Date];
    }
    const mash = Mash();
    s0 = mash(' ');
    s1 = mash(' ');
    s2 = mash(' ');

    for (let i = 0; i < args.length; i++) {
      s0 -= mash(args[i]);
      if (s0 < 0) {
        s0 += 1;
      }
      s1 -= mash(args[i]);
      if (s1 < 0) {
        s1 += 1;
      }
      s2 -= mash(args[i]);
      if (s2 < 0) {
        s2 += 1;
      }
    }

    function random() {
      const t = 2091639 * s0 + c * 2.3283064365386963e-10; // 2^-32
      s0 = s1;
      s1 = s2;
      return s2 = t - (c = t | 0);
    };
    random.uint32 = function() {
      return random() * 0x100000000; // 2^32
    };
    random.fract53 = function() {
      return random() +
        (random() * 0x200000 | 0) * 1.1102230246251565e-16; // 2^-53
    };
    random.version = 'Alea 0.9';
    random.args = args;

    return random;
  };

  const UNMISTAKABLE_CHARS = "23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz";
  const UNMISTAKABLE_CHARS_LEN = UNMISTAKABLE_CHARS.length;

  const fracArray = isClient && new Uint32Array(1);

  const crypto = ! nodeCrypto && typeof window !== "undefined" &&
          window.crypto.getRandomValues && window.crypto;

  // If seeds are provided, then the alea PRNG will be used, since cryptographic
  // PRNGs (Node crypto and window.crypto.getRandomValues) don't allow us to
  // specify seeds. The caller is responsible for making sure to provide a seed
  // for alea if a csprng is not available.
  class RandomGenerator {
    constructor(seedArray) {
      if (seedArray !== undefined)
        this.alea = Alea.apply(null, seedArray);
    }

    fraction() {
      if (this.alea) {
        return this.alea();
      }

      if (nodeCrypto) {
        const numerator = parseInt(this.hexString(8), 16);
        return numerator * 2.3283064365386963e-10; // 2^-32
      } else if (crypto) {
        crypto.getRandomValues(fracArray);
        return fracArray[0] * 2.3283064365386963e-10; // 2^-32
      }
    }

    hexString(digits) {
      if (this.alea) {
        let hexDigits = '';
        for (let i = 0; i < digits; ++i) {
          hexDigits += this.choice("0123456789abcdef");
        }
        return hexDigits;
      }
      const numBytes = Math.ceil(digits / 2);
      let bytes;
      if (nodeCrypto) {
        bytes = nodeCrypto.randomBytes(numBytes);
      } else {
        bytes = new Uint8Array(numBytes);
        crypto.getRandomValues(bytes);
      }
      let result = '';
      for(let i = 0; i < numBytes; ++i) {
        const hex = bytes[i].toString(16);
        if (hex.length === 1)
          result += '0'+hex;
        else
          result += hex;
      }

      return result.substring(0, digits);
    }

    id() {
      let digits = '';
      if (this.alea) {
        for (let i = 0; i < idLen; i++) {
          digits += UNMISTAKABLE_CHARS[Math.floor(this.alea() * UNMISTAKABLE_CHARS_LEN)];
        }
        return digits;
      }

      let bytes;
      if (nodeCrypto) {
        bytes = nodeCrypto.randomBytes(idLen);
      } else {
        bytes = new Uint8Array(idLen);
        crypto.getRandomValues(bytes);
      }
      for (let i = 0; i < idLen; i++) {
        digits += UNMISTAKABLE_CHARS[(bytes[i] * UNMISTAKABLE_CHARS_LEN) >> 8];
      }
      return digits;
    }

    choice(arrayOrString) {
      const index = Math.floor(this.fraction() * arrayOrString.length);
      if (typeof arrayOrString === "string")
        return arrayOrString.substr(index, 1);
      else
        return arrayOrString[index];
    }
  };

  // instantiate RNG.  Heuristically collect entropy from various sources when a
  // cryptographic PRNG isn't available.
  let seed = nodeCrypto || crypto ? undefined
        : [Date.now(), window.innerHeight, window.innerWidth, navigator.userAgent, Math.random()];


  const random = new RandomGenerator(seed);
  random.create = create;

  function create(...args) {
    return new RandomGenerator(args.length ? args : undefined);
  }

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
