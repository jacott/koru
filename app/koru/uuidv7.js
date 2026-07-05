define((require, exports, module) => {
  'use strict';
  const UtilBase        = require('koru/util-base');

  const CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz~';

  const {inspect$, equal$} = require('koru/symbols');

  let lastMs = 0;
  let counter = 0;

  const charToU6 = (c) =>
    (c === 45) ? 0 : (c < 58) ? c - 47 : (c < 91) ? c - 54 : (c === 126) ? 63 : c - 60;

  const ARRAY_BUF = new ArrayBuffer(16);
  const ARRAY_U64 = new BigUint64Array(ARRAY_BUF);
  const ARRAY_U32 = new Uint32Array(ARRAY_BUF);
  const RND_BUF = ARRAY_U64.subarray(0, 1);

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

      globalThis.crypto.getRandomValues(RND_BUF);

      return new this(
        (2n << 62n) | (RND_BUF[0] & 0x3FFFFFFFFFFFFFFFn),
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
        // Shift left by 6 bits to make room for 'b'
        w0 = ((w0 << 6) | (w1 >>> 26)) >>> 0;
        w1 = ((w1 << 6) | (w2 >>> 26)) >>> 0;
        w2 = ((w2 << 6) | (w3 >>> 26)) >>> 0;
        w3 = ((w3 << 6) | charToU6(str.charCodeAt(i))) >>> 0;
      }

      return new this(
        (BigInt(((w2 >>> 4) | (w1 << 28)) >>> 0) << 32n) | BigInt(((w3 >>> 4) | (w2 << 28)) >>> 0),
        (BigInt((w0 >>> 4) >>> 0) << 32n) | BigInt(((w1 >>> 4) | (w0 << 28)) >>> 0),
      );
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

    // Inside your UUIDv7 class:
    toString() {
      // 2. Cast the BigInts straight to the shared buffer slots.
      // This extracts the 32-bit components instantly with ZERO memory allocations.
      ARRAY_U64[1] = this.#high;
      ARRAY_U64[0] = this.#low;

      // Map the buffer addresses straight to CPU registers (assuming Little-Endian system layout)
      const w0 = ARRAY_U32[3]; // Upper 32 bits of high
      const w1 = ARRAY_U32[2]; // Lower 32 bits of high
      const w2 = ARRAY_U32[1]; // Upper 32 bits of low
      const w3 = ARRAY_U32[0]; // Lower 32 bits of low

      // 3. Fully unrolled 22-character extraction map.
      // Performs flat, absolute bit lookups and joins them in a single JIT pass.
      return (
        CHARS[(w0 >>> 26) & 0x3F] +
        CHARS[(w0 >>> 20) & 0x3F] +
        CHARS[(w0 >>> 14) & 0x3F] +
        CHARS[(w0 >>> 8) & 0x3F] +
        CHARS[(w0 >>> 2) & 0x3F] +
        CHARS[((w0 & 0x03) << 4) | (w1 >>> 28)] +
        CHARS[(w1 >>> 22) & 0x3F] +
        CHARS[(w1 >>> 16) & 0x3F] +
        CHARS[(w1 >>> 10) & 0x3F] +
        CHARS[(w1 >>> 4) & 0x3F] +
        CHARS[((w1 & 0x0F) << 2) | (w2 >>> 30)] +
        CHARS[(w2 >>> 24) & 0x3F] +
        CHARS[(w2 >>> 18) & 0x3F] +
        CHARS[(w2 >>> 12) & 0x3F] +
        CHARS[(w2 >>> 6) & 0x3F] +
        CHARS[w2 & 0x3F] +
        CHARS[(w3 >>> 26) & 0x3F] +
        CHARS[(w3 >>> 20) & 0x3F] +
        CHARS[(w3 >>> 14) & 0x3F] +
        CHARS[(w3 >>> 8) & 0x3F] +
        CHARS[(w3 >>> 2) & 0x3F] +
        CHARS[(w3 & 0x03) << 4] // The remaining 2 bits padded with trailing zeros
      );
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
