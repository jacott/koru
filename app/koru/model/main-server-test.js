define(function (require, exports, module) {
  const koru       = require('koru/main');
  const dbBroker   = require('koru/model/db-broker');
  const Driver     = require('koru/pg/driver');
  const session    = require('koru/session');
  const util       = require('koru/util');
  const TH         = require('./test-helper');
  const TransQueue = require('./trans-queue');
  const Val        = require('./validation');

  const {stub, spy, onEnd} = TH;

  const Model = require('./main');

  let v = null;

  const Future   = util.Future;

  TH.testCase(module, {
    setUp() {
      v = {};
      TH.noInfo();
    },

    tearDown() {
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "$docCache": {
      setUp() {
        v.defDb = Driver.defaultDb;
        v.altDb = Driver.connect(v.defDb._url + " options='-c search_path=alt'", 'alt');
        v.altDb.query('CREATE SCHEMA IF NOT EXISTS alt');
      },

      tearDown() {
        if (v.altDb) {
          v.altDb.query("DROP SCHEMA IF EXISTS alt CASCADE");
          dbBroker.clearDbId();
        }
      },

      "test switching db"() {
        const TestModel = Model.define('TestModel').defineFields({
          name: 'text',
        });
        assert.same(TestModel._$docCacheGet('fooId'), undefined);
        TestModel.create({_id: 'fooId', name: 'foo'});
        assert.same(TestModel._$docCacheGet('fooId').name, 'foo');
        dbBroker.db = v.altDb;
        assert.same(TestModel._$docCacheGet('fooId'), undefined);
        dbBroker.db = v.defDb;
        assert.same(TestModel._$docCacheGet('fooId').name, 'foo');
        const future = new Future;
        koru.fiberConnWrapper(() => {
          try {
            v.ans = TestModel._$docCacheGet('fooId');
            future.return('success');
          } catch(ex) {
            future.throw(ex);
          }
        }, v.conn = {});
        assert.same(future.wait(), 'success');
        assert.same(v.ans, undefined);

      },
    },

    "test auto Id"() {
      const TestModel = Model.define('TestModel');
      TestModel.defineFields({
        _id: {type: 'serial', auto: true},
        name: 'text',
      });

      TestModel.create({name: 'foo'});
      const bar = TestModel.create({name: 'bar'});
      assert.same(bar._id, 2);

      const doc = TestModel.findBy('name', 'bar');
      assert(doc);
      assert.same(doc._id, 2);
    },

    "test invalid findById"() {
      const TestModel = Model.define('TestModel');

      assert.same(TestModel.findById(null), undefined);

      assert.exception(()=>{
        TestModel.findById({});
      }, 'Error', 'invalid id: [object Object]');
    },

    "test globalDictAdders"() {
      const adder = session._globalDictAdders[koru.absId(require, './main-server')];
      assert.isFunction(adder);

      const TestModel = Model.define('TestModel').defineFields({name: 'text', 'age': 'number'});

      adder(v.stub = stub());

      assert.calledWith(v.stub, '_id');
      assert.calledWith(v.stub, 'name');
      assert.calledWith(v.stub, 'age');
    },

    "test remote"() {
      const TestModel = Model.define('TestModel');

      TestModel.remote({foo: v.foo = stub().returns('result')});

      spy(TestModel.db, 'transaction');

      assert.accessDenied(()=>{
        session._rpcs['TestModel.foo'].call({userId: null});
      });

      refute.called(v.foo);

      assert.same(session._rpcs['TestModel.foo'].call(v.conn = {userId: "uid"}, 1, 2),
                  'result');

      assert.calledOnce(v.foo);
      assert.calledWithExactly(v.foo, 1, 2);
      assert.same(v.foo.firstCall.thisValue, v.conn);

      assert.called(TestModel.db.transaction);
    },

    "test when no changes in save"() {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});

      v.doc = TestModel.create({name: 'foo'});
      onEnd(TestModel.onChange(v.onChange = stub()));
      TestModel.beforeSave(TestModel, v.beforeSave = stub());

      v.doc.$save();
      TestModel.query.onId(v.doc._id).update({});

      assert.same(v.doc.$reload().name, 'foo');
      refute.called (v.onChange);
      refute.called (v.beforeSave);
    },

    "test reload and caching"() {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});

      v.doc = TestModel.create({name: 'foo'});

      v.doc.attributes.name = 'baz';
      v.doc.name = 'bar';

      let retFut = new Future;
      let waitFut = new Future;

      util.Fiber(()=>{
        try {
          while(retFut) {
            const what= retFut.wait();
            waitFut.return(what && what());
          }
        } catch(ex) {
          koru.unhandledException(ex);
          waitFut.throw(ex);
        }
      }).run();

      retFut.return(()=>{
        retFut = new Future;
        const doc = TestModel.findById(v.doc._id);
        doc.attributes.name = 'cache foo';
      });
      waitFut.wait();

      TestModel.docs.updateById(v.doc._id, {name: 'fuz'});

      assert.same(v.doc.$reload(), v.doc);
      assert.same(v.doc.name, 'baz');
      assert.same(v.doc.$reload(true), v.doc);
      assert.same(v.doc.name, 'fuz');

      waitFut = new Future;
      retFut.return(()=>{
        retFut = null;
        return TestModel.findById(v.doc._id);
      });
      ;
      assert.same(waitFut.wait().name, 'cache foo');

      TestModel.docs.updateById(v.doc._id, {name: 'doz'});
      assert.same(v.doc.$reload().name, 'fuz');
    },

    "test overrideSave"() {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});
      TestModel.overrideSave = stub();

      const saveSpy = spy(TestModel.prototype, '$save');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", "fooid", {name: 'bar'});

      assert.calledWith(TestModel.overrideSave, "fooid", {name: 'bar'}, 'u123');

      refute.called(saveSpy);
    },

    "test overrideRemove"() {
      const TestModel = Model.define('TestModel', {
        overrideRemove: v.overrideRemove = stub()
      }).defineFields({name: 'text'});

      const removeSpy = spy(TestModel.prototype, '$remove');
      const doc = TestModel.create({name: 'remove me'});

      session._rpcs.remove.call({userId: 'u123'}, "TestModel", doc._id);

      assert.calledWith(v.overrideRemove, 'u123');
      const model = v.overrideRemove.firstCall.thisValue;
      assert.same(model.constructor, TestModel);
      assert.same(model.name, 'remove me');

      refute.called(removeSpy);
    },

    "test $save with callback"() {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});
      const doc = TestModel.build({name: 'foo'});
      doc.$save({callback: v.callback = this.stub()});

      assert.calledWith(v.callback, doc);
    },

    "test defaults for saveRpc new"() {
      const TestModel = Model.define('TestModel', {
        authorize: v.auth = stub()
      }).defineFields({name: 'text', language: {type: 'text', default: 'en'}});

      session._rpcs.save.call({userId: 'u123'}, "TestModel", null, {
        _id: "fooid", name: 'Mel'});

      const mel = TestModel.findById("fooid");

      assert.same(mel.language, 'en');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", null, {
        _id: "barid", name: 'Jen', language: 'no'});

      const jen = TestModel.findById('barid');

      assert.same(jen.language, 'no');
    },

    "test saveRpc new"() {
      const TestModel = Model.define('TestModel', {
        authorize: v.auth = stub()
      }).defineFields({name: 'text'});


      spy(TestModel.db, 'transaction');
      TestModel.onChange(v.onChangeSpy = stub());

      assert.accessDenied(()=>{
        session._rpcs.save.call({userId: null}, "TestModel", null, {_id: "fooid", name: 'bar'});
      });

      refute(TestModel.exists("fooid"));

      spy(Val, 'assertCheck');

      spy(TransQueue, 'onSuccess');
      spy(TransQueue, 'onAbort');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", null, {_id: "fooid", name: 'bar'});

      v.doc = TestModel.findById("fooid");

      assert.same(v.doc.name, 'bar');

      assert.calledOnce(v.onChangeSpy);

      assert(TransQueue.onAbort.calledBefore(TransQueue.onSuccess));

      TransQueue.onSuccess.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWithExactly(v.auth, "u123");

      assert.equals(v.auth.firstCall.thisValue.attributes, v.doc.attributes);

      assert.calledWith(Val.assertCheck, null, "string", {baseName: "_id"});

      assert.calledOnce(TestModel.db.transaction);

      stub(TestModel, '_$docCacheDelete');
      TransQueue.onAbort.yield();
      assert.calledWith(TestModel._$docCacheDelete, TH.match.field('_id', 'fooid'));

      v.auth.reset();
      session._rpcs.save.call({userId: 'u123'}, "TestModel", null, {_id: "fooid", name: 'bar2'});

      refute.called(v.auth);
    },

    "test saveRpc existing"() {
      const TestModel = Model.define('TestModel', {
        authorize: v.auth = stub()
      }).defineFields({name: 'text'});

      v.doc = TestModel.create({name: 'foo'});

      TestModel.onChange(v.onChangeSpy = stub());

      assert.accessDenied(()=>{
        session._rpcs.save.call({userId: null}, "TestModel", v.doc._id, {name: 'bar'});
      });

      assert.exception(()=>{
        session._rpcs.save.call({userId: 'u123'}, "TestModel", 'x'+v.doc._id, {name: 'bar'});
      }, {error: 404, reason: {_id: [['not_found']]}});

      assert.same(v.doc.$reload().name, 'foo');

      spy(TransQueue, 'onSuccess');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", v.doc._id, {name: 'bar'});

      assert.same(v.doc.$reload().name, 'bar');

      assert.calledOnce(v.onChangeSpy);
      TransQueue.onSuccess.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWithExactly(v.auth, "u123");

      assert.equals(v.auth.firstCall.thisValue.attributes, v.doc.attributes);
    },

    "test saveRpc partial no modification"() {
      const TestModel = Model.define('TestModel', {
        authorize: v.auth = stub()
      }).defineFields({name: 'text', html: 'object'});


      v.doc = TestModel.create({name: 'foo', html: {div: ['foo', 'bar']}});

      TestModel.onChange(v.onChangeSpy = stub());

      spy(TransQueue, 'onSuccess');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", v.doc._id, {$partial: {
        html: [
          'div.2', 'baz'
        ]
      }});

      assert.equals(v.doc.$reload().html, {div: ['foo', 'bar', 'baz']});

      assert.calledOnceWith(v.onChangeSpy, TH.matchModel(v.doc), {$partial: {
        html: [
          'div.2', null,
        ]
      }});
      TransQueue.onSuccess.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWithExactly(v.auth, "u123");

      assert.equals(v.auth.firstCall.thisValue.attributes, v.doc.attributes);
    },

    "test saveRpc partial validate modifies"() {
      const TestModel = Model.define('TestModel', {
        authorize: v.auth = stub()
      }).defineFields({name: 'text', html: 'object'});

      TestModel.prototype.validate = function () {
        if (this.changes.html.div[2] === 3) {
          this.changes.html.div[2] = 'three';
        }
      };

      v.doc = TestModel.create({name: 'foo', html: {div: ['foo', 'bar']}});

      TestModel.onChange(v.onChangeSpy = stub());

      spy(TransQueue, 'onSuccess');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", v.doc._id, {
        name: 'fiz',
        $partial: {
          html: [
            'div.2', 3
          ]
        }});

      assert.equals(v.doc.$reload().html, {div: ['foo', 'bar', 'three']});

      assert.calledOnceWith(v.onChangeSpy, TH.matchModel(v.doc), {
        name: 'foo',
        html: {div: ['foo', 'bar']},
      });
      TransQueue.onSuccess.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWithExactly(v.auth, "u123");

      assert.equals(v.auth.firstCall.thisValue.attributes, v.doc.attributes);
    },

    'test removeRpc'() {
      const TestModel = Model.define('TestModel', {
        authorize: v.auth = stub()
      }).defineFields({name: 'text'});

      spy(TestModel.db, 'transaction');

      v.doc = TestModel.create({name: 'foo'});

      TestModel.onChange(v.onChangeSpy = stub());

      assert.accessDenied(()=>{
        session._rpcs.remove.call({userId: null}, "TestModel", v.doc._id);
      });

      assert.exception(()=>{
        session._rpcs.remove.call({userId: 'u123'}, "TestModel", 'x'+v.doc._id);
      }, {error: 404, reason: {_id: [['not_found']]}});

      spy(TransQueue, 'onSuccess');

      session._rpcs.remove.call({userId: 'u123'}, "TestModel", v.doc._id);

      refute(TestModel.findById(v.doc._id));

      assert.calledOnce(v.onChangeSpy);
      TransQueue.onSuccess.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWith(v.auth, "u123", {remove: true});

      assert.calledThrice(TestModel.db.transaction);
    },

    "test addUniqueIndex"() {
      const TestModel = Model.define('TestModel');

      const ensureIndex = stub(TestModel.docs, 'ensureIndex');

      TestModel.addUniqueIndex('a', 'b', -1, 'c', 1, 'd', ignoreme=>{});

      refute.called(ensureIndex);

      Model.ensureIndexes();

      assert.calledWith(ensureIndex, {a: 1, b: -1, c: 1, d: 1}, {sparse: true, unique: true});
    },

    "test addIndex"() {
      const TestModel = Model.define('TestModel');

      const ensureIndex = stub(TestModel.docs, 'ensureIndex');

      TestModel.addIndex('a', 'b', -1, 'c', 1, 'd');

      refute.called(ensureIndex);

      Model.ensureIndexes();

      assert.calledWith(ensureIndex, {a: 1, b: -1, c: 1, d: 1});
    },

    "test transaction"() {
      const TestModel = Model.define('TestModel');
      const body = stub().returns('result');
      const tx = spy(TestModel.db, 'transaction');
      assert.same(TestModel.transaction(body), 'result');

      assert.called(body);
      assert.calledWith(tx, body);
    },
  });
});
