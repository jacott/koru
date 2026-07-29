define((require) => {
  'use strict';
  const Id              = require('koru/id');
  const util            = require('koru/util');

  const toFrac = Math.pow(2, -32);

  const prng = (seedArray) => {
    let seq = Id.fromHashStrings(seedArray.join('').match(/[\s\S]{1,17}/g) ?? []).asSequence();
    return () => seq.next();
  };

  const to53Frac = Math.pow(2, -53);

  function uint64ToFraction(u64) {
    // Shift off lower 11 bits -> top 53 bits -> divide by 2^53
    return Number(u64 >> 11n) * to53Frac;
  }

  const ab4 = new ArrayBuffer(4);
  const u32 = new Uint32Array(ab4);

  class Random {
    constructor(...tokens) {
      this._seq = tokens.length == 0 ? undefined : prng(tokens);
    }

    fraction() {
      if (this._seq !== undefined) {
        return uint64ToFraction(this._seq().getLow());
      }
      globalThis.crypto.getRandomValues(u32);
      return u32[0] * toFrac;
    }

    hexString(digits) {
      const result = (this._seq === undefined ? Id.random() : this._seq()).hexString(
        (digits + 1) >> 1,
      );
      return result.length == digits ? result : result.slice(0, digits);
    }

    id() {
      return (this._seq === undefined ? Id.random() : this._seq()).toBase64(17);
    }
  }

  const random = new Random();
  Random.global = random;
  Random.id = () => (util.thread.random ?? random).id();
  Random.hexString = (value) => (util.thread.random ?? random).hexString(value);

  return Random;
});
