isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test-helper');
  var sut = require('./migration');
  var DBDriver = require('../pg/driver');
  var Model = require('../model/main');

  TH.testCase(module, {
    setUpArround: function (run) {
      test = this;
      v = {};
      v.client = DBDriver.defaultDb;
      v.client.transaction(function (tx) {
        run();
        tx.transaction = 'ROLLBACK';
      });
      v = null;
      sut.migrations = null;
    },

    "test create": function () {
      sut.addMigration(v.client, '20151003T20:30:20-create-TestModel', v.migBody = function (mig) {
        mig.createTable('TestTable', {
          name: {type: 'text'}
        });
      });
      v.client.query('INSERT INTO "TestTable" (_id, name) values ($1,$2)', ["12345670123456789", "foo"]);
      var doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc._id, "12345670123456789");
      assert.same(doc.name, "foo");


      var migs = v.client.query('SELECT * FROM "Migration"');
      assert.same(migs.length, 1);

      assert.equals(migs[0].name, '20151003T20:30:20-create-TestModel');

      sut.addMigration(v.client, '20151003T20:30:20-create-TestModel', function (mig) {
        assert(false, "should not run twice");
      });

      // reverse

      sut.revertMigration(v.client, '20151003T20:30:20-create-TestModel', v.migBody);

      var migs = v.client.query('SELECT * FROM "Migration"');
      assert.same(migs.length, 0);

      assert.same(v.client.query('select exists(select 1 from pg_catalog.pg_class where relname = $1)',
                                 ["TestTable"])[0].exists, false);

    },

    "test explict primary key in create": function () {
      sut.addMigration(v.client, '20151003T20:30:20-create-TestModel', v.migBody = function (mig) {
        mig.createTable('TestTable', {
          name: {type: 'text'},
          foo: {type: 'integer primary KEY'},
        });
      });
      v.client.query('INSERT INTO "TestTable" (foo, name) values ($1,$2)', [2, "foo"]);
      var doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc.foo, 2);
    },

    "test reversible": function () {
      sut.addMigration(v.client, '20151004T20:30:20-reversible', v.migBody = function (mig) {
        mig.reversible({
          add: v.add = test.stub(),
          revert: v.revert = test.stub(),
        });
      });

      assert.calledWith(v.add, DBDriver.defaultDb);
      refute.called(v.revert);
      v.add.reset();

      // reverse

      sut.revertMigration(v.client, '20151004T20:30:20-reversible', v.migBody);

      assert.calledWith(v.revert, DBDriver.defaultDb);
      refute.called(v.add);
    },

    "test migrateTo": function () {
      var dir = module.id.replace(/\/[^/]*$/,"/test-migrations");

      sut.migrateTo(v.client, dir, "2015-06-19T17:57:32");

      v.client.query('INSERT INTO "TestTable" (_id, name, baz) values ($1,$2,$3)', ["1", "foo", v.date = new Date(2015,3, 4)]);

      sut.migrateTo(v.client, dir, "2015-06-19T17:49:31~");

      assert.equals(v.client.query('SELECT bar from "TestTable"')[0].bar, v.date);

      sut.migrateTo(v.client, dir, "");

      assert.same(v.client.query('select exists(select 1 from pg_catalog.pg_class where relname = $1)',
                                 ["TestTable"])[0].exists, false);
    },
  });
});
