isServer && define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/model/test-db-helper');
  const PgConn          = require('koru/pg/pg-conn');
  const PgType          = require('koru/pg/pg-type');
  const Uint8ArrayBuilder = require('koru/uint8-array-builder');

  const {stub, spy, util} = TH;

  const PgDate = require('./pg-date');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    group('with PgConn', () => {
      let client;
      before(async () => {
        client = await new PgConn(PgType).connect({dbname: process.env.KORU_DB});
        await PgType.assignOids(client);
      });

      after(() => {
        client.destroy();
      });

      test('date', async () => {
        const time = new Date(Date.UTC(2012, 3, 5));

        assert.equals(await client.exec(`SELECT $1 as a`, [time], [1082], [0]), [{a: time}]);
        assert.equals(await client.exec(`SELECT '2012-04-05'::date as a`, [], [], [0]), [{a: time}]);
        assert.equals(await client.exec(`SELECT $1 as a`, [time], [1082]), [{a: time}]);
        assert.equals(await client.exec(`SELECT $1 as a`, [time.getTime()], [1082]), [{a: time}]);
        assert.equals(await client.exec(`SELECT $1 as a`, [time.getTime()], [1082], [0]), [{a: time}]);
        assert.equals(await client.exec(`SELECT $1 as a`, [time.toString()], [1082]), [{a: time}]);
        assert.equals(await client.exec(`SELECT $1 as a`, ['2012-04-05'], [1082]), [{a: time}]);
      });

      test('timestamp', async () => {
        let time = new Date(Date.UTC(2012, 3, 5, 6, 7, 8, 23));
        const date = new Date(Date.UTC(2012, 3, 5));

        assert.equals(await client.exec(`SELECT '2012-04-05 06:07:08.023'::timestamp as a`), [{a: time}]);
        assert.equals(await client.exec(`SELECT '2012-04-05 06:07:08.023'::timestamp as a`, [], [], [1]), [{a: time}]);
        assert.equals(await client.exec(`SELECT $1 as a`, [time], [1114]), [{a: time}]);
        assert.equals(await client.exec(`SELECT $1 as a`, [time.toISOString()], [1114]), [{a: time}]);
        assert.equals(await client.exec(`SELECT $1::date as a`, [time], [1114]), [{a: date}]);
        assert.equals(await client.exec(`SELECT $1 as a`, [time.getTime()], [1114]), [{a: time}]);
        assert.equals(await client.exec(`SELECT $1 as a`, [time.getTime()], [1114], [0]), [{a: time}]);

        time = new Date(1657837500400);
        assert.equals(await client.exec(`SELECT '2022-07-14 22:25:00.400'::timestamp as a`), [{a: time}]);
        assert.equals(await client.exec(`SELECT '2022-07-14 22:25:00.400'::timestamp as a`, [], [1114], [0]), [{a: time}]);
        assert.equals(await client.exec(`SELECT $1 as a`, [time], [1114], [0]), [{a: time}]);
        assert.equals(await client.exec(`SELECT $1 as a`, [time], [1114]), [{a: time}]);

        const buf = new Uint8ArrayBuilder();
        PgType.encodeText(buf, time, 1114);
        assert.equals((buf.subarray(4)).toString(), '2022-07-14 22:25:00.400');

        assert.equals(PgType.decodeText(1114, buf.subarray(4)), time);
      });
    });
  });
});
