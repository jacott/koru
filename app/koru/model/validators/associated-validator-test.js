define((require, exports, module)=>{
  'use strict';
  const Val             = require('koru/model/validation');
  const TH              = require('koru/test-helper');
  const Model           = require('../main');
  const Query           = require('../query');

  const {stub, spy, onEnd, intercept} = TH;

  const {error$, original$} = require('koru/symbols');

  const {associated} = require('koru/model/validators/associated-validator');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      Model.Foo = {modelName: 'Foo'};
    });

    afterEach(()=>{
      delete Model.Foo;
      v = {};
    });

    test("filter", ()=>{
      const foo_ids = ["xyz", "def", "abc"],
            doc = {foo_ids: foo_ids, attributes: {}};

      const forEach = stub(Query.prototype, 'forEach', func =>{
        func({_id: "abc"});
        func({_id: "xyz"});
      });
      const where = stubWhere();
      const fields = spy(Query.prototype, 'fields');

      associated.call(Val, doc,'foo_ids', {filter: true});
      refute(doc[error$]);
      assert.same(doc.foo_ids, foo_ids);
      assert.equals(doc.foo_ids, ["abc", "xyz"]);

      assert.called(forEach);
      assert.same(forEach.firstCall.thisValue, v.query);

      assert.calledWithExactly(where, '_id', ["xyz", "def", "abc"]);
      assert.calledWithExactly(fields, '_id');
      assert.same(fields.firstCall.thisValue, v.query);
    });

    test("empty filter", ()=>{
      const foo_ids = ["abc", "def", "xyz"],
            doc = {foo_ids: foo_ids, attributes: {}};

      const forEach = intercept(Query.prototype, 'forEach');

      associated.call(Val, doc,'foo_ids', {filter: true});
      refute(doc[error$]);
      assert.same(doc.foo_ids, foo_ids);
      assert.equals(doc.foo_ids, []);
    });

    test("none", ()=>{
      const doc = {};
      associated.call(Val, doc,'foo_ids', true);

      refute(doc[error$]);
    });

    test("not found", ()=>{
      stub(Query.prototype, 'count', function () {
        assert.equals(this.wheres, undefined);
        assert.same(this.model, Model.Foo);
        return 0;
      });
      const doc = {foo_ids: ["xyz"], attributes: {}};
      associated.call(Val, doc,'foo_ids', true);

      assert(doc[error$]);
      assert.equals(doc[error$]['foo_ids'],[["not_found"]]);
    });

    test("changes only", ()=>{
      const doc = {
        get foo_ids() {return this.changes.foo_ids},
        changes: {},
        attributes: {foo_ids: ["bef", "foo", "xyz"]},
      };

      associated.call(Val, doc,'foo_ids', {changesOnly: true});

      refute(doc[error$]);

      let count = 2;

      intercept(Query.prototype, 'count', ()=>count);
      intercept(Query.prototype, 'forEach', func=>{
        func({_id: "abc"});
        func({_id: "can"});
      });

      doc.changes.foo_ids = ["can", "def", "bef", "xyz", "abc"];

      associated.call(Val, doc,'foo_ids', {changesOnly: true, filter: true});

      refute(doc[error$]);
      assert.equals(doc.changes.foo_ids, ["abc", "bef", "can", "xyz"]);

      associated.call(Val, doc,'foo_ids', {changesOnly: true});
      refute(doc[error$]);

      doc.changes.foo_ids = ["can", "def", "bef", "xyz", "abc", 'new'];
      associated.call(Val, doc,'foo_ids', {changesOnly: true});

      assert(doc[error$]);

      count = 1;
      doc[error$] = undefined;
      doc.changes.foo_ids = ['M', 'E'];
      doc.attributes.foo_ids = ['M'];

      associated.call(Val, doc,'foo_ids', {changesOnly: true});
      refute(doc[error$]);
      assert.equals(doc.changes.foo_ids, ['E', 'M']);

      count = 3;
      doc[error$] = undefined;
      doc.changes.foo_ids = ['ra', 'rq', 'A', 'B', 'ra', 'A'];
      doc.attributes.foo_ids = ['ra'];

      associated.call(Val, doc,'foo_ids', {changesOnly: true});
      refute(doc[error$]);
      assert.equals(doc.changes.foo_ids, ['A', 'B', 'ra', 'rq']);
    });

    group("duplicates are not allowed", ()=>{
      beforeEach(()=>{
        /**
         * Duplicates are not allowed. ids are in ascending order
         **/
      });

      test("unfiltered", ()=>{
        intercept(Query.prototype, 'count', ()=>4);

        const doc = {
          attributes: {foo_ids: ["b", "d", "a", "c"]},
          changes: {foo_ids: ["f", "a", "b", "e", "a", "e"]},

          get foo_ids() {return this.changes.foo_ids},
        };

        associated.call(Val, doc,'foo_ids', {});

        assert.equals(doc.changes.foo_ids, ["a", "a", "b", "e", "e", "f"]);
        assert.equals(doc[error$], {foo_ids: [['duplicates']]});
      });

      test("filtered", ()=>{
        intercept(Query.prototype, 'forEach', func=>{
          func({_id: 'f'});
          func({_id: 'e'});
        });

        const doc = {
          attributes: {foo_ids: ["a", "c", "b", "d"]},
          changes: {foo_ids: ["f", "a", "b", "e", "a", "e"]},

          get foo_ids() {return this.changes.foo_ids},
        };

        associated.call(Val, doc,'foo_ids', {changesOnly: true, filter: true});
        refute(doc[error$]);

        // don't filter out old ids
        assert.equals(doc.changes.foo_ids, ["a", "b", "e", "f"]);

        associated.call(Val, doc,'foo_ids', {filter: true});
        refute(doc[error$]);

        // filter out old ids
        assert.equals(doc.changes.foo_ids, ["e", "f"]);
      });
    });

    test("wrong type", ()=>{
      const doc = {foo_ids: "abc", attributes: {}};
      associated.call(Val, doc,'foo_ids', true);

      assert(doc[error$]);
      assert.equals(doc[error$]['foo_ids'],[["is_invalid"]]);
    });

    test("using scoped finder", ()=>{
      const doc = {foo_ids: v.foo_ids = ['x', 'y'], attributes: {}};

      function fooFinder(values) {
        v.values = values;
        return {count: stub().returns(2)};
      };

      associated.call(Val, doc,'foo_ids', {finder: fooFinder});

      assert.equals(v.values, v.foo_ids);
      refute(doc[error$]);
    });

    test("using scoped default", ()=>{
      const doc = {
        foo_ids: v.foo_ids = ['x', 'y'],
        fooFind(values) {
          v.values = values;
          return {count: stub().returns(2)};
        },
        attributes: {},
      };

      associated.call(Val, doc,'foo_ids', true);

      assert.equals(v.values, v.foo_ids);
      refute(doc[error$]);
    });

    test("overriding model name", ()=>{
      const bar_ids = ['x', 'y'];

      const count = stub(Query.prototype, 'count').returns(2);
      const doc = {bar_ids: bar_ids, attributes: {}};
      const where = stubWhere();

      associated.call(Val, doc,'bar_ids', {modelName: 'Foo'});
      refute(doc[error$]);

      let query = count.firstCall.thisValue;
      assert.same(query, v.query);
      assert.calledWithExactly(where, '_id', ["x", "y"]);
      assert.same(query.model, Model.Foo);

      associated.call(Val, doc,'bar_ids', 'Foo');
      query = count.getCall(1).thisValue;
      assert.same(query.model, Model.Foo);
      assert.calledTwice(count);
    });

    test("belongs_to", ()=>{
      const count = stub(Query.prototype, 'count').returns(1);
      const doc = {
        foo_id: "x", constructor: {
          $fields: {foo_id: {type: 'belongs_to', model: Model.Foo}}},
        attributes: {},
      };

      const where = stubWhere();

      associated.call(Val, doc,'foo_id', true);
      refute(doc[error$]);

      const query = count.firstCall.thisValue;
      assert.same(query, v.query);
      assert.calledWithExactly(where, '_id', ["x"]);
      assert.same(query.model, Model.Foo);
    });

    test("changes_only belongs_to", ()=>{
      let count = stub(Query.prototype, 'count').returns(0);
      const doc = {
        foo_id: "y", constructor: {
          $fields: {foo_id: {type: 'belongs_to', model: Model.Foo}}},
        attributes: {foo_id: "y"},
        changes: {}
      };

      const where = stubWhere();

      associated.call(Val, doc,'foo_id', {changesOnly: true});
      refute(doc[error$]);
      refute.called(count);

      doc.changes = {foo_id: doc.foo_id = 'x'};

      associated.call(Val, doc,'foo_id', {changesOnly: true});
      assert.equals(doc[error$], {foo_id: [['not_found']]});

      count.returns(1);

      const query = count.lastCall.thisValue;
      assert.same(query, v.query);
      assert.calledWithExactly(where, '_id', ["x"]);
      assert.same(query.model, Model.Foo);
    });

    test("using model default", ()=>{
      const foo_ids = ['x', 'y'];

      const count = stub(Query.prototype, 'count').returns(2);
      const doc = {foo_ids: foo_ids};

      const where = stubWhere();

      associated.call(Val, doc,'foo_ids', true);
      refute(doc[error$]);

      const query = count.firstCall.thisValue;
      assert.same(query, v.query);
      assert.calledWithExactly(where, '_id', ["x", "y"]);
      assert.same(query.model, Model.Foo);
    });

    group("using original$", ()=>{
      test("is undefined", ()=>{
        const foos = ['x', 'y'];

        const count = stub(Query.prototype, 'count').returns(1);
        const doc = {foos, [original$]: undefined};

        associated.call(Val, doc,'foos', {model: Model.Foo, changesOnly: true});
        assert.equals(doc[error$], {foos: [['not_found']]});
      });

      test("no changes", ()=>{
        const foos = ['x', 'y'];

        const doc = {foos, [original$]: {foos}};

        associated.call(Val, doc,'foos', {model: Model.Foo, changesOnly: true});
        refute(doc[error$]);
      });

      test("changes", ()=>{
        const foos = ['x', 'y'];

        const count = stub(Query.prototype, 'count').returns(1);
        const doc = {foos, [original$]: {foos: ['y']}};

        const where = stubWhere();

        associated.call(Val, doc,'foos', {model: Model.Foo, changesOnly: true});
        refute(doc[error$]);

        const query = count.firstCall.thisValue;
        assert.same(query, v.query);
        assert.calledWithExactly(where, '_id', ["x"]);
        assert.same(query.model, Model.Foo);
      });
    });
  });

  function stubWhere() {
    return stub(Query.prototype, 'where', function () {return v.query = this});
  }
});
