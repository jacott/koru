define((require, exports, module) => {
  'use strict';
  const util            = require('koru/util');
  const Uuidv7          = require('koru/uuidv7');

  const {inspect$, equal$} = require('koru/symbols');

  const OLD_MAX_TIME = 17587822903035n;

  const b64 = new BigUint64Array(2);
  const u8 = new Uint8Array(b64.buffer);

  const {CHARS, charToU6} = Uuidv7;

  function packV1Id(strId) {
    let hi = 0n;
    let lo = 63n;

    for (let i = 0; i < strId.length; i++) {
      const code = charToU6(strId.charCodeAt(i));

      // Manual 128-bit left shift by 6: (res << 6) | code
      // 1. Move the top 6 bits of lo into hi
      // 2. Shift both, then mask lo to 64-bit
      const carry = lo >> 58n;
      hi = ((hi << 6n) | carry) & 0xFFFFFFFFFFFFFFFFn;
      lo = ((lo << 6n) | BigInt(code)) & 0xFFFFFFFFFFFFFFFFn;
    }

    return [lo, hi];
  }

  function unpackV1Id(lo, hi) {
    const TERM = 63n;
    let id = '';

    // 16 * 6 = 96 total bits of potential content plus the initial 63.
    // Since our total "u128" is 128 bits, we calculate global shift.
    let shift = 96;
    let code = 0n;

    // Helper to get 6 bits from the 128-bit structure at a specific bit offset
    const getCode = (s) => {
      if (s >= 64) {
        return (hi >> BigInt(s - 64)) & 0x3Fn;
      } else if (s > 58) {
        // Spans across the hi/lo boundary
        const partHi = (hi << BigInt(64 - s)) & 0x3Fn;
        const partLo = lo >> BigInt(s);
        return (partHi | partLo) & 0x3Fn;
      } else {
        return (lo >> BigInt(s)) & 0x3Fn;
      }
    };

    // First loop: find the start
    while (shift !== 0 && code === 0n) {
      code = getCode(shift);

      if (code !== 0n) {
        if (code !== TERM) {
          id += CHARS[Number(code)];
        }
        break;
      }
      shift -= 6;
    }

    // Second loop: consume remaining characters
    while (shift !== 0) {
      shift -= 6;
      code = getCode(shift);
      if (code === TERM) {
        return id;
      }
      id += CHARS[Number(code)];
    }

    return id;
  }

  class Id extends Uuidv7 {
    static fromUuidV7(v7) {
      const id = new Id(v7.getLow(), v7.getHigh());
      return id;
    }

    static read(dv, offset) {
      return Id.fromUuidV7(Uuidv7.read(dv, offset));
    }

    static fromV1(v1id) {
      if (v1id == null || v1id.length == 0) {
        return Id.nullId();
      }

      assert(v1id.length <= 17, {toString: () => v1id.length});
      return Id.fromUuidV7(new Uuidv7(...packV1Id(v1id)));
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
        return unpackV1Id(this.getLow(), high64);
      }

      return super.toString();
    }
  }

  Id.prototype[equal$] = Id.prototype.equals;

  return Id;
});
