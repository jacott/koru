isServer && define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const {encodeBinary, encodeText} = require('koru/pg/pg-type');
  const TH              = require('koru/test');
  const Uint8ArrayBuilder = require('koru/uint8-array-builder');
  const PgProtocol      = require('./pg-protocol');
  const {createReadySocket, readResult} = require('./pg-test-helper');

  const net = requirejs.nodeRequire('node:net');

  const {private$} = require('koru/symbols');

  const {stub, spy, util, match: m} = TH;

  const PgPortal = require('./pg-portal');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let conn, p;

    before(async () => {
      conn = await new PgProtocol({
        user: process.env.USER, database: process.env.KORU_DB, application_name: 'koru-test/pg-portal',
      }).connect(await createReadySocket('/var/run/postgresql/.s.PGSQL.5432', conn));
    });

    after(() => {
      conn.close();
      conn.socket.destroy();
    });

    afterEach(async () => {
      await p?.close();
    });

    test('parse error', async () => {
      p = conn.portal();
      p.parse('', `SELECT $1 + $2`, 0);
      await p.flush();
      assert(p.error);
      assert.exception(
        p.error,
        {
          severity: 'ERROR',
          code: '42725',
          message: 'operator is not unique: unknown + unknown',
          hint: 'Could not choose a best candidate operator. You might need to add explicit type casts.',
          position: 11,
        },
      );
    });

    test('error during fetch', async () => {
      p = conn.portal();
      p.parse('', `select * from unnest(Array[$1,2,3], Array[4,5,6]) as x(a,b);`, 1);
      const b = p.prepareValues();
      p.addParamOid(encodeBinary(b, 1, 21));
      const query = p.execute();

      const myError = new Error('myError');

      const error = await query.fetch((row) => {throw myError;});
      assert.isFalse(query.isExecuting);
      assert.equals(error, myError);
      assert.equals(p.error, myError);
    });

    test('close before fetch started', async () => {
      const p1 = conn.portal('p1').parse('', `select * from unnest(Array[$1,2,3], Array[4,5,6]) as x(a,b);`, 1);
      p1.addParamOid(encodeBinary(p1.prepareValues(), 1, 21));
      const p2 = conn.portal('p2').parse('', `select * from unnest(Array[10,$1,30], Array[4,5,6]) as x(a,b);`, 1);
      p2.addParamOid(encodeBinary(p2.prepareValues(), 2, 21));

      const c1 = stub();
      const c2 = stub();

      const q1 = p1.execute();
      const q2 = p2.execute();

      const f1 = q1.fetch(c1);
      const f2 = q2.fetch(c2);

      const myError = new Error('myError');

      assert.same(q2.close(myError), myError);

      assert.same(q2.error, myError);
      assert.same(await f2, myError);
      assert.same(await f1, void 0);
    });

    test('parse okay', async () => {
      p = conn.portal();
      p.parse('', `SELECT $1::int4 + $2`, 0);
      assert.same(p[private$].state, 10);
      await p.flush();
      refute(p.error);
      assert.same(p[private$].state, 11);
      await p.close();

      p = conn.portal();
      p.parse('', `SELECT $1 + $2`, 2);
      p.addParamOid(23);
      p.addParamOid(23);
      // TODO GJ do a describeStatement
      await p.flush();

      refute(p.error);
      assert.same(p[private$].state, 11);
    });

    test('simple binding', async () => {
      p = conn.portal();
      p.parse('', `SELECT $1, $2 as col2, $3 as col3`, 3);
      const b = p.prepareValues([1]);
      p.addParamOid(encodeBinary(b, 'hello', 25))
        .addParamOid(encodeBinary(b, 123.456, 701))
        .addParamOid(encodeBinary(b, true, 16));
      p.addResultFormat([1]);
      p.describe();
      await p.flush();
      const col0 = p.getColumn(0);
      assert.same(col0.name, '?column?');
      assert.same(col0.oid, 25);
      assert.same(col0.format, 1);
      assert.same(col0.size, -1);
      assert.same(col0.typeModifier, -1);

      const col1 = p.getColumn(2);
      assert.same(col1.name, 'col3');
      assert.same(col1.oid, 16);
      assert.same(col1.format, 1);
      assert.same(col1.size, 1);
      assert.same(col1.typeModifier, -1);
    });

    test('mixed binding', async () => {
      p = conn.portal();
      p.parse('', `SELECT $1, $2 as col2, $3`, 3);
      const b = p.prepareValues([1, 1, 0]);
      p.addParamOid(encodeBinary(b, 1, 23)).addParamOid(encodeBinary(b, 123.456, 701))
        .addParamOid(encodeText(b, 123, 23));
      p.addResultFormat([1]);
      await p.flush();
      refute(p.error);

      assert.same(p[private$].state, 21);

      p.describe();
      await p.flush();

      const col0 = p.getColumn(0);
      assert.same(col0.name, '?column?');
      assert.same(col0.oid, 23);
      assert.same(col0.format, 1);
      assert.same(col0.size, 4);
      assert.same(col0.typeModifier, -1);

      const col1 = p.getColumn(1);
      assert.same(col1.name, 'col2');
      assert.same(col1.oid, 701);
      assert.same(col1.format, 1);
      assert.same(col1.size, 8);
      assert.same(col1.typeModifier, -1);

      const q = p.execute();
      assert.equals(await readResult(q), [{'0:?column?,23': 1, '1:col2,701': 123.456, '2:?column?,23': 123}]);
    });

    test('no params execute', async () => {
      p = conn.portal();
      p.parse('', `SELECT '{abc}'::text[] as a`, 0);
      const b = p.prepareValues([]);
      p.addResultFormat([0]);
      p.describe();
      const query = p.execute();
      const results = await readResult(query);

      refute(p.error);

      assert.equals(results, [
        {
          '0:a,1009': ['abc'],
        },
      ]);
      assert.equals(query.getCompleted(), 'SELECT 1');
    });

    test('execute with nulls', async () => {
      p = conn.portal();
      p.parse('',
              `SELECT $5 as th, 'world' as tw, $1 as a, $2 as b, $1, $4, NULL, NULL, $3, $3`, 5);
      const b = p.prepareValues([1, 1, 1, 0, 1]);
      p.addParamOid(encodeBinary(b, 1, 23))
        .addParamOid(encodeBinary(b, 123.456, 701))
        .addParamOid(encodeBinary(b, null, 25))
        .addParamOid(encodeText(b, 123, 23))
        .addParamOid(encodeBinary(b, 'hello', 25));
      p.addResultFormat([0, 1, 1, 0, 0, 1, 1, 0, 1, 0]);
      p.describe();
      const query = p.execute();
      const results = await readResult(query);

      refute(p.error);
      assert.equals(query.getCompleted(), 'SELECT 1');

      assert.equals(results, [
        {
          '0:th,25': 'hello',
          '1:tw,25': 'world',
          '2:a,23': 1,
          '3:b,701': 123.456,
          '4:?column?,23': 1,
          '5:?column?,23': 123,
          '6:?column?,25': null,
          '7:?column?,25': null,
          '8:?column?,25': null,
          '9:?column?,25': null,
        },
      ]);
    });

    test('error during execute', async () => {
      p = conn.portal();
      p.parse('', `SELECT $1 $2`, 2);
      p.addParamOid(23);
      let b = p.prepareValues();
      encodeBinary(b, 123, 23);
      p.addParamOid(encodeBinary(b, 123, 23));
      let query = p.execute();
      await query.fetch(util.voidFunc);
      assert.equals(p.error.code, '42601');

      p = conn.portal();
      p.parse('', `SELECT $1 as a`, 1);
      refute(p.error);
      b = p.prepareValues();
      p.addParamOid(encodeBinary(b, 1, 23));
      query = p.execute();
      const result = [];
      await query.fetch((row) => { result.push(row)});
      refute(p.error);
      assert.equals(result, [m.object]);
    });
  });
});
