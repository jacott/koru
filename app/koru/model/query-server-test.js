define((require, exports, module)=>{
  const TransQueue      = require('koru/model/trans-queue');
  const koru            = require('../main');
  const Model           = require('./main');
  const Query           = require('./query');
  const TH              = require('./test-db-helper');

  const {stub, spy, onEnd} = TH;

  let v = {};
  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    before(()=>{
      v.TestModel = Model.define('TestModel').defineFields({
        name: 'text', age: 'number', nested: 'object'});
      v.foo = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, nested: [{ary: ['m']}]});
    });

    after(()=>{
      Model._destroyModel('TestModel', 'drop');
      v = {};
    });

    beforeEach(()=>{TH.startTransaction()});
    afterEach(()=>{TH.rollbackTransaction()});

    test("fields", ()=>{
      assert.equals(v.TestModel.query.fields('age').fetchOne(), {_id: 'foo123', age: 5});
      assert.equals(v.TestModel.query.fields('age', 'name').fetch()[0], {
        _id: 'foo123', name: 'foo', age: 5});
    });

    test("offset", ()=>{
      v.TestModel.create({name: 'foo2'});
      v.TestModel.create({name: 'foo3'});

      assert.equals(v.TestModel.query.sort('name').offset(1).fetchField('name'), ['foo2', 'foo3']);
    });

    test("batchSize", ()=>{
      v.TestModel.create({name: 'foo2'});
      v.TestModel.create({name: 'foo3'});

      assert.equals(v.TestModel.query.sort('name').batchSize(2).fetchField('name'),
                    ['foo', 'foo2', 'foo3']);
    });

    test("$or", ()=>{
      assert.same(v.TestModel.where({$or: [{name: 'foo'}, {age: 3}]}).count(), 1);
    });

    test("notify", ()=>{
      const {TestModel} = v;
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
        refute(v.TestModel.onId(v.foo._id).where('age', 6).waitForOne(102));
        assert.calledWith(koru.setTimeout, TH.match.func, 102);
      });

      test("already exists", ()=>{
        spy(koru, 'setTimeout');
        assert.equals(v.foo.attributes, v.TestModel.onId(v.foo._id).waitForOne(10).attributes);
        refute.called(koru.setTimeout);
      });

      test("late arrival", ()=>{
        koru.setTimeout(()=>{
          v.foo.$update('age', 6);
        }, 20);
        spy(koru, 'setTimeout');

        assert.same(v.TestModel.onId(v.foo._id).where('age', 6).waitForOne().attributes.age, 6);
        assert.calledWith(koru.setTimeout, TH.match.func, 2000);
      });
    });
  });
});
