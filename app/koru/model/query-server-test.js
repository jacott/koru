define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Query = require('./query');
  var Model = require('./main');

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

    "test mongo code": function () {
      assert.same(v.TestModel.where({$or: [{name: 'foo'}, {age: 3}]}).count(), 1);
    },
  });
});
