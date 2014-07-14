define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Query = require('./query');
  var Model = require('./main');
  var util = require('../util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.TestModel = Model.define('TestModel').defineFields({name: 'text', age: 'number', gender: 'text'});

      v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
      v.foo = v.TestModel.findById('foo123');

      v.TestModel.create({_id: 'bar456', name: 'bar', age: 10, gender: 'm'});
      v.bar = v.TestModel.findById('bar456');
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "query withIndex": {
      setUp: function () {
        v.idx = v.TestModel.addUniqueIndex('gender', 'age', 'name');

        v.TestModel.query.remove();

        v.TestModel.create({_id: '1', name: 'n1', age: 1, gender: 'm'});
        v.TestModel.create({_id: '2', name: 'n2', age: 1, gender: 'm'});
        v.TestModel.create({_id: '3', name: 'n2', age: 2, gender: 'm'});
        v.TestModel.create({_id: '4', name: 'n1', age: 1, gender: 'f'});
      },

      "test no matches": function () {
        assert.same(v.TestModel.query.withIndex(v.idx, {gender: 'x'}).count(), 0);
      },

      "test last": function () {
        var result = v.TestModel.query.whereNot('_id', '1')
              .withIndex(v.idx, {gender: 'm', age: 1}).fetchIds();

        assert.equals(result, ['2']);
      },

      "test only major": function () {
        var result = v.TestModel.query.whereNot('_id', '1')
              .withIndex(v.idx, {gender: 'm'}).fetchIds();

        assert.equals(result.sort(), ['2', '3']);
      },
    },

    "test arrays": function () {
      v.multi = v.TestModel.create({age: [6,7,8]});

      assert.equals(v.TestModel.where('age', [8, 9]).fetchIds(), [v.multi._id]);
      assert.equals(v.TestModel.where('age', 7).fetchIds(), [v.multi._id]);

      assert.equals(v.TestModel.where('age', [5, 9]).fetchIds(), [v.foo._id]);
    },

    "test fields": function () {
      assert.equals(new Query(v.TestModel).fields('a', 'b').fields('c')._fields, {a: true, b:true, c: true});
    },

    "test sort": function () {
      assert.equals(new Query(v.TestModel).sort('a', 'b', -1).sort('c')._sort, {a: 1, b: -1, c: 1});

      assert.equals(v.TestModel.query.sort('gender', 'age', -1).fetchIds(), [v.bar._id, v.foo._id]);
      assert.same(v.TestModel.query.sort('gender', 'age', -1).fetchOne()._id, v.bar._id);

      assert.equals(v.TestModel.query.sort('gender', 'age').fetchIds(), [v.foo._id, v.bar._id]);
      assert.same(v.TestModel.query.sort('gender', 'age').fetchOne()._id, v.foo._id);
    },

    "test fetch": function () {
      assert.equals(new Query(v.TestModel).fetch().sort(util.compareByField('_id')), [v.bar, v.foo]);
    },

    "test fetchOne": function () {
      assert.equals(new Query(v.TestModel).where({name: 'foo'}).fetchOne(), v.foo);
    },

    "test forEach": function () {
      var results = [];
      new Query(v.TestModel).forEach(function (doc) {
        results.push(doc);
      });
      assert.equals(results.sort(util.compareByField('_id')), [v.bar, v.foo]);
    },

    'test fetchIds': function () {
      v.TestModel.query.remove();
      var exp_ids = [1,2,3].map(function (num) {
        return v.TestModel.create({age: num})._id;
      });

      assert.equals(v.TestModel.query.fetchIds().sort(), exp_ids.slice(0).sort());
      assert.equals(v.TestModel.query.whereNot('age', 1).fetchIds().sort(), exp_ids.slice(1,4).sort());
      assert.equals(v.TestModel.query.sort('age', -1).fetchIds(), exp_ids.slice(0).reverse());
    },

    "test remove": function () {
      assert.same(new Query(v.TestModel).remove(), 2);

      assert.equals(new Query(v.TestModel).fetch(), []);
    },

    "test count": function () {
      assert.same(new Query(v.TestModel).count(), 2);
    },

    "test onId exists": function () {
      var st = new Query(v.TestModel);

      assert.same(st.onId(v.foo._id), st);

      assert.equals(st.fetch(), [v.foo]);
    },

    "test onModel": function () {
      var st = new Query();

      assert.same(st.onModel(v.TestModel).onId(v.foo._id), st);

      assert.equals(st.fetch(), [v.foo]);
    },

    "test onId does not exist": function () {
      var st = new Query(v.TestModel);

      assert.same(st.onId("notfound"), st);

      assert.equals(st.fetch(), []);
    },

    "test update one": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.update({name: 'new name'}), 1);

      v.foo = v.TestModel.findById('foo123');
      assert.same(v.foo.name, 'new name');
      assert.same(v.foo.age, 5);
    },

    "test update partial field": function () {
      var handle = v.TestModel.onChange(v.ob = test.stub());
      test.onEnd(function () {
        handle.stop();
      });
      var st = new Query(v.TestModel).onId(v.foo._id);

      st.update("foo.bar", {baz: 'fnord', alice: 'rabbit', delme: 'please'});

      assert.calledWith(v.ob, TH.matchModel(v.foo.$reload()), {"foo.bar": undefined});
      assert.same(v.foo.attributes.foo.bar.baz, 'fnord');

      st.update({"foo.bar.alice": 'cat', "foo.bar.delme": undefined});
      assert.calledWith(v.ob, TH.matchModel(v.foo.$reload()), {"foo.bar.alice": 'rabbit', "foo.bar.delme": 'please'});
      assert.equals(v.foo.attributes.foo.bar, {baz: 'fnord', alice: 'cat'});
    },

    "test update deletes fields": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.update({name: 'new name', age: undefined}), 1);

      assert.equals(v.foo.$reload().attributes, {_id: 'foo123', name: 'new name', gender: 'm'});
    },

    "test inc": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);
      assert.same(st.inc("age", 2), st);

      st.update({name: 'x'});

      v.foo.$reload();

      assert.same(v.foo.name, 'x');
      assert.same(v.foo.age, 7);

      st.inc("age").update();
      assert.same(v.foo.$reload().age, 8);
    },

    "test addItem removeItem": function () {
      v.TestModel.defineFields({cogs: 'has-many'});
      test.onEnd(v.TestModel.onChange(v.onChange = test.stub()));

      v.TestModel.query.onId(v.foo._id).addItem('cogs', 'a').update();
      assert.equals(v.foo.$reload().cogs, ['a']);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.0": undefined});

      v.onChange.reset();
      v.TestModel.query.onId(v.foo._id).addItem('cogs', 'b').update();
      assert.equals(v.foo.$reload().cogs, ['a', 'b']);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.1": undefined});

      v.onChange.reset();
      v.TestModel.query.onId(v.foo._id).addItem('cogs', 'b').update();
      assert.equals(v.foo.$reload().cogs, ['a', 'b']);
      refute.called(v.onChange);

      v.TestModel.query.onId(v.foo._id).removeItem('cogs', 'a').update();
      assert.equals(v.foo.$reload().cogs, ['b']);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.1": 'a'});

      v.onChange.reset();
      v.TestModel.query.onId(v.foo._id).removeItem('cogs', 'b').update();
      assert.equals(v.foo.$reload().cogs, []);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.0": 'b'});

      v.TestModel.query.onId(v.foo._id).addItem('cogs', 'a').addItem('cogs', ['b', 'c']).update();
      assert.equals(v.foo.$reload().cogs, ['a', 'b', 'c']);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.0": undefined, "cogs.1": undefined, "cogs.2": undefined});

      v.TestModel.query.onId(v.foo._id).removeItem('cogs', ['a', 'c']).removeItem('cogs', 'b').update();
      assert.equals(v.foo.$reload().cogs, []);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.0": 'b', "cogs.1": 'c', "cogs.2": 'a'});
    },

    "test removeItem object": function () {
      v.TestModel.defineFields({cogs: 'has-many'});
      test.onEnd(v.TestModel.onChange(v.onChange = test.stub()));

      v.foo = v.TestModel.create({_id: 'foo2', cogs: [{id: 4, name: "foo"}, {id: 5, name: "bar"}, {x: 1}]});

      test.onEnd(v.TestModel.onChange(v.onChange = test.stub()));

      v.TestModel.query.onId(v.foo._id).removeItem('cogs', {x: 2}).update();
      assert.equals(v.foo.$reload().cogs, [{id: 4, name: "foo"}, {id: 5, name: "bar"}, {x: 1}]);
      refute.called(v.onChange);

      v.TestModel.query.onId(v.foo._id).removeItem('cogs', [{id: 4}, {id: 5}]).removeItem('cogs', {x: 1}).update();
      assert.equals(v.foo.$reload().cogs, []);
      assert.calledWith(v.onChange, TH.matchModel(v.foo), {"cogs.0": {x: 1}, "cogs.1": {id: 5, name: "bar"}, "cogs.2": {id: 4, name: "foo"}});
    },

    "test sort": function () {
      v.TestModel.create({name: 'bar', age: 2});

      assert.equals(util.mapField(v.TestModel.query.sort('name', 'age').fetch(), 'age'), [2, 10, 5]);

      assert.equals(util.mapField(v.TestModel.query.sort('name', -1, 'age').fetch(), 'age'), [5, 2, 10]);

      assert.equals(util.mapField(v.TestModel.query.sort('name', -1, 'age', -1).fetch(), 'age'), [5, 10, 2]);
    },

    "test whereNot": function () {
      var st = new Query(v.TestModel).where('gender', 'm');

      assert.same(st.count(), 2);

      st.whereNot('age', 5);

      assert.equals(st.fetchField('age'), [10]);

      var st = new Query(v.TestModel).where('gender', 'm');

      st.whereNot('age', [5, 7]);

      assert.equals(st.fetchField('age'), [10]);

      assert.equals(st.whereNot('age', [5, 10]).fetchField('age'), []);
    },

    "test where with array": function () {
      var st = new Query(v.TestModel).where('age', [5, 10]);

      assert.equals(st.fetchField('age').sort(), [10, 5]);

      var st = new Query(v.TestModel).where('age', [5, 7]);

      assert.equals(st.fetchField('age'), [5]);
    },

    "test where on fetch": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.where({name: 'foo'}), st);

      assert.equals(st.fetch(), [v.foo]);

      assert.equals(st.where({name: 'bar'}).fetch(), []);
    },

    "test where with field, value": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.where('name', 'foo'), st);

      assert.equals(st.fetch(), [v.foo]);

      assert.equals(st.where('name', 'bar').fetch(), []);
    },

    "test whereSome": function () {
      var ids = new Query(v.TestModel).whereSome({age: 5}, {age: 10}).where('gender', 'm').fetchIds().sort();
      assert.equals(ids, ['bar456', 'foo123']);

      var ids =  new Query(v.TestModel).whereSome({age: 5, name: 'baz'}, {age: 10, name: 'bar'}).where('gender', 'm').fetchIds();

      assert.equals(ids, ['bar456']);
    },

    "test where on forEach": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.where({name: 'foo'}), st);

      st.forEach(v.stub = test.stub());
      assert.calledOnce(v.stub);
      assert.calledWith(v.stub, TH.match(function (doc) {
        if (doc._id === v.foo._id) {
          assert.equals(doc.attributes, v.foo.attributes);
          return true;
        }
      }));

      assert.equals(st.where({name: 'bar'}).fetch(), []);
    },

    "test where on update": function () {
      var st = new Query(v.TestModel).onId(v.foo._id);

      assert.same(st.where({name: 'bar'}).update({name: 'new name'}), 0);
      v.foo.$reload();
      assert.same(v.foo.name, 'foo');

      assert.same(st.where({name: 'foo'}).update({name: 'new name'}), 1);

      v.foo.$reload();
      assert.same(v.foo.name, 'new name');
    },
  });
});
