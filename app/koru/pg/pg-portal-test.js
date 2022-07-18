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
      if (p !== void 0) {
        assert((p[private$].state & 1) == 0, 'portal still locked ' + p[private$].state.toString(2));
        assert(p.error?.severity !== 'FATAL', p.error?.message);
        await p.close();
      }
    });

    const startTransaction = async () => {
      after(async () => {
        const q = conn.exec('rollback');
        await q.fetch();
        assert.same(q.getCompleted(), 'ROLLBACK');
      });
      const q = conn.exec('begin');
      await q.fetch();
      assert.same(q.getCompleted(), 'BEGIN');
    };

    test('parse error', async () => {
      p = conn.portal();
      p.parse('', `SELECT $1 + $2`, 0);
      await p.describeStatement(true);
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

      const myError = new Error('myError');

      const error = await p.fetch((row) => {throw myError;});
      assert.isFalse(p.isExecuting);
      assert.equals(error, myError);
      assert.equals(p.error, myError);
    });

    test('noData', async () => {
      p = conn.portal();
      p.parse('', `select * from unnest(Array[1,2,3], Array[4,5,6]) as x(a,b) where x.a = 4`, 0);
      p.prepareValues();
      const rows = [];

      let error = await p.fetch((row) => {rows.push(row)}, 2);
      refute(error);
      assert.same(rows.length, 0);
      assert.isFalse(p.isExecuting);
      assert(p.isClosed);
      assert.same(p[private$].state, 86);
    });

    test('maxRows', async () => {
      await startTransaction();

      p = conn.portal('foo');
      p.parse('', `select * from unnest(Array[$1,2,3], Array[4,5,6]) as x(a,b);`, 1);
      const b = p.prepareValues();
      p.addParamOid(encodeBinary(b, 1, 21));

      const rows = [];

      let error = await p.fetch((row) => rows.push(row), 2);
      refute(error);
      assert.isTrue(p.isMore);
      assert.isTrue(p.isExecuting);
      assert.isFalse(p.isClosed);
      assert.equals(rows.length, 2);
      assert.same(p.getCompleted(), void 0);

      const q2 = conn.exec('select 1');
      await q2.fetch();
      assert.same(q2.getCompleted(), 'SELECT 1');

      error = await p.fetch((row) => rows.push(row), 2);
      refute(error);
      assert.isTrue(p.isExecuting);
      assert.equals(rows.length, 3);
      assert.isFalse(p.isMore);
      assert.same(p.getCompleted(), 'SELECT 1');

      assert.isFalse(p.isClosed);
    });

    test('close running', async () => {
      await startTransaction();
      p = conn.portal('foo');
      p.parse('', `select * from unnest(Array[$1,2,3], Array[4,5,6]) as x(a,b);`, 1);
      let b = p.prepareValues();
      p.addParamOid(encodeBinary(b, 1, 21));

      const rows = [];

      let error = await p.fetch((row) => rows.push(row), 1);
      refute(error);
      assert.isTrue(p.isMore);
      assert.isTrue(p.isExecuting);
      assert.equals(rows.length, 1);

      const cp = p.close();

      assert.same(p[private$].state, 469);

      refute(await cp);

      assert.same(p[private$].state, 87);

      assert.equals(rows.length, 1);

      p = conn.portal('foo');
      p.parse('', `select * from unnest(Array[2,$1,3], Array[4,5,6]) as x(a,b);`, 1);
      b = p.prepareValues();
      p.addParamOid(encodeBinary(b, 100, 21));

      assert.isFalse(p.isClosed);

      error = await p.fetch((row) => rows.push(row));

      refute(error);
      assert.same(rows.length, 4);
      assert.isFalse(p.isClosed);

      await p.close();

      assert.isTrue(p.isClosed);
    });

    test('close before fetch started', async () => {
      const p1 = conn.portal('p1').parse('', `select * from unnest(Array[$1,2,3], Array[4,5,6]) as x(a,b);`, 1);
      p1.addParamOid(encodeBinary(p1.prepareValues(), 1, 21));
      const p2 = conn.portal('p2').parse('', `select * from unnest(Array[10,$1,30], Array[4,5,6]) as x(a,b);`, 1);
      p2.addParamOid(encodeBinary(p2.prepareValues(), 2, 21));

      const c1 = stub();
      const c2 = stub();

      const q1 = p1.fetch(c1);
      const q2 = p2.fetch(c2);

      const myError = new Error('myError');

      assert.same(await p2.close(myError), myError);

      assert.same(p2.error, myError);
      assert.same(await q2, myError);
      assert.same(await q1, void 0);
    });

    test('early close', () => {
      p = conn.portal();
      p.parse('', `SELECT $1::int4 + $2`, 0);

      assert.same(p.close(123), 123);

      assert(p.isClosed);
    });

    test('parse okay', async () => {
      p = conn.portal();
      p.parse('', `SELECT $1::int4 + $2`, 0);
      await p.describeStatement(true);
      assert.same(p[private$].state, 22);
      refute(p.error);
      await p.close();

      p = conn.portal();
      p.parse('', `SELECT $1 + $2`, 2);
      p.addParamOid(23);
      p.addParamOid(23);
      await p.describeStatement(true);

      refute(p.error);
      assert.same(p[private$].state, 22);
    });

    test('simple binding', async () => {
      p = conn.portal();
      p.parse('', `SELECT $1, $2 as col2, $3 as col3`, 3);
      const b = p.prepareValues([1]);
      p.addParamOid(encodeBinary(b, 'hello', 25))
        .addParamOid(encodeBinary(b, 123.456, 701))
        .addParamOid(encodeBinary(b, true, 16));
      p.addResultFormat([1]);
      await p.describe(true);

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

      p.describe();

      assert.equals(await readResult(p), [{'0:?column?,23': 1, '1:col2,701': 123.456, '2:?column?,23': 123}]);

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
    });

    test('no params execute', async () => {
      p = conn.portal();
      p.parse('', `SELECT '{abc}'::text[] as a`, 0);
      const b = p.prepareValues([]);
      p.addResultFormat([0]);
      p.describe();
      const results = await readResult(p);

      refute(p.error);

      assert.equals(results, [
        {
          '0:a,1009': ['abc'],
        },
      ]);
      assert.equals(p.getCompleted(), 'SELECT 1');
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
      const results = await readResult(p);

      refute(p.error);
      assert.equals(p.getCompleted(), 'SELECT 1');

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
      await p.fetch(util.voidFunc);
      assert.equals(p.error.code, '42601');

      p = conn.portal();
      p.parse('', `SELECT $1 as a`, 1);
      refute(p.error);
      b = p.prepareValues();
      p.addParamOid(encodeBinary(b, 1, 23));
      const result = [];
      await p.fetch((row) => { result.push(row)});
      refute(p.error);
      assert.equals(result, [m.object]);
    });
  });
});
