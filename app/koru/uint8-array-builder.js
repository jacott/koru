define((require, exports, module) => {
  'use strict';

  const length$ = Symbol(), dataView$ = Symbol(), buffer$ = Symbol();

  const resizeBuffer = (from, newSize) => {
    const u8 = new Uint8Array(newSize);
    u8.set(from, 0);
    return u8;
  };

  const EMPTY_U8 = new Uint8Array(0);

  class Uint8ArrayBuilder {
    constructor(initialCapacity=4) {
      this[length$] = 0;
      this.initialCapacity = initialCapacity;
      this[buffer$] = void 0;
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

    get dataView() {
      return this[dataView$] ??= new DataView(this[buffer$].buffer);
    }

    decouple() {
      this[buffer$] = this[dataView$] = void 0;
      this[length$] = 0;
    }

    set(index, byte) {
      const length = this[length$];
      if (index >= length) this.grow(1 + index - length);
      this[buffer$][index] = byte;
    }

    get(index) {
      if (index >= this[length$] || index < 0) throw new Error('Invalid index');
      return this[buffer$][index];
    }

    grow(n, cap=n) {
      assert(cap >= n, 'cap < n');
      const curLen = this[length$];
      if (curLen === 0) {
        this[length$] = n;
        this[buffer$] = new Uint8Array(Math.max(this.initialCapacity, cap << 1));

        return;
      }
      let u8 = this[buffer$];

      const newLength = n + curLen;
      if (curLen + cap > u8.length) {
        this[buffer$] = resizeBuffer(u8, (curLen + cap) << 1);
        this[dataView$] = void 0;
      }
      this[length$] = newLength;
    }

    append(data) {
      const length = this[length$];
      this.grow(data.length);
      this[buffer$].set(data, length);
    }

    push(...bytes) {this.append(bytes)}

    subarray(spos=0, epos=this.length) {return this[buffer$]?.subarray(spos, epos) ?? EMPTY_U8}
  }

  return Uint8ArrayBuilder;
});
