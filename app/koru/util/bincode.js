define((require) => {
  'use strict';
  const Uint8ArrayBuilder = require('koru/uint8-array-builder');

  const length$ = Symbol(), dataView$ = Symbol(), buffer$ = Symbol();

  const strEncoder = new globalThis.TextEncoder();
  const strDecoder = new globalThis.TextDecoder();

  const defaultConfig = {
    littleEndian: true,
    variableIntEncoding: true,
    writeFixedArrayLength: true,
  };

  class Encoder {
    constructor(config={...defaultConfig}) {
      this[buffer$] = new Uint8ArrayBuilder();
      this.isLittleEndian = config.littleEndian;
    }

    uint8Subarray() {return this[buffer$].subarray()}

    boolEncode(n) {
      const buffer = this[buffer$];
      buffer.set(buffer.length, n == 0 ? 0 : 1);
    }

    u8Encode(n) {
      const buffer = this[buffer$];
      buffer.set(buffer.length, n);
    }

    i8Encode(n) {
      const buffer = this[buffer$];
      buffer.set(buffer.length, n < 0 ? 256 + n : n);
    }

    u32Encode(n) {
      const buffer = this[buffer$];
      const index = buffer.length;
      buffer.grow(4);
      buffer.dataView.setUint32(index, n, this.isLittleEndian);
    }

    i32Encode(n) {
      const buffer = this[buffer$];
      const index = buffer.length;
      buffer.grow(4);
      buffer.dataView.setInt32(index, n, this.isLittleEndian);
    }

    f32Encode(n) {
      const buffer = this[buffer$];
      const index = buffer.length;
      buffer.grow(4);
      buffer.dataView.setFloat32(index, n, this.isLittleEndian);
    }

    u64Encode(n) {
      const buffer = this[buffer$];
      const index = buffer.length;
      buffer.grow(8);
      buffer.dataView.setBigUint64(index, BigInt(n), this.isLittleEndian);
    }

    i64Encode(n) {
      const buffer = this[buffer$];
      const index = buffer.length;
      buffer.grow(8);
      buffer.dataView.setBigInt64(index, BigInt(n), this.isLittleEndian);
    }

    f64Encode(n) {
      const buffer = this[buffer$];
      const index = buffer.length;
      buffer.grow(8);
      buffer.dataView.setFloat64(index, n, this.isLittleEndian);
    }

    uintEncode(n) {
      assert(typeof n === 'number'
             ? n >= 0 && Math.floor(n) === n
             : (typeof n === 'bigint' && n < 2n ** 64n), 'value not a uint');

      const buffer = this[buffer$];
      const index = buffer.length;

      if (n < 251) {
        buffer.set(index, n);
        return;
      }

      if (n < 2 ** 16) {
        buffer.grow(3);
        buffer.set(index, 251);
        buffer.dataView.setUint16(index + 1, n, this.isLittleEndian);
        return;
      }

      if (n < 2 ** 32) {
        buffer.grow(5);
        buffer.set(index, 252);
        buffer.dataView.setUint32(index + 1, n, this.isLittleEndian);
        return;
      }

      buffer.grow(9);
      buffer.set(index, 253);
      buffer.dataView.setBigUint64(index + 1, BigInt(n), this.isLittleEndian);
    }

    intEncode(n) {
      if (typeof n === 'number') return this.uintEncode(n < 0 ? -2 * n - 1 : 2 * n);
      return this.uintEncode(n < 0n ? - 2n * n - 1n : 2n * n);
    }

    strEncode(str) {
      this.u64Encode(str.length);
      this[buffer$].append(strEncoder.encode(str));
    }
  }

  class Decoder {
    constructor(u8, config={...defaultConfig}) {
      this[buffer$] = u8;
      this[dataView$] = new DataView(u8.buffer, u8.byteOffset);
      this[length$] = 0;
      this.isLittleEndian = !! config.littleEndian;
    }

    boolDecode() {
      return this[buffer$][this[length$]++] == 1;
    }

    u8Decode() {
      return this[buffer$][this[length$]++];
    }

    i8Decode() {
      const n = this[buffer$][this[length$]++];
      return n > 127 ? n - 256 : n;
    }

    u32Decode() {
      const idx = this[length$] += 4;
      return this[dataView$].getUint32(idx - 4, this.isLittleEndian);
    }

    i32Decode() {
      const idx = this[length$] += 4;
      return this[dataView$].getInt32(idx - 4, this.isLittleEndian);
    }

    f32Decode() {
      const idx = this[length$] += 4;
      return this[dataView$].getFloat32(idx - 4, this.isLittleEndian);
    }

    u64Decode() {
      const idx = this[length$] += 8;
      return this[dataView$].getBigUint64(idx - 8, this.isLittleEndian);
    }

    i64Decode() {
      const idx = this[length$] += 8;
      return this[dataView$].getBigInt64(idx - 8, this.isLittleEndian);
    }

    f64Decode() {
      const idx = this[length$] += 8;
      return this[dataView$].getFloat64(idx - 8, this.isLittleEndian);
    }

    uintDecode() {
      const buffer = this[buffer$];
      let num = buffer[this[length$]++];
      if (num < 251) return num;

      if (num == 251) {
        const idx = this[length$] += 2;
        return this[dataView$].getUint16(idx - 2, this.isLittleEndian);
      }

      if (num == 252) {
        const idx = this[length$] += 4;
        return this[dataView$].getUint32(idx - 4, this.isLittleEndian);
      }

      if (num = 253) {
        const idx = this[length$] += 8;
        return this[dataView$].getBigUint64(idx - 8, this.isLittleEndian);
      }

      throw new Error('Unsupported number data');
    }

    intDecode() {
      const n = this.uintDecode();
      if (typeof n === 'number') return n % 2 == 0 ? n / 2 : (n + 1) / -2;
      return n % 2n == 0n ? n / 2n : (n + 1n) / - 2n;
    }

    strDecode() {
      const len = Number(this.u64Decode());
      const idx = this[length$] += len;
      return strDecoder.decode(this[buffer$].subarray(idx - len, idx));
    }
  }

  return {Decoder, Encoder};
});
