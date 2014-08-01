define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Query = require('./query');
  var sut = require('./query-client');
  var session = require('../session/base');
  var Model = require('./main');
  var util = require('../util');
  var sessState = require('../session/state');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.TestModel = Model.define('TestModel').defineFields({name: 'text', age: 'number', nested: 'object'});
      v.foo = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, nested: [{ary: ['m']}]});
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
      Model._destroyModel('TestModel2', 'drop');
      sessState._resetPendingCount();
      session.isUpdateFromServer = false;
      v = null;
    },

    "test empty Query": function () {
      var query = new Query();
      assert.same(query.count(), 0);

      assert.equals(query.fetch(), []);
    },

    "test where func": function () {
      assert.same(v.TestModel.query.where(function (doc) {
        return doc.name !== 'foo';
      }).count(), 0);

      assert.same(v.TestModel.query.where(function (doc) {
        return doc.name === 'foo';
      }).count(), 1);
    },


    "publishes from server should not call afterLocalChange": {
      setUp: function () {
        v.TestModel.afterLocalChange(v.TestModel, v.stub = test.stub());
        session.isUpdateFromServer = true;
      },

      "test insertFromServer": function () {
        Query.insertFromServer(v.TestModel, 'foo2', {name: 'foo2'});

        refute.called(v.stub);
      },

      "test update": function () {
        v.TestModel.query.onId(v.foo._id).update({age: 7});

        refute.called(v.stub);
      },


      "test remove": function () {
        v.TestModel.query.onId(v.foo._id).remove();

        refute.called(v.stub);
      },
    },



    /**
     * This was causing a undefined exception
     */
    "test insertFromServer no matching simDoc": function () {
      sessState.incPending();

      Query.insertFromServer(v.TestModel, 'foo2', {name: 'foo2'});
      assert(v.TestModel.exists({_id:'foo2'}));

      Query.insert(new v.TestModel({_id: 'foo1', name: 'foo1'}));

      Query.insertFromServer(v.TestModel, 'foo4', {name: 'foo3'});

      assert(v.TestModel.exists({_id: 'foo4'}));

      assert.equals(Object.keys(Query._simDocs.TestModel), ['foo1']);
    },

    "test updating array item": function () {
      v.foo.$update({ary: ['a']});

      sessState.incPending();

      v.foo.$onThis.addItem('ary','b');

      session.isUpdateFromServer = true;
      v.TestModel.query.onId(v.foo._id).update({'ary.1': 'b'});
      session.isUpdateFromServer = false;

      assert.equals(v.foo.attributes.ary, ['a', 'b']);

      sessState.decPending();

      assert.equals(v.foo.attributes.ary, ['a', 'b']);
    },

    "test add item on undefined": function () {
      sessState.incPending();
      v.foo.$onThis.addItem('ary','b');

      assert.equals(v.foo.attributes.ary, ['b']);

      session.isUpdateFromServer = true;
      v.TestModel.query.onId(v.foo._id).update({'ary.0': 'b'});
      session.isUpdateFromServer = false;

      sessState.decPending();

      assert.equals(v.foo.attributes.ary, ['b']);
    },

    "test reconcile docs": function () {
      var stateOC = test.stub(sessState, 'onChange').returns(v.stateOb = {stop: test.stub()});
      var syncOC = test.stub(sessState.pending, 'onChange').returns(v.syncOb = {stop: test.stub()});

      function MockQuery() {}
      sut(MockQuery);

      test.spy(MockQuery, 'revertSimChanges');

      assert.calledOnce(stateOC);
      assert.calledOnce(syncOC);


      assert.same(sessState._onConnect['01'], Query._onConnect);

      MockQuery.insertFromServer(v.TestModel, 'foo2', {name: 'foo2'});

      v.TestModel2 = Model.define('TestModel2').defineFields({moe: 'text'});

      var moe =  MockQuery.insertFromServer(v.TestModel2, 'moe1', {moe: 'Curly'});

      stateOC.yield(false);

      var simDocs = MockQuery._simDocs;

      assert(simDocs.TestModel);

      assert.same(simDocs.TestModel.foo123, 'new');
      assert.same(simDocs.TestModel.foo2, 'new');
      assert.same(simDocs.TestModel2.moe1, 'new');

      var pending = true;

      test.stub(sessState, 'pendingCount', function () {
        return pending;
      });
      stateOC.yield(true);

      refute.called(MockQuery.revertSimChanges);

      pending = false;

      stateOC.yield(true);
      assert.called(MockQuery.revertSimChanges);
    },

    "recording": {
      setUp: function () {
        sessState.incPending();
      },

      "test client only updates": function () {
        v.TestModel.query.update({name: 'bar'});

        assert.same(v.foo.name, 'bar');

        var tmchanges = Query._simDocs.TestModel;

        assert.equals(tmchanges[v.foo._id].name, 'foo');

        v.TestModel.query.update({age: 7, name: 'baz'});

        v.TestModel.query.update({age: 9, name: 'baz'});

        assert.equals(tmchanges[v.foo._id].name, 'foo');
        assert.equals(tmchanges[v.foo._id].age, 5);


        test.onEnd(v.TestModel.onChange(v.change = test.stub()));

        sessState.decPending();

        assert.same(v.foo.name, 'foo');
        assert.same(v.foo.age, 5);

        assert.equals(Query._simDocs, {});

        assert.calledWith(v.change, TH.matchModel(v.foo), {name: 'baz', age: 9});
      },

      "test partial update match from server": function () {
        v.TestModel.query.update({age: 7, name: 'baz'});
        v.TestModel.query.update({age: 2, name: 'another'});
        session.isUpdateFromServer = true;
        v.TestModel.query.onId(v.foo._id).update({name: 'baz'});
        session.isUpdateFromServer = false;

        sessState.decPending();

        assert.equals(v.foo.attributes, {_id: v.foo._id, age: 5, name: 'baz', nested: [{ary: ['m']}]});
      },

      "test matching update": function () {
        test.onEnd(v.TestModel.onChange(v.change = test.stub()));

        v.TestModel.query.update({age: 7, name: 'baz'});
        session.isUpdateFromServer = true;
        v.TestModel.query.onId(v.foo._id).update({age: 7, name: 'baz'});
        session.isUpdateFromServer = false;

        sessState.decPending();

        assert.same(v.foo.name, 'baz');
        assert.same(v.foo.age, 7);

        assert.calledOnce(v.change);
      },

      "test nested structures": function () {
        v.TestModel.query.update({"nested.0.arg.0": 'f'});

        var tmchanges = Query._simDocs.TestModel;

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['m']}]);

        v.TestModel.query.update({nested: true});

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['m']}]);

        session.isUpdateFromServer = true;
        v.TestModel.query.onId(v.foo._id).update({"nested.0.ary.0": 'M'});
        v.TestModel.query.onId(v.foo._id).update({"nested.0.ary.1": 'f'});
        session.isUpdateFromServer = false;

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['M', 'f']}]);

        sessState.decPending();

        assert.equals(v.foo.nested, [{ary: ['M', 'f']}]);
      },

      "test client only add": function () {
        var bar = v.TestModel.create({name: 'bar'});

        test.onEnd(v.TestModel.onChange(v.changed = test.stub()));
        sessState.decPending();

        assert.calledWith(v.changed, null, TH.matchModel(bar));
      },

      "test matching add ": function () {
        test.onEnd(v.TestModel.onChange(v.change = test.stub()));

        var bar = v.TestModel.create({name: 'baz', age: 7});
        Query.insertFromServer(v.TestModel, bar._id, {_id: bar._id, age: 7, name: 'baz'});

        sessState.decPending();

        assert.same(bar.name, 'baz');
        assert.same(bar.age, 7);

        assert.calledOnce(v.change);
      },

      "test add where server fields differ": function () {
        var bar = v.TestModel.create({name: 'bar', age: 5});

        test.onEnd(v.TestModel.onChange(v.changed = test.stub()));

        Query.insertFromServer(v.TestModel, bar._id, {_id: bar._id, name: 'sam'});

        assert.calledWith(v.changed, TH.matchModel(bar), {name: 'bar'});

        v.changed.reset();
        sessState.decPending();

        assert.same(bar.age, undefined);
        assert.same(bar.name, 'sam');

        assert.calledWith(v.changed, TH.matchModel(bar), {age: 5});
      },

      "test matching remove ": function () {
        test.onEnd(v.TestModel.onChange(v.change = test.stub()));

        v.TestModel.query.onId(v.foo._id).remove();
        session.isUpdateFromServer = true;
        v.TestModel.query.onId(v.foo._id).remove();
        session.isUpdateFromServer = false;

        sessState.decPending();

        assert.same(v.TestModel.query.count(), 0);

        assert.calledOnce(v.change);
      },

      "test client remove, server update": function () {
        v.TestModel.query.remove();

        session.isUpdateFromServer = true;
        v.TestModel.query.onId(v.foo._id).update({name: 'sam'});
        session.isUpdateFromServer = false;

        assert.same(v.TestModel.query.count(), 0);

        test.onEnd(v.TestModel.onChange(v.changed = test.stub()));
        sessState.decPending();

        assert.same(v.TestModel.query.count(), 1);

        v.foo.$reload();

        assert.same(v.foo.name, 'sam');
        assert.calledWith(v.changed, TH.matchModel(v.foo), null);
      },

      "test remote removed changed doc": function () {
        v.TestModel.query.onId(v.foo._id).update({name: 'Mary'});

        test.onEnd(v.TestModel.onChange(v.changed = test.stub()));
        session.isUpdateFromServer = true;
        v.TestModel.query.onId(v.foo._id).remove();
        session.isUpdateFromServer = false;

        refute.called(v.changed);

        assert.same(v.foo.$reload().name, 'Mary');

        sessState.decPending();
        assert.same(v.TestModel.query.count(), 0);

        assert.calledWith(v.changed, null, TH.matchModel(v.foo));
      },

      "test notification of different fields": function () {
        v.TestModel.query.update({age: 7});

        test.onEnd(v.TestModel.onChange(v.changed = test.stub()));

        session.isUpdateFromServer = true;
        v.TestModel.query.onId(v.foo._id).update({age: 9});

        refute.called(v.changed);

        v.TestModel.query.onId(v.foo._id).update({name: 'sam'});
        session.isUpdateFromServer = false;

        // Should notify immediately if major key not in client changes
        assert.calledWith(v.changed, TH.matchModel(v.foo), {name: 'foo'});

        v.changed.reset();

        sessState.decPending();

        // Should notify at revert for other changes
        assert.calledWith(v.changed, TH.matchModel(v.foo), {age: 7});
      },
    },
  });
});
