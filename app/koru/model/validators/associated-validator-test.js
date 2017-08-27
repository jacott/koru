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
            doc = {foo_ids: foo_ids, attributes: {}};

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
            doc = {foo_ids: foo_ids, attributes: {}};

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
      const doc = {foo_ids: ["xyz"], attributes: {}};
      sut(doc,'foo_ids', true);

      assert(doc._errors);
      assert.equals(doc._errors['foo_ids'],[["not_found"]]);
    },

    "test changes only"() {
      const doc = {
        get foo_ids() {return this.changes.foo_ids},
        changes: {},
        attributes: {foo_ids: ["bef", "foo", "xyz"]},
      };

      sut(doc,'foo_ids', {changesOnly: true});

      refute(doc._errors);

      let count = 2;

      test.intercept(Query.prototype, 'count', ()=>count);
      test.intercept(Query.prototype, 'forEach', func=>{
        func({_id: "abc"});
        func({_id: "can"});
      });

      doc.changes.foo_ids = ["can", "def", "bef", "xyz", "abc"];

      sut(doc,'foo_ids', {changesOnly: true, filter: true});

      refute(doc._errors);
      assert.equals(doc.changes.foo_ids, ["abc", "bef", "can", "xyz"]);

      sut(doc,'foo_ids', {changesOnly: true});
      refute(doc._errors);

      doc.changes.foo_ids = ["can", "def", "bef", "xyz", "abc", 'new'];
      sut(doc,'foo_ids', {changesOnly: true});

      assert(doc._errors);

      count = 1;
      doc._errors = undefined;
      doc.changes.foo_ids = ['M', 'E'];
      doc.attributes.foo_ids = ['M'];

      sut(doc,'foo_ids', {changesOnly: true});
      refute(doc._errors);
      assert.equals(doc.changes.foo_ids, ['E', 'M']);

      count = 3;
      doc._errors = undefined;
      doc.changes.foo_ids = ['ra', 'rq', 'A', 'B', 'ra', 'A'];
      doc.attributes.foo_ids = ['ra'];

      sut(doc,'foo_ids', {changesOnly: true});
      refute(doc._errors);
      assert.equals(doc.changes.foo_ids, ['A', 'B', 'ra', 'rq']);
    },

    "duplicates are not allowed": {
      setUp() {
        /**
         * Duplicates are not allowed. ids are in ascending order
         **/
      },

      "test unfiltered"() {
        test.intercept(Query.prototype, 'count', ()=>4);

        const doc = {
          attributes: {foo_ids: ["b", "d", "a", "c"]},
          changes: {foo_ids: ["f", "a", "b", "e", "a", "e"]},

          get foo_ids() {return this.changes.foo_ids},
        };

        sut(doc,'foo_ids', {});

        assert.equals(doc.changes.foo_ids, ["a", "a", "b", "e", "e", "f"]);
        assert.equals(doc._errors, {foo_ids: [['duplicates']]});
      },

      "test filtered"() {
        test.intercept(Query.prototype, 'forEach', func=>{
          func({_id: 'f'});
          func({_id: 'e'});
        });

        const doc = {
          attributes: {foo_ids: ["a", "c", "b", "d"]},
          changes: {foo_ids: ["f", "a", "b", "e", "a", "e"]},

          get foo_ids() {return this.changes.foo_ids},
        };

        sut(doc,'foo_ids', {changesOnly: true, filter: true});
        refute(doc._errors);

        // don't filter out old ids
        assert.equals(doc.changes.foo_ids, ["a", "b", "e", "f"]);

        sut(doc,'foo_ids', {filter: true});
        refute(doc._errors);

        // filter out old ids
        assert.equals(doc.changes.foo_ids, ["e", "f"]);
      },
    },

    "test wrong type"() {
      const doc = {foo_ids: "abc", attributes: {}};
      sut(doc,'foo_ids', true);

      assert(doc._errors);
      assert.equals(doc._errors['foo_ids'],[["is_invalid"]]);
    },

    "test using scoped finder"() {
      const doc = {foo_ids: v.foo_ids = ['x', 'y'], attributes: {}};

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
        },
        attributes: {},
      };

      sut(doc,'foo_ids', true);

      assert.equals(v.values, v.foo_ids);
      refute(doc._errors);
    },

    "test overriding model name"() {
      const bar_ids = ['x', 'y'];

      const count = test.stub(Query.prototype, 'count').returns(2);
      const doc = {bar_ids: bar_ids, attributes: {}};
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
      const doc = {
        foo_id: "x", constructor: {
          $fields: {foo_id: {type: 'belongs_to', model: Model.Foo}}},
        attributes: {},
      };

      const where = stubWhere();

      sut(doc,'foo_id', true);
      refute(doc._errors);

      const query = count.firstCall.thisValue;
      assert.same(query, v.query);
      assert.calledWithExactly(where, '_id', ["x"]);
      assert.same(query.model, Model.Foo);
    },

    "test changes_only belongs_to"() {
      let count = test.stub(Query.prototype, 'count').returns(0);
      const doc = {
        foo_id: "y", constructor: {
          $fields: {foo_id: {type: 'belongs_to', model: Model.Foo}}},
        attributes: {foo_id: "y"},
        changes: {}
      };

      const where = stubWhere();

      sut(doc,'foo_id', {changesOnly: true});
      refute(doc._errors);
      refute.called(count);

      doc.changes = {foo_id: doc.foo_id = 'x'};

      sut(doc,'foo_id', {changesOnly: true});
      assert.equals(doc._errors, {foo_id: [['not_found']]});

      count.returns(1);

      const query = count.lastCall.thisValue;
      assert.same(query, v.query);
      assert.calledWithExactly(where, '_id', ["x"]);
      assert.same(query.model, Model.Foo);
    },

    'test using model default'() {
      const foo_ids = ['x', 'y'];

      const count = test.stub(Query.prototype, 'count').returns(2);
      const doc = {foo_ids: foo_ids, attributes: {}};

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
