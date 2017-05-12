define(function (require, exports, module) {
  const api                  = require('koru/test/api');
  const session              = require('../session');
  const clientRpcBase        = require('../session/client-rpc-base');
  const sessionClientFactory = require('../session/main-client');
  const sessState            = require('../session/state');
  const util                 = require('../util');
  const dbBroker             = require('./db-broker');
  const Model                = require('./main');
  const Query                = require('./query');
  const TH                   = require('./test-helper');

  const sut                  = require('./query-client');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      dbBroker.setMainDbId('foo');
      v.TestModel = Model.define('TestModel').defineFields({
        name: 'text', age: 'number', nested: 'object'});
      v.foo = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, nested: [{ary: ['m']}]});
      api.module(module.get('./query'));
    },

    tearDown() {
      Model._destroyModel('TestModel', 'drop');
      Model._destroyModel('TestModel2', 'drop');
      sessState._resetPendingCount();
      dbBroker.clearDbId();
      delete Model._databases.foo;
      delete Model._databases.foo2;
      v = null;
    },

    "test withIndex, withDB"() {
      v.idx = v.TestModel.addUniqueIndex('name', 'age');

      dbBroker.withDB('foo2', () => v.TestModel.create({name: 'foo', age: 3}));

      assert.equals(v.TestModel.query.withIndex(v.idx, {name: 'foo'}).fetchField('age'), [5]);
      assert.equals(v.TestModel.query.withDB('foo2').withIndex(v.idx, {name: 'foo'})
                    .fetchField('age'), [3]);
    },

    "test withDB"() {
      dbBroker.withDB('foo2', () => v.TestModel.create({age: 3}));

      const ocDB = [];
      this.onEnd(v.TestModel.onAnyChange((doc, was) => {
        ocDB.push(dbBroker.dbId, was);
      }).stop);

      v.TestModel.query.update('age', 2);

      v.TestModel.query.withDB('foo2').update('age', 7);

      assert.equals(ocDB, ['foo', {age: 5}, 'foo2', {age: 3}]);

      assert.equals(v.TestModel.query.map(doc => doc.age), [2]);
      assert.equals(v.TestModel.query.withDB('foo2').map(doc => doc.age), [7]);
    },

    "test empty Query"() {
      const query = new Query();
      assert.same(query.count(), 0);

      assert.equals(query.fetch(), []);
    },

    "test where func"() {
      api.protoMethod('where');
      assert.same(v.TestModel.query.where(doc => doc.name !== 'foo').count(), 0);

      assert.same(v.TestModel.query.where(doc => doc.name === 'foo').count(), 1);
    },


    "publishes from server should not call afterLocalChange": {
      setUp() {
        v.TestModel.afterLocalChange(v.TestModel, v.stub = this.stub());
      },

      "test insertFromServer"() {
        Query.insertFromServer(v.TestModel, 'foo2', {name: 'foo2'});

        refute.called(v.stub);
      },

      "test update"() {
        v.TestModel.serverQuery.onId(v.foo._id).update({age: 7});

        refute.called(v.stub);
      },


      "test remove"() {
        v.TestModel.serverQuery.onId(v.foo._id).remove();

        refute.called(v.stub);
      },
    },



    /**
     * This was causing a undefined exception
     */
    "test insertFromServer no matching simDoc"() {
      sessState.incPending();

      Query.insertFromServer(v.TestModel, 'foo2', {name: 'foo2'});
      assert(v.TestModel.exists({_id:'foo2'}));

      Query.insert(new v.TestModel({_id: 'foo1', name: 'foo1'}));

      Query.insertFromServer(v.TestModel, 'foo4', {name: 'foo3'});

      assert(v.TestModel.exists({_id: 'foo4'}));

      assert.equals(Object.keys(Model._databases.foo.TestModel.simDocs), ['foo1']);
    },

    "test nested update after connection lost"() {
      const _sessState = sessState.constructor();
      const _session = sessionClientFactory(new (session.constructor)('foo'), _sessState);
      _session.ws = {send: this.stub()};
      clientRpcBase(_session);
      _session.defineRpc('fooUpdate', function () {
        new _Query(v.TestModel).onId('foo2').update('nested.b', 3);
      });

      const _QueryClient = sut.__init__(_session);
      const _Query = Query.__init__(_QueryClient);
      _sessState.connected(_session);
      _Query.insertFromServer(v.TestModel, 'foo2', {nested: {a: 1, b: 2}});
      _sessState.retry();
      _session.rpc('fooUpdate');
      _sessState.connected(_session);
      _Query.insertFromServer(v.TestModel, 'foo2', {nested: {a: 1, b: 2}});
      const query = new _Query(v.TestModel).onId('foo2');
      query.isFromServer = true;
      query.update({'nested.b': 3});

      _sessState.decPending();
      assert.equals(v.TestModel.docs.foo2.nested, {a: 1, b: 3});
    },

    "test insertFromServer doc already exists"() {
      const {_id, age} = v.foo;
      this.onEnd(v.TestModel.onChange(v.onChange = this.stub()));
      Query.insertFromServer(v.TestModel, v.foo._id, {
        _id, age, name: 'foo new', nested: [{ary: ['f']}]});

      assert.calledOnce(v.onChange);

      assert.equals(v.onChange.args(0, 0).attributes, {
        _id, age, name: 'foo new', nested: [{ary: ['f']}]});
      assert.equals(v.onChange.args(0, 1), {
        name: "foo", nested: [{ary: ["m"]}]});

      assert.same(v.foo.attributes, v.onChange.args(0, 0).attributes);
    },

    "test insertFromServer doc already exists and pending"() {
      const {_id, age} = v.foo;
      sessState.incPending();
      this.onEnd(v.TestModel.onChange(v.onChange = this.stub()));
      Query.insertFromServer(v.TestModel, v.foo._id, {
        _id, age, name: 'foo new', nested: [{ary: ['f']}]});

      assert.calledOnce(v.onChange);

      assert.equals(v.onChange.args(0, 0).attributes, {
        _id, age, name: 'foo new', nested: [{ary: ['f']}]});
      assert.equals(v.onChange.args(0, 1), {
        name: "foo", nested: [{ary: ["m"]}]});

      assert.same(v.foo.attributes, v.onChange.args(0, 0).attributes);
      refute.msg("Should update fromServer; not client")(Model._databases.foo.TestModel.simDocs);
    },

    "test updating array item"() {
      v.foo.$update({ary: ['a']});

      sessState.incPending();

      v.foo.$onThis.addItem('ary','b');

      v.TestModel.serverQuery.onId(v.foo._id).update({'ary.1': 'b'});

      assert.equals(v.foo.attributes.ary, ['a', 'b']);

      sessState.decPending();

      assert.equals(v.foo.attributes.ary, ['a', 'b']);
    },

    "test add item on undefined"() {
      sessState.incPending();
      v.foo.$onThis.addItem('ary','b');

      assert.equals(v.foo.attributes.ary, ['b']);

      v.TestModel.serverQuery.onId(v.foo._id).update({'ary.0': 'b'});

      sessState.decPending();

      assert.equals(v.foo.attributes.ary, ['b']);
    },

    "test reconcile docs"() {
      const stateOC = this.stub(sessState, 'onChange').returns(v.stateOb = {stop: this.stub()});
      const syncOC = this.stub(sessState.pending, 'onChange')
              .returns(v.syncOb = {stop: this.stub()});

      function MockQuery() {}
      MockQuery.notifyAC = this.stub();
      sut(MockQuery, null, 'notifyAC');

      this.spy(MockQuery, 'revertSimChanges');

      assert.calledOnce(stateOC);
      assert.calledOnce(syncOC);


      assert.same(sessState._onConnect['01'], Query._onConnect);

      MockQuery.insertFromServer(v.TestModel, 'foo2', {name: 'foo2'});

      v.TestModel2 = Model.define('TestModel2').defineFields({moe: 'text'});

      const moe =  MockQuery.insertFromServer(v.TestModel2, 'moe1', {moe: 'Curly'});

      stateOC.yield(false);

      const simDocs = Model._databases.foo.TestModel.simDocs;

      assert(simDocs);

      assert.same(simDocs.foo123, 'new');
      assert.same(simDocs.foo2, 'new');
      assert.same(Model._databases.foo.TestModel2.simDocs.moe1, 'new');

      let pending = true;

      this.stub(sessState, 'pendingCount', () => pending);
      stateOC.yield(true);

      refute.called(MockQuery.revertSimChanges);

      stateOC.yield(true);
      refute.called(MockQuery.revertSimChanges);

      syncOC.yield(pending = false);
      assert.called(MockQuery.revertSimChanges);
    },

    "recording": {
      setUp() {
        sessState.incPending();
      },

      "test client only updates"() {
        v.TestModel.query.update({name: 'bar'});

        assert.same(v.foo.name, 'bar');

        const tmchanges = Model._databases.foo.TestModel.simDocs;

        assert.equals(tmchanges[v.foo._id].name, 'foo');

        v.TestModel.query.update({age: 7, name: 'baz'});

        v.TestModel.query.update({age: 9, name: 'baz'});

        assert.equals(tmchanges[v.foo._id].name, 'foo');
        assert.equals(tmchanges[v.foo._id].age, 5);


        this.onEnd(v.TestModel.onChange(v.change = this.stub()));

        sessState.decPending();

        assert.same(v.foo.name, 'foo');
        assert.same(v.foo.age, 5);

        assert.equals(Model._databases.foo.TestModel.simDocs, {});

        assert.calledWith(v.change, TH.matchModel(v.foo), {name: 'baz', age: 9});
      },

      "test partial update match from server"() {
        v.TestModel.query.update({age: 7, name: 'baz'});
        v.TestModel.query.update({age: 2, name: 'another'});
        v.TestModel.serverQuery.onId(v.foo._id).update({name: 'baz'});

        sessState.decPending();

        assert.equals(v.foo.attributes, {
          _id: v.foo._id, age: 5, name: 'baz', nested: [{ary: ['m']}]});
      },

      "test matching update"() {
        this.onEnd(v.TestModel.onChange(v.change = this.stub()));

        v.TestModel.query.update({age: 7, name: 'baz'});
        v.TestModel.serverQuery.onId(v.foo._id).update({age: 7, name: 'baz'});

        sessState.decPending();

        assert.same(v.foo.name, 'baz');
        assert.same(v.foo.age, 7);

        assert.calledOnce(v.change);
        assert.calledWithExactly(v.change, TH.matchModel(v.foo), {age: 5, name: 'foo'}, undefined);
      },

      "test nested structures"() {
        v.TestModel.query.update({"nested.0.arg.0": 'f'});

        const tmchanges = Model._databases.foo.TestModel.simDocs;

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['m']}]);

        v.TestModel.query.update({nested: true});

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['m']}]);

        v.TestModel.serverQuery.onId(v.foo._id).update({"nested.0.ary.0": 'M'});
        v.TestModel.serverQuery.onId(v.foo._id).update({"nested.0.ary.1": 'f'});

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['M', 'f']}]);

        sessState.decPending();

        assert.equals(v.foo.nested, [{ary: ['M', 'f']}]);
      },

      "test client only add"() {
        const bar = v.TestModel.create({name: 'bar'});

        this.onEnd(v.TestModel.onChange(v.changed = this.stub()));
        sessState.decPending();

        assert.calledWith(v.changed, null, TH.matchModel(bar));
      },

      "test matching add "() {
        this.onEnd(v.TestModel.onChange(v.change = this.stub()));

        const bar = v.TestModel.create({name: 'baz', age: 7});
        Query.insertFromServer(v.TestModel, bar._id, {_id: bar._id, age: 7, name: 'baz'});

        sessState.decPending();

        assert.same(bar.name, 'baz');
        assert.same(bar.age, 7);

        assert.calledOnce(v.change);
      },

      "test add where server fields differ"() {
        const bar = v.TestModel.create({name: 'bar', age: 5});

        this.onEnd(v.TestModel.onChange(v.changed = this.stub()));

        Query.insertFromServer(v.TestModel, bar._id, {_id: bar._id, name: 'sam'});

        assert.calledWith(v.changed, TH.matchModel(bar), {name: 'bar'});

        v.changed.reset();
        sessState.decPending();

        assert.same(bar.age, undefined);
        assert.same(bar.name, 'sam');

        assert.calledWith(v.changed, TH.matchModel(bar), {age: 5}, true);
      },

      "test matching remove "() {
        this.onEnd(v.TestModel.onChange(v.change = this.stub()));

        v.TestModel.query.onId(v.foo._id).remove();
        v.TestModel.serverQuery.onId(v.foo._id).remove();

        sessState.decPending();

        assert.same(v.TestModel.query.count(), 0);

        assert.calledOnce(v.change);
      },

      "test client remove, server update"() {
        v.TestModel.query.remove();

        v.TestModel.serverQuery.onId(v.foo._id).update({name: 'sam'});

        assert.same(v.TestModel.query.count(), 0);

        this.onEnd(v.TestModel.onChange(v.changed = this.stub()));
        sessState.decPending();

        assert.same(v.TestModel.query.count(), 1);

        v.foo.$reload();

        assert.same(v.foo.name, 'sam');
        assert.calledWith(v.changed, TH.matchModel(v.foo), null);
      },

      "test remote removed changed doc"() {
        v.TestModel.query.onId(v.foo._id).update({name: 'Mary'});

        this.onEnd(v.TestModel.onChange(v.changed = this.stub()));
        v.TestModel.serverQuery.onId(v.foo._id).remove();

        refute(v.TestModel.exists(v.foo._id));
        assert.calledWith(v.changed, null, TH.matchModel(v.foo));
        v.changed.reset();

        sessState.decPending();
        assert.same(v.TestModel.query.count(), 0);

        refute.called(v.changed);
      },

      "test remote removed non existant"() {
        this.onEnd(v.TestModel.onChange(v.changed = this.stub()));
        v.TestModel.onId('noDoc').fromServer().remove();

        refute.calledWith(v.changed, null, v.foo, true);
      },

      "test notification of different fields"() {
        v.TestModel.query.update({age: 7});

        this.onEnd(v.TestModel.onChange(v.changed = this.stub()));

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

      "test notify"() {
        /**
         * Notify observers of an update to a database record. This is
         * called automatically but it is exposed here incase it needs
         * to be called manually.
         **/

        api.method('notify');
        this.stub(Model._support, 'callAfterObserver');
        this.onEnd([
          Query.onAnyChange(v.onAnyChange = this.stub()),
          v.TestModel._indexUpdate.onChange(v.indexUpdate = this.stub()),
          v.TestModel.onChange(v.oc = this.stub()),
        ]);
        Query.notify(v.foo, {age: 1}, "noMatch");
        assert.calledWith(v.indexUpdate, v.foo, {age: 1}, "noMatch");
        assert.calledWith(v.onAnyChange, v.foo, {age: 1}, "noMatch");
        assert.calledWith(v.oc, v.foo, {age: 1}, "noMatch");

        refute.called(Model._support.callAfterObserver);
        assert(v.indexUpdate.calledBefore(v.onAnyChange));
        assert(v.indexUpdate.calledBefore(v.oc));
        assert(v.onAnyChange.calledBefore(v.oc));


        Query.notify(null, v.foo);

        assert.calledWithExactly(v.indexUpdate, null, v.foo, undefined);
        assert.calledWithExactly(v.onAnyChange, null, v.foo, undefined);
        assert.calledWithExactly(v.oc, null, v.foo, undefined);
        assert.calledWithExactly(Model._support.callAfterObserver, null, v.foo);
      },
    },
  });
});
