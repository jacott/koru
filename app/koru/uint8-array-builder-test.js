define((require, exports, module) => {
  /**
   * Build an Uint8Array with dynamic sizing.
   */
  'use strict';
  const TH              = require('koru/test');
  const api             = require('koru/test/api');

  const Uint8ArrayBuilder = require('./uint8-array-builder');

  const decoder = new globalThis.TextDecoder();

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('constructor', () => {
      /**
       * Create a Uint8ArrayBuilder
       */
      api.protoProperty('subarray', {info: `The Uint8Array containing appended data`});
      const Uint8ArrayBuilder = api.class();
      //[
      const b1 = new Uint8ArrayBuilder();
      b1.set(0, 1);
      assert.same(b1.initialCapacity, 4);
      assert.same(b1.currentCapacity, 4);
      b1.set(4, 2);

      const b2 = new Uint8ArrayBuilder(2);
      b2.set(0, 1);
      assert.same(b2.initialCapacity, 2);
      assert.same(b2.currentCapacity, 2);
      //]
    });

    test('subarray', () => {
      /**
       * Return the built array. It contains the same `ArrayBuffer` store as the interal `Uint8Array`.
       */
      api.protoMethod();
      //[
      const b1 = new Uint8ArrayBuilder();
      assert.equals(Array.from(b1.subarray()), []);
      assert.same(b1.subarray(), b1.subarray());

      b1.push(1, 2, 3, 4, 5);

      assert.equals(Array.from(b1.subarray()), [1, 2, 3, 4, 5]);
      assert.equals(Array.from(b1.subarray(2, 4)), [3, 4]);

      assert(b1.subarray() instanceof Uint8Array);
      refute.same(b1.subarray(), b1.subarray());
      assert.same(b1.subarray().buffer, b1.subarray().buffer);
      //]

      if (isServer) {
        assert.same(b1.buffer.buffer, b1.subarray().buffer);
      }
    });

    test('dataView', () => {
      /**
       * Use a dataView over the interal ArrayBuffer
       */
      api.protoProperty();
      //[
      const b1 = new Uint8ArrayBuilder();
      b1.push(1, 2, 3, 4, 5);
      assert.equals(b1.dataView.getInt32(0), 16909060);
      assert.equals(b1.dataView.getInt32(1), 33752069);
      assert.equals(b1.dataView.getFloat32(0), 2.387939260590663e-38);
      //]
    });

    test('set', () => {
      /**
       * Set an existing byte in array.
       */
      api.protoMethod();
      //[
      const b1 = new Uint8ArrayBuilder();
      b1.push(1, 2);
      b1.set(1, 3);

      assert.equals(Array.from(b1.subarray()), [1, 3]);

      b1.set(2, 4);
      assert.equals(Array.from(b1.subarray()), [1, 3, 4]);
      //]
    });

    test('get', () => {
      /**
       * get an existing byte in array.
       */
      api.protoMethod();
      //[
      const b1 = new Uint8ArrayBuilder();
      b1.push(1, 2);
      assert.same(b1.get(1), 2);
      //]
    });

    test('length', () => {
      /**
       * The length of `#subarray`. It can only be reduced; increasing throws an error.
       */
      api.protoProperty();
      //[
      const b = new Uint8ArrayBuilder();
      b.push(1, 2, 3, 4, 5);

      assert.same(b.length, 5);

      b.length = 2;

      assert.same(b.length, 2);

      assert.equals(b.subarray(), new Uint8Array([1, 2]));
      //]
    });

    test('grow', () => {
      const b = new Uint8ArrayBuilder();
      b.grow(4);

      assert.equals(b.subarray(), new Uint8Array([0, 0, 0, 0]));
      assert.equals(b.currentCapacity, 8);

      b.grow(4, 9);
      assert.equals(b.subarray(), new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
      assert.equals(b.currentCapacity, 34);
    });

    test('set, push', () => {
      const b1 = new Uint8ArrayBuilder();

      b1.push(1);
      b1.push(2);

      const b2 = new Uint8ArrayBuilder();

      b2.set(0, 1);
      b2.set(1, 2);

      assert.equals(b1, b2);
    });

    test('writeInt8', () => {
      const b = new Uint8ArrayBuilder(0);
      b.appendByte(1);
      b.writeInt8(-1, 3);
      b.appendByte(3);
      assert.equals(b.subarray(), new Uint8Array([1, 0, 0, 255, 3]));
      b.writeInt8(10);
      assert.equals(b.subarray(), new Uint8Array([1, 0, 0, 255, 3, 10]));
    });

    test('writeInt32BE', () => {
      const b = new Uint8ArrayBuilder(0);
      b.appendByte(1);
      b.writeInt32BE(-1, 3);
      b.appendByte(3);
      assert.equals(b.subarray(), new Uint8Array([1, 0, 0, 255, 255, 255, 255, 3]));
      b.writeInt32BE(10);
      assert.equals(b.subarray(), new Uint8Array([1, 0, 0, 255, 255, 255, 255, 3, 0, 0, 0, 10]));
    });

    test('writeUInt32BE', () => {
      const b = new Uint8ArrayBuilder(0);
      b.appendByte(1);
      b.writeUInt32BE(0xfeedface, 3);
      b.appendByte(3);
      assert.equals(b.subarray(), new Uint8Array([1, 0, 0, 0xfe, 0xed, 0xfa, 0xce, 3]));
      b.writeUInt32BE(10);
      assert.equals(
        b.subarray(),
        new Uint8Array([1, 0, 0, 0xfe, 0xed, 0xfa, 0xce, 3, 0, 0, 0, 10]),
      );
    });

    test('writeBigInt64BE', () => {
      const b = new Uint8ArrayBuilder(0);
      b.appendByte(1);
      b.writeBigInt64BE(-1n, 3);
      b.appendByte(3);
      assert.equals(
        b.subarray(),
        new Uint8Array([1, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 3]),
      );
      b.writeBigInt64BE(1n);
      assert.equals(
        b.subarray(),
        new Uint8Array([
          1,
          0,
          0,
          255,
          255,
          255,
          255,
          255,
          255,
          255,
          255,
          3,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          1,
        ]),
      );
    });

    test('writeFloatBE', () => {
      const b = new Uint8ArrayBuilder(0);
      b.appendByte(1);
      b.writeFloatBE(-1.123, 3);
      b.appendByte(3);
      assert.equals(b.subarray(), new Uint8Array([1, 0, 0, 0xbf, 0x8f, 0xbe, 0x77, 3]));
      b.writeFloatBE(54.234e-15);
      assert.equals(
        b.subarray(),
        new Uint8Array([1, 0, 0, 0xbf, 0x8f, 0xbe, 0x77, 3, 0x29, 0x74, 0x3f, 0x8b]),
      );
    });

    test('writeDoubleBE', () => {
      const b = new Uint8ArrayBuilder(0);
      b.appendByte(1);
      b.writeDoubleBE(-1.123, 3);
      b.appendByte(3);
      assert.equals(
        b.subarray(),
        new Uint8Array([1, 0, 0, 0xbf, 0xf1, 0xf7, 0xce, 0xd9, 0x16, 0x87, 0x2b, 3]),
      );
      b.writeDoubleBE(54.234e-15);
      assert.equals(
        b.subarray(),
        new Uint8Array([
          1,
          0,
          0,
          0xbf,
          0xf1,
          0xf7,
          0xce,
          0xd9,
          0x16,
          0x87,
          0x2b,
          3,
          0x3d,
          0x2e,
          0x87,
          0xf1,
          0x6f,
          0xa9,
          0xf5,
          0xa8,
        ]),
      );
    });

    test('appendUtf8Str bug', () => {
      const text1 = 'VS Money Movement.Preparación Lími\0te';
      const text2 = 'Estrategia.Priorizacion Planificación';
      const b = new Uint8ArrayBuilder(0);
      assert.equals(b.appendUtf8Str(text1), 39);
      assert.equals(b.appendUtf8Str(text2), 38);
      assert.equals(decoder.decode(b.subarray()), text1 + text2);
    });

    test('appendUtf8Str', () => {
      const b = new Uint8ArrayBuilder(0);
      assert.equals(b.appendUtf8Str('€€€€€€€€€€€€€€€€€€€€€'), 63);

      assert.equals(b.appendUtf8Str(' hello '), 7);
      assert.equals(b.appendUtf8Str('€€€'), 9);
      b.appendUtf8Str(' world ');
      b.appendUtf8Str('🥝🥝🥝🥝🥝🥝🥝🥝🥝🥝🥝');

      assert.equals(
        decoder.decode(b.subarray()),
        '€€€€€€€€€€€€€€€€€€€€€ hello €€€ world ' + '🥝🥝🥝🥝🥝🥝🥝🥝🥝🥝🥝',
      );
    });

    test('append', () => {
      /**
       * Append a Uint8Array to the builder
       */
      api.protoMethod();
      //[
      const b = new Uint8ArrayBuilder();

      b.append([]);

      b.set(0, 16);

      b.append(new Uint8Array([1, 2, 3, 4]));

      assert.equals(b.subarray(), new Uint8Array([16, 1, 2, 3, 4]));

      b.append(new Uint8Array([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]));

      assert.equals(
        b.subarray(),
        new Uint8Array([16, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]),
      );
      assert.same(b.currentCapacity, 30);
      //]
    });

    test('setArray', () => {
      /**
       * Set a Uint8Array into the builder at offset
       */
      api.protoMethod();
      //[
      const b = new Uint8ArrayBuilder();

      b.append([]);

      b.set(0, 16);

      b.setArray(new Uint8Array([1, 2, 3, 4]), 6);

      assert.equals(b.subarray(), new Uint8Array([16, 0, 0, 0, 0, 0, 1, 2, 3, 4]));

      b.setArray(new Uint8Array([5, 6, 7, 8, 9]), 3);

      assert.equals(b.subarray(), new Uint8Array([16, 0, 0, 5, 6, 7, 8, 9, 3, 4]));

      b.setArray(b.subarray(4));
      assert.equals(b.subarray(), new Uint8Array([6, 7, 8, 9, 3, 4, 8, 9, 3, 4]));

      b.setArray(b.subarray(0, 4), 2);
      assert.equals(b.subarray(), new Uint8Array([6, 7, 6, 7, 8, 9, 8, 9, 3, 4]));

      assert.same(b.currentCapacity, 20);
      //]
    });

    test('push', () => {
      /**
       * Push byte(s) to end of array;
       */
      api.protoMethod();
      //[
      const b = new Uint8ArrayBuilder();

      b.push(1, 2, 3);
      b.push(4, 5);

      assert.equals(b.subarray(), new Uint8Array([1, 2, 3, 4, 5]));
      //]
    });
  });
});
