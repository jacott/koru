isServer && define((require, exports, module) => {
  'use strict';
  /**
   * Run Database migrations to apply or revert changes to a database in order to align the DB with
   * the expectations of the source code.
   *
   * Files are executed in alphanumeric order and are conventionally named:
   *
   * `yyyy-mm-ddThh-mm-ss-usage.js` where `usage` is like `create-user`, `add-index-to-book`
   *
   * Example: `2018-12-20T05-38-09-add-author_id-to-book.js`

   * Migrations also adds a table called "Migration" to the db which has one column `name`
   * containing all the successfully run migrations.
   **/
  const ModelMap        = require('koru/model/map');
  const DBDriver        = require('koru/pg/driver');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy} = TH;

  const Migration = require('./migration');

  TH.testCase(module, ({after, beforeEach, afterEach, group, test}) => {
    let sut, client;
    beforeEach(async () => {
      client = DBDriver.defaultDb;
      sut = new Migration(client);
      (await client.startTransaction()).transaction = 'ROLLBACK';
    });

    afterEach(async () => {
      await client.endTransaction('abort');
    });

    const migDir = () => module.id.replace(/\/[^/]*$/, '/test-migrations');

    group('Commander', () => {
      const define = (body) => body();

      const innerSubject = () => api.innerSubject(Migration[isTest].Commander, null, {
        abstract() {
          /**
           * The facilitator of a migration. An instance is passed to a migration file and is used to
           * define the actions to apply or revert for this migration entry.
           *
           * # Example
           * ```js
           * define(()=> mig =>{
           *   mig.addColumns("Book", "topic_id:id");
           * });
           * ```
           **/
        },
        initExample() {},
        initInstExample: '// file contents',
      });

      test('createTable', async () => {
        /**
         * Create a table in the database. Arguments may also be named (`{name, fields, indexes}`)

         * @param name the name of the table

         * @param fields name-value entries describing the fields of the table. The value for each
         * field can be a string containing the type or a object containing:



         * @param indexes a list of index specifications to add to the table. See {##addIndex}
         **/
        innerSubject().protoMethod();
        after(() => {delete ModelMap.Label});
        const _resetTable = stub();
        ModelMap.Label = {docs: {_resetTable}};
        const migBody =
              //[
              define(() => (mig) => {
                mig.createTable(
                  'Label',
                  {
                    name: 'text',
                    backgroundColor: {type: 'color', default: '#ffffff'},
                  },
                  [
                    {columns: ['name DESC', '_id'], unique: true},
                    ['backgroundColor']]); //  columns
              });
        //]
        await sut.addMigration('20151003T20-30-20-create-label', migBody);
        assert.called(_resetTable);

        const Label = client.table('Label');
        await Label._ensureTable();

        //[#

        assert.equals(Label._colMap._id.oid, 25);
        assert.equals(Label._colMap._id.collation_name, 'C');

        assert.equals(Label._colMap.name.oid, 25);
        assert.equals(Label._colMap.name.collation_name, void 0);

        assert.equals(Label._colMap.backgroundColor.oid, 25);
        assert.equals(Label._colMap.backgroundColor.collation_name, 'C');

        await client.query('INSERT INTO "Label" (_id, "name") values ($1,$2)', [
          '12345670123456789', 'Bug']);
        const doc = (await client.query('SELECT * from "Label"'))[0];
        assert.same(doc._id, '12345670123456789');
        assert.same(doc.name, 'Bug');
        assert.same(doc.backgroundColor, '#ffffff');
        //]
        let row = (await client.query(
          'SELECT * FROM information_schema.columns WHERE table_name = $1 and column_name = $2',
          ['Label', '_id']))[0];
        assert.equals(row.data_type, 'text');

        row = (await client.query(
          'SELECT * FROM information_schema.columns WHERE table_name = $1 and column_name = $2',
          ['Label', 'backgroundColor']))[0];
        assert.equals(row.column_default, "'#ffffff'::text");
        assert.equals(row.data_type, 'text');

        let migs = await client.query('SELECT * FROM "Migration"');
        assert.same(migs.length, 1);

        assert.equals(migs[0].name, '20151003T20-30-20-create-label');

        const indexes = await client.query(
          'select * from pg_indexes where tablename = $1 ORDER BY indexname', ['Label']);
        assert.same(indexes.length, 3);
        assert.equals(indexes[0].indexname, 'Label_backgroundColor');
        assert.equals(indexes[1].indexname, 'Label_name__id');

        assert.same(indexes[0].indexdef.replace(/public\./g, ''),
                    'CREATE INDEX "Label_backgroundColor" ON "Label" USING btree ("backgroundColor")');
        assert.same(indexes[1].indexdef.replace(/public\./g, ''),
                    'CREATE UNIQUE INDEX "Label_name__id" ON "Label" USING btree (name DESC, _id)');

        await sut.addMigration('20151003T20-30-20-create-label', (mig) => {
          assert(false, 'should not run twice');
        });

        // reverse

        await sut.revertMigration('20151003T20-30-20-create-label', migBody);

        migs = await client.query('SELECT * FROM "Migration"');
        assert.same(migs.length, 0);

        assert.same((await client.query('select exists(select 1 from pg_catalog.pg_class where relname = $1)',
                                        ['Label']))[0].exists, false);
      });

      test('field strings for create', async () => {
        after(() => {delete ModelMap.TestTable});
        await sut.addMigration('20151003T20-30-20-create-TestModel', (mig) => {
          spy(sut._client, 'query');
          mig.createTable({
            name: 'TestTable',
            fields: ['myName', "age:jsonb default '7'::jsonb"]});
        });
        assert.calledWith(sut._client.query, `CREATE TABLE "TestTable" (_id text collate "C" PRIMARY KEY,"myName" text,"age" jsonb default '7'::jsonb)`);
      });

      test('explict primary key in create', async () => {
        await sut.addMigration('20151003T20-30-20-create-TestModel', (mig) => {
          mig.createTable('TestTable', {
            name: 'text',
            foo: {type: 'integer primary KEY'},
          });
        });
        await client.query('INSERT INTO "TestTable" (foo, name) values ($1,$2)', [2, 'foo']);
        const doc = (await client.query('SELECT * from "TestTable"'))[0];
        assert.same(doc.foo, 2);
        refute.hasOwn(doc, '_id');
        await assert.exception(
          () => client.query('INSERT INTO "TestTable" (foo, name) values ($1,$2)', [2, 'foo']),
          {code: '23505'});
      });

      test('no primary key', async () => {
        await sut.addMigration('20151003T20-30-20-create-TestModel', (mig) => {
          mig.createTable({
            name: 'TestTable',
            primaryKey: false,
            fields: {
              name: 'text',
              foo: {type: 'integer'},
            },
          });
        });
        await client.query('INSERT INTO "TestTable" (foo, name) values ($1,$2)', [2, 'foo']);
        await client.query('INSERT INTO "TestTable" (foo, name) values ($1,$2)', [2, 'foo']);
        const doc = (await client.query('SELECT * from "TestTable"'))[0];
        assert.same(doc.foo, 2);
        refute.hasOwn(doc, '_id');
      });

      test('unlogged create', async () => {
        spy(client, 'query');
        await sut.addMigration('20151003T20-30-20-create-TestModel', (mig) => {
          mig.createTable({name: 'TestTable', unlogged: true, fields: {
            name: 'text',
            foo: {type: 'integer primary KEY'},
          }});
        });
        assert.calledWith(
          client.query,
          `CREATE UNLOGGED TABLE "TestTable" ("foo" integer primary KEY,"name" text)`);
        client.query.restore();
        await client.query('INSERT INTO "TestTable" (foo, name) values ($1,$2)', [2, 'foo']);
        const doc = (await client.query('SELECT * from "TestTable"'))[0];
        assert.same(doc.foo, 2);
        refute.hasOwn(doc, '_id');
      });

      test('addIndex', async () => {
        /**
         * Add an index to a table.

         * @param tableName The name of the table to add the index to.

         * @param spec The specification of the index containing:

         *
         * |name|type|desc|
         * |:---|:---|:---|
         * | columns | `Array` | a list of column names with optional `' DESC'` suffix. |
         * | [name] | `String` | The name of index. default is made from table name and column names. |
         * | [unique] | `Boolean` | `true` if index entries are unique. |
         * | [where] | `String` | An SQL expression to determine if a record is included in the index. |
         *
         **/
        innerSubject().protoMethod();
        after(() => {delete ModelMap.Book});
        ModelMap.Book = {docs: {_resetTable: stub()}};

        await sut.addMigration(
          '20151003T20-30-20-create-TestModel',
          (mig) => mig.createTable('Book', {title: 'text', pageCount: 'int8'}));

        const migBody =
              //[
              define(() => (mig) => {
                mig.addIndex('Book', {
                  columns: ['title DESC', '_id'],
                  unique: true,
                  where: '"pageCount" > 50',
                });

                mig.addIndex('Book', {
                  name: 'short_books',
                  columns: ['title DESC'],
                  where: '"pageCount" < 50',
                });
              });
        //]
        await sut.addMigration('20151004T20-30-20-add-index', migBody);

        let index = (await client.query(
          'select indexdef from pg_indexes where indexname = $1', ['Book_title__id']))[0];

        assert(index);
        assert.same(
          index.indexdef.replace(/public\./g, ''),
          'CREATE UNIQUE INDEX "Book_title__id" ON "Book" USING btree (title DESC, _id)' +
            ' WHERE ("pageCount" > 50)');

        index = (await client.query(
          'select indexdef from pg_indexes where indexname = $1', ['short_books']))[0];

        assert(index);
        assert.same(
          index.indexdef.replace(/public\./g, ''),
          'CREATE INDEX short_books ON "Book" USING btree (title DESC)' +
            ' WHERE ("pageCount" < 50)');

        await sut.revertMigration('20151004T20-30-20-add-index', migBody);

        assert.equals((await client.query(
          'select indexname from pg_indexes where tablename = $1', ['Book']))
                      .map((r) => r.indexname), ['Book_pkey']);
      });

      group('addColumns', () => {
        /**
         * Add columns to a DB table.

         * @param tableName the name of the table to add the columns to.

         * @param args either a list of `column:type` strings or an object with column keys and
         * either; type as values; or an object value containing a `type` key and optional `default`
         * key.
         **/
        beforeEach(() => {
          innerSubject().protoMethod();
        });

        test('addColumns by object', async () => {
          after(() => {delete ModelMap.Book});
          const _resetTable = stub();
          ModelMap.Book = {docs: {_resetTable}};

          await sut.addMigration('20151003T20-30-20-create-book', (mig) => mig.createTable('Book'));

          const migBody =
                //[
                define(() => (mig) => {
                  mig.addColumns('Book', {
                    pageCount: {type: 'int8', default: 0},
                    author_id: 'id',
                  });
                });
          //]
          await sut.addMigration('20151004T20-30-20-add-column', migBody);

          assert.called(_resetTable);

          await client.query('INSERT INTO "Book" (_id, author_id) values ($1,$2)',
                             ['book123', 'author456']);
          let doc = (await client.query('SELECT * from "Book"'))[0];
          assert.same(doc.pageCount, 0);
          assert.equals(doc.author_id, 'author456');

          await sut.revertMigration('20151004T20-30-20-add-column', migBody);

          doc = (await client.query('SELECT * from "Book"'))[0];
          assert.same(doc.pageCount, void 0);
          assert.same(doc.author_id, void 0);
        });

        test('addColumns by arguments', async () => {
          after(() => {delete ModelMap.Book});
          await sut.addMigration('20151003T20-30-20-create-book', (mig) => mig.createTable('Book'));

          const _resetTable = stub();
          ModelMap.Book = {docs: {_resetTable}};
          const migBody =
                //[
                define(() => (mig) => {
                  mig.addColumns('Book', 'pageCount:int8', 'title');
                });
          //]
          await sut.addMigration('20151004T20-30-20-add-column', migBody);

          assert.called(_resetTable);

          await client.query('INSERT INTO "Book" (_id, title, "pageCount") values ($1,$2,$3)',
                             ['book123', 'War and Peace', 1225]);
          let doc = (await client.query('SELECT * from "Book"'))[0];
          assert.same(doc.title, 'War and Peace');
          assert.same(doc.pageCount, 1225);

          await sut.revertMigration('20151004T20-30-20-add-column', migBody);

          doc = (await client.query('SELECT * from "Book"'))[0];
          assert.same(doc.title, void 0);
          assert.same(doc.pageCount, void 0);
        });
      });

      test('reversible', async () => {
        /**
         * Execute reversible database instructions.

         * @param add a function to call when adding a migration (migrate up) to the DB. Is passed a
         * {#koru/pg/driver::Client} instance.

         * @param revert a function to call when reverting a migration (migrate down) to the DB. Is
         * passed a {#koru/pg/driver::Client} instance.

         * @param resetTables a List of tables to reset the schema definition for
         **/
        innerSubject().protoMethod();
        after(() => {
          delete ModelMap.Book;
          delete ModelMap.Author;
        });
        const resetBook = stub();
        ModelMap.Book = {docs: {_resetTable: resetBook}};

        await sut.addMigration('20151003T20-30-20-create-book',
                               (mig) => mig.createTable('Book', {name: 'text'}));

        const migBody =
              //[
              define(() => (mig) => {
                mig.reversible({
                  async add(client) {
                    await client.query(`alter table "Book" rename column name to title`);
                    await client.query(`insert into "Book" (_id, title) values ('book123', 'Emma')`);
                  },
                  async revert(client) {
                    await client.query(`delete from "Book"`);
                    await client.query(`alter table "Book" rename column title to name`);
                  },
                  resetTables: ['Book'],
                });
              });
        //]
        await sut.addMigration('20151004T20-30-20-reversible', migBody);
        assert.same((await client.query('select title from "Book" '))[0].title, 'Emma');


        // reverse

        await sut.revertMigration('20151004T20-30-20-reversible', migBody);

        assert.same((await client.query('select name from "Book" ')).length, 0);

        assert.calledThrice(resetBook);
      });
    });

    test('migrateTo', async () => {
      /**
       * Migrate the DB to a position. Each migration is run within a transaction so that it only
       * modifies the DB if it succeeds. If a migration fails no further migrations are run.

       * @param dirPath the directory containing the migration files

       * @param pos Migration files contained in the `dirPath` directory which have not yet been
       * processed and their names are `<= pos` are applied; names `> pos` which have already been
       * applied are reverted.

       * @param verbose print messages to `console.log` as files are processed.
       **/
      api.protoMethod();
      const dir = migDir();

      await sut.migrateTo(dir, '2015-06-19T17-57-32');

      const date = new Date(2015, 3, 4);
      await client.query('INSERT INTO "TestTable" (_id, name, baz) values ($1,$2,$3)', [
        '1', 'foo', date]);

      await sut.migrateTo(dir, '2015-06-19T17-49-31~');

      assert.equals((await client.query('SELECT bar from "TestTable"'))[0].bar, date);

      stub(console, 'log');
      await sut.migrateTo(dir, ' ', true);

      assert.called(console.log);
      assert.same((await client.query('select exists(select 1 from pg_catalog.pg_class where relname = $1)',
                                      ['TestTable']))[0].exists, false);
    });

    test('recordAllMigrations', async () => {
      const dir = migDir();

      await sut.recordAllMigrations(dir);

      assert.equals((await client.query('SELECT name from "Migration" order by name')).map((d) => d.name), [
        '2015-06-19T17-48-41-create',
        '2015-06-19T17-49-31-add-column',
        '2015-06-19T17-54-18-rename-column',
        '2015-06-20T08-11-03-i-fail',
      ]);

      await sut.recordAllMigrations(dir);

      sut._migrations = null;

      await sut.recordAllMigrations(dir);
    });

    test('rollback on error', async () => {
      const dir = migDir();
      await assert.exception(() => sut.migrateTo(dir, 'zz'), {code: '42703'});

      assert.equals(await client.query('SELECT baz from "TestTable"'), []);
    });
  });
});
