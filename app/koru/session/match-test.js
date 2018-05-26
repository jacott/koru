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

  let v = null;

  TH.testCase(module, {
    setUp () {
      v = {};
      v.handles = [];
      v.doc = {constructor: {modelName: 'Book'}};
      api.module();
    },

    tearDown () {
      v.handles.forEach(h =>{h.stop()});
      dbBroker.clearDbId();
      v = null;
    },

    "test false matches"() {
      /**
       * Register a matcher agains a model
       *
       * @param modelName or model

       * @param comparator returns true if supplied document matches
       **/
      const iapi = buildRegistry();
      iapi.method('register');

      //[// no matchers match the document
      {
        const m1 = myMatch.register('Book', doc => {
          assert.same(doc, v.doc);
          return doc !== v.doc;
        });


        const m2 = myMatch.register('Book', doc => {
          assert.same(doc, v.doc);
          return doc !== v.doc;
        });

        //]
        v.handles.push(m1, m2);
        //[

        assert.isFalse(myMatch.has(v.doc));

        m1.stop(); m2.stop();
      }
      //]
    },


    "test true matches"() {
      const iapi = buildRegistry();
      iapi.method('register');
      //[{
      // at least one matcher matches the document

      const mfalse = myMatch.register('Book', doc => {
        assert.same(doc, v.doc);
        return false;
      });

      const mtrue = myMatch.register('Book', doc => {
        assert.same(doc, v.doc);
        return doc === v.doc;
      });
      //]
      v.handles.push(mfalse, mtrue);

      //[
      assert.isTrue(myMatch.has(v.doc));
      //]

      assert(mtrue.id);
      refute.same(mtrue.id, mfalse.id);

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

      //[
      mtrue.stop();
      assert.isNull(mtrue.id);
      assert.isFalse(myMatch.has(v.doc));

      mfalse.stop();
      //]//[}//]
    },
  });
});
