define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Query = require('./query');
  var sut = require('./query-client');
  var session = require('../session');
  var sessionClient = require('../session/main-client');
  var Model = require('./main');
  var util = require('../util');
  var sessState = require('../session/state');
  var clientRpcBase = require('../session/client-rpc-base');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      util.thread.db = 'foo';
      v.TestModel = Model.define('TestModel').defineFields({name: 'text', age: 'number', nested: 'object'});
      v.foo = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, nested: [{ary: ['m']}]});
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
      Model._destroyModel('TestModel2', 'drop');
      sessState._resetPendingCount();
      util.thread.db = null;
      delete Model._databases.foo;
      delete Model._databases.foo2;
      v = null;
    },

    "test withDB": function () {
      util.withDB('foo2', () => v.TestModel.create({age: 3}));

      var ocDB = [];
      test.onEnd(v.TestModel.onChange((doc, was) => {
        ocDB.push(util.thread.db, was);
      }).stop);

      v.TestModel.query.update('age', 2);

      v.TestModel.query.withDB('foo2').update('age', 7);

      assert.equals(ocDB, ['foo', {age: 5}, 'foo2', {age: 3}]);

      assert.equals(v.TestModel.query.map(doc => doc.age), [2]);
      assert.equals(v.TestModel.query.withDB('foo2').map(doc => doc.age), [7]);
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
      },

      "test insertFromServer": function () {
        Query.insertFromServer(v.TestModel, 'foo2', {name: 'foo2'});

        refute.called(v.stub);
      },

      "test update": function () {
        v.TestModel.serverQuery.onId(v.foo._id).update({age: 7});

        refute.called(v.stub);
      },


      "test remove": function () {
        v.TestModel.serverQuery.onId(v.foo._id).remove();

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

      assert.equals(Object.keys(Model._databases.foo.TestModel.simDocs), ['foo1']);
    },

    "test nested update after connection lost": function () {
      var _sessState = sessState.__init__();
      var _session = session.__init__(sessionClient.__init__(_sessState), session.__initBase__());
      _session.connect._ws = {send: test.stub()};
      clientRpcBase(_session, _sessState);
      _session.defineRpc('fooUpdate',function () {
        new _Query(v.TestModel).onId('foo2').update('nested.b', 3);
      });

      var _QueryClient = sut.__init__(_sessState, _session);
      var _Query = Query.__init__(_QueryClient);
      _sessState.connected();
      _Query.insertFromServer(v.TestModel, 'foo2', {nested: {a: 1, b: 2}});
      _sessState.retry();
      _session.rpc('fooUpdate');
      _sessState.connected();
      _Query.insertFromServer(v.TestModel, 'foo2', {nested: {a: 1, b: 2}});
      var query = new _Query(v.TestModel).onId('foo2');
      query.isFromServer = true;
      query.update({'nested.b': 3});

      _sessState.decPending();
      assert.equals(v.TestModel.docs.foo2.nested, {a: 1, b: 3});
    },

    "test insertFromServer doc already exists": function () {
      test.onEnd(v.TestModel.onChange(v.onChange = test.stub()));
      Query.insertFromServer(v.TestModel, v.foo._id, {name: 'foo new', nested: [{ary: ['f']}]});

      assert.calledOnce(v.onChange);

      assert.equals(v.onChange.args(0, 0).attributes, {name: 'foo new', nested: [{ary: ['f']}]});
      assert.equals(v.onChange.args(0, 1), {name: "foo", nested: [{ary: ["m"]}], _id: "foo123", age: 5});

      assert.same(v.foo.attributes, v.onChange.args(0, 0).attributes);
    },

    "test insertFromServer doc already exists and pending": function () {
      sessState.incPending();
      test.onEnd(v.TestModel.onChange(v.onChange = test.stub()));
      Query.insertFromServer(v.TestModel, v.foo._id, {name: 'foo new', nested: [{ary: ['f']}]});

      assert.calledOnce(v.onChange);

      assert.equals(v.onChange.args(0, 0).attributes, {name: 'foo new', nested: [{ary: ['f']}]});
      assert.equals(v.onChange.args(0, 1), {name: "foo", nested: [{ary: ["m"]}], _id: "foo123", age: 5});

      assert.same(v.foo.attributes, v.onChange.args(0, 0).attributes);
      refute.msg("Should update fromServer; not client")(Model._databases.foo.TestModel.simDocs);
    },

    "test updating array item": function () {
      v.foo.$update({ary: ['a']});

      sessState.incPending();

      v.foo.$onThis.addItem('ary','b');

      v.TestModel.serverQuery.onId(v.foo._id).update({'ary.1': 'b'});

      assert.equals(v.foo.attributes.ary, ['a', 'b']);

      sessState.decPending();

      assert.equals(v.foo.attributes.ary, ['a', 'b']);
    },

    "test add item on undefined": function () {
      sessState.incPending();
      v.foo.$onThis.addItem('ary','b');

      assert.equals(v.foo.attributes.ary, ['b']);

      v.TestModel.serverQuery.onId(v.foo._id).update({'ary.0': 'b'});

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

      var simDocs = Model._databases.foo.TestModel.simDocs;

      assert(simDocs);

      assert.same(simDocs.foo123, 'new');
      assert.same(simDocs.foo2, 'new');
      assert.same(Model._databases.foo.TestModel2.simDocs.moe1, 'new');

      var pending = true;

      test.stub(sessState, 'pendingCount', function () {
        return pending;
      });
      stateOC.yield(true);

      refute.called(MockQuery.revertSimChanges);

      stateOC.yield(true);
      refute.called(MockQuery.revertSimChanges);

      syncOC.yield(pending = false);
      assert.called(MockQuery.revertSimChanges);
    },

    "recording": {
      setUp: function () {
        sessState.incPending();
      },

      "test client only updates": function () {
        v.TestModel.query.update({name: 'bar'});

        assert.same(v.foo.name, 'bar');

        var tmchanges = Model._databases.foo.TestModel.simDocs;

        assert.equals(tmchanges[v.foo._id].name, 'foo');

        v.TestModel.query.update({age: 7, name: 'baz'});

        v.TestModel.query.update({age: 9, name: 'baz'});

        assert.equals(tmchanges[v.foo._id].name, 'foo');
        assert.equals(tmchanges[v.foo._id].age, 5);


        test.onEnd(v.TestModel.onChange(v.change = test.stub()));

        sessState.decPending();

        assert.same(v.foo.name, 'foo');
        assert.same(v.foo.age, 5);

        assert.equals(Model._databases.foo.TestModel.simDocs, {});

        assert.calledWith(v.change, TH.matchModel(v.foo), {name: 'baz', age: 9});
      },

      "test partial update match from server": function () {
        v.TestModel.query.update({age: 7, name: 'baz'});
        v.TestModel.query.update({age: 2, name: 'another'});
        v.TestModel.serverQuery.onId(v.foo._id).update({name: 'baz'});

        sessState.decPending();

        assert.equals(v.foo.attributes, {_id: v.foo._id, age: 5, name: 'baz', nested: [{ary: ['m']}]});
      },

      "test matching update": function () {
        test.onEnd(v.TestModel.onChange(v.change = test.stub()));

        v.TestModel.query.update({age: 7, name: 'baz'});
        v.TestModel.serverQuery.onId(v.foo._id).update({age: 7, name: 'baz'});

        sessState.decPending();

        assert.same(v.foo.name, 'baz');
        assert.same(v.foo.age, 7);

        assert.calledOnce(v.change);
        assert.calledWithExactly(v.change, TH.matchModel(v.foo), {age: 5, name: 'foo'}, undefined);
      },

      "test nested structures": function () {
        v.TestModel.query.update({"nested.0.arg.0": 'f'});

        var tmchanges = Model._databases.foo.TestModel.simDocs;

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['m']}]);

        v.TestModel.query.update({nested: true});

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['m']}]);

        v.TestModel.serverQuery.onId(v.foo._id).update({"nested.0.ary.0": 'M'});
        v.TestModel.serverQuery.onId(v.foo._id).update({"nested.0.ary.1": 'f'});

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

        assert.calledWith(v.changed, TH.matchModel(bar), {age: 5}, true);
      },

      "test matching remove ": function () {
        test.onEnd(v.TestModel.onChange(v.change = test.stub()));

        v.TestModel.query.onId(v.foo._id).remove();
        v.TestModel.serverQuery.onId(v.foo._id).remove();

        sessState.decPending();

        assert.same(v.TestModel.query.count(), 0);

        assert.calledOnce(v.change);
      },

      "test client remove, server update": function () {
        v.TestModel.query.remove();

        v.TestModel.serverQuery.onId(v.foo._id).update({name: 'sam'});

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
        v.TestModel.serverQuery.onId(v.foo._id).remove();

        refute.called(v.changed);

        assert.same(v.foo.$reload().name, 'Mary');

        sessState.decPending();
        assert.same(v.TestModel.query.count(), 0);

        assert.calledWith(v.changed, null, TH.matchModel(v.foo));
      },

      "test remote removed non existant": function () {
        test.onEnd(v.TestModel.onChange(v.changed = test.stub()));
        v.TestModel.onId('noDoc').fromServer().remove();

        refute.calledWith(v.changed, null, v.foo, true);
      },

      "test notification of different fields": function () {
        v.TestModel.query.update({age: 7});

        test.onEnd(v.TestModel.onChange(v.changed = test.stub()));

        v.TestModel.serverQuery.onId(v.foo._id).update({age: 9});

        refute.called(v.changed);

        v.TestModel.serverQuery.onId(v.foo._id).update({name: 'sam'});

        // Should notify immediately if major key not in client changes
        assert.calledWith(v.changed, TH.matchModel(v.foo), {name: 'foo'}, true);

        v.changed.reset();

        sessState.decPending();

        // Should notify at revert for other changes
        assert.calledWith(v.changed, TH.matchModel(v.foo), {age: 7}, true);
      },
    },
  });
});
