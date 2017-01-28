define(function() {
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

  // see http://baagoe.org/en/wiki/Better_random_numbers_for_javascript
  // for a full discussion and Alea implementation.
  function Alea (...args) {
    function Mash() {
      var n = 0xefc8249d;

      var mash = function(data) {
        data = data.toString();
        for (var i = 0; i < data.length; i++) {
          n += data.charCodeAt(i);
          var h = 0.02519603282416938 * n;
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

    var s0 = 0;
    var s1 = 0;
    var s2 = 0;
    var c = 1;

    if (args.length == 0) {
      args = [+new Date];
    }
    var mash = Mash();
    s0 = mash(' ');
    s1 = mash(' ');
    s2 = mash(' ');

    for (var i = 0; i < args.length; i++) {
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
    mash = null;

    const random = function() {
      var t = 2091639 * s0 + c * 2.3283064365386963e-10; // 2^-32
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

      if (isServer) {
        var numerator = parseInt(this.hexString(8), 16);
        return numerator * 2.3283064365386963e-10; // 2^-32
      } else if (typeof window !== "undefined" && window.crypto &&
                 window.crypto.getRandomValues) {
        window.crypto.getRandomValues(fracArray);
        return fracArray[0] * 2.3283064365386963e-10; // 2^-32
      }
    }

    hexString(digits) {
      if (this.alea) {
        var hexDigits = '';
        for (var i = 0; i < digits; ++i) {
          hexDigits += this.choice("0123456789abcdef");
        }
        return hexDigits;
      }
      var numBytes = Math.ceil(digits / 2);
      var bytes;
      if (isServer) {
        bytes = nodeCrypto.randomBytes(numBytes);
      } else {
        bytes = new Uint8Array(numBytes);
        window.crypto.getRandomValues(bytes);
      }
      var result = '';
      for(var i = 0; i < numBytes; ++i) {
        var hex = bytes[i].toString(16);
        if (hex.length === 1) hex = '0'+hex;
        result += hex;
      }

      return result.substring(0, digits);
    }

    id() {
      let digits = '';
      if (this.alea) {
        for (var i = 0; i < 17; i++) {
          digits += UNMISTAKABLE_CHARS[Math.floor(this.alea() * UNMISTAKABLE_CHARS_LEN)];
        }
        return digits;
      }

      if (isServer) {
        var bytes = nodeCrypto.randomBytes(17);
      } else {
        var bytes = new Uint8Array(17);
        window.crypto.getRandomValues(bytes);
      }
      for (var i = 0; i < 17; i++) {
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

  // client sources
  const height = (typeof window !== 'undefined' && window.innerHeight) ||
        (typeof document !== 'undefined'
         && document.documentElement
         && document.documentElement.clientHeight) ||
        (typeof document !== 'undefined'
         && document.body
         && document.body.clientHeight) ||
        1;

  const width = (typeof window !== 'undefined' && window.innerWidth) ||
        (typeof document !== 'undefined'
         && document.documentElement
         && document.documentElement.clientWidth) ||
        (typeof document !== 'undefined'
         && document.body
         && document.body.clientWidth) ||
        1;

  const agent = (typeof navigator !== 'undefined' && navigator.userAgent) || "";

  const Random = (isServer ||
                  (typeof window !== "undefined" &&
                   window.crypto && window.crypto.getRandomValues)) ?
          new RandomGenerator() :
          new RandomGenerator([new Date(), height, width, agent, Math.random()]);

  Random.create = function (...args) {
    return new RandomGenerator(args);
  };

  return Random;
});
