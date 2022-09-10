isServer && define((require, exports, module) => {
  'use strict';
  const PgConn          = require('koru/pg/pg-conn');
  const TH              = require('koru/test');
  const Uint8ArrayBuilder = require('koru/uint8-array-builder');
  const {runQuery}      = require('./pg-test-helper');

  const {stub, spy, util} = TH;

  const PgType = require('./pg-type');
  const {jsToParam} = PgType;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    const assertEnc = (value, oid, aryOid, u8Result, expValue=value) => {
      const buf = new Uint8ArrayBuilder();
      assert.same(oid, PgType.encodeBinary(buf, value, oid));
      const u8 = buf.subarray();
      if (u8Result !== undefined) {
        assert.equals(Array.from(u8).slice(4), u8Result);
      }
      assert.same(buf.dataView.getInt32(0), buf.length - 4);
      assert.equals(PgType.decodeBinary(oid, u8.subarray(4, 4 + buf.dataView.getInt32(0))), expValue);

      assert.same(PgType.toArrayOid(oid), aryOid);
      assert.same(PgType.fromArrayOid(aryOid), oid);
    };

    test('escapeLiteral', () => {
      assert.equals(PgType.escapeLiteral('234'), "'234'");
      assert.equals(PgType.escapeLiteral(234), "'234'");
      assert.equals(PgType.escapeLiteral("John's dinner"), "'John''s dinner'");
      assert.equals(PgType.escapeLiteral("no nulls\u0000 in here"), "'no nulls'");
      assert.equals(PgType.escapeLiteral(`a'\n\\" \t\r\u0010x🥝`), ` E'a''\n\\\\" \t\r\x10x🥝'`);
    });

    group('with PgConn', () => {
      let client;
      before(async () => {
        client = await new PgConn(PgType).connect({dbname: process.env.KORU_DB});
        await PgType.assignOids(client);
      });

      after(() => {
        client.destroy();
      });

      test('void', async () => {
        assert.equals(await client.exec(`SELECT '123'::void as a`, [], [0], [0]), [{a: undefined}]);
        assert.equals(await client.exec(`SELECT $1::void as a`, ['123'], [0], [0]), [{a: undefined}]);
        assert.equals(await client.exec(`SELECT $1::void as a`, ['123'], [0], [1]), [{a: undefined}]);
        assert.equals(await client.exec(`SELECT $1::void as a, $2 as b`, ['123', 1], [2278, 21], [1]), [{a: undefined, b: 1}]);
      });

      test('text', async () => {
        const a = 'my message';

        assert.equals(await client.exec(`SELECT $1::char as a`, [a], [18], [0]), [{a: 'm'}]);
        assert.equals(await client.exec(`SELECT $1::char as a`, [a], [18], [1]), [{a: 'm'}]);
        assert.equals(await client.exec(`SELECT $1::varchar as a`, [a], [1043], [0]), [{a}]);
        assert.equals(await client.exec(`SELECT $1::varchar as a`, [a], [1043], [1]), [{a}]);
        assert.equals(await client.exec(`SELECT $1::text as a`, [a], [1043], [0]), [{a}]);
        assert.equals(await client.exec(`SELECT $1::varchar(15) as a`, [a], [25], [0]), [{a}]);
        assert.equals(await client.exec(`SELECT $1::varchar(2) as a`, [a], [25], [0]), [{a: 'my'}]);
        assert.equals(await client.exec(`SELECT $1::char(12) as a`, [a], [1042], [0]), [{a: a + '  '}]);
        assert.equals(await client.exec(`SELECT $1::char(2) as a`, [a], [1042], [1]), [{a: 'my'}]);
        assert.equals(await client.exec(`SELECT $1::name as a`, [a], [1042], [1]), [{a}]);
      });

      group('arrays', () => {
        test('aryToSqlStr', () => {
          assert.equals(PgType.aryToSqlStr(['a', ' b', '"c"', null, 'null']), `{a," b","\\"c\\"",NULL,"null"}`);
          assert.equals(PgType.aryToSqlStr([1, 2, 3]), '{1,2,3}');
          assert.equals(PgType.aryToSqlStr([1, 'abc', 3]), '{1,"abc",3}');
        });

        test('to bin', async () => {
          const p = client.conn.portal();
          p.parse('', `SELECT '{{2,3},{null,4}}'::int[] as a, '{{a},{null},{c},{d}}'::text[] as b, '{}'::int[] as c`, 0);
          const b = p.prepareValues([]);
          p.addResultFormat([1]);
          p.describe();
          const result = await runQuery(p, 0, 'name');
          assert.equals(result.rows[0], {a: [[2, 3], [null, 4]], b: [['a'], [null], ['c'], ['d']], c: []});
        });

        test('to text', async () => {
          const p = client.conn.portal();
          p.parse('', `SELECT '[-1:0][1:2]={{2,3},{null,4}}'::int[] as a,
'{{a},{null},{c},{d}}'::text[] as b, '{}'::int[] as c`, 0);
          const b = p.prepareValues([]);
          p.addResultFormat([0]);
          p.describe();
          const result = await runQuery(p, 0, 'name');
          refute(p.error);
          assert.equals(result.rows[0], {a: [[2, 3], [null, 4]], b: [['a'], [null], ['c'], ['d']], c: []});
        });

        test('bin to bin', async () => {
          const p = client.conn.portal();
          p.parse('', `SELECT $1 as a, $2 as b, $3 as c`, 3);
          const b = p.prepareValues();
          const sp = b.length;
          p.addParamOid(PgType.encodeBinary(b, [[2, 3], [null, 4]], 1007));
          p.addParamOid(PgType.encodeBinary(b, [['a'], [null], ['c'], [''], ['d']], 1009));
          p.addParamOid(PgType.encodeBinary(b, [], 1009));
          p.addResultFormat([1]);
          p.describe();
          const result = await runQuery(p, 0, 'name');
          refute(p.error);
          assert.equals(result.rows[0], {a: [[2, 3], [null, 4]], b: [['a'], [null], ['c'], [''], ['d']], c: []});
        });
      });
    });

    test('text arrays', () => {
      let b = new Uint8ArrayBuilder();
      PgType.encodeText(b, [['abc"\\abc},{', null, 'null', '  hello  ', '', ',']], 1009);
      assert.equals(b.subarray(4).toString(), `{{"abc\\"\\\\abc},{",NULL,"null","  hello  ","",","}}`);

      b = new Uint8ArrayBuilder();
      PgType.encodeText(b, [[[1, 2], [3, 4]], [[5, 6], [7, 8]]], 1009);
      assert.equals(b.subarray(4).toString(), `{{{1,2},{3,4}},{{5,6},{7,8}}}`);

      assert.equals(PgType.decodeText(1009, Buffer.from('{   123  , "",  "   fdf   "   }')),
                    ['123', '', '   fdf   ']);
      assert.equals(PgType.decodeText(1009, Buffer.from('{"fdf\\",{}\\\\"}')),
                    ['fdf",{}\\']);
      assert.equals(PgType.decodeText(1009, Buffer.from('{abc,"fdf\\",{}","null",123,hello,NULL}')),
                    ['abc', 'fdf",{}', 'null', '123', 'hello', null]);
    });

    test('text', () => {
      assertEnc('hello world', 25, 1009, [104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100]);
    });

    test('integers', () => {
      assertEnc(123, 21, 1005);
      assertEnc(-1, 21, 1005, [255, 255]);

      assertEnc(1234567, 23, 1007, [0, 18, 214, 135]);
      assertEnc(-1, 23, 1007, [255, 255, 255, 255]);

      assertEnc(Number.MAX_SAFE_INTEGER, 20, 1016, [0, 31, 255, 255, 255, 255, 255, 255], Number.MAX_SAFE_INTEGER);
      assertEnc(Number.MIN_SAFE_INTEGER, 20, 1016, [255, 224, 0, 0, 0, 0, 0, 1], Number.MIN_SAFE_INTEGER);
      assertEnc(1234334444441234567, 20, 1016, [17, 33, 60, 163, 46, 242, 237, 0], 1234334444441234700);
      assertEnc(- 7212409629268317049n, 20, 1016, [155, 232, 95, 167, 184, 218, 236, 135], -7212409629268317000);
    });

    test('floats', () => {
      assertEnc(-1.1232399559080175e-12, 701, 1022, [189, 115, 194, 159, 128, 0, 0, 0]);
      assertEnc(-1.12324e-12, 700, 1021, [171, 158, 20, 252], -1.1232399559080175e-12);
    });

    test('bool', () => {
      assertEnc(true, 16, 1000, [1]);
      assertEnc(false, 16, 1000, [0]);

      assertEnc(1, 16, 1000, [1], true);
      assertEnc(0, 16, 1000, [0], false);
      assertEnc('', 16, 1000, [0], false);
    });

    test('bytea', () => {
      assertEnc(new Uint8Array([1, 2, 255, 0, 4, 5]), 17, 1001, [1, 2, 255, 0, 4, 5]);

      let b = new Uint8ArrayBuilder();
      PgType.encodeText(b, new Uint8Array([0, 1, 15, 16, 255]), 17);
      assert.equals(b.subarray(4).toString(), `\\x00010f10ff`);

      assert.equals(PgType.decodeText(17, Buffer.from('\\x00010f10ff')),
                    new Uint8Array([0, 1, 15, 16, 255]));

      assert.equals(PgType.decodeText(17, Buffer.from('\\xaABbCCdd')),
                    new Uint8Array([170, 187, 204, 221]));
    });

    test('json', () => {
      assertEnc({a: 123, b: ['hello', false]}, 3802, 3807,
                [1, 123, 34, 97, 34, 58, 49, 50, 51, 44, 34, 98, 34, 58, 91,
                 34, 104, 101, 108, 108, 111, 34, 44, 102, 97, 108, 115, 101, 93, 125]);
      assertEnc({a: 123, b: ['hello', false]}, 114, 199,
                [123, 34, 97, 34, 58, 49, 50, 51, 44, 34, 98, 34, 58, 91,
                 34, 104, 101, 108, 108, 111, 34, 44, 102, 97, 108, 115, 101, 93, 125]);
    });

    test('guessOid', () => {
      const {guessOid} = PgType;

      assert.same(guessOid([[null], ['text'], []]), 3802);
      assert.same(guessOid([[null], ['text']]), 1009);
      assert.same(guessOid([]), 1009);
      assert.same(guessOid([[null], [123], [-345]]), 1005);
      assert.same(guessOid([[null], [123], [123456789]]), 1007);
      assert.same(guessOid([[{}, {}], [{}, {}], [{}, {}]]), 3802);
      assert.same(guessOid([[{}, {}], [{}, {}], [{}, {}, {}]]), 3802);

      assert.same(guessOid({}), 3802);

      assert.same(guessOid(Infinity), 701);
      assert.same(guessOid(-Infinity), 701);
      assert.same(guessOid(false), 16);
      assert.same(guessOid(true), 16);
      assert.same(guessOid(1), 21);
      assert.same(guessOid(-32768), 21);
      assert.same(guessOid(-1), 21);
      assert.same(guessOid(32767), 21);
      assert.same(guessOid(-32769), 23);
      assert.same(guessOid(32768), 23);
      assert.same(guessOid(Number.MAX_SAFE_INTEGER), 20);
      assert.same(guessOid(6443858614676334363n), 20);

      assert.same(guessOid(1.234), 701);
      assert.same(guessOid('text'), 25);

      assert.same(guessOid(new Date(2022, 6, 23)), 1114);

      assert.same(guessOid(Buffer.from([1, 2, 3])), 17);
      assert.same(guessOid(new Uint8Array([255, 254, 0])), 17);
    });
  });
});
