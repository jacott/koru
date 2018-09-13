define((require, exports, module)=>{
  /**
   * A Factory method to create a match registry that compares a
   * {#koru/model/main} record to a set of match functions.
   *
   * Used in {#koru/session/publish}
   *
   **/
  const dbBroker = require('koru/model/db-broker');
  const Model    = require('koru/model/main');
  const api      = require('koru/test/api');
  const util     = require('koru/util');
  const TH       = require('./test-helper');

  const Match = require('./match');

  let v = {};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    class Book {
      static get modelName() {return 'Book'}
      static fetch() {
        return new Book();
      }
    }

    beforeEach( ()=>{
      v.handles = [];
    });

    afterEach( ()=>{
      v.handles.forEach(h =>{h.delete()});
      dbBroker.clearDbId();
      v = {};
    });

    test("new", ()=>{
      /**
       * Create a match registry. Do not use this directly; instead use it inside a
       * {#koru/session/publish} body
       **/
      const new_Match = api.new();

      const myMatch = new_Match();

      assert(myMatch.register);
    });

    test("false matches", ()=>{
      /**
       * Register a matcher agains a model
       *
       * @param modelName or model

       * @param comparator returns true if supplied document matches
       **/
      api.protoMethod('register');

      //[
      const myMatch = new Match();
      const myBook = Book.fetch();

      // no matchers match the document
      const m1 = myMatch.register('Book', doc => {
        assert.same(doc, myBook);
        return doc !== myBook;
      });


      const m2 = myMatch.register('Book', doc => {
        assert.same(doc, myBook);
        return doc !== myBook;
      });

      //]
      v.handles.push(m1, m2);
      //[

      assert.isFalse(myMatch.has(myBook));

      m1.delete(); m2.delete();
      //]
    });


    test("true matches", ()=>{
      api.protoMethod('register');
      //[
      const myMatch = new Match();
      const myBook = Book.fetch();

      // at least one matcher matches the document
      const mfalse = myMatch.register('Book', doc => {
        assert.same(doc, myBook);
        return false;
      });

      const mtrue = myMatch.register('Book', doc => {
        assert.same(doc, myBook);
        return doc === myBook;
      });
      //]
      v.handles.push(mfalse, mtrue);

      //[
      assert.isTrue(myMatch.has(myBook));
      //]

      if (isClient) {
        dbBroker.pushDbId('foo');
        refute.isTrue(myMatch.has(myBook));
        dbBroker.popDbId();
      } else {
        const orig = dbBroker.dbId;
        try {
          util.thread.db.name = 'foo';
          refute.isTrue(myMatch.has(myBook));
        } finally {
          util.thread.db.name = orig;
        }
      }
      assert.isTrue(myMatch.has(myBook));

      //[
      mtrue.delete();
      assert.isNull(mtrue.id);
      assert.isFalse(myMatch.has(myBook));

      mfalse.delete();
      //]
    });
  });
});
