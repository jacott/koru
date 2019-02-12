define((require, exports, module)=>{
  const TransQueue      = require('koru/model/trans-queue');
  const api             = require('koru/test/api');
  const koru            = require('../main');
  const Model           = require('./main');
  const Query           = require('./query');
  const TH              = require('./test-db-helper');

  const {stub, spy, onEnd} = TH;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    let TestModel, foo;
    before(()=>{
      TestModel = Model.define('TestModel').defineFields({
        name: 'text', age: 'number', nested: 'object'});
      foo = TestModel.create({_id: 'foo123', name: 'foo', age: 5, nested: [{ary: ['m']}]});
    });

    after(()=>{
      Model._destroyModel('TestModel', 'drop');
    });

    beforeEach(()=>{
      api.module({subjectModule: module.get('./query'), subjectName: 'Query'});
      TH.startTransaction();
    });
    afterEach(()=>{TH.rollbackTransaction()});

    test("fields", ()=>{
      assert.equals(TestModel.query.fields('age').fetchOne(), {_id: 'foo123', age: 5});
      assert.equals(TestModel.query.fields('age', 'name').fetch()[0], {
        _id: 'foo123', name: 'foo', age: 5});
    });

    test("offset", ()=>{
      TestModel.create({name: 'foo2'});
      TestModel.create({name: 'foo3'});

      assert.equals(TestModel.query.sort('name').offset(1).fetchField('name'), ['foo2', 'foo3']);
    });

    test("batchSize", ()=>{
      TestModel.create({name: 'foo2'});
      TestModel.create({name: 'foo3'});

      assert.equals(TestModel.query.sort('name').batchSize(2).fetchField('name'),
                    ['foo', 'foo2', 'foo3']);
    });

    test("$or", ()=>{
      assert.same(TestModel.where({$or: [{name: 'foo'}, {age: 3}]}).count(), 1);
    });

    test("whereSql", ()=>{
      /**
       * Add a where condition to the query which is written in sql. Two formats are supported:

       * 1. `whereSql(queryString, properties)`

       * 1. `` whereSql`queryTemplate` ``

       * @param {string} queryString a sql where-clause where `{$varName}` expressions within the
       * string get converted to parameters corresponding the the `properties`.

       * @param {object} properties key value properties mapping to the `{$varName}` expressions within
       * `queryString`

       * @param {template-literal} queryTemplate a sql where-clause where `${varName}` expressions
       * within the template get converted to parameters.
       **/
      TestModel.create({name: 'foo2', age: 4});
      api.protoMethod('whereSql', {subject: TestModel.query, subjectName: 'Query'});
      //[
      assert.same(TestModel.query.whereSql(
        `name = {$name} and age > {$age}`, {name: 'foo2', age: 3}).fetchOne().name, 'foo2');
      //]

      //[
      const name = 'foo2';
      assert.same(TestModel.query.whereSql`name = ${name} and age > ${3}`.fetchOne().name, 'foo2');
      //]
    });

    test("notify", ()=>{
      let isInTransaction = false, count = 0;
      const onChange = (dc)=>{
        isInTransaction = TransQueue.isInTransaction();
        ++count;
      };

      onEnd(TestModel.onChange(onChange));
      const doc1 = TestModel.create({name: 'doc1'});

      assert.same(count, 1);
      assert.same(isInTransaction, true);

      count = 0;
      TestModel.query.update('age', 10);
      assert.same(count, 2);
      assert.same(isInTransaction, true);

      count = 0;
      TestModel.query.remove();

      assert.same(count, 2);
      assert.same(isInTransaction, true);
    });

    group("waitForOne", ()=>{
      test("timeout", ()=>{
        stub(koru, 'setTimeout').returns(123).yields();
        refute(TestModel.onId(foo._id).where('age', 6).waitForOne(102));
        assert.calledWith(koru.setTimeout, TH.match.func, 102);
      });

      test("already exists", ()=>{
        spy(koru, 'setTimeout');
        assert.equals(foo.attributes, TestModel.onId(foo._id).waitForOne(10).attributes);
        refute.called(koru.setTimeout);
      });

      test("late arrival", ()=>{
        koru.setTimeout(()=>{
          foo.$update('age', 6);
        }, 20);
        spy(koru, 'setTimeout');

        assert.same(TestModel.onId(foo._id).where('age', 6).waitForOne().attributes.age, 6);
        assert.calledWith(koru.setTimeout, TH.match.func, 2000);
      });
    });
  });
});
