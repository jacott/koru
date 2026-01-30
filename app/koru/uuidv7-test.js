define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');

  const {stub, spy, util} = TH;

  const Uuidv7 = require('./uuidv7');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('toString', () => {
      let id = Uuidv7.fromTimeRand(0.0003, 0n);
      assert.same(id.toString(), '--------R-5-----------');
      id = Uuidv7.fromTimeRand(Date.UTC(2025, 5, 3, 1, 2, 3) + 0.1234567, 1234567890n);
      assert.same(id.toString(), '-ORoIpQtRUf-----HON1pV');
      id = new Uuidv7(5n, 6n);
      assert.same(id.toString(), '----------N---------0F');
    });

    test('random', () => {
      for (let i = 0; i < 100; ++i) {
        let id1 = Uuidv7.random();
        let id2 = Uuidv7.random();
        assert(id1.getHigh() < id2.getHigh());
        assert(id1.getLow() != id2.getLow());
        assert(id1.toString() < id2.toString());
        assert.same(id1.getHigh(), Uuidv7.fromString(id1.toString()).getHigh());
        assert.same(id1.getLow(), Uuidv7.fromString(id1.toString()).getLow());
      }
    });

    test('nullId', () => {
      let id = Uuidv7.nullId();
      assert.same(id.getLow(), 0n);
      assert.same(id.getHigh(), 0n);
    });

    test('clone', () => {
      const id = new Uuidv7(2n, 3n);
      const id2 = id.clone();
      refute.same(id, id2);
      assert.equals(id, id2);
    });
  });
});
