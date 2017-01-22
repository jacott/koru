define(function (require, exports, module) {
  var test, v;
  var geddon = require('../../test');
  var validation = require('../validation');
  var sut = require('./associated-validator').bind(validation);
  var Model = require('../main');
  var Query = require('../query');

  geddon.testCase(module, {
    setUp() {
      test = this;
      Model.Foo = {};
      v = {};
    },

    tearDown() {
      delete Model.Foo;
      v = null;
    },

    "test filter"() {
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

      assert.called(forEach);
      var query = forEach.firstCall.thisValue;
      assert.equals(query._wheres, {_id: ["xyz", "def", "abc"]});
      assert.equals(query._fields, {_id: true});
    },

    "test empty filter"() {
      var foo_ids = ["abc", "def", "xyz"],
          doc = {foo_ids: foo_ids};

      var forEach = test.intercept(Query.prototype, 'forEach');

      sut(doc,'foo_ids', {filter: true});
      refute(doc._errors);
      assert.same(doc.foo_ids, foo_ids);
      assert.equals(doc.foo_ids, []);
    },

    "test none"() {
      var doc = {};
      sut(doc,'foo_ids', true);

      refute(doc._errors);
    },

    'test not found'() {
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

    "test changes only"() {
      var doc = {foo_ids: ["xyz"], changes: {}};

      sut(doc,'foo_ids', {changesOnly: true});

      refute(doc._errors);
    },

    "test wrong type"() {
      var doc = {foo_ids: "abc"};
      sut(doc,'foo_ids', true);

      assert(doc._errors);
      assert.equals(doc._errors['foo_ids'],[["is_invalid"]]);
    },

    "test using scoped finder"() {
      var doc = {foo_ids: v.foo_ids = ['x', 'y']};

      function fooFinder(values) {
        v.values = values;
        return {count: test.stub().returns(2)};
      };


      sut(doc,'foo_ids', {finder: fooFinder});

      assert.equals(v.values, v.foo_ids);
      refute(doc._errors);
    },

    "test using scoped default"() {
      var doc = {
        foo_ids: v.foo_ids = ['x', 'y'],
        fooFind(values) {
          v.values = values;
          return {count: test.stub().returns(2)};
        }
      };

      sut(doc,'foo_ids', true);

      assert.equals(v.values, v.foo_ids);
      refute(doc._errors);
    },

    "test overriding model name"() {
      var bar_ids = ['x', 'y'];

      var count = test.stub(Query.prototype, 'count').returns(2);
      var doc = {bar_ids: bar_ids};

      sut(doc,'bar_ids', {modelName: 'Foo'});
      refute(doc._errors);

      sut(doc,'bar_ids', 'Foo');

      var query = count.firstCall.thisValue;
      assert.equals(query._wheres, {_id: ["x", "y"]});
      assert.same(query.model, Model.Foo);

      query = count.getCall(1).thisValue;
      assert.same(query.model, Model.Foo);

      assert.calledTwice(count);
    },

    "test belongs_to"() {
      var count = test.stub(Query.prototype, 'count').returns(1);
      var doc = {foo_id: "x", constructor: {$fields: {foo_id: {type: 'belongs_to', model: Model.Foo}}}};

      sut(doc,'foo_id', true);
      refute(doc._errors);

      var query = count.firstCall.thisValue;

      assert.equals(query._wheres, {_id: ["x"]});
      assert.same(query.model, Model.Foo);
    },

    'test using model default'() {
      var foo_ids = ['x', 'y'];

      var count = test.stub(Query.prototype, 'count').returns(2);
      var doc = {foo_ids: foo_ids};

      sut(doc,'foo_ids', true);
      refute(doc._errors);

      var query = count.firstCall.thisValue;

      assert.equals(query._wheres, {_id: ["x", "y"]});
      assert.same(query.model, Model.Foo);

    },
  });
});
