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
      const {TestModel} = v;
      const idxNameAge = TestModel.addUniqueIndex('name', 'age');
      const idxAgeName = TestModel.addUniqueIndex('name', 'age');

      dbBroker.withDB('foo2', ()=>{
        const ageQuery = TestModel.query.withIndex(idxAgeName, {age: 3, name: 'foo'});

        assert.same(ageQuery.count(), 0);

        TestModel.create({name: 'foo', age: 3});

        assert.same(ageQuery.count(), 1);
      });

      assert.equals(TestModel.query.withIndex(idxNameAge, {name: 'foo'}).fetchField('age'), [5]);
      assert.equals(TestModel.query.withDB('foo2').withIndex(idxNameAge, {name: 'foo'})
                    .fetchField('age'), [3]);
    });


    test("custom index", ()=>{
      const {TestModel} = v;
      const docs = [TestModel.create({_id: 'one'}), undefined, TestModel.create({_id: 'two'})];
      const index ={
        lookup() {
          return {*[Symbol.iterator]() {
            for (const x of docs) yield x;
          }};
        }
      };

      assert.equals(TestModel.query.withIndex(index).map(d => d._id), ['one', 'two']);
      assert.equals(Array.from(TestModel.query.withIndex(index)).map(d => d._id), ['one', 'two']);
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
        const {foo, TestModel} = v;
        assert.equals(foo.$cache, {});

        TestModel.serverQuery.onId(foo._id).update({age: 7});

        refute.called(afterLocalChange);
        assert.calledOnceWith(onChange, DocChange.change(foo, {age: 5}, 'serverUpdate'));
        assert.equals(foo.$cache, {});
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

      assert.equals(simDocs.foo123, ['del', undefined]);
      assert.equals(simDocs.foo2, ['del', undefined]);
      assert.equals(Model._databases.foo.TestModel2.simDocs.moe1, ['del', undefined]);

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
        const {TestModel, foo} = v;
        foo.$updatePartial('name', ['$append', '.one']);
        foo.$updatePartial('name', ['$append', '.two']);

        const oc = [];
        onEnd(TestModel.onChange(dc =>{oc.push(dc.clone())}));

        TestModel.serverQuery.onId(foo._id).updatePartial('name', ['$append', '.one']);
        TestModel.serverQuery.onId(foo._id).updatePartial('name', ['$append', '.three']);

        assert.same(foo.name, 'foo.one.two');

        assert.same(oc.length, 0);

        sessState.decPending();

        assert.same(foo.name, 'foo.one.three');

        assert.same(oc.length, 1);
        const dc = oc[0];
        assert.equals(dc, DocChange.change(foo, {$partial: {
          name: [
            '$patch', [-6, 6, null], '$patch', [-4, 4, null],
            '$patch', [3, 0, '.one'], '$patch', [7, 0, '.two'],
          ]
        }}, 'simComplete'));

        assert.equals(dc.changes, {name: 'foo.one.three'});
        assert.equals(dc.was.changes, {name: 'foo.one.two'});
        assert.same(dc.was.name, 'foo.one.two');
      });

      test("update from server no matching simDoc", ()=>{
        const {foo, TestModel} = v;
        const foo2 = TestModel.create({name: 'foo2'});

        const oc = [];
        onEnd(TestModel.onChange(dc =>{oc.push(dc.clone())}));

        v.TestModel.serverQuery.onId(foo._id).update('name', 'foo1-new');

        assert.same(oc.length, 1);
        oc.length = 0;

        sessState.decPending();

        refute(TestModel.findById(foo2._id));
        assert.same(oc.length, 1);
        const dc = oc[0];
        assert.equals(dc, DocChange.delete(foo2, 'simComplete'));
      });

      test("client only updates", ()=>{
        v.TestModel.query.update({name: 'bar'});

        assert.same(v.foo.name, 'bar');

        const tmchanges = Model._databases.foo.TestModel.simDocs;

        assert.equals(tmchanges[v.foo._id][0].name, 'foo');

        v.TestModel.query.update({age: 7, name: 'baz'});

        v.TestModel.query.update({age: 9, name: 'baz'});

        assert.equals(tmchanges[v.foo._id][0].name, 'foo');
        assert.equals(tmchanges[v.foo._id][0].age, 5);

        const onAnyChange = [], onChange = [];
        onEnd(Query.onAnyChange(dc =>{onAnyChange.push(dc.clone())}));
        onEnd(v.TestModel.onChange(dc =>{onChange.push(dc.clone())}));

        sessState.decPending();

        assert.same(v.foo.name, 'foo');
        assert.same(v.foo.age, 5);

        assert.equals(Model._databases.foo.TestModel.simDocs, {});

        assert.same(onChange.length, 1);
        assert.equals(onChange[0], DocChange.change(v.foo, {name: 'baz', age: 9}, 'simComplete'));

        assert.same(onAnyChange.length, 1);
        assert.equals(onAnyChange[0], DocChange.change(
          v.foo, {name: 'baz', age: 9}, 'simComplete'));
      });

      test("partial update match from server", ()=>{
        v.TestModel.query.update({age: 7, name: 'baz'});
        v.TestModel.query.update({age: 2, name: 'another'});
        v.TestModel.serverQuery.onId(v.foo._id).update({
          _id: v.foo._id, // _id will be deleted by update logic
          name: 'baz'});

        assert.equals(v.foo.attributes, {
          _id: v.foo._id, age: 2, name: 'another', nested: [{ary: ['m']}]});

        const simChanges = Model._databases.foo.TestModel.simDocs;

        assert.equals(simChanges[v.foo._id], [{
          age: 5, name: 'foo'
        }, {
          // _id has been deleted
          name: 'baz'
        }]);

        sessState.decPending();

        assert.equals(v.foo.attributes, {
          _id: v.foo._id, age: 5, name: 'baz', nested: [{ary: ['m']}]});
      });

      test("matching update", ()=>{
        const onAnyChange = [], onChange = [];
        onEnd(Query.onAnyChange(dc =>{onAnyChange.push(dc.clone())}));
        onEnd(v.TestModel.onChange(dc =>{onChange.push(dc.clone())}));

        v.TestModel.query.update({age: 7, name: 'baz'});
        assert.equals(onChange, [DocChange.change(v.foo, {age: 5, name: 'foo'})]);
        assert.equals(onAnyChange, [DocChange.change(v.foo, {age: 5, name: 'foo'})]);
        onChange.length = onAnyChange.length = 0;

        v.TestModel.serverQuery.onId(v.foo._id).update({age: 7, name: 'baz'});

        assert.same(onChange.length, 0);
        assert.equals(onAnyChange.length, 0);
        sessState.decPending();

        assert.same(v.foo.name, 'baz');
        assert.same(v.foo.age, 7);

        assert.same(onChange.length, 0);
        assert.equals(onAnyChange, [DocChange.change(v.foo, {}, 'simComplete')]);
      });

      test("nested structures", ()=>{
        const onChange = [];
        onEnd(v.TestModel.onChange(dc => onChange.push(dc.clone())));

        v.TestModel.query.update({$partial: {nested: ["0.arg.0", 'f']}});

        assert.equals(v.foo.nested[0].arg, ['f']);

        const tmchanges = Model._databases.foo.TestModel.simDocs;

        assert.equals(tmchanges[v.foo._id][0], {$partial: {nested: ['0.arg', null]}});

        v.TestModel.query.update({nested: true});
        v.TestModel.serverQuery.onId(v.foo._id).update({$partial: {nested: ["0.ary.0", 'M']}});
        v.TestModel.serverQuery.onId(v.foo._id).update({$partial: {nested: ["0.ary.1", 'f']}});

        assert.equals(tmchanges[v.foo._id][0], {nested: [{ary: ['m']}]});
        assert.equals(tmchanges[v.foo._id][1], {$partial: {nested: ['0.ary.0', 'M', '0.ary.1', 'f']}});

        sessState.decPending();

        assert.equals(v.foo.nested, [{ary: ['M', 'f']}]);

        // ensure undo are not overwritten
        assert.same(onChange.length, 3);
        assert.equals(onChange[0].undo, {$partial: {nested: ['0.arg', null]}});
        assert.equals(onChange[1].undo, {nested: [{ary: ['m'], arg: ['f']}]});
        assert.equals(onChange[2].undo, {nested: true});
      });

      test("client only add", ()=>{
        const bar = v.TestModel.create({name: 'bar'});

        const onChange = [];
        onEnd(v.TestModel.onChange(dc => onChange.push(dc.clone())));
        sessState.decPending();

        assert.equals(onChange, [DocChange.delete(bar, 'simComplete')]);
      });

      test("matching add ", ()=>{
        const bar = v.TestModel.create({name: 'baz', age: 7});
        const onChange = stub();
        onEnd(v.TestModel.onChange(onChange));
        Query.insertFromServer(v.TestModel, bar._id, {_id: bar._id, age: 7, name: 'baz'});

        sessState.decPending();

        assert.same(bar.name, 'baz');
        assert.same(bar.age, 7);

        refute.called(onChange);
      });

      test("add where server fields same", ()=>{
        const bar = v.TestModel.create({name: 'bar', age: 5});
        const onAnyChange = [];
        onEnd(Query.onAnyChange(dc =>{onAnyChange.push(dc.clone())}));

        Query.insertFromServer(v.TestModel, bar._id, {_id: bar._id, name: 'bar', age: 5});

        assert.equals(bar.attributes, {_id: bar._id, name: 'bar', age: 5});

        assert.same(onAnyChange.length, 0);

        sessState.decPending();

        assert.equals(onAnyChange, [DocChange.change(bar, {}, 'simComplete')]);

        assert(v.TestModel.findById(bar._id));

        assert.same(bar.age, 5);
        assert.same(bar.name, 'bar');
        assert.same(bar.attributes.iShouldGo, undefined);
      });

      test("add where server fields differ", ()=>{
        const bar = v.TestModel.create({name: 'bar', age: 5});
        const onAnyChange = [];
        onEnd(Query.onAnyChange(dc =>{onAnyChange.push(dc.clone())}));

        Query.insertFromServer(v.TestModel, bar._id, {_id: bar._id, name: 'sam'});

        assert.equals(bar.attributes, {_id: bar._id, name: 'bar', age: 5});

        sessState.decPending();

        assert.same(bar.age, undefined);
        assert.same(bar.name, 'sam');
        assert.same(bar.attributes.iShouldGo, undefined);

        assert.equals(onAnyChange, [DocChange.change(bar, {name: 'bar', age: 5}, 'simComplete')]);
      });

      test("matching remove ", ()=>{
        const onAnyChange = [];
        onEnd(Query.onAnyChange(dc =>{onAnyChange.push(dc.clone())}));

        v.TestModel.query.onId(v.foo._id).remove();

        assert.equals(onAnyChange, [DocChange.delete(v.foo, undefined)]);
        onAnyChange.length = 0;
        const onChange = [];
        onEnd(v.TestModel.onChange(dc =>{onChange.push(dc.clone())}));

        v.TestModel.serverQuery.onId(v.foo._id).remove();

        assert.same(onAnyChange.length, 0);
        assert.same(onChange.length, 0);

        sessState.decPending();

        assert.same(v.TestModel.query.count(), 0);

        assert.equals(onAnyChange, [DocChange.delete(m.field('_id', v.foo._id), 'simComplete')]);
        assert.same(onChange.length, 0);
      });

      test("sim add, client remove, server remove", ()=>{
        const onChange = [];
        onEnd(v.TestModel.onChange(dc =>{onChange.push(dc.clone())}));

        const simAdd = new v.TestModel({_id: 'sa123', name: 'simAdd', age: 3});
        Query.insert(simAdd);
        assert.equals(onChange, [DocChange.add(simAdd, undefined)]);
        onChange.length = 0;

        v.TestModel.query.onId(simAdd._id).remove();
        assert.equals(onChange, [DocChange.delete(simAdd, undefined)]);
        onChange.length = 0;

        v.TestModel.serverQuery.onId(simAdd._id).remove();
        assert.same(onChange.length, 0);

        const onAnyChange = [];
        onEnd(Query.onAnyChange(dc =>{onAnyChange.push(dc.clone())}));

        sessState.decPending();

        assert.same(v.TestModel.query.onId(simAdd._id).count(), 0);

        assert.same(onChange.length, 0);
        assert.equals(onAnyChange, [DocChange.delete(m.field('_id', simAdd._id), 'simComplete')]);
      });

      test("client remove, server update", ()=>{
        v.TestModel.query.remove();

        v.TestModel.serverQuery.onId(v.foo._id).update({name: 'sam'});

        const onChange = [];
        onEnd(v.TestModel.onChange(dc =>{onChange.push(dc.clone())}));

        sessState.decPending();

        assert.same(v.TestModel.query.count(), 1);

        v.foo.$reload();

        assert.same(v.foo.name, 'sam');
        assert.equals(onChange, [DocChange.add(m.model(v.foo), 'simComplete')]);
      });

      test("server removed changed doc", ()=>{
        v.TestModel.query.onId(v.foo._id).update({name: 'Mary'});
        const onChange = [];
        onEnd(v.TestModel.onChange(dc =>{onChange.push(dc.clone())}));
        v.TestModel.serverQuery.onId(v.foo._id).remove();

        assert(v.TestModel.exists(v.foo._id));
        assert.same(v.foo.name, 'Mary');

        assert.same(onChange.length, 0);

        sessState.decPending();
        assert.same(v.TestModel.query.count(), 0);

        assert.equals(onChange, [DocChange.delete(v.foo, 'simComplete')]);
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
