define((require, exports, module) => {
  'use strict';
  /**
   * A UUID v7 class.
   */
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const Uuidv7 = require('./uuidv7');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('toString', () => {
      /**
       * Clone the id
       */
      api.protoMethod();
      //[
      let id = Uuidv7.fromTimeRand(0.0003, 0n);
      assert.same(id.toString(), '--------R-5-----------');
      id = Uuidv7.fromTimeRand(Date.UTC(2025, 5, 3, 1, 2, 3) + 0.1234567, 1234567890n);
      assert.same(id.toString(), '-ORoIpQtRUf-----HON1pV');
      id = new Uuidv7(5n, 6n);
      assert.same(id.toString(), '----------N---------0F');
      //]
    });

    test('random', () => {
      /**
       * Create a cryptographically random v7 uuid.
       */
      api.method();

      //[
      for (let i = 0; i < 100; ++i) {
        let id1 = Uuidv7.random();
        let id2 = Uuidv7.random();
        assert(id1.getHigh() < id2.getHigh());
        assert(id1.getLow() != id2.getLow());
        assert(id1.toString() < id2.toString());
        assert.same(id1.getHigh(), Uuidv7.fromString(id1.toString()).getHigh());
        assert.same(id1.getLow(), Uuidv7.fromString(id1.toString()).getLow());

        const id1c = id1.clone().enforceValid();
        assert.equals(id1, id1c);
      }
      //]
    });

    test('enforceValid, fromString, toString', () => {
      const id = new Uuidv7(0x123456789abcdef1n, 0xfedcba987654321fn).enforceValid();
      assert.equals(id.urn(), 'urn:uuid:fedcba98-7654-721f-9234-56789abcdef1');

      assert.equals(id, Uuidv7.fromString(id.toString()));

      const idlow = new Uuidv7(0n, 0n).enforceValid();
      assert.equals(idlow, Uuidv7.fromString(idlow.toString()));

      const idhi = new Uuidv7(0xffffffffffffffffn, 0xffffffffffffffffn).enforceValid();
      assert.equals(idhi, Uuidv7.fromString(idhi.toString()));

      assert.equals(
        Uuidv7.fromString('test').urn(),
        'urn:uuid:00000000-0000-7000-8000-0000000e29df',
      );
    });

    test('nullId', () => {
      let id = Uuidv7.nullId();
      assert.same(id.getLow(), 0n);
      assert.same(id.getHigh(), 0n);
    });

    test('clone', () => {
      /**
       * Clone the id
       */
      api.protoMethod();
      //[
      const id = new Uuidv7(2n, 3n);
      const id2 = id.clone();
      refute.same(id, id2);
      assert.equals(id, id2);
      //]
    });
  });
});
