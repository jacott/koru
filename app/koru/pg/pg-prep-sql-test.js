isServer && define((require, exports, module) => {
  'use strict';
  const Enumerable      = require('koru/enumerable');
  const PgType          = require('koru/pg/pg-type');
  const TH              = require('koru/test-helper');
  const PgConn          = require('./pg-conn');

  const net = requirejs.nodeRequire('node:net');

  const {stub, spy, util, match: m} = TH;

  const PgPrepSql = require('./pg-prep-sql');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let client;

    before(async () => {
      client = await connect();
    });

    after(() => {
      client.destroy();
    });

    const connect = (formatOptions) => new PgConn(PgType, formatOptions).connect({
      dbname: process.env.KORU_DB,
      port: 5432,
      options: '-c application_name=korutest/pg-prep-sql',
    });

    test('fetchOne', async () => {
      const ps1 = new PgPrepSql(
        `select * from unnest(Array[1,2,2], Array[4,$1,6]) as x(a,b) where a = $2 order by b`)
            .setMapped(['p1', 'p2'], {p1: {oid: 21}, p2: {oid: 21}});

      assert.equals(await ps1.fetchOne(client, {p1: 5, p2: 2}), {a: 2, b: 5});
      const {columns} = ps1;

      ps1.queryStr = void 0; // not needed
      assert.equals(await ps1.fetchOne(client, {p1: 6, p2: 1}), {a: 1, b: 4});
      assert.same(ps1.columns, columns);
      assert.equals(columns, [{name: 'a', oid: 23, format: 0}, {name: 'b', oid: 23, format: 0}]);
    });

    test('describe', async () => {
      const ps = new PgPrepSql(`SELECT * from unnest(Array[1,2,2], Array[4,5,6]) as x(a,b)`);
      assert.equals(await ps.describe(client, ['name', 'oid', 'size']), [
        {name: 'a', oid: 23, size: 4}, {name: 'b', oid: 23, size: 4}]);
    });

    test('execute/fetch with rows, setMapped', async () => {
      const oparams = {a1: 1, a2: 2, a3: 3, b1: 4, b2: 5, b3: 6};
      const colMap = {};
      for (const name in oparams) {
        colMap[name] = {oid: name[0] === 'a' ? 25 : 21};
      }
      const ps1 = new PgPrepSql(
        `select * from unnest(Array[$1,$2,$3], Array[$4,$5,$6]) as x(a,b)`).setParamMapper(
          6, (obj, callback) => {for (const name in obj) callback(obj[name], name[0] === 'a' ? 25 : 21)});

      assert.equals(await ps1.execute(client, {a1: 'a1', a2: 'a2', a3: 'a3', b1: 1, b2: 2, b3: 3}), [
        {a: 'a1', b: 1}, {a: 'a2', b: 2}, {a: 'a3', b: 3},
      ]);

      const {columns} = ps1;

      ps1.queryStr = void 0; // not needed
      assert.equals(await ps1.fetch(client, {a1: 'ax1', a2: 'ax2', a3: 'ax3', b1: 11, b2: 22, b3: 33}), [
        {a: 'ax1', b: 11}, {a: 'ax2', b: 22}, {a: 'ax3', b: 33}]);

      assert.same(ps1.columns, columns);
    });

    test('execute no rows', async () => {
      const ps = new PgPrepSql(`set search_path TO DEFAULT`);
      assert.equals(await ps.execute(client), 'SET');
    });

    test('cursor', async () => {
      await client.exec('BEGIN');
      after(() => {client.exec('ROLLBACK')});
      const cursor = new PgPrepSql(`SELECT * from unnest(Array[1,$1,2], Array[4,5,6]) as x(a,b)`).setOids([21])
            .openCursor(client, 'p1', [20]);
      assert.equals(await cursor.fetch(2), [{a: 1, b: 4}, {a: 20, b: 5}]);

      assert.equals(await cursor.fetch(2), [{a: 2, b: 6}]);
      assert.equals(await cursor.fetch(2), void 0);

      await cursor.close();
    });
  });
});
