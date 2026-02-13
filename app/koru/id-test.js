define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');
  const Uuidv7          = require('koru/uuidv7');

  const {stub, spy, util, intercept} = TH;

  const Id = require('./id');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('random', () => {
      let before = Date.now();
      Id.random();
      const id1 = Id.random();
      const id2 = Id.random();
      const id3 = Id.random();
      let after = Date.now() + 2;
      assert.between(id1.toMsFrac(), before, after);
      assert.between(id2.toMsFrac(), id1.toMsFrac(), id2.toMsFrac());
    });

    test('uuidv7', () => {
      const v7id = Uuidv7.random();
      const id = Id.fromUuidV7(v7id);

      assert.same(id.toHex(), v7id.toHex());
    });

    test('fromV1', () => {
      let id = Id.fromV1('v1id');
      assert.same(id.toString(), 'v1id');
      assert.same(id.toBigInt(), 1072180072n);
      let uuid = new Uuidv7(id.getLow(), id.getHigh());
      assert.isTrue(uuid.equals(id));
      assert.isFalse(id.equals(uuid));
      assert.same(uuid.toString(), '----------------EzVgP-');

      let id1 = Id.fromV1('zzz12345671234561');
      let id2 = Id.fromV1('zzz12345671234568');
      assert.isTrue(id1.getHigh() == id2.getHigh() && id1.getLow() < id2.getLow());
      assert.isTrue(id.getHigh() < id1.getHigh());

      assert.same(id1.toBigInt(), 324438049489177981257820891537858n);
      assert.same(id2.toBigInt(), 324438049489177981257820891537865n);
      assert.same(id1.toString(), 'zzz12345671234561');
      assert.same(id2.toString(), 'zzz12345671234568');

      let idv1max = Id.fromV1('zzzzzzzzzzzzzzzzz');
      assert.same(idv1max.toBigInt(), 324438067906031283646553055293374n);
      assert.same(idv1max.toString(), 'zzzzzzzzzzzzzzzzz');

      id = Id.fromV1(null);
      assert.same(id.toBigInt(), 0n);

      id = Id.fromV1(undefined);
      assert.same(id.toBigInt(), 0n);

      id = Id.fromV1('');
      assert.same(id.toBigInt(), 0n);
    });

    test('read, write', () => {
      const id1 = Id.random();
      let u8 = new Uint8Array(20);
      let dv = new DataView(u8.buffer);
      id1.write(dv, 1);
      let id2 = Id.read(dv, 1);
      assert.equals(id1, id2);
    });
  });
});
