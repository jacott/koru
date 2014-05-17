// FIXME turn on for server too
isClient && define(function (require, exports, module) {
  var test, v;
  var geddon = require('bart/test');
  var Query = require('./query');
  var Model = require('./main');
  var util = require('../util');

  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.TestModel = Model.define('TestModel').defineFields({name: 'text', age: 'number'});

      v.TestModel.create({_id: 'foo123', name: 'foo', age: 5});
      v.foo = v.TestModel.findById('foo123');

      v.TestModel.create({_id: 'bar456', name: 'bar', age: 10});
      v.bar = v.TestModel.findById('bar456');
    },

    tearDown: function () {
      Model._destroyModel('TestModel');
      v = null;
    },

    "test fetch": function () {
      assert.equals(new Query(v.TestModel).fetch().sort(util.compareByField('_id')), [v.bar, v.foo]);
    },

    "test on exists": function () {
      var st = new Query(v.TestModel);

      assert.same(st.on(v.foo._id), st);

      assert.equals(st.fetch(), [v.foo]);
    },

    "test on does not exist": function () {
      var st = new Query(v.TestModel);

      assert.same(st.on("notfound"), st);

      assert.equals(st.fetch(), []);
    },

    "test update one": function () {
      var st = new Query(v.TestModel).on(v.foo._id);

      assert.same(st.update({name: 'new name'}), 1);

      v.foo = v.TestModel.findById('foo123');
      assert.same(v.foo.name, 'new name');
      assert.same(v.foo.age, 5);
    },

    "test update deletes fields": function () {
      var st = new Query(v.TestModel).on(v.foo._id);

      assert.same(st.update({name: 'new name', age: undefined}), 1);

      assert.equals(v.foo.attributes, {_id: 'foo123', name: 'new name'});
    },

    "test inc": function () {
      var st = new Query(v.TestModel).on(v.foo._id);
      assert.same(st.inc("age", 2), st);

      st.update({name: 'x'});

      assert.same(v.foo.name, 'x');
      assert.same(v.foo.age, 7);
    },

    "test where on fetch": function () {
      var st = new Query(v.TestModel).on(v.foo._id);

      assert.same(st.where({name: 'foo'}), st);

      assert.equals(st.fetch(), [v.foo]);

      assert.equals(st.where({name: 'bar'}).fetch(), []);
    },

    "test where on update": function () {
      var st = new Query(v.TestModel).on(v.foo._id);

      assert.same(st.where({name: 'bar'}).update({name: 'new name'}), 0);
      assert.same(v.foo.name, 'foo');

      assert.same(st.where({name: 'foo'}).update({name: 'new name'}), 1);

      assert.same(v.foo.name, 'new name');
    },
  });
});
