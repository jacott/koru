define((require, exports, module)=>{
  const DocChange       = require('koru/model/doc-change');
  const api             = require('koru/test/api');
  const session         = require('../session');
  const clientRpcBase   = require('../session/client-rpc-base');
  const sessionClientFactory = require('../session/main-client');
  const sessState       = require('../session/state');
  const util            = require('../util');
  const dbBroker        = require('./db-broker');
  const Model           = require('./main');
  const Query           = require('./query');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd, matchModel: mm, match: m} = TH;

  const {private$, stopGap$} = require('koru/symbols');

  const sut = require('./query-client');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      dbBroker.setMainDbId('foo');
      v.TestModel = Model.define('TestModel').defineFields({
        name: 'text', age: 'number', nested: 'object'});
      v.foo = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, nested: [{ary: ['m']}]});
      api.module({subjectModule: module.get('./query')});
    });

    afterEach(()=>{
      Model._destroyModel('TestModel', 'drop');
      Model._destroyModel('TestModel2', 'drop');
      sessState._resetPendingCount();
      dbBroker.clearDbId();
      delete Model._databases.foo;
      delete Model._databases.foo2;
      v = {};
    });

    test("withIndex, withDB", ()=>{
      v.idx = v.TestModel.addUniqueIndex('name', 'age');

      dbBroker.withDB('foo2', () => v.TestModel.create({name: 'foo', age: 3}));

      assert.equals(v.TestModel.query.withIndex(v.idx, {name: 'foo'}).fetchField('age'), [5]);
      assert.equals(v.TestModel.query.withDB('foo2').withIndex(v.idx, {name: 'foo'})
                    .fetchField('age'), [3]);
    });

    test("withDB", ()=>{
      dbBroker.withDB('foo2', () => v.TestModel.create({age: 3}));

      const ocDB = [];
      onEnd(v.TestModel.onAnyChange(({undo}) => {
        ocDB.push(dbBroker.dbId, undo);
      }).stop);

      v.TestModel.query.update('age', 2);

      v.TestModel.query.withDB('foo2').update('age', 7);

      assert.equals(ocDB, ['foo', {age: 5}, 'foo2', {age: 3}]);

      assert.equals(v.TestModel.query.map(doc => doc.age), [2]);
      assert.equals(v.TestModel.query.withDB('foo2').map(doc => doc.age), [7]);
    });

    test("empty Query", ()=>{
      const query = new Query();
      assert.same(query.count(), 0);

      assert.equals(query.fetch(), []);
    });

    test("where func", ()=>{
      api.protoMethod('where');
      assert.same(v.TestModel.query.where(doc => doc.name !== 'foo').count(), 0);

      assert.same(v.TestModel.query.where(doc => doc.name === 'foo').count(), 1);
    });


    group("publishes from server should not call afterLocalChange", ()=>{
      let afterLocalChange, onChange;
      beforeEach(()=>{
        onEnd(v.TestModel.onChange(onChange = stub()));
        onEnd(v.TestModel.afterLocalChange(afterLocalChange = stub()));
      });

      test("insertFromServer", ()=>{
        Query.insertFromServer(v.TestModel, 'foo2', {name: 'foo2'});
        const foo2 = v.TestModel.findById('foo2');

        refute.called(afterLocalChange);
        assert.calledOnceWith(onChange, DocChange.add(foo2, 'serverUpdate'));
      });

      test("update", ()=>{
        v.TestModel.serverQuery.onId(v.foo._id).update({age: 7});

        refute.called(afterLocalChange);
        assert.calledOnceWith(onChange, DocChange.change(v.foo, {age: 5}, 'serverUpdate'));
      });


      test("remove", ()=>{
        v.TestModel.serverQuery.onId(v.foo._id).remove();

        refute.called(afterLocalChange);
        assert.calledOnceWith(onChange, DocChange.delete(v.foo, 'serverUpdate'));
      });
    });

    /**
     * This was causing a undefined exception
     */
    test("insertFromServer no matching simDoc", ()=>{
      sessState.incPending();

      const onChange = stub();
      onEnd(v.TestModel.onChange(onChange));

      Query.insertFromServer(v.TestModel, 'foo2', {name: 'foo2'});
      const doc = v.TestModel.findById('foo2');
      assert(doc);
      assert.calledOnceWith(onChange, DocChange.add(doc, 'serverUpdate'));
      onChange.reset();

      Query.insert(new v.TestModel({_id: 'foo1', name: 'foo1'}));
      const foo1 = v.TestModel.findById('foo1');
      assert.calledOnceWith(onChange, DocChange.add(foo1, undefined));
      onChange.reset();

      Query.insertFromServer(v.TestModel, 'foo4', {name: 'foo4'});
      const foo4 = v.TestModel.findById('foo4');
      assert(foo4);
      assert.calledOnceWith(onChange, DocChange.add(foo4, 'serverUpdate'));

      assert.equals(Object.keys(Model._databases.foo.TestModel.simDocs), ['foo1']);
    });

    test("nested update after connection lost", ()=>{
      const _sessState = sessState.constructor();
      const _session = sessionClientFactory(new (session.constructor)('foo'), _sessState);
      _session.ws = {send: stub()};
      clientRpcBase(_session);
      _session.defineRpc('fooUpdate', function () {
        new _Query(v.TestModel).onId('foo2').update({$partial: {nested: ['b', 3]}});
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
      query.update({$partial: {nested: ['b', 3]}});

      _sessState.decPending();
      assert.equals(v.TestModel.docs.foo2.nested, {a: 1, b: 3});
    });

    test("insertFromServer stopGap pending doc", ()=>{
      sessState.incPending();
      const foo = v.TestModel.createStopGap({name: 'foo'});
      assert.isTrue(foo[stopGap$]);

      Query.insertFromServer(v.TestModel, foo._id, {
        _id: foo._id, name: 'foo new'});

      assert.same(foo[stopGap$], undefined);
    });

    test("insertFromServer stopGap doc already exists", ()=>{
      const foo = v.TestModel.createStopGap({name: 'foo'});
      assert.isTrue(foo[stopGap$]);

      Query.insertFromServer(v.TestModel, foo._id, {
        _id: foo._id, name: 'foo new'});

      assert.same(foo[stopGap$], undefined);

      const bar = v.TestModel.createStopGap({name: 'bar'});
      sessState.incPending();
      bar.name = 'bar new';
      bar.$$save();

      Query.insertFromServer(v.TestModel, bar._id, {
        _id: bar._id, name: 'bar new'});

      assert.same(bar[stopGap$], undefined);
    });

    test("insertFromServer doc already exists.", ()=>{
      const {_id, age} = v.foo;
      v.foo.attributes.iShouldGo = 123;
      onEnd(v.TestModel.onChange(v.onChange = stub()));
      Query.insertFromServer(v.TestModel, v.foo._id, {
        _id, age, name: 'foo new', nested: [{ary: ['f']}]});

      assert.calledOnceWith(v.onChange);

      const dc = v.onChange.firstCall.args[0];

      assert.equals(v.foo.attributes, {
        _id, age, name: 'foo new', nested: [{ary: ['f']}]});
      assert.same(v.foo.attributes, dc.doc.attributes);
      assert.equals(dc.undo, {
        name: 'foo',
        $partial: {nested: ['$patch', [0, 1, [{ary: ['m']}]]]}, iShouldGo: 123});
    });

    test("insertFromServer doc already exists and pending", ()=>{
      const {_id, age} = v.foo;
      v.foo.attributes.iShouldGo = 123;
      sessState.incPending();
      const onChange = stub();
      onEnd(v.TestModel.onChange(onChange));
      Query.insertFromServer(v.TestModel, v.foo._id, {
        _id, age, name: 'foo new', nested: [{ary: ['f']}]});

      assert.calledWith(onChange, DocChange.change(v.foo, {
        name: 'foo',
        $partial: {nested: ['$patch', [0, 1, [{ary: ['m']}]]]}, iShouldGo: 123}, 'serverUpdate'));

      const dc = onChange.firstCall.args[0];
      assert.equals(dc.doc.attributes, {
        _id, age, name: 'foo new', nested: [{ary: ['f']}]});

      assert.same(v.foo, dc.doc);
      refute.msg("Should update fromServer; not client")(Model._databases.foo.TestModel.simDocs);
    });

    test("updating array item", ()=>{
      v.foo.$update({ary: ['a']});

      sessState.incPending();

      v.foo.$onThis.update({$partial: {ary: ['$add', ['b']]}});

      v.TestModel.serverQuery.onId(v.foo._id).update({$partial: {ary: ['$add', ['b']]}});

      assert.equals(v.foo.attributes.ary, ['a', 'b']);

      sessState.decPending();

      assert.equals(v.foo.attributes.ary, ['a', 'b']);
    });

    test("add item on undefined", ()=>{
      sessState.incPending();
      v.foo.$onThis.update({$partial: {ary: ['$add', ['b']]}});

      assert.equals(v.foo.attributes.ary, ['b']);

      v.TestModel.serverQuery.onId(v.foo._id).update({$partial: {ary: ['$add', ['b']]}});

      sessState.decPending();

      assert.equals(v.foo.attributes.ary, ['b']);
    });

    test("reconcile docs", ()=>{
      const stateOC = stub(sessState, 'onChange').returns(v.stateOb = {stop: stub()});
      const syncOC = stub(sessState.pending, 'onChange')
              .returns(v.syncOb = {stop: stub()});

      function MockQuery() {};
      MockQuery[private$] = {};
      MockQuery.notifyAC = stub();
      sut(MockQuery, null, 'notifyAC');

      spy(MockQuery, 'revertSimChanges');

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

      stub(sessState, 'pendingCount', () => pending);
      stateOC.yield(true);

      refute.called(MockQuery.revertSimChanges);

      stateOC.yield(true);
      refute.called(MockQuery.revertSimChanges);

      syncOC.yield(pending = false);
      assert.called(MockQuery.revertSimChanges);
    });

    group("recording", ()=>{
      beforeEach(()=>{
        sessState.incPending();
      });

      test("queuing server updates on simDoc", ()=>{
        v.foo.$updatePartial('name', ['$append', '.one']);
        v.foo.$updatePartial('name', ['$append', '.two']);

        const onChange = stub();

        v.TestModel.serverQuery.onId(v.foo._id).updatePartial('name', ['$append', '.one']);
        v.TestModel.serverQuery.onId(v.foo._id).updatePartial('name', ['$append', '.three']);

        assert.same(v.foo.name, 'foo.one.two');

        refute.called(onChange);

        sessState.decPending();

        assert.same(v.foo.name, 'foo.one.three');

        assert.calledWith(onChange, DocChange.change(v.foo, {$partial: {
          foo: ['FIXME']
        }}));
      });

      test("update from server no matching simDoc", ()=>{
        const {foo, TestModel} = v;
        const foo2 = TestModel.create({name: 'foo2'});
        const onChange = stub();
        onEnd(TestModel.onChange(onChange));

        v.TestModel.serverQuery.onId(foo._id).update('name', 'foo1-new');

        assert.calledOnceWith(onChange, DocChange.change(foo, {name: 'foo'}, 'serverUpdate'));

        onChange.reset();
        sessState.decPending();

        assert.calledOnceWith(onChange, DocChange.delete(foo2, 'simComplete'));
      });

      test("multiple partial simulations", ()=>{
        v.foo.$updatePartial('name', ['$append', '.one']);
        v.foo.$updatePartial('name', ['$append', '.two']);

        assert.same(v.foo.name, 'foo.one.two');

        const onAnyChange = stub(), onChange = stub();
        onEnd(Query.onAnyChange(onAnyChange));
        onEnd(v.TestModel.onChange(onChange));

        v.TestModel.serverQuery.onId(v.foo._id).updatePartial('name', ['$append', '.one']);

        assert.calledOnceWith(onChange, DocChange.change(
          v.foo, {name: 'foo.one.two'}, 'serverUpdate'));
        assert.calledOnceWith(onAnyChange, DocChange.change(
          v.foo, {name: 'foo.one.two'}, 'serverUpdate'));
        onChange.reset(); onAnyChange.reset();

        assert.same(v.foo.name, 'foo.one');

        sessState.decPending();

        assert.same(v.foo.name, 'foo.one');
        refute.called(onChange);
        assert.calledOnceWith(onAnyChange, DocChange.change( v.foo, {}, 'simComplete'));
      });

      test("client only updates", ()=>{
        v.TestModel.query.update({name: 'bar'});

        assert.same(v.foo.name, 'bar');

        const tmchanges = Model._databases.foo.TestModel.simDocs;

        assert.equals(tmchanges[v.foo._id].name, 'foo');

        v.TestModel.query.update({age: 7, name: 'baz'});

        v.TestModel.query.update({age: 9, name: 'baz'});

        assert.equals(tmchanges[v.foo._id].name, 'foo');
        assert.equals(tmchanges[v.foo._id].age, 5);

        const onAnyChange = stub(), onChange = stub();
        onEnd(v.TestModel.onChange(onChange));
        onEnd(Query.onAnyChange(onAnyChange));

        sessState.decPending();

        assert.same(v.foo.name, 'foo');
        assert.same(v.foo.age, 5);

        assert.equals(Model._databases.foo.TestModel.simDocs, {});

        assert.calledOnceWith(onChange, DocChange.change(v.foo, {name: 'baz', age: 9}, 'simComplete'));
        assert.calledOnceWith(onAnyChange, DocChange.change(
          v.foo, {name: 'baz', age: 9}, 'simComplete'));
      });

      test("partial update match from server", ()=>{
        v.TestModel.query.update({age: 7, name: 'baz'});
        v.TestModel.query.update({age: 2, name: 'another'});
        v.TestModel.serverQuery.onId(v.foo._id).update({name: 'baz'});

        sessState.decPending();

        assert.equals(v.foo.attributes, {
          _id: v.foo._id, age: 5, name: 'baz', nested: [{ary: ['m']}]});
      });

      test("matching update", ()=>{
        const onAnyChange = stub(), onChange = stub();
        onEnd(v.TestModel.onChange(onChange));
        onEnd(Query.onAnyChange(onAnyChange));

        v.TestModel.query.update({age: 7, name: 'baz'});
        assert.calledOnceWith(onChange, DocChange.change(v.foo, {age: 5, name: 'foo'}));
        assert.calledOnceWith(onAnyChange, DocChange.change(v.foo, {age: 5, name: 'foo'}));
        onChange.reset(); onAnyChange.reset();

        v.TestModel.serverQuery.onId(v.foo._id).update({age: 7, name: 'baz'});
        refute.called(onChange);
        assert.calledOnceWith(onAnyChange, DocChange.change(v.foo, {}, 'serverUpdate'));
        onChange.reset(); onAnyChange.reset();

        sessState.decPending();

        assert.same(v.foo.name, 'baz');
        assert.same(v.foo.age, 7);

        refute.called(onChange);
        assert.calledOnceWith(onAnyChange, DocChange.change(v.foo, {}, 'simComplete'));
      });

      test("nested structures", ()=>{
        v.TestModel.query.update({$partial: {nested: ["0.arg.0", 'f']}});

        assert.equals(v.foo.nested[0].arg, ['f']);

        const tmchanges = Model._databases.foo.TestModel.simDocs;

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['m']}]);

        v.TestModel.query.update({nested: true});

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['m']}]);

        v.TestModel.serverQuery.onId(v.foo._id).update({$partial: {nested: ["0.ary.0", 'M']}});
        v.TestModel.serverQuery.onId(v.foo._id).update({$partial: {nested: ["0.ary.1", 'f']}});

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['M', 'f']}]);

        sessState.decPending();

        assert.equals(v.foo.nested, [{ary: ['M', 'f']}]);
      });

      test("client only add", ()=>{
        const bar = v.TestModel.create({name: 'bar'});

        onEnd(v.TestModel.onChange(v.changed = stub()));
        sessState.decPending();

        assert.calledWith(v.changed, DocChange.delete(bar, 'simComplete'));
      });

      test("matching add ", ()=>{
        const bar = v.TestModel.create({name: 'baz', age: 7});
        onEnd(v.TestModel.onChange(v.change = stub()));
        Query.insertFromServer(v.TestModel, bar._id, {_id: bar._id, age: 7, name: 'baz'});

        sessState.decPending();

        assert.same(bar.name, 'baz');
        assert.same(bar.age, 7);

        refute.called(v.change);
      });

      test("add where server fields same", ()=>{
        const bar = v.TestModel.create({name: 'bar', age: 5});
        const onAnyChange = stub(), onChange = stub();
        onEnd(v.TestModel.onChange(onChange));
        onEnd(Query.onAnyChange(onAnyChange));

        Query.insertFromServer(v.TestModel, bar._id, {_id: bar._id, name: 'bar', age: 5});

        assert.equals(bar.attributes, {_id: bar._id, name: 'bar', age: 5});

        assert.calledOnceWith(onAnyChange, DocChange.change(bar, {}, 'simComplete'));

        onAnyChange.reset();
        sessState.decPending();

        assert(v.TestModel.findById(bar._id));

        assert.same(bar.age, 5);
        assert.same(bar.name, 'bar');
        assert.same(bar.attributes.iShouldGo, undefined);

        refute.called(onChange);
        refute.called(onAnyChange);
      });

      test("add where server fields differ", ()=>{
        const bar = v.TestModel.create({name: 'bar', age: 5});
        const onAnyChange = stub(), onChange = stub();
        onEnd(v.TestModel.onChange(onChange));
        onEnd(Query.onAnyChange(onAnyChange));

        Query.insertFromServer(v.TestModel, bar._id, {_id: bar._id, name: 'sam'});

        assert.equals(bar.attributes, {_id: bar._id, name: 'sam', age: 5});

        assert.calledOnceWith(onChange, DocChange.change(bar, {name: 'bar'}, 'serverUpdate'));
        assert.calledOnceWith(onAnyChange, DocChange.change(bar, {name: 'bar'}, 'serverUpdate'));

        onChange.reset(); onAnyChange.reset();
        sessState.decPending();

        assert.same(bar.age, undefined);
        assert.same(bar.name, 'sam');
        assert.same(bar.attributes.iShouldGo, undefined);

        assert.calledOnceWith(onChange, DocChange.change(bar, {age: 5}, 'simComplete'));
        assert.calledOnceWith(onAnyChange, DocChange.change(bar, {age: 5}, 'simComplete'));
      });

      test("matching remove ", ()=>{
        const onAnyChange = stub(), onChange = stub();
        onEnd(v.TestModel.onChange(onChange));
        onEnd(Query.onAnyChange(onAnyChange));

        v.TestModel.query.onId(v.foo._id).remove();
        assert.calledOnceWith(onChange, DocChange.delete(v.foo, undefined));
        assert.calledOnceWith(onAnyChange, DocChange.delete(v.foo, undefined));
        onChange.reset(); onAnyChange.reset();
        v.TestModel.serverQuery.onId(v.foo._id).remove();
        assert.calledOnceWith(onAnyChange, DocChange.delete(v.foo, 'simComplete'));
        onAnyChange.reset();

        sessState.decPending();

        assert.same(v.TestModel.query.count(), 0);

        refute.called(onChange); refute.called(onAnyChange);
      });

      test("sim add, client remove, server remove", ()=>{
        const onAnyChange = stub(), onChange = stub();
        onEnd(v.TestModel.onChange(onChange));
        onEnd(Query.onAnyChange(onAnyChange));

        const simAdd = new v.TestModel({_id: 'sa123', name: 'simAdd', age: 3});
        Query.insert(simAdd);
        assert.calledOnceWith(onChange, DocChange.add(simAdd, undefined));
        assert.calledOnceWith(onAnyChange, DocChange.add(simAdd, undefined));
        onChange.reset(); onAnyChange.reset();

        v.TestModel.query.onId(simAdd._id).remove();
        assert.calledOnceWith(onChange, DocChange.delete(simAdd, undefined));
        assert.calledOnceWith(onAnyChange, DocChange.delete(simAdd, undefined));
        onChange.reset(); onAnyChange.reset();

        v.TestModel.serverQuery.onId(simAdd._id).remove();
        assert.calledOnceWith(onAnyChange, DocChange.delete(
          new v.TestModel({_id: 'sa123'}), 'simComplete'));
        onAnyChange.reset();

        sessState.decPending();

        assert.same(v.TestModel.query.onId(simAdd._id).count(), 0);

        refute.called(onChange); refute.called(onAnyChange);
      });

      test("client remove, server update", ()=>{
        v.TestModel.query.remove();

        v.TestModel.serverQuery.onId(v.foo._id).update({name: 'sam'});

        assert.same(v.TestModel.query.count(), 0);

        onEnd(v.TestModel.onChange(v.changed = stub()));
        sessState.decPending();

        assert.same(v.TestModel.query.count(), 1);

        v.foo.$reload();

        assert.same(v.foo.name, 'sam');
        assert.calledWith(v.changed, DocChange.add(v.foo, 'simComplete'));
      });

      test("server removed changed doc", ()=>{
        v.TestModel.query.onId(v.foo._id).update({name: 'Mary'});
        const onChange = stub();
        onEnd(v.TestModel.onChange(onChange));
        v.TestModel.serverQuery.onId(v.foo._id).remove();

        refute(v.TestModel.exists(v.foo._id));
        assert.calledOnceWith(onChange, DocChange.delete(v.foo, 'simComplete'));
        onChange.reset();

        sessState.decPending();
        assert.same(v.TestModel.query.count(), 0);

        refute.called(onChange);
      });

      test("server removed non existant", ()=>{
        onEnd(v.TestModel.onChange(v.changed = stub()));
        v.TestModel.onId('noDoc').fromServer().remove();

        refute.called(v.changed);
      });

      test("server removed pending but not changed", ()=>{
        onEnd(v.TestModel.onChange(v.changed = stub()));
        v.TestModel.onId(v.foo._id).fromServer().remove();

        assert.calledWith(v.changed, DocChange.delete(v.foo, 'serverUpdate'));
      });

      test("notification of different fields", ()=>{
        v.TestModel.query.update({age: 7});

        onEnd(v.TestModel.onChange(v.changed = stub()));

        v.TestModel.serverQuery.onId(v.foo._id).update({age: 9});

        refute.called(v.changed);

        v.TestModel.serverQuery.onId(v.foo._id).update({name: 'sam'});

        // Should notify immediately if major key not in client changes
        assert.calledWith(v.changed, DocChange.change(v.foo, {name: 'foo'}, 'serverUpdate'));

        v.changed.reset();

        sessState.decPending();

        // Should notify at revert for other changes
        assert.calledWith(v.changed, DocChange.change(v.foo, {age: 7}, 'simComplete'));
      });

      test("notify", ()=>{
        /**
         * Notify observers of an update to a database record. This is
         * called automatically but it is exposed here incase it needs
         * to be called manually.
         **/

        api.method('notify');
        stub(Model._support, 'callAfterLocalChange');
        onEnd([
          Query.onAnyChange(v.onAnyChange = stub()),
          v.TestModel._indexUpdate.onChange(v.indexUpdate = stub()),
          v.TestModel.onChange(v.oc = stub()),
        ]);
        {
          const dc = DocChange.change(v.foo, {age: 1}, "noMatch");
          Query.notify(dc);
          assert.calledWith(v.indexUpdate, dc);
          assert.calledWith(v.onAnyChange, dc);
          assert.calledWith(v.oc, dc);

          refute.called(Model._support.callAfterLocalChange);
          assert(v.indexUpdate.calledBefore(v.onAnyChange));
          assert(v.indexUpdate.calledBefore(v.oc));
          assert(v.onAnyChange.calledBefore(v.oc));
        }


        {
          const dc = DocChange.delete(v.foo);
          Query.notify(dc);

          assert.calledWithExactly(v.indexUpdate, dc);
          assert.calledWithExactly(v.onAnyChange, dc);
          assert.calledWithExactly(v.oc, dc);
          assert.calledWithExactly(Model._support.callAfterLocalChange, dc);
        }
      });
    });
  });
});
