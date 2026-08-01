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

  const validLow = (w) => (2n << 62n) | (w & 0x3FFFFFFFFFFFFFFFn);
  const validHigh = (w) => (w & ~0xF000n) | 0x7000n;

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
      return new this(validLow(rand), (BigInt(ms) << 16n) | 0x7000n | BigInt(randA & 0xFFF));
    }

    static charToU6 = charToU6;

    static fromString(str) {
      // Handle canonical UUID formats (36-char hyphenated, 32-char hex, or URN prefixed)
      if (
        str.length >= 32 && (str.length === 36 || str.length === 32 || str.startsWith('urn:uuid:'))
      ) {
        const hex = str.length === 45 ? str.slice(9).replace(/-/g, '') : str.replace(/-/g, '');
        return new this(
          validLow(BigInt('0x' + hex.slice(16, 32))),
          validHigh(BigInt('0x' + hex.slice(0, 16))),
        );
      }

      if (str.length < 22) {
        str = str.padStart(22, '-');
      }

      // 22-character Base64 parsing (zero closure allocations)
      const c0 = charToU6(str.charCodeAt(0));
      const c1 = charToU6(str.charCodeAt(1));
      const c2 = charToU6(str.charCodeAt(2));
      const c3 = charToU6(str.charCodeAt(3));
      const c4 = charToU6(str.charCodeAt(4));
      const c5 = charToU6(str.charCodeAt(5));
      const c6 = charToU6(str.charCodeAt(6));
      const c7 = charToU6(str.charCodeAt(7));
      const c8 = charToU6(str.charCodeAt(8));
      const c9 = charToU6(str.charCodeAt(9));
      const c10 = charToU6(str.charCodeAt(10));
      const c11 = charToU6(str.charCodeAt(11));
      const c12 = charToU6(str.charCodeAt(12));
      const c13 = charToU6(str.charCodeAt(13));
      const c14 = charToU6(str.charCodeAt(14));
      const c15 = charToU6(str.charCodeAt(15));
      const c16 = charToU6(str.charCodeAt(16));
      const c17 = charToU6(str.charCodeAt(17));
      const c18 = charToU6(str.charCodeAt(18));
      const c19 = charToU6(str.charCodeAt(19));
      const c20 = charToU6(str.charCodeAt(20));
      const c21 = charToU6(str.charCodeAt(21));

      ARRAY_U32[3] = ((c0 << 26) | (c1 << 20) | (c2 << 14) | (c3 << 8) | (c4 << 2) | (c5 >>> 4)) >>>
        0;
      ARRAY_U32[2] =
        (((c5 & 0x0F) << 28) | (c6 << 22) | (c7 << 16) | (c8 << 10) | (c9 << 4) | (c10 >>> 2)) >>>
        0;
      ARRAY_U32[1] =
        (((c10 & 0x03) << 30) | (c11 << 24) | (c12 << 18) | (c13 << 12) | (c14 << 6) | c15) >>> 0;
      ARRAY_U32[0] =
        ((c16 << 26) | (c17 << 20) | (c18 << 14) | (c19 << 8) | (c20 << 2) | (c21 >>> 4)) >>> 0;

      return new this(validLow(ARRAY_U64[0]), validHigh(ARRAY_U64[1]));
    }

    [inspect$]() {
      return `Uuidv7(${this.toString()})`;
    }

    set(lo, hi) {
      this.#low = lo;
      this.#high = hi;
    }

    setValid(lo, hi) {
      this.#low = validLow(lo);
      this.#high = validHigh(hi);
    }

    enforceValid() {
      this.#low = validLow(this.#low);
      this.#high = validHigh(this.#high);
      return this;
    }

    equals(other) {
      return (other instanceof Uuidv7) && this.#high == other.#high && this.#low == other.#low;
    }

    clone() {
      return new this.constructor(this.#low, this.#high);
    }

    toString() {
      ARRAY_U64[1] = this.#high;
      ARRAY_U64[0] = this.#low;

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

    urn() {
      const l = this.#low.toString(16).padStart(16, '0');
      const h = this.#high.toString(16).padStart(16, '0');
      return 'urn:uuid:' + h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12) + '-' +
        l.slice(0, 4) + '-' + l.slice(4);
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
