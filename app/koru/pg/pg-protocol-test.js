isServer && define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const {decodeText}    = require('koru/pg/pg-type');
  const {forEachColumn, buildNameOidColumns} = require('koru/pg/pg-util');
  const TH              = require('koru/test');
  const {createReadySocket, readResult} = require('./pg-test-helper');

  const {private$} = require('koru/symbols');

  const {stub, spy, util, match: m} = TH;

  const PgProtocol = require('./pg-protocol');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    group('with Conn', () => {
      let conn;

      before(async () => {
        conn = await new PgProtocol({
          user: process.env.USER, database: process.env.KORU_DB, application_name: 'koru-test/pg-protocol',
        }).connect(await createReadySocket('/var/run/postgresql/.s.PGSQL.5432', conn));
      });

      after(() => {
        conn.close();
        conn.socket.destroy();
      });

      test('test scheduling', async () => {
        const q1 = readResult(conn.exec(`select 1 as q1`));
        const q2 = readResult(conn.exec(`select 2 as q2`));

        const [ans1, ans2] = await Promise.all([q1, q2]);

        assert.equals(ans1, [{'0:q1,23': 1}]);
        assert.equals(ans2, [{'0:q2,23': 2}]);
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
          while (query.isExecuting) {
            let columns;
            await query.fetch((rawRow) => {
              columns ??= buildNameOidColumns(query.rawColumns);
              const rec = {};
              forEachColumn(rawRow, (rawValue, i) => {
                const {name, oid} = columns[i];
                rec[name] = decodeText(oid, rawValue);
              });
              results.push(rec);
            });
            if (query.isExecuting) {
              assert.equals(query.getCompleted(), 'SELECT 1');
            }
          }
          assert.equals(results, [{jsonb: {a: 'b'}}]);
        } catch (err) {
          assert.fail(JSON.stringify(err));
        }
      });

      test('onNotice', async () => {
        const cb1 = stub();
        assert.same(conn.onNotice(cb1), void 0);
        const cb2 = stub();
        assert.same(conn.onNotice(cb2), cb1);
        const q = conn.exec(`set client_min_messages = 'debug5'`);

        const completed = [];
        do {
          await q.fetch((row) => {
            const rec = {};
            for (const field of row) {
              rec[field.desc.name] = field.rawValue.toString();
            }
          });
          completed.push(q.getCompleted());
        } while(q.isExecuting);

        assert.equals(completed, ['SET', void 0]);

        assert.calledOnceWith(cb2, m((m) => m.severity === 'DE' + 'BUG' && m.code === '00000'));
      });

      test('exec', async () => {
        const results = [];
        const query = conn.exec(`select * from unnest(Array[1,2,3], Array[4,5,6]) as x(a,b);`);
        let columns;
        const completed = [];
        do {
          await query.fetch((rawRow) => {
            columns ??= buildNameOidColumns(query.rawColumns);
            const rec = {};
            forEachColumn(rawRow, (rawValue, i) => {
              rec[columns[i].name] = decodeText(25, rawValue);
            });
            results.push(rec);
          });
          refute(query.error);
          query.isExecuting && completed.push(query.getCompleted());
        } while(query.isExecuting);

        assert.equals(completed, ['SELECT 3']);

        assert.equals(results, [{a: '1', b: '4'}, {a: '2', b: '5'}, {a: '3', b: '6'}]);
      });

      test('error during fetch', async () => {
        const query = conn.exec(`select * from unnest(Array[1,2,3], Array[4,5,6]) as x(a,b);`);

        const myError = new Error('myError');

        const error = await query.fetch((row) => {throw myError;});
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

        assert.same(await f1, void 0);
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
        do {
          await query.fetch((rawRow) => {
            columns ??= buildNameOidColumns(query.rawColumns);
            const rec = {};
            forEachColumn(rawRow, (rawValue, i) => {
              rec[columns[i].name] = rawValue.toString();
            });
            rows.push(rec);
          });
          if (query.getCompleted() === void 0) break;
          results.push(query.getCompleted());
        } while (query.isExecuting);

        assert.equals(rows, [
          {a: '1', b: '4'}, {a: '2', b: '5'}, {a: '3', b: '6'},
          {a: '7', b: '4'}, {a: '8', b: '5'}, {a: '9', b: '6'}]);
        assert.equals(results, ['SELECT 3', 'BEGIN', 'SELECT 3', 'COMMIT']);
      });
    });
  });
});
