define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Model = require('./main');
  var session = require('../session/base');
  var koru = require('../main');
  var Val = require('./validation');
  var Future = requirejs.nodeRequire('fibers/future');
  var util = require('../util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      TH.noInfo();
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "test invalid findById": function () {
      var TestModel = Model.define('TestModel');

      assert.same(TestModel.findById(null), undefined);

      assert.exception(function () {
        TestModel.findById({});
      }, 'Error', 'invalid id: [object Object]');
    },

    "test globalDictAdders": function () {
      var adder = session._globalDictAdders[koru.absId(require, './main-server')];
      assert.isFunction(adder);

      var TestModel = Model.define('TestModel').defineFields({name: 'text', 'age': 'number'});

      adder(v.stub = test.stub());

      assert.calledWith(v.stub, '_id');
      assert.calledWith(v.stub, 'name');
      assert.calledWith(v.stub, 'age');
    },

    "test remote": function () {
      var TestModel = Model.define('TestModel');

      TestModel.remote({foo: v.foo = test.stub().returns('result')});

      test.spy(TestModel.docs, 'transaction');

      assert.accessDenied(function () {
        session._rpcs['TestModel.foo'].call({userId: null});
      });

      refute.called(v.foo);

      assert.same(session._rpcs['TestModel.foo'].call(v.conn = {userId: "uid"}, 1, 2),
                  'result');

      assert.calledOnce(v.foo);
      assert.calledWithExactly(v.foo, 1, 2);
      assert.same(v.foo.thisValues[0], v.conn);

      assert.called(TestModel.docs.transaction);
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

    "test reload and caching": function () {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});

      v.doc = TestModel.create({name: 'foo'});

      v.doc.attributes.name = 'baz';
      v.doc.name = 'bar';

      var retFut = new Future;
      var waitFut = new Future;

      util.Fiber(function () {
        try {
          while(retFut) {
            var what= retFut.wait();
            waitFut.return(what && what());
          }
        } catch(ex) {
          waitFut.throw(ex);
        }
      }).run();

      retFut.return(function () {
        retFut = new Future;
        var doc = TestModel.findById(v.doc._id);
        doc.attributes.name = 'cache foo';
      });
      waitFut.wait();

      TestModel.docs.update({_id: v.doc._id}, {$set: {name: 'fuz'}});

      assert.same(v.doc.$reload(), v.doc);
      assert.same(v.doc.name, 'baz');
      assert.same(v.doc.$reload('full'), v.doc);
      assert.same(v.doc.name, 'fuz');

      waitFut = new Future;
      retFut.return(function () {
        retFut = null;
        return TestModel.findById(v.doc._id);
      });
      ;
      assert.same(waitFut.wait().name, 'cache foo');

      TestModel.docs.update({_id: v.doc._id}, {$set: {name: 'doz'}});
      assert.same(v.doc.$reload().name, 'fuz');
    },

    "test saveRpc new": function () {
      var TestModel = Model.define('TestModel', {
        authorize: v.auth = test.stub()
      }).defineFields({name: 'text'});


      test.spy(TestModel.docs, 'transaction');
      TestModel.onChange(v.afterLocalChange = test.stub());

      assert.accessDenied(function () {
        session._rpcs.save.call({userId: null}, "TestModel", "fooid", {name: 'bar'});
      });

      refute(TestModel.exists("fooid"));

      test.spy(Val, 'assertCheck');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", "fooid", {name: 'bar'});

      v.doc = TestModel.findById("fooid");

      assert.same(v.doc.name, 'bar');

      assert.called(v.afterLocalChange);
      assert.calledWithExactly(v.auth, "u123");

      assert.equals(v.auth.thisValues[0].attributes, v.doc.attributes);

      assert.calledWith(Val.assertCheck, "fooid", "string", {baseName: "_id"});
      assert.calledWith(Val.assertCheck, "TestModel", "string", {baseName: "modelName"});

      assert.calledOnce(TestModel.docs.transaction);
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

      test.spy(TestModel.docs, 'transaction');

      v.doc = TestModel.create({name: 'foo'});

      TestModel.onChange(v.afterRemove = test.stub());

      assert.accessDenied(function () {
        session._rpcs.remove.call({userId: null}, "TestModel", v.doc._id);
      });

      session._rpcs.remove.call({userId: 'u123'}, "TestModel", v.doc._id);

      refute(TestModel.findById(v.doc._id));

      assert.called(v.afterRemove);
      assert.calledWith(v.auth, "u123", {remove: true});

      assert.calledOnce(TestModel.docs.transaction);
    },

    "test addUniqueIndex": function () {
      var TestModel = Model.define('TestModel');

      var ensureIndex = test.stub(TestModel.docs, 'ensureIndex');

      TestModel.addUniqueIndex('a', 'b', -1, 'c', 1, 'd');

      refute.called(ensureIndex);

      Model.ensureIndexes();

      assert.calledWith(ensureIndex, {a: 1, b: -1, c: 1, d: 1}, {sparse: true, unique: true});
    },

    "test addIndex": function () {
      var TestModel = Model.define('TestModel');

      var ensureIndex = test.stub(TestModel.docs, 'ensureIndex');

      TestModel.addIndex('a', 'b', -1, 'c', 1, 'd');

      refute.called(ensureIndex);

      Model.ensureIndexes();

      assert.calledWith(ensureIndex, {a: 1, b: -1, c: 1, d: 1});
    },

    "test transaction": function () {
      var TestModel = Model.define('TestModel');
      var stub = test.stub().returns('result');
      var tx = test.spy(TestModel.docs, 'transaction');
      assert.same(TestModel.transaction(stub), 'result');

      assert.called(stub);
      assert.calledWith(tx, stub);
    },
  });
});
