isServer && define((require, exports, module)=>{
  const ModelMap        = require('koru/model/map');
  const DBDriver        = require('koru/pg/driver');
  const TH              = require('koru/test-helper');

  const {stub, spy, onEnd} = TH;

  const Migration = require('./migration');

  let v = {};

  TH.testCase(module, ({aroundEach, beforeEach, afterEach, group, test})=>{
    aroundEach((run)=>{
      v.client = DBDriver.defaultDb;
      v.sut = new Migration(v.client);
      v.client.transaction(tx =>{
        run();
        tx.transaction = 'ROLLBACK';
      });
      v = {};
    });

    test("create", ()=>{
      onEnd(() => delete ModelMap.TestTable);
      ModelMap.TestTable = {docs: {_resetTable: v.resetTable = stub()}};
      v.sut.addMigration('20151003T20-30-20-create-TestModel', v.migBody = mig =>{
        mig.createTable('TestTable', {
          myName: {type: 'text', default: 'George'},
          color: 'color',
        }, [{columns: ['myName DESC', '_id'], unique: true}, ['myName']]);
      });
      assert.called(v.resetTable);

      const TestTable = v.client.table('TestTable');
      TestTable._ensureTable();

      assert.equals(TestTable._colMap._id.data_type, 'text');
      assert.equals(TestTable._colMap._id.collation_name, 'C');

      assert.equals(TestTable._colMap.myName.data_type, 'text');
      assert.equals(TestTable._colMap.myName.collation_name, undefined);

      assert.equals(TestTable._colMap.color.data_type, 'text');
      assert.equals(TestTable._colMap.color.collation_name, 'C');

      v.client.query('INSERT INTO "TestTable" (_id, "myName") values ($1,$2)', [
        "12345670123456789", "foo"]);
      const doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc._id, "12345670123456789");
      assert.same(doc.myName, "foo");
      let row = v.client.query(
        "SELECT * FROM information_schema.columns WHERE table_name = $1 and column_name = $2",
        ['TestTable', '_id'])[0];
      assert.equals(row.data_type, "text");

      row = v.client.query(
        "SELECT * FROM information_schema.columns WHERE table_name = $1 and column_name = $2",
        ['TestTable', 'myName'])[0];
      assert.equals(row.column_default, "'George'::text");
      assert.equals(row.data_type, "text");


      let migs = v.client.query('SELECT * FROM "Migration"');
      assert.same(migs.length, 1);

      assert.equals(migs[0].name, '20151003T20-30-20-create-TestModel');

      const indexes = v.client.query(
        'select * from pg_indexes where tablename = $1 ORDER BY indexname', ['TestTable']);
      assert.same(indexes.length, 3);
      assert.equals(indexes[0].indexname, 'TestTable_myName');
      assert.equals(indexes[1].indexname, 'TestTable_myName__id');

      assert.same(indexes[0].indexdef.replace(/public\./g, ''),
                  'CREATE INDEX "TestTable_myName" ON "TestTable" USING btree ("myName")');
      assert.same(indexes[1].indexdef.replace(/public\./g, ''),
                  'CREATE UNIQUE INDEX "TestTable_myName__id" ON "TestTable" USING btree ("myName" DESC, _id)');

      v.sut.addMigration('20151003T20-30-20-create-TestModel', mig =>{
        assert(false, "should not run twice");
      });

      // reverse

      v.sut.revertMigration('20151003T20-30-20-create-TestModel', v.migBody);

      migs = v.client.query('SELECT * FROM "Migration"');
      assert.same(migs.length, 0);

      assert.same(v.client.query('select exists(select 1 from pg_catalog.pg_class where relname = $1)',
                                 ["TestTable"])[0].exists, false);
    });

    test("field strings for create", ()=>{
      onEnd(() => delete ModelMap.TestTable);
      v.sut.addMigration('20151003T20-30-20-create-TestModel', mig =>{
        spy(v.sut._client, 'query');
        mig.createTable({
          name: 'TestTable',
          fields: ["myName", "age:jsonb default '7'::jsonb"]});
      });
      assert.calledWith(v.sut._client.query, `CREATE TABLE "TestTable" (_id text collate "C" PRIMARY KEY,"myName" text,"age" jsonb default '7'::jsonb)`);
    });

    test("explict primary key in create", ()=>{
      v.sut.addMigration('20151003T20-30-20-create-TestModel', v.migBody = mig =>{
        mig.createTable('TestTable', {
          name: 'text',
          foo: {type: 'integer primary KEY'},
        });
      });
      v.client.query('INSERT INTO "TestTable" (foo, name) values ($1,$2)', [2, "foo"]);
      const doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc.foo, 2);
      refute.hasOwn(doc, '_id');
      assert.exception(()=>{
        v.client.query('INSERT INTO "TestTable" (foo, name) values ($1,$2)', [2, "foo"]);
      }, {sqlState: '23505'});
   });

    test("no primary key", ()=>{
       v.sut.addMigration('20151003T20-30-20-create-TestModel', v.migBody = mig =>{
         mig.createTable({
           name: 'TestTable',
           primaryKey: false,
           fields: {
             name: 'text',
             foo: {type: 'integer'},
           }
         });
      });
      v.client.query('INSERT INTO "TestTable" (foo, name) values ($1,$2)', [2, "foo"]);
      v.client.query('INSERT INTO "TestTable" (foo, name) values ($1,$2)', [2, "foo"]);
      const doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc.foo, 2);
      refute.hasOwn(doc, '_id');
    });

    test("unlogged create", ()=>{
      spy(v.client, 'query');
      v.sut.addMigration('20151003T20-30-20-create-TestModel', v.migBody = mig =>{
        mig.createTable({name: 'TestTable', unlogged: true, fields: {
          name: 'text',
          foo: {type: 'integer primary KEY'},
        }});
      });
      assert.calledWith(v.client.query,
                        `CREATE UNLOGGED TABLE "TestTable" ("foo" integer primary KEY,"name" text)`);
      v.client.query('INSERT INTO "TestTable" (foo, name) values ($1,$2)', [2, "foo"]);
      const doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc.foo, 2);
      refute.hasOwn(doc, '_id');
    });

    test("addIndex", ()=>{
      onEnd(() => delete ModelMap.TestTable);
      ModelMap.TestTable = {docs: {_resetTable: v.resetTable = stub()}};

      v.sut.addMigration(
        '20151003T20-30-20-create-TestModel',
        mig => mig.createTable('TestTable', {name: 'text', age: 'int8',}));

      v.sut.addMigration('20151004T20-30-20-add-index', v.migBody = mig => {
        mig.addIndex('TestTable', {
          columns: ['name DESC', 'age'], unique: true,
          where: "age > 50"
        });

        mig.addIndex('TestTable', {
          name: "override_name",
          columns: ['name DESC', 'age'],
          where: "age < 50"
        });
      });

      let index = v.client.query(
        'select indexdef from pg_indexes where indexname = $1', ['TestTable_name_age'])[0];

      assert(index);
      assert.same(
        index.indexdef.replace(/public\./g, ''),
        'CREATE UNIQUE INDEX "TestTable_name_age" ON "TestTable" USING btree (name DESC, age)'+
          ' WHERE (age > 50)');

      index = v.client.query(
        'select indexdef from pg_indexes where indexname = $1', ['override_name'])[0];

      assert(index);
      assert.same(
        index.indexdef.replace(/public\./g, ''),
        'CREATE INDEX override_name ON "TestTable" USING btree (name DESC, age)'+
          ' WHERE (age < 50)');

      v.sut.revertMigration('20151004T20-30-20-add-index', v.migBody);

      assert.equals(v.client.query(
        'select indexname from pg_indexes where tablename = $1', ['TestTable'])
                    .map(r=>r.indexname), ['TestTable_pkey']);
    });

    test("addColumns by object", ()=>{
      onEnd(() => delete ModelMap.TestTable);
      ModelMap.TestTable = {docs: {_resetTable: v.resetTable = stub()}};

      v.sut.addMigration('20151003T20-30-20-create-TestModel', mig => mig.createTable('TestTable'));

      v.sut.addMigration('20151004T20-30-20-add-column', v.migBody = mig => mig
                         .addColumns('TestTable', {myAge: 'number', dob: 'date'}));

      assert.called(v.resetTable);

      v.client.query('INSERT INTO "TestTable" (_id, "myAge", dob) values ($1,$2,$3)',
                     ['foo', 12, new Date(1970, 1, 1)]);
      let doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc.myAge, 12);
      assert.equals(doc.dob, new Date(1970, 1, 1));

      v.sut.revertMigration('20151004T20-30-20-add-column', v.migBody);

      doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc.myAge, undefined);
      assert.same(doc.dob, undefined);
    });

    test("addColumns by arguments", ()=>{
      onEnd(() => delete ModelMap.TestTable);
      v.sut.addMigration('20151003T20-30-20-create-TestModel', mig => mig.createTable('TestTable'));

      ModelMap.TestTable = {docs: {_resetTable: v.resetTable = stub()}};
      v.sut.addMigration('20151004T20-30-20-add-column', v.migBody = mig => mig
                         .addColumns('TestTable', 'myAge:number', 'dob:date'));

      assert.called(v.resetTable);

      v.client.query('INSERT INTO "TestTable" (_id, "myAge", dob) values ($1,$2,$3)',
                     ['foo', 12, new Date(1970, 1, 1)]);
      let doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc.myAge, 12);
      assert.equals(doc.dob, new Date(1970, 1, 1));

      v.sut.revertMigration('20151004T20-30-20-add-column', v.migBody);

      doc = v.client.query('SELECT * from "TestTable"')[0];
      assert.same(doc.myAge, undefined);
      assert.same(doc.dob, undefined);
    });

    test("reversible", ()=>{
      onEnd(() => {
        delete ModelMap.Foo;
        delete ModelMap.Bar;
      });
      ModelMap.Foo = {docs: {_resetTable: v.resetFoo = stub()}};
      ModelMap.Bar = {docs: {_resetTable: v.resetBar = stub()}};

      v.sut.addMigration('20151004T20-30-20-reversible', v.migBody = mig =>{
        mig.reversible({
          add: v.add = stub(),
          revert: v.revert = stub(),
          resetTables: ['Foo', 'Bar'],
        });
      });

      assert.calledWith(v.add, DBDriver.defaultDb);
      refute.called(v.revert);
      v.add.reset();

      // reverse

      v.sut.revertMigration('20151004T20-30-20-reversible', v.migBody);

      assert.calledWith(v.revert, DBDriver.defaultDb);
      refute.called(v.add);

      assert.calledTwice(v.resetFoo);
      assert.calledTwice(v.resetBar);
    });

    test("migrateTo", ()=>{
      const dir = module.id.replace(/\/[^/]*$/,"/test-migrations");

      v.sut.migrateTo(dir, "2015-06-19T17-57-32");

      v.client.query('INSERT INTO "TestTable" (_id, name, baz) values ($1,$2,$3)', [
        "1", "foo", v.date = new Date(2015,3, 4)]);

      v.sut.migrateTo(dir, "2015-06-19T17-49-31~");

      assert.equals(v.client.query('SELECT bar from "TestTable"')[0].bar, v.date);

      v.sut.migrateTo(dir, " ");

      assert.same(v.client.query('select exists(select 1 from pg_catalog.pg_class where relname = $1)',
                                 ["TestTable"])[0].exists, false);
    });

    test("recordAllMigrations", ()=>{
      const dir = module.id.replace(/\/[^/]*$/,"/test-migrations");

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
    });

    test("rollback on error", ()=>{
      const dir = module.id.replace(/\/[^/]*$/,"/test-migrations");

      assert.exception(()=>{
        v.sut.migrateTo(dir, "zz");
      }, {sqlState: "42703"});

      refute.exception(()=>{
        v.client.query('SELECT baz from "TestTable"');
      });
    });
  });
});
