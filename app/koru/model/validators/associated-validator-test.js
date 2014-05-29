define(function (require, exports, module) {
  var test, v;
  var geddon = require('../../test');
  var validation = require('../validation');
  var sut = require('./associated-validator').method.bind(validation);
  var Model = require('../main');
  var Query = require('../query');

  geddon.testCase(module, {
    setUp: function () {
      test = this;
      Model.Foo = {};
      v = {};
    },

    tearDown: function () {
      delete Model.Foo;
      v = null;
    },

    "test filter": function () {
      var foo_ids = ["xyz", "def", "abc"],
          doc = {foo_ids: foo_ids};

      var forEach = test.stub(Query.prototype, 'forEach', function (func) {
          func({_id: "abc"});
          func({_id: "xyz"});
      });

      sut(doc,'foo_ids', {filter: true});
      refute(doc._errors);
      assert.same(doc.foo_ids, foo_ids);
      assert.equals(doc.foo_ids, ["abc", "xyz"]);

      var query = forEach.thisValues[0];
      assert.equals(query._wheres, {_id: ["xyz", "def", "abc"]});
      assert.equals(query._fields, {_id: true});
    },

    "test empty filter": function () {
      var foo_ids = ["abc", "def", "xyz"],
          doc = {foo_ids: foo_ids};

      var forEach = test.stub(Query.prototype, 'forEach');

      sut(doc,'foo_ids', {filter: true});
      refute(doc._errors);
      assert.same(doc.foo_ids, foo_ids);
      assert.equals(doc.foo_ids, []);
    },

    "test none": function () {
      var doc = {};
      sut(doc,'foo_ids', true);

      refute(doc._errors);
    },

    'test not found': function () {
      test.stub(Query.prototype, 'count', function () {
        assert.equals(this.wheres, undefined);
        assert.same(this.model, Model.Foo);
        return 0;
      });
      var doc = {foo_ids: ["xyz"]};
      sut(doc,'foo_ids', true);

      assert(doc._errors);
      assert.equals(doc._errors['foo_ids'],[["not_found"]]);
    },

    "test changes only": function () {
      var doc = {foo_ids: ["xyz"], changes: {}};

      sut(doc,'foo_ids', {changesOnly: true});

      refute(doc._errors);
    },

    "test wrong type": function () {
      var doc = {foo_ids: "abc"};
      sut(doc,'foo_ids', true);

      assert(doc._errors);
      assert.equals(doc._errors['foo_ids'],[["is_invalid"]]);
    },

    "test using scoped finder": function () {
      var doc = {foo_ids: v.foo_ids = ['x', 'y']},
          fooFinder = {};

      fooFinder.where = test.stub().returns(fooFinder);
      fooFinder.count = test.stub().returns(2);

      sut(doc,'foo_ids', {finder: fooFinder});

      assert.calledWith(fooFinder.where, '_id', v.foo_ids);
      refute(doc._errors);
    },

    "test using scoped default": function () {
      var doc = {foo_ids: v.foo_ids = ['x', 'y'], fooFind: {}},
          fooFinder = doc.fooFind;

      fooFinder.where = test.stub().returns(fooFinder);
      fooFinder.count = test.stub().returns(2);

      sut(doc,'foo_ids', true);

      assert.calledWith(fooFinder.where, '_id', v.foo_ids);
      refute(doc._errors);
    },

    "test overriding model name": function () {
      var bar_ids = ['x', 'y'];

      var count = test.stub(Query.prototype, 'count').returns(2);
      var doc = {bar_ids: bar_ids};

      sut(doc,'bar_ids', {modelName: 'Foo'});
      refute(doc._errors);

      sut(doc,'bar_ids', 'Foo');

      var query = count.thisValues[0];
      assert.equals(query._wheres, {_id: ["x", "y"]});
      assert.same(query.model, Model.Foo);

      query = count.thisValues[1];
      assert.same(query.model, Model.Foo);

      assert.calledTwice(count);
    },

    'test using model default': function () {
      var foo_ids = ['x', 'y'];

      var count = test.stub(Query.prototype, 'count').returns(2);
      var doc = {foo_ids: foo_ids};

      sut(doc,'foo_ids', true);
      refute(doc._errors);

      var query = count.thisValues[0];

      assert.equals(query._wheres, {_id: ["x", "y"]});
      assert.same(query.model, Model.Foo);

    },
  });
});
