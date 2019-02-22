define((require, exports, module)=>{
  /**
   * Database CRUD API.
   **/
  const DocChange       = require('koru/model/doc-change');
  const api             = require('koru/test/api');
  const util            = require('../util');
  const Model           = require('./main');
  const TH              = require('./test-db-helper');

  const {stub, spy, onEnd, intercept, match: m, matchModel: mModel} = TH;

  const Query = require('./query');

  let v = {}, TestModel;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    before(()=>{
      TestModel = Model.define('TestModel').defineFields({
        name: 'text', age: 'number', gender: 'text', hobby: 'text'});
      TestModel.query.count(); // ensure table created
    });

    beforeEach(()=>{
      TH.startTransaction();
      TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
      v.foo = TestModel.findById('foo123');

      TestModel.create({_id: 'bar456', name: 'bar', age: 10, gender: 'm'});
      v.bar = TestModel.findById('bar456');
    });

    afterEach(()=>{
      TH.rollbackTransaction();
      v = {};
    });

    after(()=>{
      Model._destroyModel('TestModel', 'drop');
      TestModel = undefined;
    });

    test("limit", ()=>{
      TestModel.create({name: 'foo2'});

      assert.equals(TestModel.query.sort('name').limit(2).fetchField('name'), ['bar', 'foo']);

      assert.equals(TestModel.query.limit(1).fetchField('name'), [m.string]);
    });

    test("un/match array element", ()=>{
      TestModel.defineFields({aoo: 'object'});
      v.foo.$onThis.update('aoo', [{a: 1, b:2}, {a: 1, b: 3}]);

      assert.same(TestModel.query.whereNot('aoo', {a: 1, b: 3}).count(), 1);

      v.bar.$onThis.update('aoo', {a: 2, b:2});

      if (isServer) {
        assert.same(TestModel.where('aoo', {$elemMatch: {a: 1, b: 3}}).count(), 1);
        assert.same(TestModel.where('aoo', {$elemMatch: {a: 1, b: 1}}).count(), 0);

        assert.same(TestModel.query.whereNot('aoo', {$elemMatch: {a: 1, b: 1}}).count(), 2);
        assert.same(TestModel.query.whereNot('aoo', {$elemMatch: {a: 1, b: 3}}).count(), 1);
      }

      assert.same(TestModel.where('aoo', {a: 1, b: 3}).count(), 1);
      assert.same(TestModel.where('aoo', {a: 1, b: 1}).count(), 0);
      assert.same(TestModel.query.where('aoo', {a: 1}).count(), 0);

      assert.same(TestModel.query.whereNot('aoo', {a: 1, b: 3}).count(), 1);
      assert.same(TestModel.query.whereNot('aoo', {a: 1, b: 1}).count(), 2);
    });

    test("$ne", ()=>{
      api.protoMethod('where');
      assert.equals(TestModel.where('age', {$ne: 5}).map(d => d.age), [10]);
      assert.equals(TestModel.where('age', {$nin: [5, 6]}).map(d => d.age), [10]);
      assert.equals(TestModel.where({age: {$ne: 5}}).map(d => d.age), [10]);
    });

    test("$in", ()=>{
      api.protoMethod('where');
      assert.equals(TestModel.where('age', {$in: [10, 5]}).map(d => d.age).sort(), [10, 5]);
      assert.equals(TestModel.where('age', {$in: [5, 6]}).map(d => d.age).sort(), [5]);
      assert.equals(TestModel.where('age', [5, 6]).map(d => d.age).sort(), [5]);
    });

    test("simple addUniqueIndex", ()=>{
      const idx = TestModel.addUniqueIndex('name');

      TestModel.create({_id: '1', name: 'n1', age: 1, gender: 'm'});

      assert.equals(Array.from(TestModel.query.withIndex(idx, {name: 'n1'})), [m.field('name', 'n1')]);

      assert.isTrue(TestModel.query.withIndex(idx, {name: 'n1'}).exists());
    });

    group("query unsorted withIndex", ()=>{
      before(()=>{
        v.idx = TestModel.addUniqueIndex('gender', 'age', 'name', q => {
          q.whereNot('hobby', 'climbing');
        });

        TestModel.query.remove();

        TestModel.create({_id: '1', name: 'n1', age: 1, gender: 'm'});
        TestModel.create({_id: '2', name: 'n2', age: 1, gender: 'm'});
        TestModel.create({_id: '3', name: 'n2', age: 2, gender: 'm', hobby: 'skiing'});
        TestModel.create({_id: '4', name: 'n1', age: 1, gender: 'f'});
        TestModel.create({_id: '5', name: 'n11', age: 1, gender: 'm', hobby: 'climbing'});
      });

      test("matches", ()=>{
        const query = TestModel.query.withIndex(v.idx, {gender: 'x'});

        assert.same(query.matches({gender: 'y'}), false);
        assert.same(query.matches({gender: 'x'}), true);
      });

      test("count no matches", ()=>{
        assert.same(TestModel.query.withIndex(v.idx, {gender: 'x'}).count(), 0);
      });

      test("last", ()=>{
        const result = TestModel.query.whereNot('_id', '1')
                .withIndex(v.idx, {gender: 'm', age: 1}).fetchIds();

        assert.equals(result, ['2']);
      });

      test("only major", ()=>{
        const result = TestModel.query.whereNot('_id', '1')
                .withIndex(v.idx, {gender: 'm'}).fetchIds();

        assert.equals(result.sort(), ['2', '3']);
      });

      test("limit", ()=>{
        const q = TestModel.query.whereNot('_id', '4')
                .withIndex(v.idx, {gender: 'm'}).limit(2);

        assert.equals(q.fetchIds().length, 2);

        assert.equals(Array.from(q).length, 2);
      });
    });

    group("query sorted withIndex and filterTest", ()=>{
      before(()=>{
        v.idx = TestModel.addIndex(
          'gender', 'age', -1, 'name', 'hobby', 1, '_id',
          q => {
            q.where(doc =>{
              return doc.hobby != null && doc.hobby[0] === 'h';
            });
          }
        );

        TestModel.query.remove();

        TestModel.create({_id: '1', name: 'n1', age: 1, gender: 'm', hobby: 'h0'});
        TestModel.create({_id: '2', name: 'n2', age: 1, gender: 'm', hobby: 'h1'});
        TestModel.create({_id: '3', name: 'n2', age: 2, gender: 'm', hobby: 'h2'});
        TestModel.create({_id: '4', name: 'n1', age: 1, gender: 'f', hobby: 'h3'});
        TestModel.create({_id: '5', name: 'n5', age: 2, gender: 'm', hobby: 'h4'});
      });

      after(()=>{
        v.idx.stop();
        v.idx = null;
      });

      test("matches", ()=>{
        const query = TestModel.query.withIndex(v.idx, {gender: 'm'});
        assert.same(query.matches({gender: 'm', hobby: 'h1'}), true);
        assert.same(query.matches({gender: 'f', hobby: 'h1'}), false);
        assert.same(query.matches({gender: 'm', hobby: 'g1'}), false);
      });

      test("no matches", ()=>{
        assert.same(TestModel.query.withIndex(v.idx, {gender: 'x'}).count(), 0);
      });

      test("last", ()=>{
        const result = TestModel.query.whereNot('_id', '1')
                .withIndex(v.idx, {gender: 'm', age: 1}).fetchIds();

        assert.equals(result, ['2']);
      });

      test("limit", ()=>{
        const q = TestModel.query.whereNot('_id', '1')
                .withIndex(v.idx, {gender: 'm'}).limit(2);

        assert.equals(q.fetchIds(), ['2', '5']);
        assert.equals(Array.from(q).map(d =>d._id), ['2', '5']);
      });

      test("only major", ()=>{
        const query = TestModel.query.whereNot('_id', '1')
                .withIndex(v.idx, {gender: 'm'});

        const query2 = TestModel.query.whereNot('_id', '1')
                .withIndex(v.idx, {gender: 'm'}, {direction: -1});

        assert.equals(query.fetchIds(), ['2', '5', '3']);
        assert.equals(Array.from(query).map(d => d._id), ['2', '5', '3']);

        assert.equals(query2.fetchIds().sort(), ['2', '3', '5']);
        assert.equals(Array.from(query2).map(d => d._id).sort(), ['2', '3', '5']);
      });

      test("partial", ()=>{
        const i6 = TestModel.create({
          _id: '6', name: 'n6', age: 1, gender: 'm', hobby: 'h5'});
        TestModel.create({
          _id: '70', name: 'n7', age: 1, gender: 'm', hobby: 'h6'});
        TestModel.create({
          _id: '71', name: 'n7', age: 1, gender: 'm', hobby: 'h7'});
        const i72 = TestModel.create({
          _id: '72', name: 'n7', age: 1, gender: 'm', hobby: 'h7'});
        TestModel.create({
          _id: '8', name: 'n8', age: 1, gender: 'm', hobby: 'h8'});


        if (isClient) {
          const btree = v.idx.entries.m[1];

          assert.equals(
            TestModel.where({age: 1, gender: 'm'}).fetch().sort(btree.compare).map(d=>d._id),
            ['8', '71', '72', '70', '6', '2', '1']);
        }


        const fetch = options => TestModel.query.withIndex(
          v.idx, {gender: 'm', age: 1}, options
        ).fetchIds();

        assert.equals(
          fetch({from: {name: 'n7'}, to: {name: 'n3'}}),
          ['71', '72', '70', '6']);

        assert.equals(
          fetch({from: i72, to: i6}),
          ['72', '70', '6']);

        assert.equals(
          fetch({direction: 1}),
          ['8', '71', '72', '70', '6', '2', '1']);

        assert.equals(
          fetch({direction: -1}),
          ['1', '2', '6', '70', '72', '71', '8']);

        assert.equals(
          fetch({direction: -1, from: i6, to: i72}),
          ['6', '70', '72']);

        assert.equals(
          fetch({direction: -1, from: i6, to: i72, excludeFrom: true}),
          ['70', '72']);

        assert.equals(
          fetch({direction: -1, from: i6, to: i72, excludeFrom: true, excludeTo: true}),
          ['70']);
      });
    });

    test("subField", ()=>{
      TestModel.defineFields({html: 'object'});
      v.foo.$updatePartial(
        'html', ['div.0.b', 'hello', 'input.$partial', ['id', 'world']],
        'name', ['$append', '.suffix']
      );

      v.foo.$reload();

      assert.equals(v.foo.name, 'foo.suffix');
      assert.equals(v.foo.html, {div: [{b: 'hello'}], input: {id: 'world'}});
    });

    test("arrays", ()=>{
      TestModel.defineFields({ages: 'integer[]'});
      v.foo.$update('ages', [5]);
      v.multi = TestModel.create({ages: [6,7,8]});

      assert.equals(TestModel.where('ages', [8, 9]).fetchIds(), [v.multi._id]);
      assert.equals(TestModel.where('ages', {$in: [8, 9]}).fetchIds(), [v.multi._id]);
      assert.equals(TestModel.where('ages', 7).fetchIds(), [v.multi._id]);

      assert.equals(TestModel.where('ages', [5, 9]).fetchIds(), [v.foo._id]);
    });

    test("fields", ()=>{
      assert.equals(new Query(TestModel).fields('a', 'b').fields('c')._fields,
                    {a: true, b:true, c: true});
    });

    test("sort", ()=>{
      assert.equals(TestModel.query.sort('gender', 'age', -1).fetchIds(), [v.bar._id, v.foo._id]);
      assert.same(TestModel.query.sort('gender', 'age', -1).fetchOne()._id, v.bar._id);

      assert.equals(TestModel.query.sort('gender', 'age').fetchIds(), [v.foo._id, v.bar._id]);
      assert.same(TestModel.query.sort('gender', 'age').fetchOne()._id, v.foo._id);

      TestModel.create({name: 'bar', age: 2});

      assert.equals(util.mapField(TestModel.query.sort('name', 'age').fetch(), 'age'),
                    [2, 10, 5]);

      assert.equals(util.mapField(TestModel.query.sort('name', -1, 'age').fetch(), 'age'),
                    [5, 2, 10]);

      assert.equals(util.mapField(TestModel.query.sort('name', -1, 'age', -1).fetch(), 'age'),
                    [5, 10, 2]);
    });

    test("compare", ()=>{
      const {query} = TestModel;
      assert.same(query.compare, undefined);

      const {compare} = query.sort('name', 'age');
      assert.same(query.compare, compare);


      assert.equals(compare({name: "foo"}, {name: "Bar"}), 2);
      assert.equals(compare({name: "Foo"}, {name: "bar"}), 2);
      assert.equals(compare({name: "foo"}, {name: "Foo"}), -2);
      assert.equals(compare({name: "foo", age: 1}, {name: "foo", age: 22}), -1);
      assert.equals(compare({name: "foo", age: 1, _id: "def"},
                            {name: "foo", age: 1, _id: "abc"}), 1);
    });

    test("compareKeys", ()=>{
      const {compareKeys} = TestModel.query.sort('name', -1, 'age');

      assert.equals(compareKeys, ['name', 'age', '_id']);
    });

    test("onChange", ()=>{
      /**
       * Observe changes to documents matching query.
       *
       * See {#koru/observable#add}
       *
       * @param callback called with one argument {#../doc-change} detailing the change.
       **/
      api.protoMethod('onChange');

      const onChange = TestModel.onChange;
      intercept(TestModel, 'onChange', func =>{
        const handle = onChange.call(TestModel, func);
        v.stopSpy = spy(handle, 'stop');
        return handle;
      });

      //[
      const query = TestModel.query.where(doc => doc.name.startsWith('F'));
      const oc = stub();
      const handle = query.onChange(oc);

      const fred = TestModel.create({name: 'Fred'});

      assert.calledWith(oc, DocChange.add(fred));
      oc.reset();

      const emma = TestModel.create({name: 'Emma'});
      refute.called(oc);

      emma.$update('name', 'Fiona');
      assert.calledWith(oc, DocChange.add(emma.$reload()));
      emma.$update('name', 'Fi');
      assert.calledWith(oc, DocChange.change(emma.$reload(), {name: 'Fiona'}));

      fred.$update('name', 'Eric');
      assert.calledWith(oc, DocChange.delete(fred.$reload()));


      /** stop cancels observer **/
      handle.stop();

      oc.reset();
      fred.$update('name', 'Freddy');

      refute.called(oc);
      //]

      assert.called(v.stopSpy);
    });

    test("fetch", ()=>{
      assert.equals(new Query(TestModel).fetch().sort(util.compareByField('_id')), [v.bar, v.foo]);
    });

    test("fetchOne", ()=>{
      assert.equals(new Query(TestModel).where({name: 'foo'}).fetchOne(), v.foo);
    });

    test("forEach", ()=>{
      const results = [];
      new Query(TestModel).forEach(doc => {results.push(doc)});
      assert.equals(results.sort(util.compareByField('_id')), [v.bar, v.foo]);
    });

    test("iterate singleton", ()=>{
      const results = [];
      for (let doc of TestModel.onId(v.bar._id)) {
        results.push(doc);
      }

      assert.equals(results, [v.bar]);
    });

    test("iterate sorted", ()=>{
      const results = [];
      const q = new Query(TestModel).sort('_id');

      for (let doc of q) {
        results.push(doc);
      }
      assert.equals(results, [v.bar, v.foo]);
    });

    test("iterate unsorted", ()=>{
      const results = [];
      const q = new Query(TestModel);

      for (let doc of q) {
        results.push(doc);
      }
      assert.equals(results.sort(util.compareByField('_id')), [v.bar, v.foo]);
    });


    test("iterate limit", ()=>{
      TestModel.create({_id: 'tre789', name: 'tre', age: 3, gender: 'm'});

      const q = new Query(TestModel).limit(2);

      assert.equals(Array.from(q).length, 2);
    });

    test("fetchIds", ()=>{
      TestModel.query.remove();
      const exp_ids = [1,2,3].map(num => TestModel.create({age: num})._id);

      assert.equals(TestModel.query.fetchIds().sort(), exp_ids.slice(0).sort());
      assert.equals(TestModel.query.whereNot('age', 1).fetchIds().sort(),
                    exp_ids.slice(1,4).sort());
      assert.equals(TestModel.query.sort('age', -1).fetchIds(), exp_ids.slice(0).reverse());
    });

    test("remove", ()=>{
      assert.same(new Query(TestModel).remove(), 2);

      assert.equals(new Query(TestModel).fetch(), []);
    });

    test("count", ()=>{
      assert.same(new Query(TestModel).count(), 2);
    });

    test("exisits", ()=>{
      assert.same(new Query(TestModel).exists(), true);
      assert.same(new Query(TestModel).where({_id: 'notfound'}).exists(), false);
      assert.same(new Query(TestModel).exists({_id: v.foo._id}), true);
    });

    group("matches", ()=>{
      before(()=>{});
      test("field compare", ()=>{
        const query = new Query(TestModel);
        assert.same(query.matches({}), true);

        query.where({_id: 'id1'});
        assert.same(query.matches({_id: 'id1'}), true);
        assert.same(query.matches({_id: 'id2'}), false);
        assert.same(query.matches({_id: 'id2'}, {_id: 'id1'}), true);
      });

      test("functions", ()=>{
        const query = new Query(TestModel).where(doc => doc.age == 5);

        assert.same(query.matches({age: 5}), true);
        assert.same(query.matches({age: 5}, {age: 4}), true);
        assert.same(query.matches({age: 4}), false);
        assert.same(query.matches({age: 4}, {age: 5}), false);
      });

      test("$gt", ()=>{
        const query = new Query(TestModel).where({age: {'>': 50}});

        assert.same(query.matches({age: 54}), true);
        return;
        assert.same(query.matches({age: 50.1}), true);
        assert.same(query.matches({age: 50}), false);
        assert.same(query.matches({age: 49.9}), false);
        assert.same(query.matches({age: "x"}), false);

        const textQuery = new Query(TestModel).where({name: {$gt: 'Terry'}});

        assert.same(textQuery.matches({name: 'zac'}), true);
        assert.same(textQuery.matches({name: 'Terry'}), false);
        assert.same(textQuery.matches({name: 'terry'}), false);
        assert.same(textQuery.matches({name: 'aulb'}), false);
      });

      test("$gte", ()=>{
        const query = new Query(TestModel).where({age: {'>=': 50}});

        assert.same(query.matches({age: 54}), true);
        assert.same(query.matches({age: 50.1}), true);
        assert.same(query.matches({age: 50}), true);
        assert.same(query.matches({age: 49.9}), false);
        assert.same(query.matches({age: "x"}), false);

        const textQuery = new Query(TestModel).where({name: {$gte: 'Terry'}});

        assert.same(textQuery.matches({name: 'zac'}), true);
        assert.same(textQuery.matches({name: 'terry'}), false);
        assert.same(textQuery.matches({name: 'Terry'}), true);
        assert.same(textQuery.matches({name: 'aulb'}), false);

        /** whereNot **/ {
          const query = new Query(TestModel).whereNot({age: {$gte: 50}});

          assert.same(query.matches({age: 54}), false);
          assert.same(query.matches({age: 50.1}), false);
          assert.same(query.matches({age: 50}), false);
          assert.same(query.matches({age: 49.9}), true);
          assert.same(query.matches({age: "x"}), true);
        }

        /** whereSome **/ {
          const query = new Query(TestModel).whereSome({age: {$lte: 50}}, {age: {'>=': 100}});

          assert.same(query.matches({age: 40}), true);
          assert.same(query.matches({age: 50}), true);
          assert.same(query.matches({age: 50.1}), false);
          assert.same(query.matches({age: 74}), false);
          assert.same(query.matches({age: 100}), true);
          assert.same(query.matches({age: 150}), true);
        }
      });

      test("$lt.", ()=>{
        const query = new Query(TestModel).where({age: {'<': 50}});

        assert.same(query.matches({age: 54}), false);
        assert.same(query.matches({age: 50.1}), false);
        assert.same(query.matches({age: 50}), false);
        assert.same(query.matches({age: 49.9}), true);
        assert.same(query.matches({age: "x"}), false);

        const textQuery = new Query(TestModel).where({name: {$lt: 'terry'}});

        assert.same(textQuery.matches({name: 'Zac'}), false);
        assert.same(textQuery.matches({name: 'Terry'}), false);
        assert.same(textQuery.matches({name: 'terry'}), false);
        assert.same(textQuery.matches({name: 'Aulb'}), true);
      });

      test("$lte", ()=>{
        const query = new Query(TestModel).where({age: {'<=': 50}});

        assert.same(query.matches({age: 54}), false);
        assert.same(query.matches({age: 50.1}), false);
        assert.same(query.matches({age: 50}), true);
        assert.same(query.matches({age: 49.9}), true);
        assert.same(query.matches({age: "x"}), false);

        const textQuery = new Query(TestModel).where({name: {$lte: 'terry'}});

        assert.same(textQuery.matches({name: 'Zac'}), false);
        assert.same(textQuery.matches({name: 'Terry'}), false);
        assert.same(textQuery.matches({name: 'terry'}), true);
        assert.same(textQuery.matches({name: 'Aulb'}), true);
      });

      test("$in", ()=>{
        const query = new Query(TestModel).where({age: {$in: [1,2,3]}});

        assert.same(query.matches({age: 0}), false);
        assert.same(query.matches({age: "x"}), false);
        assert.same(query.matches({age: 1}), true);
        assert.same(query.matches({age: 2}), true);
      });

      test("$nin", ()=>{
        const query = new Query(TestModel).where({age: {$nin: [1,2,3]}});

        assert.same(query.matches({age: 0}), true);
        assert.same(query.matches({age: "x"}), true);
        assert.same(query.matches({age: 1}), false);
        assert.same(query.matches({age: 2}), false);
      });

      test("$ne", ()=>{
        const query = new Query(TestModel).where({age: {'!=': 42}});

        assert.same(query.matches({age: 40}), true);
        assert.same(query.matches({age: "x"}), true);
        assert.same(query.matches({age: 42}), false);
      });
    });

    group("updates", ()=>{
      beforeEach(()=>{TH.startTransaction()});
      afterEach(()=>{TH.rollbackTransaction()});

      test("update one", ()=>{
        const st = new Query(TestModel).onId(v.foo._id);

        assert.same(st.update({name: 'new name'}), 1);

        v.foo = TestModel.findById('foo123');
        assert.same(v.foo.name, 'new name');
        assert.same(v.foo.age, 5);
      });

      test("update partial field", ()=>{
        TestModel.defineFields({foo: 'object'});

        const handle = TestModel.onChange(v.ob = stub());
        onEnd(() => handle.stop());
        const st = new Query(TestModel).onId(v.foo._id);

        st.update("$partial", {foo: [
          'bar.baz', 'fnord',
          'bar.alice', 'rabbit',
          'bar.delme', 'please'
        ]});

        v.foo.$reload();
        assert.calledWith(v.ob, DocChange.change(v.foo, {$partial: {foo: ['$replace', null]}}));
        assert.same(v.foo.attributes.foo.bar.baz, 'fnord');
        v.ob.reset();

        st.update({$partial: {foo: [
          "bar.$partial", [
            "alice.$partial", ['$append', ' and cat'],
            "delme", null,
          ]]}});
        v.foo.$reload();
        assert.equals(v.foo.attributes.foo.bar, {baz: 'fnord', alice: 'rabbit and cat'});
        assert.equals(v.ob.lastCall.args[0].undo, {
          $partial: {foo: [
            "bar.$partial", [
              "delme", 'please',
              "alice.$partial", ['$patch', [-8, 8, null]],
            ]
          ]}});
      });

      test("update arrays", ()=>{
        TestModel.defineFields({foo: 'jsonb', x: 'integer[]'});
        const st = new Query(TestModel).onId(v.foo._id);

        st.update({name: 'new Name', $partial: {
          foo: ['bar.baz', 123],
          x: ['$add', [11, 22]],
        }});

        const attrs = v.foo.$reload().attributes;

        assert.same(attrs.name, 'new Name');
        assert.equals(attrs.foo.bar.baz, 123);
        assert.equals(attrs.x, [11, 22]);
      });

      test("update deletes fields", ()=>{
        const st = new Query(TestModel).onId(v.foo._id);

        assert.same(st.update({name: 'new name', age: undefined}), 1);

        assert.equals(v.foo.$reload().attributes, {_id: 'foo123', name: 'new name', gender: 'm'});
      });

      test("inc", ()=>{
        const st = new Query(TestModel).onId(v.foo._id);
        assert.same(st.inc("age", 2), st);

        st.update({name: 'x'});

        v.foo.$reload();

        assert.same(v.foo.name, 'x');
        assert.same(v.foo.age, 7);

        st.inc("age").update();
        assert.same(v.foo.$reload().age, 8);
      });

      test("where on update", ()=>{
        const st = new Query(TestModel).onId(v.foo._id);

        assert.same(st.where({name: 'bar'}).update({name: 'new name'}), 0);
        v.foo.$reload();
        assert.same(v.foo.name, 'foo');

        assert.same(st.where({name: 'foo'}).update({name: 'new name'}), 1);

        v.foo.$reload();
        assert.same(v.foo.name, 'new name');
      });
    });

    group("with model", ()=>{
      before(()=>{});
      test("onId exists", ()=>{
        const st = new Query(TestModel);

        assert.same(st.onId(v.foo._id), st);

        assert.equals(st.fetch(), [v.foo]);
      });

      test("onModel", ()=>{
        const st = new Query();

        assert.same(st.onModel(TestModel).onId(v.foo._id), st);

        assert.equals(st.fetch(), [v.foo]);
      });

      test("onId does not exist", ()=>{
        const st = new Query(TestModel);

        assert.same(st.onId("notfound"), st);

        assert.equals(st.fetch(), []);
      });

      test("addItems, removeItems", ()=>{
        TestModel.defineFields({cogs: 'text[]'});
        onEnd(TestModel.onChange(v.onChange = stub()));

        TestModel.query.onId(v.foo._id).addItems('cogs', ['a']);
        assert.equals(v.foo.$reload().cogs, ['a']);
        assert.calledWith(v.onChange, DocChange.change(v.foo, {$partial: {cogs: ['$remove', ['a']]}}));

        v.onChange.reset();
        TestModel.query.onId(v.foo._id).addItems('cogs', ['b']);
        assert.equals(v.foo.$reload().cogs, ['a', 'b']);
        assert.calledWith(v.onChange, DocChange.change(v.foo, {$partial: {cogs: ['$remove', ['b']]}}));

        v.onChange.reset();

        TestModel.query.onId(v.foo._id).addItems('cogs', ['b']);
        assert.equals(v.foo.$reload().cogs, ['a', 'b']);
        refute.called(v.onChange);

        TestModel.query.onId(v.foo._id).removeItems('cogs', ['a']);
        assert.equals(v.foo.$reload().cogs, ['b']);
        assert.calledWith(v.onChange, DocChange.change(v.foo, {$partial: {cogs: ['$add', ['a']]}}));

        v.onChange.reset();
        TestModel.query.onId(v.foo._id).removeItems('cogs', ['b']);
        assert.equals(v.foo.$reload().cogs, []);
        assert.calledWith(v.onChange, DocChange.change(v.foo, {$partial: {cogs: ['$add', ['b']]}}));
      });

      test("whereNot", ()=>{
        /**
         * Add one or more where-nots to the query.  If any where-not
         * test matches then the query does not match record

         * @param {string|object} params field or directive to match
         * on. If is object then whereNot is called for each key.

         * @param {object|primitive} [value] corresponding to `params`
         **/
        api.protoMethod('whereNot');
        let st = new Query(TestModel).where('gender', 'm');

        assert.same(st.count(), 2);

        st.whereNot({age: 5});

        assert.equals(st.fetchField('age'), [10]);

        st = new Query(TestModel).where('gender', 'm');

        st.whereNot('age', [5, 7]);

        assert.equals(st.fetchField('age'), [10]);

        assert.equals(st.whereNot('age', [5, 10]).fetchField('age'), []);
        assert.equals(st.whereNot('name', 'foo').fetchField('name'), []);
      });

      test("where with array", ()=>{
        let st = new Query(TestModel).where('age', [5, 10]);

        assert.equals(st.fetchField('age').sort(), [10, 5]);

        st = new Query(TestModel).where('age', [5, 7]);

        assert.equals(st.fetchField('age'), [5]);
      });

      test("where on fetch", ()=>{
        const st = new Query(TestModel).onId(v.foo._id);

        assert.same(st.where({name: 'foo'}), st);

        assert.equals(st.fetch(), [v.foo]);

        assert.equals(st.where({name: 'bar'}).fetch(), []);
      });

      test("where with field, value", ()=>{
        const st = new Query(TestModel).onId(v.foo._id);

        assert.same(st.where('name', 'foo'), st);

        assert.equals(st.fetch(), [v.foo]);

        assert.equals(st.where('name', 'bar').fetch(), []);
      });

      test("whereSome", ()=>{
        let ids = new Query(TestModel).whereSome({age: 5}, {age: 10}).where('gender', 'm')
            .fetchIds().sort();
        assert.equals(ids, ['bar456', 'foo123']);

        ids =  new Query(TestModel).whereSome({age: 5, name: 'baz'}, {age: 10, name: 'bar'})
          .where('gender', 'm').fetchIds();

        assert.equals(ids, ['bar456']);

        assert.equals(
          TestModel.query.whereSome({age: [5, 10]}).fetchIds().sort(), ['bar456', 'foo123']);

      });

      test("where on forEach", ()=>{
        const st = new Query(TestModel).onId(v.foo._id);

        assert.same(st.where({name: 'foo'}), st);

        st.forEach(v.stub = stub());
        assert.calledOnce(v.stub);
        assert.calledWith(v.stub, m(doc => {
          if (doc._id === v.foo._id) {
            assert.equals(doc.attributes, v.foo.attributes);
            return true;
          }
        }));

        assert.equals(st.where({name: 'bar'}).fetch(), []);
      });

      test("onAnyChange", ()=>{
        /**
         * Observe any change to any model.
         *
         * @param callback is called a {#koru/model/doc-change} instance.
         *
         * @return contains a stop method to stop observering
         **/
        api.method('onAnyChange');
        onEnd(Query.onAnyChange(v.onAnyChange = stub()));

        const ondra = TestModel.create({_id: 'm123', name: 'Ondra', age: 21, gender: 'm'});
        const matchOndra = m.field('_id', ondra._id);
        assert.calledWith(v.onAnyChange, DocChange.add(ondra));


        ondra.$update('age', 22);
        assert.calledWith(v.onAnyChange, DocChange.change(matchOndra, {age: 21}));

        ondra.$remove();
        assert.calledWith(v.onAnyChange, DocChange.delete(matchOndra));
      });
    });

  });
});
