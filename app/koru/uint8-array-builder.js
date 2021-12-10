define((require, exports, module) => {
  'use strict';

  const length$ = Symbol(), buffer$ = Symbol();

  const resize = (from, newSize) => {
    const u8 = new Uint8Array(newSize);
    u8.set(from, 0);
    return u8;
  };

  class Uint8ArrayBuilder {
    constructor(initialCapacity=4) {
      this[length$] = 0;
      this[buffer$] = new Uint8Array(initialCapacity);
    }

    get length() {return this[length$]}
    set length(v) {
      if (v < 0 || v !== Math.floor(v) || v > this[length$]) throw new Error('Invalid length');

      this[length$] = v;

      const u8 = this[buffer$];

      if ((v >> 1) < (u8.length >> 1)) {
        const nu8 = new Uint8Array(v << 1);
        nu8.set(u8.subarray(0, v));
        this[buffer$] = nu8;
      }
    }

    set(index, byte) {
      if (index >= this[length$] || index < 0) throw new Error('Invalid index');
      this[buffer$][index] = byte;
    }

    get(index) {
      if (index >= this[length$] || index < 0) throw new Error('Invalid index');
      return this[buffer$][index];
    }

    append(data) {
      const length = this[length$];
      let u8 = this[buffer$];
      const newLength = data.length + length;
      if (newLength > u8.length) u8 = this[buffer$] = resize(u8, newLength << 1);

      u8.set(data, length);
      this[length$] = newLength;
    }

    push(...bytes) {this.append(bytes)}

    subarray() {return this[buffer$].subarray(0, this[length$])}
  }

  return Uint8ArrayBuilder;
});
