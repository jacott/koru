define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Query = require('./query');
  var Model = require('./main');
  var koru = require('../main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.TestModel = Model.define('TestModel').defineFields({name: 'text', age: 'number', nested: 'object'});
      v.foo = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, nested: [{ary: ['m']}]});
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "test fields": function () {
      assert.equals(v.TestModel.query.fields('age').fetchOne().attributes, {_id: 'foo123', age: 5});
      assert.equals(v.TestModel.query.fields('age', 'name').fetch()[0].attributes, {_id: 'foo123', name: 'foo', age: 5});
    },

    "test limit": function () {
      v.TestModel.create({name: 'foo2'});
      v.TestModel.create({name: 'foo3'});

      assert.equals(v.TestModel.query.sort('name').limit(2).fetchField('name'), ['foo', 'foo2']);
    },

    "test batchSize": function () {
      v.TestModel.create({name: 'foo2'});
      v.TestModel.create({name: 'foo3'});

      assert.equals(v.TestModel.query.sort('name').batchSize(2).fetchField('name'), ['foo', 'foo2', 'foo3']);
    },

    "test mongo code": function () {
      assert.same(v.TestModel.where({$or: [{name: 'foo'}, {age: 3}]}).count(), 1);
    },

    "waitForOne": {
      "test timeout": function () {
        test.stub(koru, 'setTimeout').returns(123).yields();
        refute(v.TestModel.onId(v.foo._id).where('age', 6).waitForOne(102));
        assert.calledWith(koru.setTimeout, TH.match.func, 102);
      },

      "test already exists": function () {
        test.spy(koru, 'setTimeout');
        assert.equals(v.foo.attributes, v.TestModel.onId(v.foo._id).waitForOne(10).attributes);
        refute.called(koru.setTimeout);
      },

      "test late arrival": function () {
        koru.setTimeout(function () {
          v.foo.$update('age', 6);
        }, 50);
        test.spy(koru, 'setTimeout');

        assert.same(v.TestModel.onId(v.foo._id).where('age', 6).waitForOne().attributes.age, 6);
        assert.calledWith(koru.setTimeout, TH.match.func, 2000);
      },
    },
  });
});
