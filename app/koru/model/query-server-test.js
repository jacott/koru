define((require, exports, module) => {
  'use strict';
  const TransQueue      = require('koru/model/trans-queue');
  const SQLStatement    = require('koru/pg/sql-statement');
  const api             = require('koru/test/api');
  const Model           = require('./main');
  const Query           = require('./query');
  const TH              = require('./test-db-helper');
  const koru            = require('../main');

  const {stub, spy} = TH;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let TestModel, foo;
    before(async () => {
      TestModel = Model.define('TestModel').defineFields({
        name: 'text', age: 'number', height: 'real'});
      foo = await TestModel.create({_id: 'foo123', name: 'foo', age: 5, height: 1.234});
    });

    after(() => Model._destroyModel('TestModel', 'drop'));

    beforeEach(() => {
      api.module({subjectModule: module.get('./query'), subjectName: 'Query'});
      TH.startTransaction();
    });
    afterEach(() => TH.rollbackTransaction());

    test('exists', async () => {
      assert.isTrue(await TestModel.exists({_id: ['foo123', 'foo456'], age: 5}));
      assert.isFalse(await TestModel.exists({_id: ['foo123', 'foo456'], age: 4}));
      assert.isFalse(await TestModel.exists({_id: {$nin: ['foo213', 'foo456']}, age: 4}));
      assert.isFalse(await TestModel.exists({_id: {$in: ['foo123']}, age: 4}));
      assert.isFalse(await TestModel.exists({name: {$regex: 'f.O'}, age: 4}));
      assert.isFalse(await TestModel.exists({name: {$regex: 'f.O', $options: 'i'}, age: 4}));
      assert.isTrue(await TestModel.exists({name: {$regex: 'f.O', $options: 'i'}, age: 5}));
    });

    test('fields', async () => {
      assert.equals(await TestModel.query.fields('age').fetchOne(), {_id: 'foo123', age: 5});
      assert.equals((await TestModel.query.fields('age', 'name').fetch())[0], {
        _id: 'foo123', name: 'foo', age: 5});
    });

    test('offset', async () => {
      await TestModel.create({name: 'foo2'});
      await TestModel.create({name: 'foo3'});

      assert.equals(await TestModel.query.sort('name').offset(1).fetchField('name'), ['foo2', 'foo3']);
    });

    test('batchSize', async () => {
      await TestModel.create({name: 'foo2'});
      await TestModel.create({name: 'foo3'});

      assert.equals(await TestModel.query.sort('name').batchSize(2).fetchField('name'),
                    ['foo', 'foo2', 'foo3']);
    });

    test('$or', async () => {
      assert.same(await TestModel.where({$or: [{name: 'foo'}, {age: 3}]}).count(), 1);
    });

    test('whereSql', async () => {
      /**
       * Add a where condition to the query which is written in sql.

       * @param args Four formats are supported:

       * 1. `whereSql(queryString, params)` queryString is a sql where-clause where `$n` parameters
       * corresponds to the nth-1 position in params.

       * 1. `whereSql(queryString, properties)` queryString is a sql where-clause where `{$varName}`
       * expressions within the string get converted to parameters corresponding the the
       * `properties`.

       * 1. `whereSql(sqlStatement, properties)` sqlStatment is a pre-compiled
       * {#koru/pg/sql-statement} and properties are referenced in the statement.

       * 1. `` whereSql`queryTemplate` queryTemplate a sql where-clause where `${varName}`
       * expressions within the template get converted to parameters.
       **/
      await TestModel.create({name: 'foo2', age: 4});
      api.protoMethod('whereSql', {subject: TestModel.query, subjectName: 'Query'});
      //[
      assert.same((await TestModel.query.whereSql(
        `name = $1 and age > $2`, ['foo2', 3]).fetchOne()).name, 'foo2');
      //]
      //[
      assert.same((await TestModel.query.whereSql(
        `name = {$name} and age > {$age}`, {name: 'foo2', age: 3}).fetchOne()).name, 'foo2');
      //]
      //[
      const statement = new SQLStatement(`name = {$name} and age > {$age}`);
      assert.same((await TestModel.query.whereSql(
        statement, {name: 'foo2', age: 3}).fetchOne()).name, 'foo2');
      //]
      //[
      const name = 'foo2';
      assert.same((await TestModel.query.whereSql`name = ${name} and age > ${3}`.fetchOne()).name, 'foo2');
      //]

      assert.same((await TestModel.query.whereSql(new SQLStatement(`name = 'foo2'`)).fetchOne()).name, 'foo2');

      // test oid assignment.
      // should handle casting types to match columns
      assert.same((await TestModel.query.whereSql(
        `height > {$height}`, {height: 1}).fetchOne()).name, 'foo');

      assert.same((await TestModel.query.whereSql(
        `height > {$height}`, {height: 1.1}).fetchOne()).name, 'foo');
    });

    test('notify', async () => {
      let isInTransaction = false, count = 0;
      const onChange = (dc) => {
        isInTransaction = TransQueue.isInTransaction();
        ++count;
      };

      after(TestModel.onChange(onChange));
      const doc1 = await TestModel.create({name: 'doc1'});

      assert.same(count, 1);
      assert.same(isInTransaction, true);

      count = 0;
      await TestModel.query.update('age', 10);
      assert.same(count, 2);
      assert.same(isInTransaction, true);

      count = 0;
      await TestModel.query.remove();

      assert.same(count, 2);
      assert.same(isInTransaction, true);
    });

    group('waitForOne', () => {
      test('timeout', async () => {
        stub(koru, 'setTimeout').returns(123).yields();
        refute(await TestModel.onId(foo._id).where('age', 6).waitForOne(102));
        assert.calledWith(koru.setTimeout, TH.match.func, 102);
      });

      test('already exists', async () => {
        spy(koru, 'setTimeout');
        assert.specificAttributes((await TestModel.onId(foo._id).waitForOne(10)).attributes, {_id: foo._id, age: 5});
        refute.called(koru.setTimeout);
      });

      test('late arrival', async () => {
        let p;
        try {
          koru.setTimeout(() => {
            p = foo.$update('age', 6);
          }, 20);
          spy(koru, 'setTimeout');

          assert.same((await TestModel.onId(foo._id).where('age', 6).waitForOne()).attributes.age, 6);
          assert.calledWith(koru.setTimeout, TH.match.func, 2000);
        } finally {
          p && await p;
        }
      });
    });
  });
});
