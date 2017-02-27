define(function (require, exports, module) {
  /**
   * A function that makes a registry that compares a
   * {#koru/model/main} record to a set of match functions.
   *
   * Used in {#koru/session/publish}
   **/
  const dbBroker = require('koru/model/db-broker');
  const Model    = require('koru/model/main');
  const api      = require('koru/test/api');
  const util     = require('koru/util');
  const TH       = require('./test-helper');

  const sut = require('./match');
  var test, v;

  let myMatch;

  function buildRegistry() {
    let match;
    return api.innerSubject(
      myMatch = sut(),
      "match()",
      {
        abstract() {
          /**
           * Create an instance of match.
           *
           * Do not call this directly; instead use it inside a
           * {#koru/session/publish} body
           **/
        },
        initExample: 'const myMatch = match()'
      }
    );
  }

  TH.testCase(module, {
    setUp () {
      test = this;
      v = {};
      v.handles = [];
      v.doc = {constructor: {modelName: 'Foo'}};
      api.module();
    },

    tearDown () {
      v.handles.forEach(function (h) {h.stop()});
      dbBroker.clearDbId();
      v = null;
    },

    "test false matches" () {
      /**
       * Register a matcher agains a model
       *
       * @param modelName or model

       * @param comparator returns true if supplied document matches
       **/
      const iapi = buildRegistry();
      iapi.method('register');
      v.handles.push(iapi.example(() => myMatch.register('Foo', doc => {
        assert.same(doc, v.doc);
        return doc !== v.doc;
      })));

      iapi.exampleCont(";\n");
      v.handles.push(iapi.exampleCont(() => myMatch.register('Foo', doc => {
        assert.same(doc, v.doc);
        return doc !== v.doc;
      })));

      iapi.exampleCont(";\n");
      iapi.exampleCont(() => {
        assert.isFalse(myMatch.has(v.doc));
      });
    },


    "test true matches" () {
      const iapi = buildRegistry();
      iapi.method('register');
      v.handles.push(iapi.example(() => v.f = myMatch.register('Foo', doc => {
        assert.same(doc, v.doc);
        return false;
      })));

      iapi.exampleCont(";\n");
      v.handles.push(iapi.exampleCont(() => v.t = myMatch.register('Foo', doc => {
        assert.same(doc, v.doc);
        return doc === v.doc;
      })));

      iapi.example(() => {
        assert.isTrue(myMatch.has(v.doc));
      });

      iapi.done();
      api.done();

      assert(v.t.id);
      refute.same(v.t.id, v.f.id);

      if (isClient) {
        dbBroker.pushDbId('foo');
        refute.isTrue(myMatch.has(v.doc));
        dbBroker.popDbId();
      } else {
        var orig = dbBroker.dbId;
        try {
          util.thread.db.name = 'foo';
          refute.isTrue(myMatch.has(v.doc));
        } finally {
          util.thread.db.name = orig;
        }
      }
      assert.isTrue(myMatch.has(v.doc));
      v.t.stop();

      assert.isNull(v.t.id);

      assert.isFalse(myMatch.has(v.doc));
    },
  });
});
