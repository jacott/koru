define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Query = require('./query');
  var Model = require('./main');
  var util = require('../util');

  TH.testCase(module, {
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
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "test fetch": function () {
      assert.equals(new Query(v.TestModel).fetch().sort(util.compareByField('_id')), [v.bar, v.foo]);
    },

    "test fetchOne": function () {
      assert.equals(new Query(v.TestModel).where({name: 'foo'}).fetchOne(), v.foo);
    },

    "test forEach": function () {
      var results = [];
      new Query(v.TestModel).forEach(function (doc) {
        results.push(doc);
      });
      assert.equals(results.sort(util.compareByField('_id')), [v.bar, v.foo]);
    },

    "test remove": function () {
      assert.same(new Query(v.TestModel).remove(), 2);

      assert.equals(new Query(v.TestModel).fetch(), []);
    },

    "test count": function () {
      assert.same(new Query(v.TestModel).count(), 2);
    },

    'test findIds': function () {
      new Query(v.TestModel).remove();
      var exp_ids = [1,2,3].map(function (num) {
        return v.TestModel.create({name: 'name'+num})._id;
      });

      assert.equals(new Query(v.TestModel).findIds().sort(), exp_ids.slice(0).sort());
    },

    "test onId exists": function () {
      var st = new Query(v.TestModel);

      assert.same(st.onId(v.foo._id), st);

      assert.equals(st.fetch(), [v.foo]);
    },

    "test onModel": function () {
      var st = new Query();

      assert.same(st.onModel(v.TestModel).onId(v.foo._id), st);

      assert.equals(st.fetch(), [v.foo]);
    },

    "test onId does not exist": function () {
      var st = new Query(v.TestModel);

      assert.same(st.onId("notfound"), st);

      assert.equals(st.fetch(), []);
    },

    "test update one": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.update({name: 'new name'}), 1);

      v.foo = v.TestModel.findById('foo123');
      assert.same(v.foo.name, 'new name');
      assert.same(v.foo.age, 5);
    },

    "test update deletes fields": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.update({name: 'new name', age: undefined}), 1);

      assert.equals(v.foo.$reload().attributes, {_id: 'foo123', name: 'new name'});
    },

    "test inc": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);
      assert.same(st.inc("age", 2), st);

      st.update({name: 'x'});

      v.foo.$reload();

      assert.same(v.foo.name, 'x');
      assert.same(v.foo.age, 7);
    },

    "test where on fetch": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.where({name: 'foo'}), st);

      assert.equals(st.fetch(), [v.foo]);

      assert.equals(st.where({name: 'bar'}).fetch(), []);
    },

    "test where with field, value": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.where('name', 'foo'), st);

      assert.equals(st.fetch(), [v.foo]);

      assert.equals(st.where('name', 'bar').fetch(), []);
    },

    "test where on forEach": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.where({name: 'foo'}), st);

      st.forEach(v.stub = test.stub());
      assert.calledOnce(v.stub);
      assert.calledWith(v.stub, TH.match(function (doc) {
        if (doc._id === v.foo._id) {
          assert.equals(doc.attributes, v.foo.attributes);
          return true;
        }
      }));

      assert.equals(st.where({name: 'bar'}).fetch(), []);
    },

    "test where on update": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.where({name: 'bar'}).update({name: 'new name'}), 0);
      v.foo.$reload();
      assert.same(v.foo.name, 'foo');

      assert.same(st.where({name: 'foo'}).update({name: 'new name'}), 1);

      v.foo.$reload();
      assert.same(v.foo.name, 'new name');
    },
  });
});
