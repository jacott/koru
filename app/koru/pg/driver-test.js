isServer && define((require, exports, module) => {
  'use strict';
  /**
   * Interface to PostgreSQL.
   *
   * @config url The default url to connect to; see
   * [pg-libpq](https://www.npmjs.com/package/pg-libpq), [libpq - Connection Strings](
   * http://www.postgresql.org/docs/current/static/libpq-connect.html#LIBPQ-CONNSTRING)
   *
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const SQLStatement    = require('./sql-statement');

  const {stub, spy, match: m} = TH;

  const API = api;

  const {private$} = require('koru/symbols');
  const pg = require('./driver');

  const mf = m.field;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    before(() => {
      api.module({subjectName: 'pg'});
    });

    afterEach(async () => {
      await pg.defaultDb.dropTable('Foo');
    });

    const clientSubject = () => API.innerSubject(pg.defaultDb.constructor, null, {
      abstract() {
        /**
         * A connection to a database.
         *
         * See {#../driver.connect}
         **/
      },
      initExample() {
        const Client = pg.defaultDb.constructor;
      },
      initInstExample() {
        const client = pg.defaultDb;
      },
    });

    group('Client', () => {
      let Client, api;

      before(() => {
        Client = pg.defaultDb.constructor;
        api = clientSubject();
      });

      test('constructor', () => {
        const Client = api.class();
        //[                  const Client = pg.defaultDb.constructor;
        const client = new Client('host=/var/run/postgresql dbname=korutest', 'public');
        const client2 = new Client(undefined, 'my name');

        assert.same(client._url, 'host=/var/run/postgresql dbname=korutest');
        assert.same(client.name, 'public');
        assert.same(client2.name, 'my name');
        //]
      });

      test('jsFieldToPg', async () => {
        api.protoMethod();
        //[
        await pg.defaultDb.withConn((conn) => {
          assert.equals(pg.defaultDb.jsFieldToPg('foo', 'text'), '"foo" text');
          assert.equals(pg.defaultDb.jsFieldToPg('foo', 'id'), '"foo" text collate "C"');
          assert.equals(pg.defaultDb.jsFieldToPg('foo', 'color'), '"foo" text collate "C"');
          assert.equals(pg.defaultDb.jsFieldToPg('foo', 'belongs_to'), '"foo" text collate "C"');
          assert.equals(pg.defaultDb.jsFieldToPg('foo', 'has_many'), '"foo" text[] collate "C"');
          assert.equals(pg.defaultDb.jsFieldToPg('runs', 'number'), '"runs" double precision');
          assert.equals(pg.defaultDb.jsFieldToPg('name'), '"name" text');
          assert.equals(pg.defaultDb.jsFieldToPg('dob', {type: 'date'}), '"dob" date');
          assert.equals(
            pg.defaultDb.jsFieldToPg('map', {type: 'object', default: {treasure: 'lost'}}),
            `"map" jsonb DEFAULT '{"treasure":"lost"}'::jsonb`);
        });
        //]
      });

      test('query', async () => {
        /**
         * Query the database with a SQL instruction. Five formats are supported (most performant
         * first):

         * 1. `query(text)` where no parameters are in the query text

         * 1. `query(text, params)` where parameters correspond to array position (1 is first
         * position)

         * 1. `query(sqlStatment, params)` where `sqlStatment` is a pre-compiled {#../sql-statement}
         * and params is a key-value object.

         * 1. `query(text, params)` where params is a key-value object

         * 1. `` query`queryTemplate` ``

         * @param {string|templateLiteral|../sql-statement} text a sql where-clause where either:

         * 1. no paramters are supplied

         * 1. `$n` parameters within the text correspond to `params` array position (n-1).

         * 1. See {#../sql-statement}

         * 1. `{$varName}` parameters within the text correspond to `params` object properties.

         * 1. `${varName}` expressions within the template get converted to parameters.

         * @param {array|object} params either an array of positional arguments or key value
         * properties mapping to the `{$varName}` expressions within `text`

         * @returns {[object]} a list of result records

         * @alias exec
         **/
        api.protoMethod();
        //[
        const a = 3, b = 2;

        assert.equals(
          (await pg.defaultDb.query(`SELECT {$a}::int + {$b}::int as ans`, {a, b}))[0].ans, 5);

        assert.equals(
          (await pg.defaultDb.query(`SELECT $1::int + $2::int as ans`, [a, b]))[0].ans, 5);

        assert.equals(
          (await pg.defaultDb.query`SELECT ${a}::int + ${b}::int as ans`)[0].ans, 5);

        const statment = new SQLStatement(`SELECT {$a}::int + {$b}::int as ans`);
        assert.equals(
          (await pg.defaultDb.query(statment, {a, b}))[0].ans, 5);
        //]
      });

      test('explainQuery', async () => {
        /**
         * Run an EXPLAIN ANALYZE on given query and return result text.
         **/
        api.protoMethod();
        //[
        const ans = await pg.defaultDb.explainQuery(`SELECT {$a}::int + {$b}::int as ans`, {a: 1, b: 2});

        assert.match(ans, /^Result.*cost=.*\nPlanning time:.*\nExecution time/i);
      });

      test('timeLimitQuery', async () => {
        /**
         * Same as {##query} but limit to time the query can run for. This method will wrap the
         * query in a transaction/savepoint. Does not support queryTemplate.

         * @param text See {##query}

         * @param params See {##query}

         * @param timeout max time for query in ms. Defaults to 20s.

         * @param timeoutMessage Defaults to "Query took too long to run";

         * @throws koru.Error `{error: 504, timeoutMessage}`
         **/
        api.protoMethod();
        //[
        try {
          assert.same((await pg.defaultDb.timeLimitQuery(`SELECT 'a' || $1 as a`, ['b']))[0].a, 'ab');

          const ans = await pg.defaultDb.timeLimitQuery(
            `SELECT pg_sleep($1)`, [0.002], {timeout: 1, timeoutMessage: 'My message'});
          assert.fail('Expected timeout ');
        } catch (e) {
          if (e.error !== 504) throw e;
          assert.same(e.reason, 'My message');
        }
        //]
      });
    });

    test('Libpq', () => {
      api.property('Libpq', {
        info: `The underling database [PG interface](https://github.com/jacott/node-pg-libpq)`});

      api.property('config', {info: 'Configuration for the database such as `url`'});

      assert.equals(pg.Libpq.connect, m.func);

      assert.equals(
        pg.config.url,
        "host=/var/run/postgresql dbname=korutest options='-c client_min_messages=ERROR'");
    });

    test('connection', async () => {
      /**
       * Create a new database Client connected to the `url`
       *
       * @param [name] The name to give to the connection. By default
       * it is the schema name.
       **/
      api.method('connect');
      const conn1 = await pg.connect(
        "host=/var/run/postgresql dbname=korutest options='-c search_path=public,pg_catalog'",
      );
      assert.equals(await conn1.query('select 1 as a'), [{a: 1}]);
      assert.same(await conn1.schemaName(), 'public');

      const conn2 = await pg.connect('postgresql://localhost/korutest', 'conn2');
      assert.same(conn2.name, 'conn2');
    });

    test('defaultDb', async () => {
      /**
       * Return the default Client database connection.
       *
       **/
      api.property('defaultDb');
      const db = pg.defaultDb;
      assert.same(db, pg.defaultDb);
      api.done();
      assert.same(db.name, 'default');

      await db.query('CREATE TABLE "Foo" (_id text PRIMARY KEY, "foo" jsonb)');
      await db.query('INSERT INTO "Foo" ("_id","foo") values ($1::text,$2::jsonb)',
                     ['123', JSON.stringify({a: 1})]);
      await db.query('INSERT INTO "Foo" ("_id","foo") values ($1::text,$2::jsonb)',
                     ['456', JSON.stringify([1])]);

      assert.same((await db.query('SELECT EXISTS(SELECT 1 FROM "Foo" WHERE "_id">$1)', ['']))[0].exists, true);
      assert.equals((await db.query('select 1+1 as a'))[0], {a: 2});
      assert.equals(await db.query('select 1 as a; select 2 as b'), [{b: 2}]);
    });

    test('isPG', () => {
      assert.same(pg.isPG, true);
    });

    test('aryToSqlStr', () => {
      const foo = pg.defaultDb.table('Foo');
      assert.same(foo.aryToSqlStr, pg.aryToSqlStr);

      assert.equals(pg.aryToSqlStr([1, 2, 'three', null]), '{1,2,three,NULL}');
      assert.equals(pg.aryToSqlStr([[1, '"', 'three', null]]), '{{1,"\\"",three,NULL}}');
    });

    test('bytea', async () => {
      const db = pg.defaultDb;
      await db.query('CREATE TABLE "Foo" (_id text PRIMARY KEY, "foo" bytea)');
      await db.query('INSERT INTO "Foo" ("_id","foo") values ($1::text,$2::bytea)',
                     ['123', Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 254, 255])]);

      const results = await db.query('select * from "Foo"');
      assert.equals(results[0].foo.toString('hex'), '000102030405060708feff');
    });

    test('insert suffix', async () => {
      const foo = pg.defaultDb.table('Foo', {
        _id: 'integer',
        name: 'text',
      });

      assert.equals(await foo.insert({_id: 123, name: 'a name'}, 'RETURNING name'), [{name: 'a name'}]);
    });

    test('override _id spec', async () => {
      const foo = pg.defaultDb.table('Foo', {
        _id: 'integer',
      });

      assert.same(foo.dbType('_id'), 'integer');

      await foo.insert({_id: 123});
      assert.isTrue(await foo.exists({_id: 123}));
      try {
        await foo.insert({_id: 123});
        assert.fail('insert should have thrown');
      } catch (err) {
        assert.exception(err, {
          error: 409, reason: m(/violates unique constraint "Foo_pkey"/),
        });
      }
    });

    test('Array insert', async () => {
      const foo = pg.defaultDb.table('Foo', {
        bar_ids: 'has_many',
      });

      assert.same(foo.dbType('bar_ids'), 'text[]');

      await foo.insert({_id: '123', bar_ids: ['1', '2', '3']});
      assert.equals((await foo.findOne({})).bar_ids, ['1', '2', '3']);
    });

    test('Array in jsonb', async () => {
      const foo = pg.defaultDb.table('Foo', {
        bar_ids: 'object',
      });

      assert.same(foo.dbType('bar_ids'), 'jsonb');
      const a = new Date();
      await foo.insert({_id: '123', bar_ids: ['1', {a}]});
      assert.equals((await foo.findOne({})).bar_ids, ['1', {a: a.toISOString()}]);
    });

    test('$elemMatch', async () => {
      const foo = pg.defaultDb.table('Foo', {
        widget: 'object',
      });

      await foo.insert(
        {_id: '123', widget: [{id: '1', value: 200}, {id: '5', value: 500}, {id: '2', value: 100}]});
      await foo.insert(
        {_id: '234', widget: [{id: '1', value: 100}, {id: '4', value: 400}, {id: '3', value: 200}]});

      const values = [];
      const where = foo.where({widget: {$elemMatch: {id: '1', value: {$in: [50, 10]}}}}, values);
      assert.equals(where, `jsonb_typeof("widget") = 'array' AND EXISTS(SELECT 1 FROM jsonb_to_recordset("widget") as __x("id" text,"value" integer) where "id"=$1 AND "value" = ANY($2))`);
      assert.equals(values, ['1', '{50,10}']);

      assert.equals(await foo.count({widget: {$elemMatch: {id: '1', value: {$in: null}}}}), 0);
      assert.equals(await foo.count({widget: {$elemMatch: {id: '1', value: {$in: [100, 200]}}}}), 2);
      assert.equals(await foo.count({widget: {$elemMatch: {id: '1', value: {$in: [100, 300]}}}}), 1);
      assert.equals(await foo.count({widget: {$elemMatch: {id: '4'}}}), 1);
      assert.equals(await foo.count({widget: {$elemMatch: {id: '6'}}}), 0);
      assert.equals(await foo.count({widget: {$elemMatch: {id: '1'}}}), 2);
      assert.equals(await foo.count({widget: {$elemMatch: {id: '1', value: 100}}}), 1);
    });

    test('multipart key', async () => {
      const foo = pg.defaultDb.table('Foo', {
        widget: 'object',
      });
      await foo.insert({_id: '123', widget: {a: {b: {c: 1}}}});

      assert.equals(await foo.count({'widget.a.b.c': 1}), 1);
      assert.equals(await foo.count({'widget.a.b.c': 2}), 0);
      assert.equals(await foo.count({'widget.a.b': {c: 1}}), 1);
      assert.equals(await foo.count({'widget.a.b': {c: 2}}), 0);
      assert.equals(await foo.count({'widget.a.b': [{c: 2}, {c: 1}]}), 1);
      assert.equals(await foo.count({'widget.a.b': [{c: 2}, {c: 3}]}), 0);
    });

    test('values', async () => {
      const foo = pg.defaultDb.table('Foo', {
        widget: 'object',
        lots: 'integer[]',
        createdOn: 'date',
        updatedAt: 'timestamp',
      });
      const data = {
        widget: 'a',
        lots: [11, 23, 44],
        createdOn: new Date(2015, 5, 12),
        updatedAt: new Date(2014, 11, 27, 23, 45, 55),
      };
      assert.equals(await foo.values(data), ['"a"', '{11,23,44}', '2015-06-12T00:00:00.000Z', '2014-12-27T23:45:55.000Z']);
      data.widget = [1, 2, {a: 3}];
      assert.equals(await foo.values(data, ['createdOn', 'widget']), ['2015-06-12T00:00:00.000Z', '[1,2,{"a":3}]']);
    });

    test('json', async () => {
      const foo = pg.defaultDb.table('Foo', {
        widget: 'object',
      });
      await foo.insert({_id: '123', widget: 'dodacky'});
      await foo.insert({_id: '124', widget: null});

      assert.equals(await foo.count({widget: 'dodacky'}), 1);
      assert.equals(await foo.count({widget: 'wazzit'}), 0);

      //should be null; not json:null
      assert.equals(await foo.count({widget: null}), 1);
    });

    test('ARRAY column', async () => {
      const foo = pg.defaultDb.table('Foo', {
        widget: 'integer[]',
      });

      assert.same(foo.dbType('widget'), 'integer[]');

      await foo.insert({_id: '123', widget: [1, 2, 3]});
      await foo.insert({_id: '456', widget: [3, 4]});

      assert.equals(await foo.count({widget: 2}), 1);
      assert.equals(await foo.count({widget: 3}), 2);
      assert.equals(await foo.count({widget: 5}), 0);
      assert.equals(await foo.count({widget: {$in: [1, 3]}}), 2);
      assert.equals(await foo.count({widget: {$nin: [1, 3]}}), 0);
      assert.equals(await foo.count({widget: {$nin: [4, 5]}}), 1);
      assert.equals(await foo.count({widget: {$in: []}}), 0);
      assert.equals(await foo.count({widget: {$nin: []}}), 2);
    });

    test('date', async () => {
      const foo = pg.defaultDb.table('Foo', {
        createdOn: 'date',
      });

      assert.same(foo.dbType('createdOn'), 'date');

      const createdOn = new Date(2015, 3, 4);
      await foo.insert({_id: '123', createdOn});

      assert.equals(await foo.count({createdOn}), 1);
      assert.equals(await foo.count({createdOn: new Date(2015, 3, 5)}), 0);
      assert.equals(await foo.count({createdOn: '2015/04/04'}), 1);
      assert.equals(await foo.values({createdOn: '2015/04/04'}),
                    ['2015-04-04T00:00:00.000Z']);
      assert.equals(await foo.values({createdOn: new Date('2015/04/04').getTime()}),
                    ['2015-04-04T00:00:00.000Z']);
    });

    test('$regex', async () => {
      const foo = pg.defaultDb.table('Foo', {
        story: 'text',
      });

      await foo.insert({_id: '123', story: 'How now brown cow'});

      assert.equals(await foo.count({story: {$regex: 'how'}}), 0);
      assert.equals(await foo.count({story: {$regex: 'cow$'}}), 1);
      assert.equals(await foo.count({story: {$regex: 'how', $options: 'i'}}), 1);
      assert.equals(await foo.count({story: {$options: 'i', $regex: 'how'}}), 1);
      assert.equals(await foo.count({story: {$regex: /how/i}}), 1);
      assert.equals(await foo.count({story: {$regex: /how/}}), 0);
    });

    group('find', () => {
      let foo;
      before(async () => {
        foo = pg.defaultDb.table('Foo', {
          name: 'text',
          createdAt: 'timestamp',
          version: 'integer',
          age: {type: 'number', default: 10},
        });

        spy(foo, '_ensureTable');
        await foo.transaction(async () => {
          let i = -1;
          for (const name of 'one two three Four five'.split(' ')) {
            await foo.insert({_id: name + ++i, name,
                              createdAt: new Date(util.dateNow() - i * 1e6)});
          }
        });
        assert.called(foo._ensureTable);
        foo._ensureTable.restore();
      });

      test('bad sql', async () => {
        const cursor = foo.find({age: 'hello'});

        try {
          try {
            await cursor.next();
          } finally {
            await cursor.close();     // should not raise error
          }
          assert.fail('expected to throw');
        } catch (err) {
          assert.exception(err, {message: m(/invalid input syntax.*hello/)});
        }
      });

      test('array param', async () => {
        assert.equals(await foo.count({name: ['one', 'three']}), 2);
        assert.equals(await foo.count({name: []}), 0);
        assert.equals(await foo.count({name: ['Four']}), 1);

        assert.equals(await foo.count({name: {$in: ['one', 'three']}}), 2);
        assert.equals(await foo.count({name: {$in: []}}), 0);
        assert.equals(await foo.count({name: {$in: ['Four']}}), 1);

        assert.equals(await foo.count({name: {$nin: ['one', 'three']}}), 3);
        assert.equals(await foo.count({name: {$nin: []}}), 5);
        assert.equals(await foo.count({name: {$nin: ['Four']}}), 4);
      });

      test('named params on _client', async () => {
        const client = foo._client;
        assert.equals(
          await client.query(
            'select count(*) from "Foo" where name like {$likeE} OR name = {$four}',
            {likeE: '%e', four: 'Four'}),
          [{count: 4}]);
      });

      test('$sql', async () => {
        assert.equals(await foo.count({$sql: "name like '%e'"}), 3);
        assert.equals(await foo.count({$sql: ['name like {$likeE} OR name = {$four}',
                                              {likeE: '%e', four: 'Four'}]}), 4);
        assert.equals(await foo.count({$sql: ['name like $1 OR name = $2', ['%e', 'Four']]}), 4);
        assert.equals(foo.show({$sql: ['{$one} + {$two} + {$one}', {one: 11, two: 22, three: 33}]}),
                      ' WHERE $1 + $2 + $1 ([11, 22])');
      });

      test('fields', async () => {
        assert.equals(await foo.findOne({_id: 'one0'}, {name: true}), {_id: 'one0', name: 'one'});
        assert.equals(await foo.findOne({_id: 'one0'}, {version: false, age: false}), {
          _id: 'one0', name: 'one', createdAt: m.date});
        await foo.transaction(async () => {
          const c = foo.find({_id: 'one0'}, {fields: {name: true, age: true}});
          assert.equals(await c.next(), {
            _id: 'one0', name: 'one', age: 10});
          try {
            foo.find({}, {fields: {age: true, name: false}});
          } catch (err) {
            assert.exception(err, 'Error', 'fields must be all true or all false');
          }
        });
      });

      test('cursor next', async () => {
        const cursor = foo.find({age: 10});
        cursor.batchSize(2);

        assert(cursor);
        try {
          assert.equals(await cursor.next(), mf('name', 'one'));
          assert.equals(await cursor.next(2), [mf('name', 'two'), mf('name', 'three')]);
          assert.same((await cursor.next(3)).length, 2);
          assert.same(await cursor.next(), undefined);
        } finally {
          await cursor.close();
        }

        await foo.transaction(async () => {
          const cursor = foo.find({name: 'one'});
          assert.equals(await cursor.next(1), [mf('_id', 'one0')]);
          assert.equals(await cursor.next(1), []);
          await cursor.close(); // optional since in transaction
        });
      });

      test('cursor with options', async () => {
        let cursor = foo.find({age: 10}, {limit: 1, sort: ['name']});
        try {
          assert.equals(await cursor.next(2), [mf('name', 'five')]);
        } finally {
          cursor.close();
        }
        cursor = foo.find({age: 10}, {limit: 1, offset: 2, sort: ['name']});
        try {
          assert.equals(await cursor.next(2), [mf('name', 'one')]);
        } finally {
          await cursor.close();
        }
      });

      test('collation', async () => {
        let cursor = foo.find({}, {sort: ['(name collate "C")']});
        assert.equals((await cursor.next(100)).map((d) => d.name), [
          'Four', 'five', 'one', 'three', 'two',
        ]);

        cursor = foo.find({}, {sort: ['name']}); // natural en_US
        assert.equals((await cursor.next(100)).map((d) => d.name), [
          'five', 'Four', 'one', 'three', 'two',
        ]);
      });
    });

    group('Static table', () => {
      let foo;
      before(() => {
        foo = pg.defaultDb.table('Foo', {
          name: 'text',
          age: {type: 'number', default: 10},
        });
      });

      beforeEach(async () => {
        await foo.insert({_id: '123', name: 'abc'});
        await foo.insert({_id: '456', name: 'def'});
      });

      afterEach(async () => {
        await foo._client.query('truncate "Foo"');
      });

      test('_resetTable', async () => {
        assert.same(foo._ready, true);
        foo._resetTable();
        assert.same(foo._ready, undefined);

        const c = foo.find({name: 'abc'});
        assert.equals(await c.next(), {_id: '123', name: 'abc', age: 10});
        assert.same(foo._ready, true);
      });

      test('ensureIndex', async () => {
        await foo.ensureIndex({name: -1}, {unique: true});

        await foo.insert({_id: '1', name: 'Foo'});
        try {
          await foo.insert({_id: '2', name: 'Foo'});
          assert.fail('expected throw');
        } catch (err) {
          assert.exception(err, {error: 409});
        }

        await foo.ensureIndex({name: -1}, {unique: true});
        await foo.ensureIndex({name: 1, _id: -1});
      });

      test('findOne', async () => {
        assert.equals(await foo.findOne({_id: '456'}), {_id: '456', name: 'def', age: 10});
      });

      test('findById', async () => {
        assert.equals(await foo.findById('456'), {_id: '456', name: 'def', age: 10});
        assert.equals(await foo.findById('123'), {_id: '123', name: 'abc', age: 10});
      });

      test('query all', async () => {
        assert.equals(await foo.query({}), [
          {_id: '123', name: 'abc', age: 10}, {_id: '456', name: 'def', age: 10}]);
      });

      test('$inequality', async () => {
        await foo.insert({_id: '789', name: 'ghi'});
        assert.same(await foo.count({name: {$regex: '[AG]', $ne: 'ghi', $options: 'i'}}), 1);
        assert.same(await foo.count({name: {$gt: 'abc', $lt: 'ghi'}}), 1);
        assert.same(await foo.count({name: {'>': 'abc', $ne: 'def'}}), 1);
        assert.same(await foo.count({name: {$gte: 'abc', $in: ['def', 'ghi']}}), 2);
        assert.same(await foo.count({age: {$ne: 10}}), 0);
        assert.same(await foo.count({name: {$ne: 'abc'}}), 2);
        assert.same(await foo.count({name: {'!=': 'aabc'}}), 3);
        assert.same(await foo.count({name: {'>=': 'abcd'}}), 2);
        assert.same(await foo.count({name: {$gt: 'abc'}}), 2);
        assert.same(await foo.count({name: {'<=': 'abc'}}), 1);
        assert.same(await foo.count({name: {$lte: 'abc'}}), 1);
        assert.same(await foo.count({name: {'<': 'abc'}}), 0);
        assert.same(await foo.count({name: null}), 0);
        assert.same(await foo.count({name: {$ne: null}}), 3);
      });

      test("can't add field", async () => {
        try {
          await foo.update({name: 'abc'}, {foo: 'eee'});
          assert.fail('expected throw');
        } catch (err) {
          assert.exception(err, {sqlState: '42703'});
        }
      });

      test('abort startTransaction, endTransaction', async () => {
        const client = foo._client;
        clientSubject().protoProperty('inTransaction', {intro() {
          /**
           * determine if client is in a transaction
           **/
        }});

        assert.isFalse(client.inTransaction);
        const tx = await client.startTransaction(); {
          assert.isTrue(client.inTransaction);
          await foo.updateById('123', {name: 'a1'});

          assert.same(await client.startTransaction(), tx);
          {
            assert.isTrue(client.inTransaction);
            assert.equals(tx.savepoint, 1);

            await foo.updateById('123', {name: 'a2'});
            assert.equals((await foo.findOne({_id: '123'})).name, 'a2');
          }
          assert.same(await client.endTransaction('abort'), 1);

          assert.equals((await foo.findOne({_id: '123'})).name, 'a1');
        }
        assert.same(await client.endTransaction('abort'), 0);
        assert.isFalse(client.inTransaction);
        assert.equals((await foo.findOne({_id: '123'})).name, 'abc');
        try {
          await client.endTransaction('abort');
        } catch (err) {
          assert.exception(err, {message: 'No transaction in progress!'});
        }
      });

      test('commit startTransaction, endTransaction', async () => {
        await foo._client.startTransaction(); {
          await foo.updateById('123', {name: 'a1'});

          await foo._client.startTransaction(); {
            await foo.updateById('123', {name: 'a2'});
            assert.equals((await foo.findOne({_id: '123'})).name, 'a2');
          } await foo._client.endTransaction();
          assert.equals((await foo.findOne({_id: '123'})).name, 'a2');
        } await foo._client.endTransaction();
        assert.equals((await foo.findOne({_id: '123'})).name, 'a2');
      });

      test('update schema', async () => {
        await foo.updateSchema({
          name: 'text',
          age: {type: 'number', default: 10},
          createdAt: 'timestamp',
        });
        await foo.update({name: 'abc'}, {name: 'eee'});
        assert.equals(await foo.query({name: 'eee'}), [{_id: '123', name: 'eee', age: 10}]);
        const createdAt = new Date();
        await foo.updateById('123', {createdAt});
        assert.equals((await foo.findOne({_id: '123'})).createdAt, createdAt);
      });
    });

    group('Dynamic table', () => {
      let foo;
      before(() => {
        foo = pg.defaultDb.table('Foo');
      });

      beforeEach(async () => {
        assert.same(await foo.insert({_id: '123', name: 'abc'}), 1);
        await foo.insert({_id: '456', name: 'abc'});
      });

      afterEach(async () => {
        await foo._client.query('truncate "Foo"');
      });

      test('transaction rollback', async () => {
        try {
          await foo.transaction(async () => {
            assert.same(await foo.updateById('123', {foo: 'eee'}), 1);
            assert.equals((await foo.findOne({_id: '123'})).foo, 'eee');
            throw 'abort';
          });
        } catch (ex) {
          if (ex !== 'abort') throw ex;
        }
        assert.msg('should not  have a foo column')
          .equals(await foo.findOne({_id: '123'}), {_id: '123', name: 'abc'});
      });

      test('query all', async () => {
        assert.equals(await foo.query({}), [{_id: '123', name: 'abc'}, {_id: '456', name: 'abc'}]);
      });

      test('updateById', async () => {
        assert.same(await foo.updateById('123', {name: 'zzz', age: 7}), 1);
        assert.equals(await foo.query({_id: '123'}), [{_id: '123', name: 'zzz', age: 7}]);
      });

      test('update', async () => {
        assert.same(await foo.update({name: 'abc'}, {name: 'def'}), 2);

        assert.equals(
          await foo.query({name: 'def'}), [{_id: '123', name: 'def'}, {_id: '456', name: 'def'}]);
        assert.same(await foo.update({_id: '123'}, {name: 'zzz', age: 7}), 1);

        assert.equals(await foo.query({_id: '123'}), [{_id: '123', name: 'zzz', age: 7}]);
        assert.equals(await foo.findOne({_id: '123'}), {_id: '123', name: 'zzz', age: 7});
        assert.equals(await foo.findOne({_id: '456'}), {_id: '456', name: 'def'});
      });

      test('count', async () => {
        assert.same(await foo.count({name: 'abc'}), 2);
      });

      test('exists', async () => {
        assert.isTrue(await foo.exists({name: 'abc'}));
        assert.isFalse(await foo.exists({name: 'abcx'}));
      });

      test('remove', async () => {
        assert.same(await foo.remove({_id: '123'}), 1);

        assert.equals(await foo.query({}), [{_id: '456', name: 'abc'}]);

        await foo.remove({});

        assert.equals(await foo.query({}), []);
      });

      test('truncate', async () => {
        await foo.truncate();

        assert.equals(await foo.query({}), []);
      });
    });
  });
});
