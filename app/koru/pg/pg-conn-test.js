isServer && define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const PgProtocol      = require('koru/pg/pg-protocol');
  const PgType          = require('koru/pg/pg-type');
  const TH              = require('koru/test-helper');

  const net = requirejs.nodeRequire('node:net');

  const {stub, spy, util, match: m} = TH;

  const PgConn = require('./pg-conn');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    before(() => {
      PgType.registerOid('name', 19, 1003);
    });

    group('connect', () => {
      test('bad options', async () => {
        spy(net, 'createConnection');

        await assert.exception(
          () => new PgConn(PgType).connect({
            port: 5432,
            user: 'bad-user',
          }),
          {severity: 'FATAL', code: '28000'});

        const socket = net.createConnection.firstCall.returnValue;
        assert.isTrue(socket.closed);
      });

      group('connection string parsing', () => {
        let socket, connect;
        beforeEach(() => {
          socket = {
            write: stub(),
            once: stub(),
            on: stub(),
            removeListener: stub(),
          };
          stub(net, 'createConnection').returns(socket);
          connect = stub(PgProtocol.prototype, 'connect').returns({then: stub()});
        });

        test('bad connection string', async () => {
          const assertError = (str, message='Invalid connection string') => assert.exception(
            () => new PgConn(PgType).connect(str),
            {severity: 'FATAL', message});

          await assertError('noequals');
          await assertError('novalue=');
          await assertError(`noterm='abc=123 c=456`);
        });

        test('error during connect', async () => {
          connect.restore();
          const error = socket.on.withArgs('error');
          const p = new PgConn(PgType).connect({user: 'x'});

          assert.calledWith(socket.once, 'connect', m.func);
          refute.called(socket.write);

          const fut = new Future();

          socket.write.invokes(() => {fut.resolve()});
          socket.once.yieldAndReset();

          await fut.promiseAndReset();
          assert.calledWith(socket.write, new Uint8Array([0, 0, 0, 16, 0, 3, 0, 0, 117, 115, 101, 114, 0, 120, 0, 0]));

          error.yield('bad connect');

          await assert.exception(() => p, {severity: 'FATAL', message: 'bad connect'});
        });

        test('unix string options', () => {
          const p = new PgConn(PgType).connect(
            `host=/my/socket port=1234 user='myuser' dbname="mydb" options='-c application_name=myapp'`);

          assert.calledWith(net.createConnection, '/my/socket/.s.PGSQL.1234');

          assert.calledOnceWith(socket.once, 'connect', m.func);

          socket.once.yieldAndReset();

          const pgproto = connect.firstCall.thisValue;

          assert.equals(pgproto.options, {
            user: 'myuser',
            database: 'mydb',
            options: '-c application_name=myapp',
          });
        });

        test('unix url', () => {
          const p = new PgConn(PgType).connect(`postgresql:///mydb?user=myuser&application_name=myapp&client_encoding=UTF8`);

          assert.calledWith(net.createConnection, '/var/run/postgresql/.s.PGSQL.5432');

          socket.once.yieldAndReset();
          const pgproto = connect.firstCall.thisValue;

          assert.equals(pgproto.options, {
            user: 'myuser',
            database: 'mydb',
            application_name: 'myapp',
            client_encoding: 'UTF8',
          });
        });

        test('network url', () => {
          const p = new PgConn(PgType).connect(`postgresql://me:pw@test.com/mydb?application_name=myapp&keepalives=1`);

          assert.calledWith(net.createConnection, {port: 5432, host: 'test.com', keepAlive: true});

          socket.once.yieldAndReset();
          assert.equals(connect.firstCall.args, [socket, 'pw']);
          const pgproto = connect.firstCall.thisValue;

          assert.equals(pgproto.options, {
            user: 'me',
            database: 'mydb',
            application_name: 'myapp',
          });
        });
      });
    });

    test('handle bad message during connect', async () => {
      const ps = TH.promiseStub();
      const fut = new Future();
      const connect = stub(PgProtocol.prototype, 'connect').invokes((c) => {
        fut.resolve();
        return ps;
      });
      const p = new PgConn(PgType).connect({});

      await fut.promiseAndReset();

      assert.calledOnceWith(ps.then, m.func, m.func);
      ps.then.firstCall.args[1]({severity: 'FATAL', message: 'test failure'});

      await assert.exception(
        () => p,
        {severity: 'FATAL', message: 'test failure'});
    });

    group('with connection', () => {
      let client;

      const connect = (formatOptions) => new PgConn(PgType, formatOptions).connect({
        dbname: process.env.KORU_DB,
        port: 5432,
        options: '-c application_name=korutest',
      });

      before(async () => {
        client = await connect();
      });

      after(() => {
        client.destroy();
      });

      test('execRows', async () => {
        const query = client.execRows(`SELECT 1+2 as a`);
        const result = [];
        do {
          await query.fetch((row) => {result.push(row)});
        } while (query.isExecuting)

        assert.equals(result, [{a: 3}]);
      });

      test('bad query', async () => {
        await assert.exception(
          () => client.exec(`SELECT $1`),
          {severity: 'ERROR', message: `there is no parameter $1`, code: '42P02'},
        );
      });

      test('begin/rollback', async () => {
        assert.equals(await client.exec(`BEGIN`), 'BEGIN');
        assert.equals(await client.exec(`create table "Test1" (_id TEXT PRIMARY KEY, v int4)`), 0);
        assert.equals(await client.exec(`insert into "Test1" VALUES ('hello')`), 1);
        assert.equals(await client.exec(`insert into "Test1" VALUES ('world', $1)`, [123]), 1);
        assert.equals(await client.exec(`SELECT * from "Test1"`), [{_id: 'hello'}, {_id: 'world', v: 123}]);
        assert.equals(await client.exec(
          `SELECT table_name FROM information_schema.columns WHERE table_name = $1 and column_name = $2`,
          ['Test1', 'v'],
        ), [{table_name: 'Test1'}]);

        assert.equals(await client.exec(`ROLLBACK`), 'ROLLBACK');
      });

      test('nulls', async () => {
        const client2 = await connect({excludeNulls: false});
        after(() => {client2.destroy()});

        assert.equals(await client.exec(`SELECT 1+2 as a, null as b`), [{a: 3}]);
        assert.equals(await client2.exec(`SELECT 1+2 as a, null as b`), [{a: 3, b: null}]);
      });

      test('bytea', async () => {
        const u8 = new Uint8Array([0, 1, 2, 127, 255]);

        assert.equals(await client.exec(`SELECT $1 as b`, [u8]), [{b: u8}]);
        assert.equals(await client.exec(`SELECT $1::bytea as b`, ['\\x0001027fff'], [25]), [{b: u8}]);
        assert.equals(await client.exec(`SELECT $1 as b`, [u8], [17]), [{b: u8}]);
        assert.equals(await client.exec(`SELECT $1 as b`, [u8], [17], [1]), [{b: u8}]);
      });

      test('use after error', async () => {
        await assert.exception(
          () => client.exec(`SELECT $1 $2`, [1, 2]),
          {code: '42601'},
        );
        assert.equals(await client.exec('SELECT 1 as a'), [{a: 1}]);
      });

      test('exec with params', async () => {
        after(() => {client.formatOptions = {}});
        client.formatOptions = {excludeNulls: false};
        assert.equals(
          await client.exec(`SELECT $1::int4 as i, $2 as t, $3 as n`, [123, 'hello', null]),
          [{i: 123, t: 'hello', n: null}]);

        assert.equals(
          await client.exec(`SELECT $1 as i, $2 as t, $3 as n`, [123, 'hello', null], [23, 25, 25], [1, 1, 1]),
          [{i: 123, t: 'hello', n: null}]);

        assert.equals(
          await client.exec(`SELECT $1 as i, $2 as t, $3 as n`, [123, 'hello', null], [23, 25, 25]),
          [{i: 123, t: 'hello', n: null}]);

        assert.equals(
          await client.exec(`SELECT $1::int4 as n`, ['123'], [0], [1]),
          [{n: 123}]);

        assert.equals(
          await client.exec(`SELECT $1 as n`, ['123'], [23], [1]),
          [{n: 123}]);
      });
    });
  });
});
