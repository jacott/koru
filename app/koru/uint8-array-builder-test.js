define((require, exports, module) => {
  /**
   * Build an Uint8Array with dynamic sizing.
   */
  'use strict';
  const TH              = require('koru/test');
  const api             = require('koru/test/api');

  const Uint8ArrayBuilder = require('./uint8-array-builder');

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
      assert.same(b1.subarray().buffer.byteLength, 4);

      const b2 = new Uint8ArrayBuilder(2);
      b2.set(0, 1);
      assert.same(b2.subarray().buffer.byteLength, 2);
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

      assert.same(b1.subarray().constructor, Uint8Array);
      refute.same(b1.subarray(), b1.subarray());
      assert.same(b1.subarray().buffer, b1.subarray().buffer);
      //]
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
      assert.same(b.subarray().buffer.byteLength, 4);
      //]
    });

    test('grow', () => {
      const b = new Uint8ArrayBuilder();
      b.grow(4);

      assert.equals(b.subarray(), new Uint8Array([0, 0, 0, 0]));
      assert.equals(new Uint8Array(b.subarray().buffer).length, 8);

      b.grow(4, 13);
      assert.equals(b.subarray(), new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
      assert.equals(new Uint8Array(b.subarray().buffer).length, 34);
    });

    test('append', () => {
      /**
       * Append a Uint8Array to the builder
       */
      api.protoMethod();
      //[
      const b = new Uint8ArrayBuilder();

      b.append(new Uint8Array([1, 2]));

      assert.equals(b.subarray(), new Uint8Array([1, 2]));

      b.append(new Uint8Array([3, 4, 5]));

      assert.equals(b.subarray(), new Uint8Array([1, 2, 3, 4, 5]));
      assert.same(b.subarray().buffer.byteLength, 10);
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
