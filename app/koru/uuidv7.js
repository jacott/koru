define((require, exports, module) => {
  'use strict';
  const UtilBase        = require('koru/util-base');

  const CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz~';

  const {inspect$, equal$} = require('koru/symbols');

  let lastMs = 0;
  let counter = 0;

  const charToU6 = (c) =>
    (c === 45) ? 0 : (c < 58) ? c - 47 : (c < 91) ? c - 54 : (c === 126) ? 63 : c - 60;

  class Uuidv7 {
    #low = 0n;
    #high = 0n;
    static CHARS = CHARS;

    constructor(low, high) {
      this.#low = low;
      this.#high = high;
    }

    static nullId() {
      return new this(0n, 0n);
    }

    static random() {
      const now = performance.now() + performance.timeOrigin;
      const ms = Math.floor(now);

      const microFraction = now - ms;
      let randA = Math.floor((now - ms) * 4096) & ~0x7d0; // leave room for counter

      // 2. Handle Monotonicity/Counter
      if (ms === lastMs && randA <= counter) {
        // If we are in the same tick, increment the counter
        counter++;
        randA = counter;
      } else {
        // Reset counter for new millisecond/microsecond tick
        lastMs = ms;
        counter = randA;
      }

      const array = new BigUint64Array(1);
      globalThis.crypto.getRandomValues(array);

      return new this(
        (2n << 62n) | (array[0] & 0x3FFFFFFFFFFFFFFFn),
        (BigInt(ms) << 16n) | (7n << 12n) | BigInt(randA & 0xFFF),
      );
    }

    static fromTimeRand(time, rand) {
      const ms = Math.floor(time);
      let randA = Math.floor((time - ms) * 4096);
      return new this(
        (2n << 62n) | (rand & 0x3FFFFFFFFFFFFFFFn),
        (BigInt(ms) << 16n) | (7n << 12n) | BigInt(randA & 0xFFF),
      );
    }

    static charToU6 = charToU6;

    static fromString(str) {
      let w0 = 0, w1 = 0, w2 = 0, w3 = 0;

      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        const b = charToU6(c);

        // Shift left by 6 bits to make room for 'b'
        w0 = ((w0 << 6) | (w1 >>> 26)) >>> 0;
        w1 = ((w1 << 6) | (w2 >>> 26)) >>> 0;
        w2 = ((w2 << 6) | (w3 >>> 26)) >>> 0;
        w3 = ((w3 << 6) | b) >>> 0;
      }

      // 3. REALIGNMENT: 22 chars shifted in 132 bits.
      // We must shift the entire 128-bit result RIGHT by 4 bits.
      const rw3 = ((w3 >>> 4) | (w2 << 28)) >>> 0;
      const rw2 = ((w2 >>> 4) | (w1 << 28)) >>> 0;
      const rw1 = ((w1 >>> 4) | (w0 << 28)) >>> 0;
      const rw0 = (w0 >>> 4) >>> 0;

      return new this((BigInt(rw2) << 32n) | BigInt(rw3), (BigInt(rw0) << 32n) | BigInt(rw1));
    }

    [inspect$]() {
      return `Uuidv7(${this.toString()})`;
    }

    equals(other) {
      return (other instanceof Uuidv7) && this.#high == other.#high && this.#low == other.#low;
    }

    clone() {
      return new this.constructor(this.#low, this.#high);
    }

    toString() {
      // 1. Split into four 32-bit unsigned words
      let w0 = Number(this.#high >> 32n) >>> 0;
      let w1 = Number(this.#high & 0xFFFFFFFFn) >>> 0;
      let w2 = Number(this.#low >> 32n) >>> 0;
      let w3 = Number(this.#low & 0xFFFFFFFFn) >>> 0;

      let ans = '';
      // 2. Process 22 characters (132 bits worth of capacity)
      for (let i = 0; i < 22; i++) {
        // Grab the top 6 bits of the 128-bit block
        ans += CHARS[w0 >>> 26];

        // Shift the entire 128-bit block left by 6 bits
        w0 = ((w0 << 6) | (w1 >>> 26)) >>> 0;
        w1 = ((w1 << 6) | (w2 >>> 26)) >>> 0;
        w2 = ((w2 << 6) | (w3 >>> 26)) >>> 0;
        w3 = (w3 << 6) >>> 0;
      }
      return ans;
    }

    toBigInt() {
      return this.#high * (1n << 64n) + this.#low;
    }

    static read(dv, offset) {
      return new this(dv.getBigUint64(offset, true), dv.getBigUint64(offset + 8, true));
    }

    write(dv, offset) {
      dv.setBigUint64(offset, this.#low, true);
      dv.setBigUint64(offset + 8, this.#high, true);
    }

    getHigh() {
      return this.#high;
    }

    getLow() {
      return this.#low;
    }

    toMsFrac() {
      return Number(this.#high >> 16n) + Number(this.#high & 0xfffn) / 4096;
    }

    toMs() {
      return Number(this.#high >> 16n);
    }

    toHex() {
      return this.#high.toString(16).padStart(16, '0') + this.#low.toString(16).padStart(16, '0');
    }

    timeAsFloat() {
      const ms = this.#high >> 16n;

      const randA = this.#high & 0xFFFn;
      return Number(ms) + (Number(randA) / 4096);
    }
  }

  Uuidv7.prototype[equal$] = Uuidv7.prototype.equals;

  return Uuidv7;
});
