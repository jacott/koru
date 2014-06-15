define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Query = require('./query');
  var session = require('../session/base');
  var Model = require('./main');
  var util = require('../util');
  var sync = require('../session/sync');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.TestModel = Model.define('TestModel').defineFields({name: 'text', age: 'number', nested: 'object'});
      v.foo = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, nested: [{ary: ['m']}]});
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
      sync._resetCount();
      v = null;
    },

    "//test reconcile docs": function () {
      assert.calledWith(v.sess.onConnect, "10", subscribe._onConnect);

      // in addition waitMs we should be only reconcile once all rpcs
      // and supsciptions have responded. Will need to recfactor the
      // v.sess.rpc.notify logic
    },

    "recording": {
      setUp: function () {
        sync.inc();
      },

      "test client only updates": function () {
        v.TestModel.query.update({name: 'bar'});

        assert.same(v.foo.name, 'bar');

        var tmchanges = Query._simDocs.TestModel[1];

        assert.equals(tmchanges[v.foo._id].name, 'foo');

        v.TestModel.query.update({age: 7, name: 'baz'});

        v.TestModel.query.update({age: 9, name: 'baz'});

        assert.equals(tmchanges[v.foo._id].name, 'foo');
        assert.equals(tmchanges[v.foo._id].age, 5);


        test.onEnd(v.TestModel.onChange(v.change = test.stub()));

        sync.dec();

        assert.same(v.foo.name, 'foo');
        assert.same(v.foo.age, 5);

        assert.equals(Query._simDocs, {});

        assert.calledWith(v.change, TH.matchModel(v.foo), {name: 'baz', age: 9});
      },

      "test partial update match from server": function () {
        v.TestModel.query.update({age: 7, name: 'baz'});
        v.TestModel.query.update({age: 2, name: 'another'});
        v.TestModel.query.fromServer(v.foo._id).update({name: 'baz'});

        sync.dec();

        assert.equals(v.foo.attributes, {_id: v.foo._id, age: 5, name: 'baz', nested: [{ary: ['m']}]});
      },

      "test matching update": function () {
        test.onEnd(v.TestModel.onChange(v.change = test.stub()));

        v.TestModel.query.update({age: 7, name: 'baz'});
        v.TestModel.query.fromServer(v.foo._id).update({age: 7, name: 'baz'});

        sync.dec();

        assert.same(v.foo.name, 'baz');
        assert.same(v.foo.age, 7);

        assert.calledOnce(v.change);
      },

      "test nested structures": function () {
        v.TestModel.query.update({"nested.0.arg.0": 'f'});

        var tmchanges = Query._simDocs.TestModel[1];

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['m']}]);

        v.TestModel.query.update({nested: true});

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['m']}]);

        v.TestModel.query.fromServer(v.foo._id).update({"nested.0.ary.0": 'M'});
        v.TestModel.query.fromServer(v.foo._id).update({"nested.0.ary.1": 'f'});

        assert.equals(tmchanges[v.foo._id].nested, [{ary: ['M', 'f']}]);

        sync.dec();

        assert.equals(v.foo.nested, [{ary: ['M', 'f']}]);
      },

      "test client only add": function () {
        var bar = v.TestModel.create({name: 'bar'});

        test.onEnd(v.TestModel.onChange(v.changed = test.stub()));
        sync.dec();

        assert.calledWith(v.changed, null, TH.matchModel(bar));
      },

      "test matching add ": function () {
        test.onEnd(v.TestModel.onChange(v.change = test.stub()));

        var bar = v.TestModel.create({name: 'baz', age: 7});
        Query.insertFromServer(v.TestModel, bar._id, {_id: bar._id, age: 7, name: 'baz'});

        sync.dec();

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
        sync.dec();

        assert.same(bar.age, undefined);
        assert.same(bar.name, 'sam');

        assert.calledWith(v.changed, TH.matchModel(bar), {age: 5});
      },

      "test matching remove ": function () {
        test.onEnd(v.TestModel.onChange(v.change = test.stub()));

        v.TestModel.query.onId(v.foo._id).remove();
        v.TestModel.query.fromServer(v.foo._id).remove();

        sync.dec();

        assert.same(v.TestModel.query.count(), 0);

        assert.calledOnce(v.change);
      },

      "test client remove, server update": function () {
        v.TestModel.query.remove();

        v.TestModel.query.fromServer(v.foo._id).update({name: 'sam'});

        assert.same(v.TestModel.query.count(), 0);

        test.onEnd(v.TestModel.onChange(v.changed = test.stub()));
        sync.dec();

        assert.same(v.TestModel.query.count(), 1);

        v.foo.$reload();

        assert.same(v.foo.name, 'sam');
        assert.calledWith(v.changed, TH.matchModel(v.foo), null);
      },

      "test remote removed changed doc": function () {
        v.TestModel.query.onId(v.foo._id).update({name: 'Mary'});

        test.onEnd(v.TestModel.onChange(v.changed = test.stub()));
        v.TestModel.query.fromServer(v.foo._id).remove();

        refute.called(v.changed);

        assert.same(v.foo.$reload().name, 'Mary');

        sync.dec();
        assert.same(v.TestModel.query.count(), 0);

        assert.calledWith(v.changed, null, TH.matchModel(v.foo));
      },

      "test notification of different fields": function () {
        v.TestModel.query.update({age: 7});

        test.onEnd(v.TestModel.onChange(v.changed = test.stub()));

        v.TestModel.query.fromServer(v.foo._id).update({age: 9});

        refute.called(v.changed);

        v.TestModel.query.fromServer(v.foo._id).update({name: 'sam'});

        // Should notify immediately if major key not in client changes
        assert.calledWith(v.changed, TH.matchModel(v.foo), {name: 'foo'});

        v.changed.reset();

        sync.dec();

        // Should notify at revert for other changes
        assert.calledWith(v.changed, TH.matchModel(v.foo), {age: 7});
      },
    },
  });
});
