define(function (require, exports, module) {
  const util  = require('../util');
  const Model = require('./main');
  const TH    = require('./test-helper');

  const Query = require('./query');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      v.TestModel = Model.define('TestModel').defineFields({name: 'text', age: 'number', gender: 'text'});

      v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
      v.foo = v.TestModel.findById('foo123');

      v.TestModel.create({_id: 'bar456', name: 'bar', age: 10, gender: 'm'});
      v.bar = v.TestModel.findById('bar456');
    },

    tearDown() {
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "test un/match array element"() {
      v.TestModel.defineFields({aoo: 'object'});
      v.foo.$onThis.update('aoo', [{a: 1, b:2}, {a: 1, b: 3}]);

      assert.same(v.TestModel.query.whereNot('aoo', {a: 1, b: 3}).count(), 1);

      v.bar.$onThis.update('aoo', {a: 2, b:2});

      if (isServer) {
         assert.same(v.TestModel.where('aoo', {$elemMatch: {a: 1, b: 3}}).count(), 1);
         assert.same(v.TestModel.where('aoo', {$elemMatch: {a: 1, b: 1}}).count(), 0);

         assert.same(v.TestModel.query.whereNot('aoo', {$elemMatch: {a: 1, b: 1}}).count(), 2);
         assert.same(v.TestModel.query.whereNot('aoo', {$elemMatch: {a: 1, b: 3}}).count(), 1);
      }

      assert.same(v.TestModel.where('aoo', {a: 1, b: 3}).count(), 1);
      assert.same(v.TestModel.where('aoo', {a: 1, b: 1}).count(), 0);
      assert.same(v.TestModel.query.where('aoo', {a: 1}).count(), 0);

      assert.same(v.TestModel.query.whereNot('aoo', {a: 1, b: 3}).count(), 1);
      assert.same(v.TestModel.query.whereNot('aoo', {a: 1, b: 1}).count(), 2);
    },

    "test $ne"() {
      assert.equals(v.TestModel.where('age', {$ne: 5}).map(d => d.age), [10]);
      assert.equals(v.TestModel.where('age', {$nin: [5, 6]}).map(d => d.age), [10]);
    },

    "query withIndex": {
      setUp() {
        v.idx = v.TestModel.addUniqueIndex('gender', 'age', 'name');

        v.TestModel.query.remove();

        v.TestModel.create({_id: '1', name: 'n1', age: 1, gender: 'm'});
        v.TestModel.create({_id: '2', name: 'n2', age: 1, gender: 'm'});
        v.TestModel.create({_id: '3', name: 'n2', age: 2, gender: 'm'});
        v.TestModel.create({_id: '4', name: 'n1', age: 1, gender: 'f'});
      },

      "test no matches"() {
        assert.same(v.TestModel.query.withIndex(v.idx, {gender: 'x'}).count(), 0);
      },

      "test last"() {
        const result = v.TestModel.query.whereNot('_id', '1')
              .withIndex(v.idx, {gender: 'm', age: 1}).fetchIds();

        assert.equals(result, ['2']);
      },

      "test only major"() {
        const result = v.TestModel.query.whereNot('_id', '1')
              .withIndex(v.idx, {gender: 'm'}).fetchIds();

        assert.equals(result.sort(), ['2', '3']);
      },
    },

    "test arrays"() {
      v.TestModel.defineFields({ages: 'integer[]'});
      v.foo.$update('ages', [5]);
      v.multi = v.TestModel.create({ages: [6,7,8]});

      assert.equals(v.TestModel.where('ages', [8, 9]).fetchIds(), [v.multi._id]);
      assert.equals(v.TestModel.where('ages', 7).fetchIds(), [v.multi._id]);

      assert.equals(v.TestModel.where('ages', [5, 9]).fetchIds(), [v.foo._id]);
    },

    "test fields"() {
      assert.equals(new Query(v.TestModel).fields('a', 'b').fields('c')._fields, {a: true, b:true, c: true});
    },

    "test sort"() {
      assert.equals(new Query(v.TestModel).sort('a', 'b', -1).sort('c')._sort, {a: 1, b: -1, c: 1});

      assert.equals(v.TestModel.query.sort('gender', 'age', -1).fetchIds(), [v.bar._id, v.foo._id]);
      assert.same(v.TestModel.query.sort('gender', 'age', -1).fetchOne()._id, v.bar._id);

      assert.equals(v.TestModel.query.sort('gender', 'age').fetchIds(), [v.foo._id, v.bar._id]);
      assert.same(v.TestModel.query.sort('gender', 'age').fetchOne()._id, v.foo._id);
    },

    "test fetch"() {
      assert.equals(new Query(v.TestModel).fetch().sort(util.compareByField('_id')), [v.bar, v.foo]);
    },

    "test fetchOne"() {
      assert.equals(new Query(v.TestModel).where({name: 'foo'}).fetchOne(), v.foo);
    },

    "test forEach"() {
      const results = [];
      new Query(v.TestModel).forEach(doc => {results.push(doc)});
      assert.equals(results.sort(util.compareByField('_id')), [v.bar, v.foo]);
    },

    'test fetchIds'() {
      v.TestModel.query.remove();
      const exp_ids = [1,2,3].map(num => v.TestModel.create({age: num})._id);

      assert.equals(v.TestModel.query.fetchIds().sort(), exp_ids.slice(0).sort());
      assert.equals(v.TestModel.query.whereNot('age', 1).fetchIds().sort(), exp_ids.slice(1,4).sort());
      assert.equals(v.TestModel.query.sort('age', -1).fetchIds(), exp_ids.slice(0).reverse());
    },

    "test remove"() {
      assert.same(new Query(v.TestModel).remove(), 2);

      assert.equals(new Query(v.TestModel).fetch(), []);
    },

    "test count"() {
      assert.same(new Query(v.TestModel).count(), 2);
    },

    "test exisits"() {
      assert.same(new Query(v.TestModel).exists(), true);
      assert.same(new Query(v.TestModel).where({_id: 'notfound'}).exists(), false);
      assert.same(new Query(v.TestModel).exists({_id: v.foo._id}), true);
    },

    "test onId exists"() {
      const st = new Query(v.TestModel);

      assert.same(st.onId(v.foo._id), st);

      assert.equals(st.fetch(), [v.foo]);
    },

    "test onModel"() {
      const st = new Query();

      assert.same(st.onModel(v.TestModel).onId(v.foo._id), st);

      assert.equals(st.fetch(), [v.foo]);
    },

    "test onId does not exist"() {
      const st = new Query(v.TestModel);

      assert.same(st.onId("notfound"), st);

      assert.equals(st.fetch(), []);
    },

    "test update one"() {
      const st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.update({name: 'new name'}), 1);

      v.foo = v.TestModel.findById('foo123');
      assert.same(v.foo.name, 'new name');
      assert.same(v.foo.age, 5);
    },

    "test update partial field"() {
      v.TestModel.defineFields({foo: 'object'});

      const handle = v.TestModel.onChange(v.ob = this.stub());
      this.onEnd(() => handle.stop());
      const st = new Query(v.TestModel).onId(v.foo._id);

      st.update("foo.bar", {baz: 'fnord', alice: 'rabbit', delme: 'please'});

      assert.calledWith(v.ob, TH.matchModel(v.foo.$reload()), {"foo.bar": undefined});
      assert.same(v.foo.attributes.foo.bar.baz, 'fnord');

      st.update({"foo.bar.alice": 'cat', "foo.bar.delme": undefined});
      assert.calledWith(v.ob, TH.matchModel(v.foo.$reload()), {"foo.bar.alice": 'rabbit', "foo.bar.delme": 'please'});
      assert.equals(v.foo.attributes.foo.bar, {baz: 'fnord', alice: 'cat'});
    },

    "test update arrays"() {
      v.TestModel.defineFields({foo: 'jsonb', x: 'integer[]'});
      const st = new Query(v.TestModel).onId(v.foo._id);

      st.update({name: 'new Name', 'foo.bar.baz': 123, 'x.$+1': 11, 'x.$+2': 22});

      const attrs = v.foo.$reload().attributes;

      assert.same(attrs.name, 'new Name');
      assert.equals(attrs.foo.bar.baz, 123);
      assert.equals(attrs.x, [11, 22]);
    },

    "test update deletes fields"() {
      const st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.update({name: 'new name', age: undefined}), 1);

      assert.equals(v.foo.$reload().attributes, {_id: 'foo123', name: 'new name', gender: 'm'});
    },

    "test inc"() {
      const st = new Query(v.TestModel).onId(v.foo._id);
      assert.same(st.inc("age", 2), st);

      st.update({name: 'x'});

      v.foo.$reload();

      assert.same(v.foo.name, 'x');
      assert.same(v.foo.age, 7);

      st.inc("age").update();
      assert.same(v.foo.$reload().age, 8);
    },

    "test addItem removeItem"() {
      v.TestModel.defineFields({cogs: 'text[]'});
      this.onEnd(v.TestModel.onChange(v.onChange = this.stub()));

      v.TestModel.query.onId(v.foo._id).addItem('cogs', 'a');
      assert.equals(v.foo.$reload().cogs, ['a']);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.$-1": 'a'});

      v.onChange.reset();
      v.TestModel.query.onId(v.foo._id).addItem('cogs', 'b');
      assert.equals(v.foo.$reload().cogs, ['a', 'b']);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.$-1": 'b'});

      v.onChange.reset();
      v.TestModel.query.onId(v.foo._id).addItem('cogs', 'b');
      assert.equals(v.foo.$reload().cogs, ['a', 'b']);
      refute.called(v.onChange);

      v.TestModel.query.onId(v.foo._id).removeItem('cogs', 'a');
      assert.equals(v.foo.$reload().cogs, ['b']);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.$+1": 'a'});

      v.onChange.reset();
      v.TestModel.query.onId(v.foo._id).removeItem('cogs', 'b');
      assert.equals(v.foo.$reload().cogs, []);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.$+1": 'b'});

      v.TestModel.query.onId(v.foo._id).addItemAnd('cogs', 'a').addItem('cogs', ['b', 'c']);
      assert.equals(v.foo.$reload().cogs, ['a', 'b', 'c']);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.$-1": 'a', "cogs.$-2": 'b', "cogs.$-3": 'c'});

      v.TestModel.query.onId(v.foo._id).removeItemAnd('cogs', ['a', 'c']).addItemAnd('cogs', 'f').removeItem('cogs', 'b');
      assert.equals(v.foo.$reload().cogs, ['f']);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.$-1": 'f', "cogs.$+2": 'a', "cogs.$+3": 'c', "cogs.$+4": 'b'});
    },

    "test 1st removeItem"() {
      v.TestModel.defineFields({cogs: 'text[]'});
      v.TestModel.query.onId(v.foo._id).update({cogs: ['a', 'b', 'c']});
      this.onEnd(v.TestModel.onChange(v.onChange = this.stub()));


      v.TestModel.query.onId(v.foo._id).removeItem('cogs', 'a');

      assert.calledWith(v.onChange, TH.matchModel(v.foo.$reload()), {"cogs.$+1": 'a'});

      assert.equals(v.foo.$withChanges({"cogs.$+1": 'a'}).cogs, ['b', 'c', 'a']);
    },

    "test removeItem object"() {
      v.TestModel.defineFields({cogs: 'jsonb'});
      this.onEnd(v.TestModel.onChange(v.onChange = this.stub()));

      v.foo = v.TestModel.create({_id: 'foo2', cogs: [{id: 4, name: "foo"}, {id: 5, name: "bar"}, {x: 1}]});

      this.onEnd(v.TestModel.onChange(v.onChange = this.stub()));

      v.TestModel.query.onId(v.foo._id).removeItem('cogs', {x: 2});
      assert.equals(v.foo.$reload().cogs, [{id: 4, name: "foo"}, {id: 5, name: "bar"}, {x: 1}]);
      refute.called(v.onChange);

      v.TestModel.query.onId(v.foo._id).removeItemAnd('cogs', [{id: 4}, {id: 5}]).removeItem('cogs', {x: 1});
      assert.equals(v.foo.$reload().cogs, []);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.$+1": {id: 4, name: "foo"}, "cogs.$+2": {id: 5, name: "bar"}, "cogs.$+3": {x: 1}});
    },

    "test sort"() {
      v.TestModel.create({name: 'bar', age: 2});

      assert.equals(util.mapField(v.TestModel.query.sort('name', 'age').fetch(), 'age'), [2, 10, 5]);

      assert.equals(util.mapField(v.TestModel.query.sort('name', -1, 'age').fetch(), 'age'), [5, 2, 10]);

      assert.equals(util.mapField(v.TestModel.query.sort('name', -1, 'age', -1).fetch(), 'age'), [5, 10, 2]);
    },

    "test whereNot"() {
      let st = new Query(v.TestModel).where('gender', 'm');

      assert.same(st.count(), 2);

      st.whereNot('age', 5);

      assert.equals(st.fetchField('age'), [10]);

      st = new Query(v.TestModel).where('gender', 'm');

      st.whereNot('age', [5, 7]);

      assert.equals(st.fetchField('age'), [10]);

      assert.equals(st.whereNot('age', [5, 10]).fetchField('age'), []);
      assert.equals(st.whereNot('name', 'foo').fetchField('name'), []);
    },

    "test where with array"() {
      let st = new Query(v.TestModel).where('age', [5, 10]);

      assert.equals(st.fetchField('age').sort(), [10, 5]);

      st = new Query(v.TestModel).where('age', [5, 7]);

      assert.equals(st.fetchField('age'), [5]);
    },

    "test where on fetch"() {
      const st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.where({name: 'foo'}), st);

      assert.equals(st.fetch(), [v.foo]);

      assert.equals(st.where({name: 'bar'}).fetch(), []);
    },

    "test where with field, value"() {
      const st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.where('name', 'foo'), st);

      assert.equals(st.fetch(), [v.foo]);

      assert.equals(st.where('name', 'bar').fetch(), []);
    },

    "test whereSome"() {
      let ids = new Query(v.TestModel).whereSome({age: 5}, {age: 10}).where('gender', 'm').fetchIds().sort();
      assert.equals(ids, ['bar456', 'foo123']);

      ids =  new Query(v.TestModel).whereSome({age: 5, name: 'baz'}, {age: 10, name: 'bar'}).where('gender', 'm').fetchIds();

      assert.equals(ids, ['bar456']);

      assert.equals(v.TestModel.query.whereSome({age: [5, 10]}).fetchIds().sort(), ['bar456', 'foo123']);

    },

    "test where on forEach"() {
      const st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.where({name: 'foo'}), st);

      st.forEach(v.stub = this.stub());
      assert.calledOnce(v.stub);
      assert.calledWith(v.stub, TH.match(doc => {
        if (doc._id === v.foo._id) {
          assert.equals(doc.attributes, v.foo.attributes);
          return true;
        }
      }));

      assert.equals(st.where({name: 'bar'}).fetch(), []);
    },

    "test where on update"() {
      const st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.where({name: 'bar'}).update({name: 'new name'}), 0);
      v.foo.$reload();
      assert.same(v.foo.name, 'foo');

      assert.same(st.where({name: 'foo'}).update({name: 'new name'}), 1);

      v.foo.$reload();
      assert.same(v.foo.name, 'new name');
    },
  });
});
