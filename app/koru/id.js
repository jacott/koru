define((require) => {
  'use strict';
  const Uuidv7          = require('koru/uuidv7');

  const {inspect$, equal$} = require('koru/symbols');

  const OLD_MAX_TIME = 1125620665794299n;

  const b64 = new BigUint64Array(2);
  const u8 = new Uint8Array(b64.buffer);

  const {CHARS, charToU6} = Uuidv7;

  const MAX_ITEMS = 3;
  const SHARED_BUFFER = new ArrayBuffer(MAX_ITEMS * 16);
  const SHARED_U64 = new BigUint64Array(SHARED_BUFFER);
  const SHARED_U32 = new Uint32Array(SHARED_BUFFER);

  /**
   * Hashes a list of 64-bit number pairs into a single 64-bit pair.
   * Designed for maximum speed and zero memory allocation in the inner loop.
   *
   * @param {BigUint64Array | Array<[bigint, bigint]>} inputPairs - The list of pairs.
   * @returns {[bigint, bigint]} A pair of 64-bit BigInts representing the final 128-bit hash.
   */
  const hash64BitPairs = () => {
    // MurmurHash3 128-bit internal state (4 x 32-bit registers)
    let h1 = 0x12345678;
    let h2 = 0x23456789;
    let h3 = 0x3456789a;
    let h4 = 0x456789ab;

    const c1 = 0x239b961b;
    const c2 = 0xab0e9789;
    const c3 = 0x38b34ae5;
    const c4 = 0xa1e38b93;

    const len = SHARED_U32.length;

    // Process 4 x 32-bit numbers (one 64-bit pair) per step
    for (let i = 0; i < len; i += 4) {
      let k1 = SHARED_U32[i];
      let k2 = SHARED_U32[i + 1];
      let k3 = SHARED_U32[i + 2];
      let k4 = SHARED_U32[i + 3];

      // Mix k1 into h1
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h1 ^= k1;
      h1 = (h1 << 19) | (h1 >>> 13);
      h1 = (h1 + h2) | 0;
      h1 = (Math.imul(h1, 5) + 0x561ccd1b) | 0;

      // Mix k2 into h2
      k2 = Math.imul(k2, c2);
      k2 = (k2 << 16) | (k2 >>> 16);
      k2 = Math.imul(k2, c3);
      h2 ^= k2;
      h2 = (h2 << 17) | (h2 >>> 15);
      h2 = (h2 + h3) | 0;
      h2 = (Math.imul(h2, 5) + 0x0bcaa747) | 0;

      // Mix k3 into h3
      k3 = Math.imul(k3, c3);
      k3 = (k3 << 17) | (k3 >>> 15);
      k3 = Math.imul(k3, c4);
      h3 ^= k3;
      h3 = (h3 << 15) | (h3 >>> 17);
      h3 = (h3 + h4) | 0;
      h3 = (Math.imul(h3, 5) + 0x96cd1c35) | 0;

      // Mix k4 into h4
      k4 = Math.imul(k4, c4);
      k4 = (k4 << 18) | (k4 >>> 14);
      k4 = Math.imul(k4, c1);
      h4 ^= k4;
      h4 = (h4 << 13) | (h4 >>> 19);
      h4 = (h4 + h1) | 0;
      h4 = (Math.imul(h4, 5) + 0x32ac3b17) | 0;
    }

    h1 = (h1 + h2) | 0;
    h1 = (h1 + h3) | 0;
    h1 = (h1 + h4) | 0;
    h2 = (h2 + h1) | 0;
    h3 = (h3 + h1) | 0;
    h4 = (h4 + h1) | 0;

    // Finalization avalanche mix (ensures high quality bit distribution)
    h1 ^= h1 >>> 16;
    h1 = Math.imul(h1, 0x85ebca6b);
    h1 ^= h1 >>> 13;
    h1 = Math.imul(h1, 0xc2b2ae35);
    h1 ^= h1 >>> 16;
    h2 ^= h2 >>> 16;
    h2 = Math.imul(h2, 0x85ebca6b);
    h2 ^= h2 >>> 13;
    h2 = Math.imul(h2, 0xc2b2ae35);
    h2 ^= h2 >>> 16;
    h3 ^= h3 >>> 16;
    h3 = Math.imul(h3, 0x85ebca6b);
    h3 ^= h3 >>> 13;
    h3 = Math.imul(h3, 0xc2b2ae35);
    h3 ^= h3 >>> 16;
    h4 ^= h4 >>> 16;
    h4 = Math.imul(h4, 0x85ebca6b);
    h4 ^= h4 >>> 13;
    h4 = Math.imul(h4, 0xc2b2ae35);
    h4 ^= h4 >>> 16;

    h1 = (h1 + h2) | 0;
    h1 = (h1 + h3) | 0;
    h1 = (h1 + h4) | 0;
    h2 = (h2 + h1) | 0;
    h3 = (h3 + h1) | 0;
    h4 = (h4 + h1) | 0;

    SHARED_U32[0] = h1;
    SHARED_U32[1] = h2;
    SHARED_U32[2] = h3;
    SHARED_U32[3] = h4;
  };

  const packV1IdInto = (strId, targetU32, startIndex) => {
    let r0 = 63; // Lowest 32 bits
    let r1 = 0;
    let r2 = 0;
    let r3 = 0; // Highest 32 bits

    for (let i = 0; i < strId.length; i++) {
      r3 = (r3 << 6) | (r2 >>> 26) & 0x3F;
      r2 = (r2 << 6) | (r1 >>> 26) & 0x3F;
      r1 = (r1 << 6) | (r0 >>> 26) & 0x3F;
      r0 = (r0 << 6) | charToU6(strId.charCodeAt(i)) & 0x3F;
    }

    targetU32[startIndex] = r0;
    targetU32[startIndex + 1] = r1;
    targetU32[startIndex + 2] = r2;
    targetU32[startIndex + 3] = r3;
  };

  const fastEncode128BitB64 = (h1, h2, h3, h4, len) => {
    const s17 = CHARS[h1 & 0x3F] +
      CHARS[h2 >>> 26] +
      CHARS[(h2 >>> 20) & 0x3F] +
      CHARS[(h2 >>> 14) & 0x3F] +
      CHARS[(h2 >>> 8) & 0x3F] +
      CHARS[(h2 >>> 2) & 0x3F] +
      CHARS[((h2 & 0x03) << 4) | (h3 >>> 28)] +
      CHARS[(h3 >>> 22) & 0x3F] +
      CHARS[(h3 >>> 16) & 0x3F] +
      CHARS[(h3 >>> 10) & 0x3F] +
      CHARS[(h3 >>> 4) & 0x3F] +
      CHARS[((h3 & 0x0F) << 2) | (h4 >>> 30)] +
      CHARS[(h4 >>> 24) & 0x3F] +
      CHARS[(h4 >>> 18) & 0x3F] +
      CHARS[(h4 >>> 12) & 0x3F] +
      CHARS[(h4 >>> 6) & 0x3F] +
      CHARS[h4 & 0x3F];

    if (len === 17) {
      return s17;
    }

    if (len < 17) {
      return s17.slice(-len);
    }

    const s5 = CHARS[h1 >>> 30] +
      CHARS[(h1 >>> 24) & 0x3F] +
      CHARS[(h1 >>> 18) & 0x3F] +
      CHARS[(h1 >>> 12) & 0x3F] +
      CHARS[(h1 >>> 6) & 0x3F];

    return (len < 22 ? s5.slice(17 - len) : s5) + s17;
  };

  class Id extends Uuidv7 {
    static fromUuidV7(v7) {
      const id = new Id(v7.getLow(), v7.getHigh());
      return id;
    }

    static read(dv, offset) {
      return Id.fromUuidV7(Uuidv7.read(dv, offset));
    }

    static v1ToU64(v1id) {
      packV1IdInto(v1id, SHARED_U32, 0);
      return [SHARED_U64[0], SHARED_U64[1]];
    }

    static u64ToV1(lo, hi) {
      SHARED_U64[0] = lo;
      SHARED_U64[1] = hi;
      const str = fastEncode128BitB64(
        SHARED_U32[3],
        SHARED_U32[2],
        SHARED_U32[1],
        SHARED_U32[0],
        17,
      );
      const len = str.length;
      for (let i = 0; i < len; i++) {
        const code = str.charCodeAt(i);
        if (code !== 45) {
          return str.slice(code === 126 ? i + 1 : i);
        }
      }
      return '';
    }

    static fromV1(v1id) {
      if (v1id == null || v1id.length == 0) {
        return Id.nullId();
      }

      assert(v1id.length <= 18, {toString: () => v1id.length});
      packV1IdInto(v1id, SHARED_U32, 0);
      return new Id(SHARED_U64[0], SHARED_U64[1]);
    }

    toBase64(len) {
      SHARED_U64[0] = this.getLow();
      SHARED_U64[1] = this.getHigh();
      return fastEncode128BitB64(SHARED_U32[3], SHARED_U32[2], SHARED_U32[1], SHARED_U32[0], len);
    }

    static v1HashStrings(items) {
      const len = items.length;
      let i;

      for (i = 0; i < MAX_ITEMS; ++i) {
        if (i < len) {
          packV1IdInto(items[i], SHARED_U32, i << 2);
        } else {
          for (i = i << 2; i < SHARED_U32.length; ++i) {
            SHARED_U32[i] = 0;
          }
        }
      }
      hash64BitPairs();
      while (i < len) {
        i -= 1;
        // Start j at 1 so that the current hash is preserved
        for (let j = 1; j < MAX_ITEMS && i + j < len; ++j) {
          packV1IdInto(items[i + j], SHARED_U32, j << 2);
        }

        i += MAX_ITEMS;

        hash64BitPairs(); // add to current hash
      }

      return fastEncode128BitB64(SHARED_U32[0], SHARED_U32[1], SHARED_U32[2], SHARED_U32[3], 17);
    }

    [inspect$]() {
      return `Id(${this.toString()})`;
    }

    equals(other) {
      return (other instanceof Id) && super.equals(other);
    }

    toString() {
      const high64 = this.getHigh();
      if (high64 <= OLD_MAX_TIME) {
        return Id.u64ToV1(this.getLow(), high64);
      }

      return super.toString();
    }
  }

  Id.prototype[equal$] = Id.prototype.equals;

  return Id;
});
