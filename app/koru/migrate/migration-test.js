isServer && define(function (require, exports, module) {
  var test, v;
  const Model     = require('koru/model/main');
  const DBDriver  = require('koru/pg/driver');
  const TH        = require('koru/test-helper');
  const Migration = require('./migration');

  TH.testCase(module, {
    setUpAround(run) {
      test = this;
      v = {};
      v.client = DBDriver.defaultDb;
      v.sut = new Migration(v.client);
      v.client.transaction(function (tx) {
        run();
        tx.transaction = 'ROLLBACK';
      });
      v = null;
    },

    "test create"() {
      v.sut.addMigration('20151003T20-30-20-create-TestModel', v.migBody = function (mig) {
        mig.createTable('TestTable', {
          myName: {type: 'text', default: 'George'}
        }, [['*unique', 'myName DESC', '_id'], ['myName']]);
      });
      v.client.query('INSERT INTO "TestTable" (_id, "myName") values ($1,$2)', ["12345670123456789", "foo"]);
      var doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc._id, "12345670123456789");
      assert.same(doc.myName, "foo");
      var row = v.client.query("SELECT * FROM information_schema.columns WHERE table_name = $1 and column_name = $2",
                               ['TestTable', '_id'])[0];
      assert.equals(row.character_maximum_length, 24);
      assert.equals(row.data_type, "character varying");

      var row = v.client.query("SELECT * FROM information_schema.columns WHERE table_name = $1 and column_name = $2",
                               ['TestTable', 'myName'])[0];
      assert.equals(row.column_default, "'George'::text");
      assert.equals(row.data_type, "text");


      var migs = v.client.query('SELECT * FROM "Migration"');
      assert.same(migs.length, 1);

      assert.equals(migs[0].name, '20151003T20-30-20-create-TestModel');

      var indexes = v.client.query('select * from pg_indexes where tablename = $1 ORDER BY indexname', ['TestTable']);
      assert.same(indexes.length, 3);
      assert.equals(indexes[0].indexname, 'TestTable_myName');
      assert.equals(indexes[1].indexname, 'TestTable_myName__id');

      assert.same(indexes[0].indexdef, 'CREATE INDEX "TestTable_myName" ON "TestTable" USING btree ("myName")');
      assert.same(indexes[1].indexdef, 'CREATE UNIQUE INDEX "TestTable_myName__id" ON "TestTable" USING btree ("myName" DESC, _id)');

      v.sut.addMigration('20151003T20-30-20-create-TestModel', function (mig) {
        assert(false, "should not run twice");
      });

      // reverse

      v.sut.revertMigration('20151003T20-30-20-create-TestModel', v.migBody);

      var migs = v.client.query('SELECT * FROM "Migration"');
      assert.same(migs.length, 0);

      assert.same(v.client.query('select exists(select 1 from pg_catalog.pg_class where relname = $1)',
                                 ["TestTable"])[0].exists, false);



    },

    "test explict primary key in create"() {
      v.sut.addMigration('20151003T20-30-20-create-TestModel', v.migBody = function (mig) {
        mig.createTable('TestTable', {
          name: 'text',
          foo: {type: 'integer primary KEY'},
        });
      });
      v.client.query('INSERT INTO "TestTable" (foo, name) values ($1,$2)', [2, "foo"]);
      var doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc.foo, 2);
      assert.isFalse(doc.hasOwnProperty('_id'));
    },

    "test addColumns"() {
      v.sut.addMigration('20151003T20-30-20-create-TestModel', mig => mig.createTable('TestTable'));

      v.sut.addMigration('20151004T20-30-20-add-column', v.migBody = mig => mig
                         .addColumns('TestTable', {myAge: 'number'}));

      v.client.query('INSERT INTO "TestTable" (_id, "myAge") values ($1,$2)', ['foo', 12]);
      var doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc.myAge, 12);

      v.sut.revertMigration('20151004T20-30-20-add-column', v.migBody);

      var doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc.myAge, undefined);
    },

    "test reversible"() {
      v.sut.addMigration('20151004T20-30-20-reversible', v.migBody = function (mig) {
        mig.reversible({
          add: v.add = test.stub(),
          revert: v.revert = test.stub(),
        });
      });

      assert.calledWith(v.add, DBDriver.defaultDb);
      refute.called(v.revert);
      v.add.reset();

      // reverse

      v.sut.revertMigration('20151004T20-30-20-reversible', v.migBody);

      assert.calledWith(v.revert, DBDriver.defaultDb);
      refute.called(v.add);
    },

    "test migrateTo"() {
      var dir = module.id.replace(/\/[^/]*$/,"/test-migrations");

      v.sut.migrateTo(dir, "2015-06-19T17-57-32");

      v.client.query('INSERT INTO "TestTable" (_id, name, baz) values ($1,$2,$3)', ["1", "foo", v.date = new Date(2015,3, 4)]);

      v.sut.migrateTo(dir, "2015-06-19T17-49-31~");

      assert.equals(v.client.query('SELECT bar from "TestTable"')[0].bar, v.date);

      v.sut.migrateTo(dir, " ");

      assert.same(v.client.query('select exists(select 1 from pg_catalog.pg_class where relname = $1)',
                                 ["TestTable"])[0].exists, false);
    },

    "test recordAllMigrations"() {
      var dir = module.id.replace(/\/[^/]*$/,"/test-migrations");

      v.sut.recordAllMigrations(dir);

      assert.equals(v.client.query('SELECT name from "Migration" order by name').map(d => d.name), [
        '2015-06-19T17-48-41-create',
        '2015-06-19T17-49-31-add-column',
        '2015-06-19T17-54-18-rename-column',
        '2015-06-20T08-11-03-i-fail'
      ]);

      refute.exception(() => {
        v.sut.recordAllMigrations(dir);
      });

      v.sut._migrations = null;

      refute.exception(() => {
        v.sut.recordAllMigrations(dir);
      });
    },

    "test rollback on error"() {
      var dir = module.id.replace(/\/[^/]*$/,"/test-migrations");

      assert.exception(function () {
        v.sut.migrateTo(dir, "zz");
      }, {sqlState: "42703"});

      refute.exception(function () {
        v.client.query('SELECT baz from "TestTable"');
      });
    },
  });
});
