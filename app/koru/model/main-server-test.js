define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Model = require('./main');
  var session = require('../session/base');
  var koru = require('../main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      test.stub(koru, 'info');
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "test remote": function () {
      var TestModel = Model.define('TestModel');

      TestModel.remote({foo: v.foo = test.stub()});

      assert.accessDenied(function () {
        session._rpcs['TestModel.foo'].call({userId: null});
      });

      refute.called(v.foo);

      session._rpcs['TestModel.foo'].call(v.conn = {userId: "uid"});

      assert.calledOnce(v.foo);

      assert.same(v.foo.thisValues[0], v.conn);
    },

    "test when no changes in save": function () {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});

      v.doc = TestModel.create({name: 'foo'});
      test.onEnd(TestModel.onChange(v.onChange = test.stub()));
      TestModel.beforeSave('TestModel', v.beforeSave = test.stub());

      v.doc.$save();
      TestModel.query.onId(v.doc._id).update({});

      assert.same(v.doc.$reload().name, 'foo');
      refute.called (v.onChange);
      refute.called (v.beforeSave);
    },

    "test saveRpc new": function () {
      var TestModel = Model.define('TestModel', {
        authorize: v.auth = test.stub()
      }).defineFields({name: 'text'});


      TestModel.onChange(v.afterLocalChange = test.stub());

      assert.accessDenied(function () {
        session._rpcs.save.call({userId: null}, "TestModel", "fooid", {name: 'bar'});
      });

      refute(TestModel.exists("fooid"));

      session._rpcs.save.call({userId: 'u123'}, "TestModel", "fooid", {name: 'bar'});

      v.doc = TestModel.findById("fooid");

      assert.same(v.doc.name, 'bar');

      assert.called(v.afterLocalChange);
      assert.calledWithExactly(v.auth, "u123");

      assert.equals(v.auth.thisValues[0].attributes, v.doc.attributes);
    },

    "test saveRpc existing": function () {
      var TestModel = Model.define('TestModel', {
        authorize: v.auth = test.stub()
      }).defineFields({name: 'text'});


      v.doc = TestModel.create({name: 'foo'});

      TestModel.onChange(v.afterLocalChange = test.stub());

      assert.accessDenied(function () {
        session._rpcs.save.call({userId: null}, "TestModel", v.doc._id, {name: 'bar'});
      });

      assert.same(v.doc.$reload().name, 'foo');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", v.doc._id, {name: 'bar'});

      assert.same(v.doc.$reload().name, 'bar');

      assert.called(v.afterLocalChange);
      assert.calledWithExactly(v.auth, "u123");

      assert.equals(v.auth.thisValues[0].attributes, v.doc.attributes);
    },

    'test removeRpc': function () {
      var TestModel = Model.define('TestModel', {
        authorize: v.auth = test.stub()
      }).defineFields({name: 'text'});


      v.doc = TestModel.create({name: 'foo'});

      TestModel.onChange(v.afterRemove = test.stub());

      assert.accessDenied(function () {
        session._rpcs.remove.call({userId: null}, "TestModel", v.doc._id);
      });

      session._rpcs.remove.call({userId: 'u123'}, "TestModel", v.doc._id);

      refute(TestModel.findById(v.doc._id));

      assert.called(v.afterRemove);
      assert.calledWith(v.auth, "u123", {remove: true});
    },

    "test addUniqueIndex": function () {
      var TestModel = Model.define('TestModel');

      var ensureIndex = test.stub(TestModel.docs, 'ensureIndex');

      TestModel.addUniqueIndex('a', 'b', -1, 'c', 1, 'd');

      assert.calledWith(ensureIndex, {a: 1, b: -1, c: 1, d: 1}, {sparse: true, unique: true});
    },

    "test addIndex": function () {
      var TestModel = Model.define('TestModel');

      var ensureIndex = test.stub(TestModel.docs, 'ensureIndex');

      TestModel.addIndex('a', 'b', -1, 'c', 1, 'd');

      assert.calledWith(ensureIndex, {a: 1, b: -1, c: 1, d: 1});
    },
  });
});
