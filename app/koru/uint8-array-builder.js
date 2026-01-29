define((require, exports, module) => {
  'use strict';

  const length$ = Symbol(), lw$ = Symbol(), dataView$ = Symbol(), buffer$ = Symbol();

  const newArray = isServer ? (size) => Buffer.allocUnsafe(size) : (size) => new Uint8Array(size);

  const resizeBuffer = (from, newSize) => {
    const u8 = newArray(newSize);
    u8.set(from, 0);
    return u8;
  };

  const EMPTY_U8 = newArray(0);

  const growTo = (b, grow, fill, cap = 0) => {
    let curLen = b[length$];
    const newLen = grow + fill;
    if (newLen > curLen) {
      if (curLen === 0) {
        b[buffer$] = newArray(Math.max(b.initialCapacity, (newLen + cap) << 1));
      } else {
        let u8 = b[buffer$];

        if (newLen + cap > u8.length) {
          const nb = b[buffer$] = resizeBuffer(u8, (newLen + cap) << 1);
          b[dataView$] = undefined;
        }
      }
      curLen = b[length$] = newLen;
    }
    let lw = b[lw$];
    if (lw < grow) {
      const u8 = b[buffer$];
      do {
        u8[lw++] = 0;
      } while (lw < grow);
      b[lw$] = Math.max(lw, grow + fill);
    } else if (lw < grow + fill) {
      b[lw$] = grow + fill;
    }
    return curLen;
  };

  const updateLw = (b, n) => {
    if (b[lw$] < n) b[lw$] = n;
  };

  let writeUtf8,
    writeInt8,
    writeInt16BE,
    writeUInt32BE,
    writeInt32BE,
    writeBigInt64BE,
    writeFloatBE,
    writeDoubleBE;
  if (isServer) {
    writeUtf8 = (b, str, i, maxLen) => b.write(str, i, maxLen);
    writeInt8 = (b, v, o) => b[buffer$].writeInt8(v, o);
    writeInt16BE = (b, v, o) => b[buffer$].writeInt16BE(v, o);
    writeUInt32BE = (b, v, o) => b[buffer$].writeUInt32BE(v, o);
    writeInt32BE = (b, v, o) => b[buffer$].writeInt32BE(v, o);
    writeBigInt64BE = (b, v, o) => b[buffer$].writeBigInt64BE(v, o);
    writeFloatBE = (b, v, o) => b[buffer$].writeFloatBE(v, o);
    writeDoubleBE = (b, v, o) => b[buffer$].writeDoubleBE(v, o);
  } else {
    const encoder = new globalThis.TextEncoder();
    writeUtf8 = (b, str, i, maxLen) => encoder.encodeInto(str, b.subarray(i, i + maxLen)).written;
    writeInt8 = (b, v, o) => b.dataView.setInt8(o, v);
    writeInt16BE = (b, v, o) => b.dataView.setInt16(o, v);
    writeUInt32BE = (b, v, o) => b.dataView.setInt32(o, v);
    writeInt32BE = (b, v, o) => b.dataView.setInt32(o, v);
    writeBigInt64BE = (b, v, o) => b.dataView.setBigInt64(o, v);
    writeFloatBE = (b, v, o) => b.dataView.setFloat32(o, v);
    writeDoubleBE = (b, v, o) => b.dataView.setFloat64(o, v);
  }

  class Uint8ArrayBuilder {
    constructor(initialCapacity = 4) {
      this.initialCapacity = initialCapacity;
      this[length$] = 0;
      this[lw$] = 0;
      this[buffer$] = undefined;
    }

    get length() {
      return this[length$];
    }
    set length(v) {
      if (v < 0 || v !== Math.floor(v) || v > this[length$]) {
        throw new Error('Invalid length! ' + v + ' > ' + this[length$]);
      }

      this[length$] = v;
      if (this[lw$] > v) this[lw$] = v;
    }

    get dataView() {
      return this[dataView$] ??= new DataView(this[buffer$].buffer, this[buffer$].byteOffset);
    }

    get currentCapacity() {
      return this[buffer$].length;
    }

    decouple() {
      this[buffer$] = this[dataView$] = undefined;
      this[length$] = this[lw$] = 0;
    }

    set(index, byte) {
      growTo(this, index, 1);
      this[buffer$][index] = byte;
    }

    writeInt8(v, offset = this.length) {
      growTo(this, offset, 1);
      writeInt8(this, v, offset);
    }
    writeInt16BE(v, offset = this.length) {
      growTo(this, offset, 2);
      writeInt16BE(this, v, offset);
    }
    writeUInt32BE(v, offset = this.length) {
      growTo(this, offset, 4);
      writeUInt32BE(this, v, offset);
    }
    writeInt32BE(v, offset = this.length) {
      growTo(this, offset, 4);
      writeInt32BE(this, v, offset);
    }
    writeBigInt64BE(v, offset = this.length) {
      growTo(this, offset, 8);
      writeBigInt64BE(this, v, offset);
    }

    writeFloatBE(v, offset = this.length) {
      growTo(this, offset, 4);
      writeFloatBE(this, v, offset);
    }
    writeDoubleBE(v, offset = this.length) {
      growTo(this, offset, 8);
      writeDoubleBE(this, v, offset);
    }

    appendByte(byte) {
      const length = this[length$];
      growTo(this, length, 1);
      this[buffer$][length] = byte;
      return this;
    }

    get(index) {
      if (index >= this[length$] || index < 0) throw new Error('Invalid index');
      return this[buffer$][index];
    }

    grow(n, cap = 0) {
      assert(n >= 0 && cap >= 0, 'cap or n < 0');
      const curLen = this[length$];
      growTo(this, this[length$] + n, 0, cap);
      return this;
    }

    append(data) {
      if (data.length == 0) return this;
      const length = this[length$];
      growTo(this, data.length, length);
      this[buffer$].set(data, length);
      return this;
    }

    setArray(data, offset = 0) {
      growTo(this, data.length + offset - this[length$], this[length$]);
      this[buffer$].set(data, offset);
      return this;
    }

    appendUtf8Str(str) {
      if (str === '') return;
      const length = this[length$];
      const newLen = growTo(this, this[length$] + str.length, 0 * str.length >> 1);
      let b = this[buffer$];
      while (true) {
        const maxLen = b.length - length;
        const actual = writeUtf8(b, str, length, maxLen);
        if (actual < maxLen) {
          this[length$] = this[lw$] = length + actual;
          return actual;
        }
        b = resizeBuffer(b, b.length + maxLen);
      }
    }

    push(...bytes) {
      return this.append(bytes);
    }

    subarray(spos = 0, epos = this.length) {
      return this[buffer$]?.subarray(spos, epos) ?? EMPTY_U8;
    }
  }

  if (isServer) {
    Object.defineProperty(Uint8ArrayBuilder.prototype, 'buffer', {
      get() {
        return this[buffer$];
      },
      enumerable: false,
      configurable: true,
    });
  }

  return Uint8ArrayBuilder;
});
