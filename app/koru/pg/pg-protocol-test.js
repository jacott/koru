isServer && define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const PgError         = require('koru/pg/pg-error');
  const {decodeText}    = require('koru/pg/pg-type');
  const {forEachColumn, buildNameOidColumns} = require('koru/pg/pg-util');
  const TH              = require('koru/test');
  const {createReadySocket, runQuery, simpleExec} = require('./pg-test-helper');

  const {private$} = require('koru/symbols');

  const {stub, spy, util, match: m} = TH;

  const PgProtocol = require('./pg-protocol');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('checkBuf, sendNext', async () => {
      const socket = {write: stub(), on: stub(), pause: stub(), resume: stub()};
      const conn = new PgProtocol();
      const p = conn.connect(socket);

      const ready = Buffer.from('5a0000000549', 'hex');

      let checkBuf;
      assert.calledWith(socket.on, 'data', m((f) => checkBuf = f));

      checkBuf(ready);

      await p;

      const listener = {
        addRowDesc: stub((v) => v[0] != 0),
      };

      await conn.lock(listener);

      const msg1 = Buffer.from('54000000061122', 'hex');

      checkBuf(msg1.slice(0, -1));

      refute.called(listener.addRowDesc);

      checkBuf(msg1.slice(-1));

      assert.calledWith(listener.addRowDesc, msg1.slice(-2));
      assert.calledThrice(socket.resume);
      assert.calledThrice(socket.pause);

      const msg2 = Buffer.from('540000000500', 'hex');

      checkBuf(msg2);

      assert.calledWith(listener.addRowDesc, msg2.slice(-1));

      assert.calledThrice(socket.resume);
    });

    group('with Conn', () => {
      let conn;

      before(async () => {
        conn = new PgProtocol({
          user: process.env.USER, database: process.env.KORU_DB, application_name: 'koru-test/pg-protocol',
        });
        await conn.connect(await createReadySocket('/var/run/postgresql/.s.PGSQL.5432', conn));
      });

      after(() => {
        conn.close();
        conn.socket.destroy();
      });

      test('test scheduling', async () => {
        const p1 = runQuery(conn.exec(`select 1 as q1`));
        const p2 = runQuery(conn.exec(`select 2 as q2`));

        const [q1, q2] = await Promise.all([p1, p2]);

        assert.equals(q1.rows, [{'0:q1,23': 1}]);
        assert.equals(q2.rows, [{'0:q2,23': 2}]);
      });

      test('bad connect', async () => {
        const socket = await createReadySocket('/var/run/postgresql/.s.PGSQL.5432', conn);
        after(() => {socket.destroy()});
        let sql;
        try {
          await new PgProtocol({
            host: 'hello',
          }).connect(socket);
        } catch (_sql) {
          sql = _sql;
        }
        assert.equals(sql, {
          severity: 'FATAL',
          message: 'no PostgreSQL user name specified in startup packet',
          code: '28000',
          file: m.string,
          line: m.number,
          routine: m.string,
        });
      });

      test('password connect', async () => {
        after(() => simpleExec(conn, `DROP USER IF EXISTS "testuser1"`));

        await simpleExec(conn, `CREATE ROLE "testuser1" SUPERUSER LOGIN PASSWORD '123'`);

        const c2 = new PgProtocol({
          user: 'testuser1', database: process.env.KORU_DB, application_name: 'koru-test/pg-protocol',
        });

        await assert.exception(
          async () => c2.connect(await createReadySocket({host: 'localhost', port: 5432}, c2), '1234'),
          {code: '28P01'},
        );

        const c3 = new PgProtocol({
          user: 'testuser1', database: process.env.KORU_DB, application_name: 'koru-test/pg-protocol',
        });
        let err;
        try {
          await c3.connect(await createReadySocket({host: 'localhost', port: 5432}, c3), '123');
        } catch (_err) {
          err = _err;
        }
        refute(err);
      });

      test('runtimeParams', () => {
        const rp = conn.runtimeParams;

        assert.equals(rp.application_name, 'koru-test/pg-protocol');
        assert.equals(rp.TimeZone, 'UTC');
        assert.equals(rp.session_authorization, process.env.USER);
        assert.equals(rp.client_encoding, 'UTF8');
        assert.equals(rp.server_encoding, 'UTF8');
        assert.equals(conn.cancel.processId, m.number);
        assert.equals(conn.cancel.secretKey, m.number);
      });

      test('row', async () => {
        const results = [];
        try {
          const query = conn.exec(`select '{"a":"b"}'::jsonb;`);
          do {
            let columns, tag;
            query.describe((rawColumns) => {columns = buildNameOidColumns(rawColumns)});
            query.commandComplete((t) => {tag = t});
            await query.fetch((rawRow) => {
              const rec = {};
              forEachColumn(rawRow, (rawValue, i) => {
                const {name, oid} = columns[i];
                rec[name] = decodeText(oid, rawValue);
              });
              results.push(rec);
            });
            if (query.isExecuting) {
              assert.equals(tag, 'SELECT 1');
            }
          } while (query.isExecuting)
          assert.equals(results, [{jsonb: {a: 'b'}}]);
        } catch (err) {
          assert.fail(JSON.stringify(err));
        }
      });

      test('onNotice', async () => {
        const cb1 = stub();
        assert.same(conn.onNotice(cb1), undefined);
        const cb2 = stub();
        assert.same(conn.onNotice(cb2), cb1);
        const q = conn.exec(`set client_min_messages = 'debug5'`);

        const completed = [];
        q.commandComplete((tag) => {completed.push(tag)});
        do {
          await q.fetch((row) => {
            const rec = {};
            for (const field of row) {
              rec[field.desc.name] = field.rawValue.toString();
            }
          });
        } while (q.isExecuting)

        assert.equals(completed, ['SET']);

        assert.calledOnceWith(cb2, m((m) => m.severity === 'DE' + 'BUG' && m.code === '00000'));
      });

      test('copyToStream', async () => {
        let result = '';
        const format = {};
        const copy = conn.copyToStream(
          `COPY (SELECT * FROM unnest(Array[1,2,3], Array[4,5,6]) as x(a,b)) TO STDOUT`,
          (isText, cols) => {format.isText = isText, format.cols = cols},
        );
        copy.on('data', (chunk) => {result += chunk});
        try {
          await new Promise((resolve, reject) => {
            copy.on('error', reject);
            copy.on('end', resolve);
          });
        } catch (err) {
          refute(err);
        }

        assert.equals(format, {isText: true, cols: [0, 0]});

        assert.equals(result, "1\t4\n2\t5\n3\t6\n");
      });

      test('copyFromStream', async () => {
        await simpleExec(conn, 'BEGIN');
        await simpleExec(conn, 'CREATE TABLE ab (a int2, b int2)');
        after(() => simpleExec(conn, 'ROLLBACK'));

        await conn.copyFromStream(`COPY ab FROM STDIN`, (stream, format) => {
          stream.write("1\t4\n2\t5\n3\t6\n");
          stream.end();
        });

        assert.equals((await runQuery(conn.exec('SELECT * from ab'))).rows, [
          {'0:a,21': 1, '1:b,21': 4}, {'0:a,21': 2, '1:b,21': 5}, {'0:a,21': 3, '1:b,21': 6}]);
      });

      test('exec', async () => {
        const results = [];
        const query = conn.exec(`select * from unnest(Array[1,2,3], Array[4,5,6]) as x(a,b);`);
        const completed = [];
        let columns;
        query.describe((rawColumns) => {columns = buildNameOidColumns(rawColumns)});
        query.commandComplete((tag) => completed.push(tag));
        do {
          await query.fetch((rawRow) => {
            const rec = {};
            forEachColumn(rawRow, (rawValue, i) => {
              rec[columns[i].name] = decodeText(25, rawValue);
            });
            results.push(rec);
          });
          refute(query.error);
        } while (query.isExecuting)

        assert.equals(completed, ['SELECT 3']);

        assert.equals(results, [{a: '1', b: '4'}, {a: '2', b: '5'}, {a: '3', b: '6'}]);
      });

      test('error during fetch', async () => {
        const query = conn.exec(`select * from unnest(Array[1,2,3], Array[4,5,6]) as x(a,b);`);

        const myError = new Error('myError');

        const error = await query.fetch((row) => {throw myError});
        assert.isFalse(query.isExecuting);
        assert.equals(error, myError);
      });

      test('close before fetch started', async () => {
        const q1 = conn.exec(`select * from unnest(Array[1,2,3], Array[4,5,6]) as x(a,b);`);
        const q2 = conn.exec(`select * from unnest(Array[10,20,30], Array[4,5,6]) as x(a,b);`);

        const c1 = stub();
        const c2 = stub();

        const f1 = q1.fetch(c1);
        const f2 = q2.fetch(c2);

        const myError = new Error('myError');

        const close2 = q2.close(myError);
        assert.same(close2, myError);

        assert.same(await f1, undefined);
        while (q1.isExecuting) {await q1.fetch(c1)}

        assert.same(await f2, myError);
        assert.same(q2.error, myError);
      });

      test('multi exec', async () => {
        const rows = [];
        const query = conn.exec(`
select * from unnest(Array[1,2,3], Array[4,5,6]) as x(a,b);
BEGIN;
select * from unnest(Array[7,8,9], Array[4,5,6]) as x(a,b);
END;`);
        const results = [];
        let columns;
        query.describe((rawColumns) => {columns = buildNameOidColumns(rawColumns)});
        query.commandComplete((tag) => results.push(tag));
        do {
          await query.fetch((rawRow) => {
            const rec = {};
            forEachColumn(rawRow, (rawValue, i) => {
              rec[columns[i].name] = rawValue.toString();
            });
            rows.push(rec);
          });
        } while (query.isExecuting)

        assert.equals(rows, [
          {a: '1', b: '4'}, {a: '2', b: '5'}, {a: '3', b: '6'},
          {a: '7', b: '4'}, {a: '8', b: '5'}, {a: '9', b: '6'}]);
        assert.equals(results, ['SELECT 3', 'BEGIN', 'SELECT 3', 'COMMIT']);
      });
    });
  });
});
