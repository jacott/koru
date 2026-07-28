define((require, exports, module) => {
  'use strict';
  const AccSha256       = require('koru/crypto/acc-sha256');
  const Enumerable      = require('koru/enumerable');
  const TH              = require('koru/test-helper');
  const Uuidv7          = require('koru/uuidv7');

  const {stub, spy, util, intercept} = TH;

  const Id = require('./id');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('random', () => {
      let before = Date.now() - 0.6;
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

    false && test('benchmark', () => {
      const list = ['zzz12345671234561', '671234561zzz12345', 'BZPRvtOkEq4EBxO3l'];
      const c = 'P';

      const a256 = (a, b, c) => AccSha256.toId(a + b + c);

      let i = 0;

      const args = ['', '', ''];

      const ans = assert.benchmark({
        duration: 1000,
        subject() {
          args[0] = list[(++i) % 3];
          args[1] = list[(++i) % 3];
          args[2] = c;
          return Id.v1HashStrings(args);
          //return a256(list[(++i) % 3], list[(++i) % 3], c);
        },
        control() {
          return 'abcdef';
        },
      });
    });

    test('v1ToU64, u64ToV1', () => {
      const [lo, hi] = Id.v1ToU64('zzz12345671234561');
      assert.same(lo, 5874699564028813762n);
      assert.same(hi, 17587821904656n);

      assert.same(Id.u64ToV1(lo, hi), 'zzz12345671234561');
      assert.same(Id.u64ToV1(0n, 0n), '');
      assert.same(Id.u64ToV1(5n, 0n), '4');
      assert.same(Id.u64ToV1(5n, 1n), 'F---------4');
    });

    test('toBase64', () => {
      assert.same(
        new Id(0xffffffff_fffffffffn, 0xffffffff_ffffffffn).toBase64(32),
        '2~~~~~~~~~~~~~~~~~~~~~',
      );
      assert.same(new Id(0n, 0n).toBase64(17), '-----------------');
      assert.same(Id.fromV1('zzz12345671234561').toBase64(17), 'zzz12345671234561');
      assert.same(Id.fromV1('zzz12345671234568').toBase64(17), 'zzz12345671234568');
      assert.same(Id.fromV1('zzz12345671234568').toBase64(5), '34568');
      assert.same(Id.fromV1('zzz12345671234568').toBase64(40), '----~zzz12345671234568');
      assert.same(Id.fromV1('abcdef').toBase64(40), '---------------~abcdef');
      assert.same(new Id(1012n, 0n).toBase64(2), 'Ep');
    });

    test('nextHash', () => {
      const ans = Enumerable.count(4).reduce((a, n) => a.nextHash(BigInt(n)), new Id(1n, 2n));

      assert.same(ans.toBase64(17), '3HVt889fYYIpWMEdW');
      assert.same(ans.nextHash(ans.getLow(), ans.getHigh()).toBase64(17), 'h9R2etF3zAFrh-TwI');
      assert.same(ans.nextHash().toBase64(17), 'h9R2etF3zAFrh-TwI');
      assert.same(ans.nextHash(ans.getHigh()).toBase64(17), 'xjGYvC-x9EIR5bB4K');
      assert.same(ans.nextHash(0n, 1n).nextHash(0n, 1n).toBase64(17), 'qBDcf6D7B4imh-rhS');
    });

    test('v1HashStrings', () => {
      assert.same(
        Id.v1HashStrings(
          'abfdfds fsdfdsfds fsdfdfds fdsfdfsfd fsdfdfds sfdfdsfsdfsdfsdfd 1211232323232323d'.split(
            ' ',
          ),
        ),
        'oYpoTigKi3eSaVukC',
      );

      const ans = Enumerable.count(4).reduce((a, n) => (a.push(Id.v1HashStrings([a.at(-1)])), a), [
        '4',
      ]);
      assert.equals(ans, [
        '4',
        '6dDIAos3B4FZHoTtc',
        'PThKPomAnqmTYOnin',
        'eZDm6vj0FJhk6~o2Z',
        'SEOA4ZpZVnqRwvsKM',
      ]);

      assert.same(
        Id.v1HashStrings(['zzzzzzzzzzzzzzzzzzD', 'zzzzzzzzzzzzzzzzzz']),
        'qMxePiJD91Uq9IJMy',
      );

      assert.same(Id.v1HashStrings(['b', 'a']), '75F5DUhBX0YAB0LyW');
      assert.same(Id.v1HashStrings(['a', 'b']), 'k472OV7vXJaV8CU7b');
      assert.same(Id.v1HashStrings(['+', 'b']), '5A8WtrtAd99Jyy1Q9');
      assert.same(Id.v1HashStrings(['zzzzzzzzzzzzzzzzzz', '']), 'IgVNoDUys~aRkLQnO');
      assert.same(Id.v1HashStrings(['zzzzzzzzzzzzzzzzzz']), '2Za4eqCH3eV12a2Je');
      assert.same(
        Id.v1HashStrings(['zzz12345671234561', 'zzz12345671234568']),
        'vbqBFu4BTa09lgY5t',
      );
    });

    test('fromV1', () => {
      assert.same(Id.fromV1('zzz12345671234561').toString(), 'zzz12345671234561');
      assert.same(Id.fromV1('0z12345671234561').toString(), '0z12345671234561');

      let id;
      id = Id.fromV1('v1id');
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

      // some Old ids can be 18 chars long
      let idv1max = Id.fromV1('zzzzzzzzzzzzzzzzzz');
      assert.same(idv1max.toBigInt(), 20764036345986002153379395538775998n);
      assert.same(idv1max.toString(), 'zzzzzzzzzzzzzzzzz');
      let uuidv7 = new Uuidv7(idv1max.getLow(), idv1max.getHigh());
      assert.same(uuidv7.toString(), '--E~kkkkkkkkkkkkkkkkkV');
      assert.same(
        Uuidv7.fromTimeRand(Date.UTC(2000, 0, 0), 0n).toString(),
        '-CmafK--R-1-----------',
      );

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
