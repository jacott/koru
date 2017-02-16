define(function (require, exports, module) {
  const TH         = require('koru/test-helper');
  const Model      = require('../main');
  const Query      = require('../query');
  const validation = require('../validation');

  const sut        = require('./associated-validator').bind(validation);
  var test, v;

  TH.testCase(module, {
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
      const foo_ids = ["xyz", "def", "abc"],
            doc = {foo_ids: foo_ids};

      const forEach = test.stub(Query.prototype, 'forEach', function (func) {
        func({_id: "abc"});
        func({_id: "xyz"});
      });
      const where = stubWhere();
      const fields = this.spy(Query.prototype, 'fields');

      sut(doc,'foo_ids', {filter: true});
      refute(doc._errors);
      assert.same(doc.foo_ids, foo_ids);
      assert.equals(doc.foo_ids, ["abc", "xyz"]);

      assert.called(forEach);
      assert.same(forEach.firstCall.thisValue, v.query);

      assert.calledWithExactly(where, '_id', ["xyz", "def", "abc"]);
      assert.calledWithExactly(fields, '_id');
      assert.same(fields.firstCall.thisValue, v.query);
    },

    "test empty filter"() {
      const foo_ids = ["abc", "def", "xyz"],
            doc = {foo_ids: foo_ids};

      const forEach = test.intercept(Query.prototype, 'forEach');

      sut(doc,'foo_ids', {filter: true});
      refute(doc._errors);
      assert.same(doc.foo_ids, foo_ids);
      assert.equals(doc.foo_ids, []);
    },

    "test none"() {
      const doc = {};
      sut(doc,'foo_ids', true);

      refute(doc._errors);
    },

    'test not found'() {
      test.stub(Query.prototype, 'count', function () {
        assert.equals(this.wheres, undefined);
        assert.same(this.model, Model.Foo);
        return 0;
      });
      const doc = {foo_ids: ["xyz"]};
      sut(doc,'foo_ids', true);

      assert(doc._errors);
      assert.equals(doc._errors['foo_ids'],[["not_found"]]);
    },

    "test changes only"() {
      const doc = {foo_ids: ["xyz"], changes: {}};

      sut(doc,'foo_ids', {changesOnly: true});

      refute(doc._errors);
    },

    "test wrong type"() {
      const doc = {foo_ids: "abc"};
      sut(doc,'foo_ids', true);

      assert(doc._errors);
      assert.equals(doc._errors['foo_ids'],[["is_invalid"]]);
    },

    "test using scoped finder"() {
      const doc = {foo_ids: v.foo_ids = ['x', 'y']};

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
      const bar_ids = ['x', 'y'];

      const count = test.stub(Query.prototype, 'count').returns(2);
      const doc = {bar_ids: bar_ids};
      const where = stubWhere();

      sut(doc,'bar_ids', {modelName: 'Foo'});
      refute(doc._errors);

      let query = count.firstCall.thisValue;
      assert.same(query, v.query);
      assert.calledWithExactly(where, '_id', ["x", "y"]);
      assert.same(query.model, Model.Foo);

      sut(doc,'bar_ids', 'Foo');
      query = count.getCall(1).thisValue;
      assert.same(query.model, Model.Foo);
      assert.calledTwice(count);
    },

    "test belongs_to"() {
      const count = test.stub(Query.prototype, 'count').returns(1);
      const doc = {foo_id: "x", constructor: {
        $fields: {foo_id: {type: 'belongs_to', model: Model.Foo}}}};

      const where = stubWhere();

      sut(doc,'foo_id', true);
      refute(doc._errors);

      const query = count.firstCall.thisValue;
      assert.same(query, v.query);
      assert.calledWithExactly(where, '_id', ["x"]);
      assert.same(query.model, Model.Foo);
    },

    'test using model default'() {
      const foo_ids = ['x', 'y'];

      const count = test.stub(Query.prototype, 'count').returns(2);
      const doc = {foo_ids: foo_ids};

      const where = stubWhere();

      sut(doc,'foo_ids', true);
      refute(doc._errors);

      const query = count.firstCall.thisValue;
      assert.same(query, v.query);
      assert.calledWithExactly(where, '_id', ["x", "y"]);
      assert.same(query.model, Model.Foo);
    },
  });

  function stubWhere() {
    return TH.test.stub(Query.prototype, 'where', function () {return v.query = this});
  }
});
